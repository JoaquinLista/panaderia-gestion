import { query } from '../config/db.js';
import { aCentavos, aPesos } from '../domain/cuadre.js';
import {
  CUENTAS,
  RETIRO_SUCURSAL,
  TIPOS,
  compararMovimientos,
  conSaldos,
  cuentasQueToca,
  retiroDeCierre,
} from '../domain/cajaCentral.js';
import { esFecha, hoyEnArgentina, rangoDelMes } from '../domain/fecha.js';

const errorHttp = (status, mensaje) => Object.assign(new Error(mensaje), { status });

const NOMBRE_CUENTA = { CAJA: 'la caja central', BANCO: 'el Banco Patagonia' };
const LARGO_CONCEPTO = 200;

// NUMERIC(12,2) llega como texto exacto ("-150.50"): a centavos sin redondeos raros.
const centavosDe = (texto) => Math.round(Number(texto) * 100);
const pesos = (centavos) => Number(aPesos(centavos));
const diaMes = (fecha) => fecha.split('-').reverse().slice(0, 2).join('/');

const idValido = (id, mensaje) => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647) throw errorHttp(404, mensaje);
  return n;
};

const fechaValida = (fecha, nombre) => {
  if (!esFecha(fecha)) throw errorHttp(400, `"${nombre}" tiene que ser una fecha AAAA-MM-DD`);
  return fecha;
};

/** Dueños que pueden retirar plata, en el orden de la planilla. */
export const listarDuenos = async () => {
  const { rows } = await query(
    'SELECT id, nombre FROM duenos WHERE activo ORDER BY orden ASC, nombre ASC'
  );
  return rows;
};

/** Saldo inicial vigente de cada cuenta, o null si todavía no se cargó. */
const saldosIniciales = async () => {
  const { rows } = await query(
    `SELECT cuenta, to_char(fecha, 'YYYY-MM-DD') AS fecha, monto
       FROM movimientos_caja
      WHERE tipo = 'SALDO_INICIAL' AND anulado_en IS NULL`
  );
  return Object.fromEntries(
    CUENTAS.map((c) => {
      const fila = rows.find((r) => r.cuenta === c);
      return [c, fila ? { fecha: fila.fecha, monto: Number(fila.monto) } : null];
    })
  );
};

const MOVIMIENTO_SELECT = `
  SELECT m.id, to_char(m.fecha, 'YYYY-MM-DD') AS fecha, m.tipo, m.cuenta, m.monto,
         m.categoria_id, k.nombre AS categoria, m.dueno_id, d.nombre AS dueno,
         m.concepto, m.creado_en, u.nombre AS cargado_por_nombre
    FROM movimientos_caja m
    JOIN usuarios u              ON u.id = m.cargado_por
    LEFT JOIN categorias_gasto k ON k.id = m.categoria_id
    LEFT JOIN duenos d           ON d.id = m.dueno_id`;

const deFilaMovimiento = (f) => ({
  id: f.id,
  cierreId: null,
  fecha: f.fecha,
  tipo: f.tipo,
  cuenta: f.cuenta,
  centavos: centavosDe(f.monto),
  categoriaId: f.categoria_id,
  categoria: f.categoria,
  duenoId: f.dueno_id,
  dueno: f.dueno,
  concepto: f.concepto,
  sucursalId: null,
  sucursal: null,
  turno: null,
  cargadoPor: f.cargado_por_nombre,
  momento: f.creado_en,
  orden: f.id,
});

const deFilaCierre = (f) => ({
  id: null,
  cierreId: f.cierre_id,
  fecha: f.fecha,
  tipo: RETIRO_SUCURSAL,
  cuenta: 'CAJA',
  centavos: retiroDeCierre({
    efectivoContado: centavosDe(f.efectivo_contado),
    cambioFijo: centavosDe(f.cambio_fijo),
  }),
  categoriaId: null,
  categoria: null,
  duenoId: null,
  dueno: null,
  concepto: null,
  sucursalId: f.sucursal_id,
  sucursal: f.sucursal,
  turno: f.turno,
  cargadoPor: f.cargado_por_nombre,
  momento: f.creado_en,
  orden: f.cierre_id,
});

const aRespuesta = (m) => ({
  id: m.id,
  cierre_id: m.cierreId,
  fecha: m.fecha,
  tipo: m.tipo,
  cuenta: m.cuenta,
  monto: pesos(m.centavos),
  categoria_id: m.categoriaId,
  categoria: m.categoria,
  dueno_id: m.duenoId,
  dueno: m.dueno,
  concepto: m.concepto,
  sucursal_id: m.sucursalId,
  sucursal: m.sucursal,
  turno: m.turno,
  cargado_por_nombre: m.cargadoPor,
  ...(m.saldoCaja === undefined
    ? {}
    : { saldo_caja: pesos(m.saldoCaja), saldo_banco: pesos(m.saldoBanco) }),
});

/**
 * Todos los movimientos hasta una fecha, en orden y con el saldo de cada
 * cuenta después de cada uno. Lo que entra de las sucursales sale de los
 * cierres: los anteriores al saldo inicial de la caja no cuentan (ese saldo
 * ya es la plata que había).
 * @param {string} hasta AAAA-MM-DD
 */
const movimientosHasta = async (hasta) => {
  const iniciales = await saldosIniciales();
  const { rows: manuales } = await query(
    `${MOVIMIENTO_SELECT} WHERE m.anulado_en IS NULL AND m.fecha <= $1`,
    [hasta]
  );
  const { rows: cierres } = await query(
    `SELECT c.id AS cierre_id, to_char(c.fecha, 'YYYY-MM-DD') AS fecha, c.turno,
            c.sucursal_id, s.nombre AS sucursal, c.efectivo_contado, c.cambio_fijo,
            c.creado_en, u.nombre AS cargado_por_nombre
       FROM cierres_caja c
       JOIN sucursales s ON s.id = c.sucursal_id
       JOIN usuarios u   ON u.id = c.cargado_por
      WHERE c.fecha <= $1 AND ($2::date IS NULL OR c.fecha >= $2::date)`,
    [hasta, iniciales.CAJA?.fecha ?? null]
  );
  const lista = [
    ...manuales.map(deFilaMovimiento),
    ...cierres.map(deFilaCierre).filter((m) => m.centavos !== 0),
  ].sort(compararMovimientos);
  return { iniciales, movimientos: conSaldos(lista) };
};

const TIPOS_FILTRO = [...TIPOS, RETIRO_SUCURSAL];

const enteroPositivo = (valor, nombre) => {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw errorHttp(400, `${nombre} inválido`);
  return n;
};

/**
 * Movimientos de un rango de fechas, en orden y con el saldo después de cada
 * uno. Sin fechas, los del mes en curso hasta hoy.
 * @param {{ desde?: string, hasta?: string, cuenta?: string, tipo?: string,
 *           categoria_id?: string, dueno_id?: string }} filtros
 * @param {Date} [ahora]
 */
export const listarMovimientos = async (filtros = {}, ahora = new Date()) => {
  const hasta = filtros.hasta ? fechaValida(filtros.hasta, 'hasta') : hoyEnArgentina(ahora);
  const desde = filtros.desde ? fechaValida(filtros.desde, 'desde') : `${hasta.slice(0, 8)}01`;
  if (desde > hasta) throw errorHttp(400, '"desde" no puede ser posterior a "hasta"');

  const condiciones = [(m) => m.fecha >= desde];
  if (filtros.cuenta) {
    const cuenta = String(filtros.cuenta).toUpperCase();
    if (!CUENTAS.includes(cuenta)) throw errorHttp(400, `La cuenta es ${CUENTAS.join(' o ')}`);
    condiciones.push((m) => cuentasQueToca(m).includes(cuenta));
  }
  if (filtros.tipo) {
    const tipo = String(filtros.tipo).toUpperCase();
    if (!TIPOS_FILTRO.includes(tipo)) throw errorHttp(400, 'Tipo de movimiento inválido');
    condiciones.push((m) => m.tipo === tipo);
  }
  if (filtros.categoria_id) {
    const id = enteroPositivo(filtros.categoria_id, 'categoria_id');
    condiciones.push((m) => m.categoriaId === id);
  }
  if (filtros.dueno_id) {
    const id = enteroPositivo(filtros.dueno_id, 'dueno_id');
    condiciones.push((m) => m.duenoId === id);
  }

  const { movimientos } = await movimientosHasta(hasta);
  return {
    desde,
    hasta,
    movimientos: movimientos.filter((m) => condiciones.every((c) => c(m))).map(aRespuesta),
  };
};

const saldosAl = (movimientos) => {
  const ultimo = movimientos.at(-1);
  return {
    saldo_caja: pesos(ultimo?.saldoCaja ?? 0),
    saldo_banco: pesos(ultimo?.saldoBanco ?? 0),
  };
};

const sumar = (movimientos) => movimientos.reduce((total, m) => total + m.centavos, 0);

/**
 * Lo que la dueña ve al abrir la caja central: el saldo de cada cuenta al
 * final del día, lo que entró de cada sucursal y lo que se movió ese día.
 * @param {string} [fecha] AAAA-MM-DD; hoy si no viene
 * @param {Date} [ahora]
 */
export const resumenDelDia = async (fecha, ahora = new Date()) => {
  const dia = fecha ? fechaValida(fecha, 'fecha') : hoyEnArgentina(ahora);
  const { iniciales, movimientos } = await movimientosHasta(dia);
  const delDia = movimientos.filter((m) => m.fecha === dia);
  const entradas = delDia.filter((m) => m.tipo === RETIRO_SUCURSAL);
  return {
    fecha: dia,
    ...saldosAl(movimientos),
    saldo_inicial: { caja: iniciales.CAJA, banco: iniciales.BANCO },
    entradas: entradas.map(aRespuesta),
    total_entradas: pesos(sumar(entradas)),
    movimientos: delDia.filter((m) => m.tipo !== RETIRO_SUCURSAL).map(aRespuesta),
  };
};

/**
 * Totales de un mes, como la hoja del mes y el "Resumen SOCIOS" de la
 * planilla: lo que entró de cada sucursal, lo que se llevó cada dueño y en
 * qué se gastó (en las sucursales y desde la caja central).
 * @param {string} [mes] AAAA-MM; el actual si no viene
 * @param {Date} [ahora]
 */
export const resumenMensual = async (mes, ahora = new Date()) => {
  const elegido = mes ?? hoyEnArgentina(ahora).slice(0, 7);
  const rango = rangoDelMes(elegido);
  if (!rango) throw errorHttp(400, '"mes" tiene que tener el formato AAAA-MM');

  const { movimientos } = await movimientosHasta(rango.hasta);
  const delMes = movimientos.filter((m) => m.fecha >= rango.desde);
  const deTipo = (tipo) => delMes.filter((m) => m.tipo === tipo);

  const porSucursal = new Map();
  for (const m of deTipo(RETIRO_SUCURSAL)) {
    const fila = porSucursal.get(m.sucursalId) ?? { nombre: m.sucursal, centavos: 0 };
    fila.centavos += m.centavos;
    porSucursal.set(m.sucursalId, fila);
  }

  const duenos = await listarDuenos();
  const retirosDueno = deTipo('RETIRO_DUENO');
  // Un dueño que ya no está activo aparece sólo si retiró algo ese mes.
  for (const m of retirosDueno) {
    if (!duenos.some((d) => d.id === m.duenoId)) duenos.push({ id: m.duenoId, nombre: m.dueno });
  }

  const { rows: categorias } = await query(
    'SELECT id, nombre FROM categorias_gasto ORDER BY orden ASC, nombre ASC'
  );
  const { rows: gastosSucursales } = await query(
    `SELECT g.categoria_id, SUM(g.monto) AS total
       FROM cierre_gastos g
       JOIN cierres_caja c ON c.id = g.cierre_id
      WHERE c.fecha BETWEEN $1 AND $2
      GROUP BY g.categoria_id`,
    [rango.desde, rango.hasta]
  );
  const pagos = deTipo('PAGO');
  const gastosPorCategoria = categorias
    .map((k) => {
      const fila = gastosSucursales.find((g) => g.categoria_id === k.id);
      const enSucursales = fila ? centavosDe(fila.total) : 0;
      const enCajaCentral = sumar(pagos.filter((p) => p.categoriaId === k.id));
      return {
        categoria_id: k.id,
        categoria: k.nombre,
        en_sucursales: pesos(enSucursales),
        en_caja_central: pesos(enCajaCentral),
        total: pesos(enSucursales + enCajaCentral),
      };
    })
    .filter((k) => k.total !== 0);

  return {
    mes: elegido,
    ...rango,
    entradas_por_sucursal: [...porSucursal.entries()]
      .map(([id, f]) => ({ sucursal_id: id, sucursal: f.nombre, total: pesos(f.centavos) }))
      .sort((a, b) => a.sucursal.localeCompare(b.sucursal)),
    total_entradas: pesos(sumar(deTipo(RETIRO_SUCURSAL))),
    depositos: pesos(sumar(deTipo('DEPOSITO'))),
    retiros_por_dueno: duenos.map((d) => ({
      dueno_id: d.id,
      dueno: d.nombre,
      total: pesos(sumar(retirosDueno.filter((m) => m.duenoId === d.id))),
    })),
    total_retiros_duenos: pesos(sumar(retirosDueno)),
    gastos_por_categoria: gastosPorCategoria,
    ajustes: pesos(sumar(deTipo('AJUSTE'))),
    ...saldosAl(movimientos),
  };
};

// ---- Carga y anulación ----

/** Monto del movimiento en centavos; sólo el ajuste puede ser negativo. */
const montoDe = (valor, tipo) => {
  const texto = typeof valor === 'number' ? String(valor) : valor;
  const negativo = tipo === 'AJUSTE' && typeof texto === 'string' && texto.trim().startsWith('-');
  const centavos = aCentavos(negativo ? texto.trim().slice(1) : texto);
  if (!centavos) {
    throw errorHttp(
      400,
      tipo === 'AJUSTE'
        ? 'El ajuste necesita un monto distinto de cero (negativo si falta plata)'
        : 'El monto tiene que ser mayor a cero, en pesos y con hasta dos decimales'
    );
  }
  return negativo ? -centavos : centavos;
};

const conceptoDe = (valor, tipo) => {
  if (valor !== undefined && valor !== null && typeof valor !== 'string') {
    throw errorHttp(400, 'El concepto tiene que ser un texto');
  }
  const concepto = (valor ?? '').trim();
  if (concepto.length > LARGO_CONCEPTO) {
    throw errorHttp(400, `El concepto puede tener hasta ${LARGO_CONCEPTO} caracteres`);
  }
  if (!concepto && tipo === 'PAGO') throw errorHttp(400, 'Escribí el concepto del pago');
  if (!concepto && tipo === 'AJUSTE') throw errorHttp(400, 'Escribí el motivo del ajuste');
  return concepto || null;
};

const existeActivo = async (tabla, columnaActiva, id) => {
  const { rows } = await query(`SELECT id FROM ${tabla} WHERE id = $1 AND ${columnaActiva}`, [id]);
  return rows.length > 0;
};

/**
 * La dueña carga un movimiento de la caja central o del banco.
 * @param {object} datos  cuerpo del request
 * @param {object} sesion
 * @param {Date} [ahora]
 */
export const crearMovimiento = async (datos = {}, sesion, ahora = new Date()) => {
  const tipo = String(datos.tipo ?? '').toUpperCase();
  if (!TIPOS.includes(tipo)) {
    throw errorHttp(400, `Elegí el tipo de movimiento: ${TIPOS.join(', ')}`);
  }
  // El depósito siempre sale de la caja y entra al banco.
  const cuenta = tipo === 'DEPOSITO' ? 'CAJA' : String(datos.cuenta ?? '').toUpperCase();
  if (!CUENTAS.includes(cuenta)) {
    throw errorHttp(400, `Elegí la cuenta: ${CUENTAS.join(' o ')}`);
  }

  const hoy = hoyEnArgentina(ahora);
  const fecha = datos.fecha ? fechaValida(datos.fecha, 'fecha') : hoy;
  if (fecha > hoy) throw errorHttp(400, 'No se pueden cargar movimientos con fecha futura');

  const centavos = montoDe(datos.monto, tipo);
  const concepto = conceptoDe(datos.concepto, tipo);

  let categoriaId = null;
  if (tipo === 'PAGO') {
    categoriaId = Number(datos.categoria_id);
    if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
      throw errorHttp(400, 'Elegí la categoría del pago');
    }
    if (!(await existeActivo('categorias_gasto', 'activa', categoriaId))) {
      throw errorHttp(400, 'Esa categoría no existe');
    }
  }
  let duenoId = null;
  if (tipo === 'RETIRO_DUENO') {
    duenoId = Number(datos.dueno_id);
    if (!Number.isInteger(duenoId) || duenoId <= 0) {
      throw errorHttp(400, 'Elegí quién retira la plata');
    }
    if (!(await existeActivo('duenos', 'activo', duenoId))) {
      throw errorHttp(400, 'Ese dueño no existe');
    }
  }

  const iniciales = await saldosIniciales();
  if (tipo === 'SALDO_INICIAL') {
    if (iniciales[cuenta]) {
      throw errorHttp(
        409,
        `Ya está cargado el saldo inicial de ${NOMBRE_CUENTA[cuenta]}: anulalo para cargar otro`
      );
    }
    const { rows } = await query(
      `SELECT count(*)::int AS cantidad FROM movimientos_caja
        WHERE anulado_en IS NULL AND fecha < $1
          AND (cuenta = $2 OR (tipo = 'DEPOSITO' AND $2 = 'BANCO'))`,
      [fecha, cuenta]
    );
    if (rows[0].cantidad > 0) {
      throw errorHttp(
        400,
        `Hay movimientos de ${NOMBRE_CUENTA[cuenta]} anteriores al ${diaMes(fecha)}: el saldo inicial tiene que ser el primero`
      );
    }
  } else {
    for (const c of cuentasQueToca({ tipo, cuenta })) {
      if (iniciales[c] && fecha < iniciales[c].fecha) {
        throw errorHttp(
          400,
          `La fecha es anterior al saldo inicial de ${NOMBRE_CUENTA[c]} (${diaMes(iniciales[c].fecha)})`
        );
      }
    }
  }

  let id;
  try {
    const { rows } = await query(
      `INSERT INTO movimientos_caja
         (fecha, tipo, cuenta, monto, categoria_id, dueno_id, concepto, cargado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [fecha, tipo, cuenta, aPesos(centavos), categoriaId, duenoId, concepto, sesion.usuario.id]
    );
    id = rows[0].id;
  } catch (error) {
    // Dos saldos iniciales cargados a la vez: el índice único deja pasar uno.
    if (error.code === '23505') {
      throw errorHttp(409, `Ya está cargado el saldo inicial de ${NOMBRE_CUENTA[cuenta]}`);
    }
    throw error;
  }

  const { rows } = await query(`${MOVIMIENTO_SELECT} WHERE m.id = $1`, [id]);
  return aRespuesta(deFilaMovimiento(rows[0]));
};

/**
 * Anula un movimiento mal cargado. No se borra: queda quién lo anuló y cuándo,
 * y deja de contar en los saldos.
 * @param {number|string} id
 * @param {object} sesion
 */
export const anularMovimiento = async (id, sesion) => {
  const movimientoId = idValido(id, 'No existe ese movimiento');
  const { rows } = await query(
    `UPDATE movimientos_caja SET anulado_en = now(), anulado_por = $2
      WHERE id = $1 AND anulado_en IS NULL
      RETURNING id`,
    [movimientoId, sesion.usuario.id]
  );
  if (rows.length === 0) {
    const { rows: existe } = await query('SELECT id FROM movimientos_caja WHERE id = $1', [
      movimientoId,
    ]);
    if (existe.length === 0) throw errorHttp(404, 'No existe ese movimiento');
    throw errorHttp(409, 'Ese movimiento ya estaba anulado');
  }
  return { id: movimientoId, anulado: true };
};
