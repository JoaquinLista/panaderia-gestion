import { query } from '../config/db.js';
import { aPesos } from '../domain/cuadre.js';
import {
  periodos,
  resumirDia,
  totalesDelPeriodo,
  variacion,
  ventasDelMes,
} from '../domain/dashboard.js';
import { esFecha, hoyEnArgentina, rangoDelMes } from '../domain/fecha.js';

const errorHttp = (status, mensaje) => Object.assign(new Error(mensaje), { status });

// NUMERIC(12,2) llega como texto exacto: a centavos sin redondeos raros, y de vuelta a pesos.
const centavosDe = (texto) => Math.round(Number(texto) * 100);
const pesos = (centavos) => Number(aPesos(centavos));

// Números que no son plata: quedan como están.
const NO_SON_PLATA = new Set(['sucursal_id', 'dueno_id', 'cierres', 'turnos_sin_cargar']);

/** Pasa a pesos los montos de un objeto (un nivel). */
const enPesos = (montos) =>
  Object.fromEntries(
    Object.entries(montos).map(([k, v]) => [
      k,
      typeof v === 'number' && !NO_SON_PLATA.has(k) ? pesos(v) : v,
    ])
  );

/** Sucursales que venden (el galpón es depósito y no tiene caja). */
const sucursalesQueVenden = async () => {
  const { rows } = await query(
    `SELECT id, nombre FROM sucursales WHERE tipo <> 'DEPOSITO' ORDER BY nombre ASC`
  );
  return rows;
};

/** Cierres entre dos fechas, con el total de sus gastos; montos en centavos. */
const cierresEntre = async (desde, hasta) => {
  const { rows } = await query(
    `SELECT c.sucursal_id, to_char(c.fecha, 'YYYY-MM-DD') AS fecha, c.turno,
            c.total_controlador, c.efectivo_contado, c.cambio_fijo, c.debito, c.credito, c.qr,
            c.diferencia, COALESCE(SUM(g.monto), 0) AS gastos
       FROM cierres_caja c
       LEFT JOIN cierre_gastos g ON g.cierre_id = c.id
      WHERE c.fecha BETWEEN $1 AND $2
      GROUP BY c.id`,
    [desde, hasta]
  );
  return rows.map((r) => ({
    sucursal_id: r.sucursal_id,
    fecha: r.fecha,
    turno: r.turno,
    ...Object.fromEntries(
      [
        'total_controlador',
        'efectivo_contado',
        'cambio_fijo',
        'debito',
        'credito',
        'qr',
        'diferencia',
        'gastos',
      ].map((k) => [k, centavosDe(r[k])])
    ),
  }));
};

/** Pagos y retiros de los dueños de la caja central (sin los anulados). */
const movimientosEntre = async (desde, hasta) => {
  const { rows } = await query(
    `SELECT m.tipo, m.monto, m.dueno_id, d.nombre AS dueno, k.nombre AS categoria
       FROM movimientos_caja m
       LEFT JOIN duenos d ON d.id = m.dueno_id
       LEFT JOIN categorias_gasto k ON k.id = m.categoria_id
      WHERE m.anulado_en IS NULL AND m.tipo IN ('PAGO', 'RETIRO_DUENO')
        AND m.fecha BETWEEN $1 AND $2`,
    [desde, hasta]
  );
  const conMonto = rows.map((r) => ({ ...r, monto: centavosDe(r.monto) }));
  return {
    pagos: conMonto
      .filter((m) => m.tipo === 'PAGO')
      .map((m) => ({ monto: m.monto, obra: m.categoria === 'Obra' })),
    retiros: conMonto.filter((m) => m.tipo === 'RETIRO_DUENO'),
  };
};

/**
 * Lo vendido en un día por sucursal y medio de pago, y qué cierres faltan.
 * @param {string} [fecha] AAAA-MM-DD; hoy si no viene
 * @param {Date} [ahora]
 */
export const resumenDelDia = async (fecha, ahora = new Date()) => {
  const hoy = hoyEnArgentina(ahora);
  const dia = fecha ?? hoy;
  if (!esFecha(dia)) throw errorHttp(400, '"fecha" tiene que ser una fecha AAAA-MM-DD');
  if (dia > hoy) throw errorHttp(400, 'Todavía no llegó ese día');

  const resumen = resumirDia({
    fecha: dia,
    sucursales: await sucursalesQueVenden(),
    cierres: await cierresEntre(dia, dia),
  });
  return {
    fecha: dia,
    es_hoy: dia === hoy,
    total: enPesos(resumen.total),
    sucursales: resumen.sucursales.map(enPesos),
    turnos_pendientes: resumen.turnos_pendientes,
  };
};

/**
 * El mes hasta hoy (o entero, si ya terminó): ventas por sucursal y por día,
 * gastos, retiros de los dueños, resultado y comparación con los mismos días
 * del mes anterior.
 * @param {string} [mes] AAAA-MM; el actual si no viene
 * @param {Date} [ahora]
 */
export const resumenDelMes = async (mes, ahora = new Date()) => {
  const hoy = hoyEnArgentina(ahora);
  const elegido = mes ?? hoy.slice(0, 7);
  if (!rangoDelMes(elegido)) throw errorHttp(400, '"mes" tiene que tener el formato AAAA-MM');
  const p = periodos(elegido, hoy);
  if (!p) throw errorHttp(400, 'Ese mes todavía no empezó');

  const sucursales = await sucursalesQueVenden();
  const [cierres, cierresAntes, movimientos, movimientosAntes] = await Promise.all([
    cierresEntre(p.actual.desde, p.actual.hasta),
    cierresEntre(p.anterior.desde, p.anterior.hasta),
    movimientosEntre(p.actual.desde, p.actual.hasta),
    movimientosEntre(p.anterior.desde, p.anterior.hasta),
  ]);

  const actual = totalesDelPeriodo({ cierres, ...movimientos });
  const anterior = totalesDelPeriodo({ cierres: cierresAntes, ...movimientosAntes });
  const ventas = ventasDelMes({ ...p.actual, sucursales, cierres });

  const porDueno = new Map();
  for (const r of movimientos.retiros) {
    const fila = porDueno.get(r.dueno_id) ?? { dueno_id: r.dueno_id, dueno: r.dueno, total: 0 };
    fila.total += r.monto;
    porDueno.set(r.dueno_id, fila);
  }

  const totales = (t) => ({
    ventas: pesos(t.ventas),
    medios: enPesos(t.medios),
    gastos: enPesos(t.gastos),
    retiros_duenos: pesos(t.retiros_duenos),
    resultado: pesos(t.resultado),
  });

  return {
    ...p.actual,
    ...totales(actual),
    retiros_por_dueno: [...porDueno.values()].map(enPesos),
    ventas_por_sucursal: ventas.por_sucursal.map(enPesos),
    ventas_por_dia: ventas.por_dia.map((d) => ({
      fecha: d.fecha,
      vendido: pesos(d.vendido),
      por_sucursal: enPesos(d.por_sucursal),
    })),
    anterior: { ...p.anterior, ...totales(anterior) },
    variacion: {
      ventas: variacion(actual.ventas, anterior.ventas),
      gastos: variacion(actual.gastos.total, anterior.gastos.total),
      retiros_duenos: variacion(actual.retiros_duenos, anterior.retiros_duenos),
      resultado: variacion(actual.resultado, anterior.resultado),
    },
  };
};
