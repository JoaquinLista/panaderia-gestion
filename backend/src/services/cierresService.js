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
         c.cargado_por, u.nombre AS cargado_por_nombre, c.creado_en,
         c.revisado_en, r.nombre AS revisado_por_nombre,
         (c.diferencia <> 0 AND c.revisado_en IS NULL) AS a_revisar
    FROM cierres_caja c
    JOIN sucursales s    ON s.id = c.sucursal_id
    JOIN usuarios u      ON u.id = c.cargado_por
    LEFT JOIN usuarios r ON r.id = c.revisado_por`;

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

const idValido = (id) => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647)
    throw errorHttp(404, 'No existe ese cierre');
  return n;
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

// ---- Revisión de la dueña (#10) ----

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const validarFecha = (fecha, nombre) => {
  if (typeof fecha !== 'string' || !FECHA.test(fecha) || Number.isNaN(Date.parse(fecha))) {
    throw errorHttp(400, `"${nombre}" tiene que ser una fecha AAAA-MM-DD`);
  }
  return fecha;
};

const MAXIMO_LISTA = 200;

/**
 * Cierres filtrados por sucursal, rango de fechas y "a revisar", del más
 * nuevo al más viejo. Sin filtros, los de los últimos días (hasta 200).
 * @param {{ sucursal_id?: string, desde?: string, hasta?: string, a_revisar?: string }} filtros
 */
export const listarCierres = async (filtros = {}) => {
  const condiciones = [];
  const params = [];
  const agregar = (sql, valor) => {
    params.push(valor);
    condiciones.push(sql.replace('?', `$${params.length}`));
  };

  if (filtros.sucursal_id !== undefined && filtros.sucursal_id !== '') {
    const id = Number(filtros.sucursal_id);
    if (!Number.isInteger(id) || id <= 0) throw errorHttp(400, 'sucursal_id inválida');
    agregar('c.sucursal_id = ?', id);
  }
  if (filtros.desde) agregar('c.fecha >= ?', validarFecha(filtros.desde, 'desde'));
  if (filtros.hasta) agregar('c.fecha <= ?', validarFecha(filtros.hasta, 'hasta'));
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    throw errorHttp(400, '"desde" no puede ser posterior a "hasta"');
  }
  if (filtros.a_revisar === 'true') condiciones.push('c.diferencia <> 0 AND c.revisado_en IS NULL');

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const { rows } = await query(
    `${CIERRE_SELECT} ${where} ORDER BY c.fecha DESC, c.turno DESC, s.nombre ASC LIMIT ${MAXIMO_LISTA}`,
    params
  );
  return adjuntarGastos(rows);
};

/**
 * Qué sucursales todavía no cargaron cada turno de hoy (el galpón no tiene caja).
 * @param {Date} [ahora]
 */
export const cierresPendientes = async (ahora = new Date()) => {
  const fecha = hoyEnArgentina(ahora);
  const { rows } = await query(
    `SELECT s.id, s.nombre, array_remove(array_agg(c.turno), NULL) AS cerrados
       FROM sucursales s
       LEFT JOIN cierres_caja c ON c.sucursal_id = s.id AND c.fecha = $1
      WHERE s.tipo <> 'DEPOSITO'
      GROUP BY s.id, s.nombre
      ORDER BY s.nombre ASC`,
    [fecha]
  );
  return {
    fecha,
    sucursales: rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      turnos_pendientes: TURNOS.filter((t) => !r.cerrados.includes(t)),
    })),
  };
};

/** Un cierre con su historial de correcciones. */
export const detalleCierre = async (id) => {
  const cierreId = idValido(id);
  const cierre = await obtenerCierre(cierreId);
  if (!cierre) throw errorHttp(404, 'No existe ese cierre');
  const { rows } = await query(
    `SELECT k.id, k.campo, k.valor_anterior, k.valor_nuevo, k.creado_en, u.nombre AS usuario_nombre
       FROM cierre_correcciones k
       JOIN usuarios u ON u.id = k.usuario_id
      WHERE k.cierre_id = $1
      ORDER BY k.creado_en DESC, k.id DESC`,
    [cierreId]
  );
  return { ...cierre, correcciones: rows };
};

// Campos que la dueña puede corregir, con la columna y cómo se compara.
const MONTOS_EDITABLES = {
  total_controlador: 'totalControlador',
  efectivo_contado: 'efectivoContado',
  cambio_fijo: 'cambioFijo',
  posnet: 'posnet',
  transferencias: 'transferencias',
};

const textoGastos = (gastos) =>
  gastos.length === 0
    ? 'sin gastos'
    : gastos.map((g) => `${g.detalle} ${aPesos(g.centavos)}`).join('; ');

/**
 * La dueña corrige un cierre. Sólo cambian los campos que vienen en `datos`;
 * `gastos`, si viene, reemplaza la lista entera. La diferencia se recalcula y
 * cada campo que cambió queda en el historial con el valor anterior.
 * @param {number|string} id
 * @param {object} datos
 * @param {object} sesion
 */
export const corregirCierre = async (id, datos = {}, sesion) => {
  const cierreId = idValido(id);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, turno, numero_z, total_controlador,
              efectivo_contado, cambio_fijo, posnet, transferencias, comentario, sucursal_id
         FROM cierres_caja WHERE id = $1 FOR UPDATE`,
      [cierreId]
    );
    const actual = rows[0];
    if (!actual) throw errorHttp(404, 'No existe ese cierre');
    const { rows: gastosActuales } = await client.query(
      'SELECT detalle, monto FROM cierre_gastos WHERE cierre_id = $1 ORDER BY id ASC',
      [cierreId]
    );

    const antes = {
      fecha: actual.fecha,
      turno: actual.turno,
      numero_z: actual.numero_z,
      comentario: actual.comentario,
      ...Object.fromEntries(Object.keys(MONTOS_EDITABLES).map((k) => [k, aCentavos(actual[k])])),
      gastos: gastosActuales.map((g) => ({ detalle: g.detalle, centavos: aCentavos(g.monto) })),
    };
    const despues = { ...antes };

    if ('fecha' in datos) despues.fecha = validarFecha(datos.fecha, 'fecha');
    if ('turno' in datos) {
      const turno = String(datos.turno ?? '').toUpperCase();
      if (!TURNOS.includes(turno)) throw errorHttp(400, `Turno inválido: ${TURNOS.join(' o ')}`);
      despues.turno = turno;
    }
    if ('numero_z' in datos) despues.numero_z = validarNumeroZ(datos.numero_z);
    if ('comentario' in datos) despues.comentario = validarComentario(datos.comentario);
    for (const campo of Object.keys(MONTOS_EDITABLES)) {
      if (campo in datos) despues[campo] = monto(datos, campo, { obligatorio: true });
    }
    if ('gastos' in datos) despues.gastos = validarGastos(datos.gastos);

    const cambios = [];
    const comparar = (campo, mostrar = (v) => (v === null ? null : String(v))) => {
      if (mostrar(antes[campo]) !== mostrar(despues[campo])) {
        cambios.push([campo, mostrar(antes[campo]), mostrar(despues[campo])]);
      }
    };
    ['fecha', 'turno', 'numero_z', 'comentario'].forEach((c) => comparar(c));
    Object.keys(MONTOS_EDITABLES).forEach((c) => comparar(c, aPesos));
    comparar('gastos', textoGastos);
    if (cambios.length === 0) throw errorHttp(400, 'No hay cambios para guardar');

    const { diferencia } = calcularCuadre({
      ...Object.fromEntries(
        Object.entries(MONTOS_EDITABLES).map(([campo, clave]) => [clave, despues[campo]])
      ),
      gastos: despues.gastos.map((g) => g.centavos),
    });

    await client.query(
      `UPDATE cierres_caja
          SET fecha = $2, turno = $3, numero_z = $4, comentario = $5,
              total_controlador = $6, efectivo_contado = $7, cambio_fijo = $8,
              posnet = $9, transferencias = $10, diferencia = $11
        WHERE id = $1`,
      [
        cierreId,
        despues.fecha,
        despues.turno,
        despues.numero_z,
        despues.comentario,
        aPesos(despues.total_controlador),
        aPesos(despues.efectivo_contado),
        aPesos(despues.cambio_fijo),
        aPesos(despues.posnet),
        aPesos(despues.transferencias),
        aPesos(diferencia),
      ]
    );
    if ('gastos' in datos) {
      await client.query('DELETE FROM cierre_gastos WHERE cierre_id = $1', [cierreId]);
      for (const g of despues.gastos) {
        await client.query(
          'INSERT INTO cierre_gastos (cierre_id, detalle, monto) VALUES ($1, $2, $3)',
          [cierreId, g.detalle, aPesos(g.centavos)]
        );
      }
    }
    for (const [campo, anterior, nuevo] of cambios) {
      await client.query(
        `INSERT INTO cierre_correcciones (cierre_id, usuario_id, campo, valor_anterior, valor_nuevo)
         VALUES ($1, $2, $3, $4, $5)`,
        [cierreId, sesion.usuario.id, campo, anterior, nuevo]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      throw errorHttp(409, 'Ya hay un cierre de esa sucursal para esa fecha y turno');
    }
    throw error;
  } finally {
    client.release();
  }
  return detalleCierre(cierreId);
};

/**
 * La dueña marca revisado un cierre (o lo vuelve a dejar pendiente).
 * @param {number|string} id
 * @param {boolean} revisado
 * @param {object} sesion
 */
export const marcarRevisado = async (id, revisado, sesion) => {
  const cierreId = idValido(id);
  if (typeof revisado !== 'boolean') throw errorHttp(400, '"revisado" tiene que ser true o false');
  const { rowCount } = revisado
    ? await query('UPDATE cierres_caja SET revisado_por = $2, revisado_en = now() WHERE id = $1', [
        cierreId,
        sesion.usuario.id,
      ])
    : await query('UPDATE cierres_caja SET revisado_por = NULL, revisado_en = NULL WHERE id = $1', [
        cierreId,
      ]);
  if (rowCount === 0) throw errorHttp(404, 'No existe ese cierre');
  return detalleCierre(cierreId);
};
