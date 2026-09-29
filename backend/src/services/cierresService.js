import { query, getClient } from '../config/db.js';
import { aCentavos, aPesos, calcularCuadre } from '../domain/cuadre.js';
import { hoyEnArgentina } from '../domain/fecha.js';
import { sucursalRestringida } from '../domain/permisos.js';

const errorHttp = (status, mensaje) => Object.assign(new Error(mensaje), { status });

/** Dos cierres por día (PM, 2026-09-29). */
export const TURNOS = Object.freeze(['MEDIODIA', 'NOCHE']);
const NOMBRE_TURNO = { MEDIODIA: 'del mediodía', NOCHE: 'de la noche' };

const MAXIMO_GASTOS = 30;
const LARGO_DETALLE = 120;
const LARGO_COMENTARIO = 500;

const CIERRE_SELECT = `
  SELECT c.id, c.sucursal_id, s.nombre AS sucursal_nombre,
         to_char(c.fecha, 'YYYY-MM-DD') AS fecha, c.turno, c.numero_z,
         c.total_controlador, c.efectivo_contado, c.cambio_fijo, c.posnet,
         c.transferencias, c.diferencia, c.comentario,
         c.cargado_por, u.nombre AS cargado_por_nombre, c.creado_en
    FROM cierres_caja c
    JOIN sucursales s ON s.id = c.sucursal_id
    JOIN usuarios u   ON u.id = c.cargado_por`;

const MONTOS = [
  'total_controlador',
  'efectivo_contado',
  'cambio_fijo',
  'posnet',
  'transferencias',
  'diferencia',
];

// Postgres devuelve NUMERIC como texto para no perder precisión; con dos
// decimales un número de JavaScript alcanza para mostrarlo.
const aRespuesta = (fila, gastos) => {
  const cierre = { ...fila };
  for (const m of MONTOS) cierre[m] = Number(fila[m]);
  cierre.gastos = gastos.map((g) => ({ id: g.id, detalle: g.detalle, monto: Number(g.monto) }));
  return cierre;
};

const adjuntarGastos = async (filas) => {
  if (filas.length === 0) return [];
  const { rows: gastos } = await query(
    `SELECT id, cierre_id, detalle, monto FROM cierre_gastos
      WHERE cierre_id = ANY($1::int[]) ORDER BY id ASC`,
    [filas.map((f) => f.id)]
  );
  return filas.map((f) =>
    aRespuesta(
      f,
      gastos.filter((g) => g.cierre_id === f.id)
    )
  );
};

const obtenerCierre = async (id) => {
  const { rows } = await query(`${CIERRE_SELECT} WHERE c.id = $1`, [id]);
  const [cierre] = await adjuntarGastos(rows);
  return cierre;
};

/**
 * Sucursal en la que cierra la sesión. La empleada, en su sucursal del día;
 * la dueña elige cualquiera que atienda público (el galpón no tiene caja).
 * @param {object} sesion
 * @param {unknown} sucursalPedida  sucursal_id que vino en el request
 */
const resolverSucursal = async (sesion, sucursalPedida) => {
  const propia = sucursalRestringida(sesion);
  const pedida =
    sucursalPedida === undefined || sucursalPedida === null ? null : Number(sucursalPedida);

  if (propia) {
    if (pedida !== null && pedida !== propia) {
      throw errorHttp(
        403,
        `Sólo podés cerrar la caja de tu sucursal del día (${sesion.sucursal.nombre})`
      );
    }
    return sesion.sucursal;
  }

  if (!Number.isInteger(pedida) || pedida <= 0) {
    throw errorHttp(400, 'Elegí la sucursal del cierre (sucursal_id)');
  }
  const { rows } = await query('SELECT id, nombre, tipo FROM sucursales WHERE id = $1', [pedida]);
  if (!rows[0]) throw errorHttp(400, 'No existe esa sucursal');
  if (rows[0].tipo === 'DEPOSITO') throw errorHttp(400, 'El galpón no tiene caja para cerrar');
  return rows[0];
};

const monto = (datos, campo, { obligatorio }) => {
  const valor = datos[campo];
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) throw errorHttp(400, `Falta el monto "${campo}"`);
    return 0;
  }
  const centavos = aCentavos(valor);
  if (centavos === null) {
    throw errorHttp(400, `"${campo}" tiene que ser un monto en pesos, con hasta dos decimales`);
  }
  return centavos;
};

const validarGastos = (gastos = []) => {
  if (!Array.isArray(gastos)) throw errorHttp(400, '"gastos" tiene que ser una lista');
  if (gastos.length > MAXIMO_GASTOS) {
    throw errorHttp(400, `Se pueden cargar hasta ${MAXIMO_GASTOS} gastos por cierre`);
  }
  return gastos.map((g) => {
    const detalle = typeof g?.detalle === 'string' ? g.detalle.trim() : '';
    if (!detalle || detalle.length > LARGO_DETALLE) {
      throw errorHttp(400, `Cada gasto necesita un detalle (hasta ${LARGO_DETALLE} caracteres)`);
    }
    const centavos = aCentavos(g.monto);
    if (!centavos) throw errorHttp(400, `El gasto "${detalle}" necesita un monto mayor a cero`);
    return { detalle, centavos };
  });
};

const validarNumeroZ = (numeroZ) => {
  if (numeroZ === undefined || numeroZ === null || numeroZ === '') return null;
  const n = Number(numeroZ);
  if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647) {
    throw errorHttp(400, 'El número de Z tiene que ser un entero positivo');
  }
  return n;
};

const validarComentario = (comentario) => {
  if (comentario === undefined || comentario === null) return null;
  if (typeof comentario !== 'string' || comentario.trim().length > LARGO_COMENTARIO) {
    throw errorHttp(400, `El comentario puede tener hasta ${LARGO_COMENTARIO} caracteres`);
  }
  return comentario.trim() || null;
};

/**
 * Carga un cierre de caja. La fecha es la de hoy en Argentina y el cuadre lo
 * calcula el servidor: el formulario no puede mandar otra diferencia.
 * Una diferencia no bloquea el cierre: queda guardada para que la dueña la
 * averigüe (PM, 2026-09-29).
 * @param {object} datos  cuerpo del request
 * @param {object} sesion sesión de quien carga (req.sesion)
 * @param {Date} [ahora]
 */
export const crearCierre = async (datos = {}, sesion, ahora = new Date()) => {
  const turno = String(datos.turno ?? '').toUpperCase();
  if (!TURNOS.includes(turno)) {
    throw errorHttp(400, `Elegí el turno del cierre: ${TURNOS.join(' o ')}`);
  }
  const montos = {
    totalControlador: monto(datos, 'total_controlador', { obligatorio: true }),
    efectivoContado: monto(datos, 'efectivo_contado', { obligatorio: true }),
    cambioFijo: monto(datos, 'cambio_fijo', { obligatorio: true }),
    posnet: monto(datos, 'posnet', { obligatorio: false }),
    transferencias: monto(datos, 'transferencias', { obligatorio: false }),
  };
  const gastos = validarGastos(datos.gastos);
  const numeroZ = validarNumeroZ(datos.numero_z);
  const comentario = validarComentario(datos.comentario);
  const sucursal = await resolverSucursal(sesion, datos.sucursal_id);

  const { diferencia } = calcularCuadre({ ...montos, gastos: gastos.map((g) => g.centavos) });
  const fecha = hoyEnArgentina(ahora);

  const client = await getClient();
  let id;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO cierres_caja
         (sucursal_id, fecha, turno, numero_z, total_controlador, efectivo_contado,
          cambio_fijo, posnet, transferencias, diferencia, comentario, cargado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        sucursal.id,
        fecha,
        turno,
        numeroZ,
        aPesos(montos.totalControlador),
        aPesos(montos.efectivoContado),
        aPesos(montos.cambioFijo),
        aPesos(montos.posnet),
        aPesos(montos.transferencias),
        aPesos(diferencia),
        comentario,
        sesion.usuario.id,
      ]
    );
    id = rows[0].id;
    for (const g of gastos) {
      await client.query(
        'INSERT INTO cierre_gastos (cierre_id, detalle, monto) VALUES ($1, $2, $3)',
        [id, g.detalle, aPesos(g.centavos)]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      throw errorHttp(
        409,
        `Ya se cargó el cierre ${NOMBRE_TURNO[turno]} de hoy en ${sucursal.nombre}`
      );
    }
    throw error;
  } finally {
    client.release();
  }

  return obtenerCierre(id);
};

/**
 * Lo que necesita el formulario al abrirse: qué turnos de hoy ya se cerraron
 * en la sucursal y qué cambio fijo sugerir (el del último cierre cargado).
 * @param {object} sesion
 * @param {unknown} sucursalPedida  ?sucursal_id= (sólo la dueña)
 * @param {Date} [ahora]
 */
export const cierresDeHoy = async (sesion, sucursalPedida, ahora = new Date()) => {
  const sucursal = await resolverSucursal(sesion, sucursalPedida);
  const fecha = hoyEnArgentina(ahora);

  const { rows } = await query(
    `${CIERRE_SELECT} WHERE c.sucursal_id = $1 AND c.fecha = $2 ORDER BY c.turno ASC`,
    [sucursal.id, fecha]
  );
  const { rows: ultimo } = await query(
    `SELECT cambio_fijo FROM cierres_caja WHERE sucursal_id = $1
      ORDER BY fecha DESC, creado_en DESC LIMIT 1`,
    [sucursal.id]
  );

  const cierres = await adjuntarGastos(rows);
  const cerrados = new Set(cierres.map((c) => c.turno));
  return {
    fecha,
    sucursal: { id: sucursal.id, nombre: sucursal.nombre },
    cierres,
    turnos_pendientes: TURNOS.filter((t) => !cerrados.has(t)),
    cambio_sugerido: ultimo[0] ? Number(ultimo[0].cambio_fijo) : null,
  };
};
