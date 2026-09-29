/**
 * Cuentas del resumen de los dueños (Sprint 7). Funciones puras sobre los
 * cierres y los movimientos de la caja central ya leídos de la base; todos
 * los montos en centavos enteros, igual que el cuadre.
 *
 * - Vendido: el total del controlador fiscal (Z) de cada cierre.
 * - Efectivo vendido: lo que quedó en la caja menos el cambio, más los gastos
 *   chicos pagados con esa plata (entró por ventas aunque después se gastó).
 * - Resultado del mes: ventas − gastos (sucursales + caja central) − retiros
 *   de los dueños. Los depósitos al banco no cuentan: mueven plata, no la gastan.
 */
import { rangoDelMes } from './fecha.js';

export const TURNOS = Object.freeze(['MEDIODIA', 'NOCHE']);

const MEDIOS = Object.freeze(['efectivo', 'debito', 'credito', 'qr']);

/** Montos vacíos de ventas, para sumar. */
const ventasEnCero = () => ({ vendido: 0, efectivo: 0, debito: 0, credito: 0, qr: 0, gastos: 0 });

/**
 * Ventas de un cierre, en centavos.
 * @param {{ total_controlador: number, efectivo_contado: number, cambio_fijo: number,
 *   debito: number, credito: number, qr: number, gastos: number }} c
 */
export const ventasDeCierre = (c) => ({
  vendido: c.total_controlador,
  efectivo: c.efectivo_contado - c.cambio_fijo + c.gastos,
  debito: c.debito,
  credito: c.credito,
  qr: c.qr,
  gastos: c.gastos,
});

const sumarVentas = (a, b) =>
  Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + (b[k] ?? 0)]));

/**
 * Resumen de un día: ventas por sucursal y medio de pago, y qué turnos faltan.
 * @param {{ fecha: string,
 *   sucursales: { id: number, nombre: string }[],
 *   cierres: { sucursal_id: number, turno: string, diferencia: number }[] }} datos
 *   cierres de ese día, con los montos en centavos
 */
export const resumirDia = ({ fecha, sucursales, cierres }) => {
  const filas = sucursales.map((s) => {
    const propios = cierres.filter((c) => c.sucursal_id === s.id);
    const ventas = propios.map(ventasDeCierre).reduce(sumarVentas, ventasEnCero());
    const cargados = TURNOS.filter((t) => propios.some((c) => c.turno === t));
    return {
      sucursal_id: s.id,
      sucursal: s.nombre,
      ...ventas,
      diferencia: propios.reduce((suma, c) => suma + c.diferencia, 0),
      turnos_cargados: cargados,
      turnos_pendientes: TURNOS.filter((t) => !cargados.includes(t)),
    };
  });
  const total = filas.reduce(sumarVentas, ventasEnCero());
  return {
    fecha,
    total: Object.fromEntries(Object.keys(ventasEnCero()).map((k) => [k, total[k]])),
    sucursales: filas,
    turnos_pendientes: filas.reduce((n, f) => n + f.turnos_pendientes.length, 0),
  };
};

const diasDelMes = (mes) => Number(rangoDelMes(mes).hasta.slice(8));

/** Mes anterior a AAAA-MM. */
export const mesAnterior = (mes) => {
  const [anio, numero] = mes.split('-').map(Number);
  return numero === 1 ? `${anio - 1}-12` : `${anio}-${String(numero - 1).padStart(2, '0')}`;
};

/**
 * Qué días se comparan. En el mes en curso, del 1 a hoy contra los mismos días
 * del mes anterior (si hoy es 31 y el anterior tiene 30, hasta el 30). Un mes
 * ya terminado se compara entero contra el anterior entero.
 * @param {string} mes AAAA-MM
 * @param {string} hoy AAAA-MM-DD
 * @returns {{ actual: { mes: string, desde: string, hasta: string, en_curso: boolean },
 *   anterior: { mes: string, desde: string, hasta: string } } | null}
 *   null si el mes todavía no empezó
 */
export const periodos = (mes, hoy) => {
  const rango = rangoDelMes(mes);
  if (rango.desde > hoy) return null;
  const enCurso = hoy <= rango.hasta;
  const hasta = enCurso ? hoy : rango.hasta;
  const previo = mesAnterior(mes);
  const dias = enCurso ? Math.min(Number(hoy.slice(8)), diasDelMes(previo)) : diasDelMes(previo);
  return {
    actual: { mes, desde: rango.desde, hasta, en_curso: enCurso },
    anterior: {
      mes: previo,
      desde: `${previo}-01`,
      hasta: `${previo}-${String(dias).padStart(2, '0')}`,
    },
  };
};

/**
 * Cuánto cambió un número contra el período anterior, en porcentaje con un
 * decimal. null si antes era cero (no hay contra qué comparar).
 */
export const variacion = (actual, anterior) =>
  anterior === 0 ? null : Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;

/**
 * Totales de un período: ventas, gastos, retiros y resultado.
 * @param {{ cierres: object[],
 *   pagos: { monto: number, obra: boolean }[],
 *   retiros: { monto: number }[] }} datos  montos en centavos
 */
export const totalesDelPeriodo = ({ cierres, pagos, retiros }) => {
  const ventas = cierres.map(ventasDeCierre).reduce(sumarVentas, ventasEnCero());
  const gastosSucursales = ventas.gastos;
  const obra = pagos.filter((p) => p.obra).reduce((s, p) => s + p.monto, 0);
  const pagosCaja = pagos.filter((p) => !p.obra).reduce((s, p) => s + p.monto, 0);
  const gastos = gastosSucursales + pagosCaja + obra;
  const retirosDuenos = retiros.reduce((s, r) => s + r.monto, 0);
  return {
    ventas: ventas.vendido,
    medios: Object.fromEntries(MEDIOS.map((m) => [m, ventas[m]])),
    gastos: { sucursales: gastosSucursales, caja_central: pagosCaja, obra, total: gastos },
    retiros_duenos: retirosDuenos,
    resultado: ventas.vendido - gastos - retirosDuenos,
  };
};

/**
 * Ventas del mes por sucursal y por día.
 * @param {{ desde: string, hasta: string,
 *   sucursales: { id: number, nombre: string }[], cierres: object[] }} datos
 */
export const ventasDelMes = ({ desde, hasta, sucursales, cierres }) => {
  const dias = [];
  for (let d = new Date(`${desde}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const fecha = d.toISOString().slice(0, 10);
    if (fecha > hasta) break;
    dias.push(fecha);
  }
  const porSucursal = sucursales.map((s) => {
    const propios = cierres.filter((c) => c.sucursal_id === s.id);
    return {
      sucursal_id: s.id,
      sucursal: s.nombre,
      vendido: propios.reduce((suma, c) => suma + c.total_controlador, 0),
      cierres: propios.length,
      // Turnos que tendrían que estar cargados y no están: dos por día.
      turnos_sin_cargar: dias.length * TURNOS.length - propios.length,
    };
  });
  const porDia = dias.map((fecha) => {
    const delDia = cierres.filter((c) => c.fecha === fecha);
    return {
      fecha,
      vendido: delDia.reduce((suma, c) => suma + c.total_controlador, 0),
      por_sucursal: Object.fromEntries(
        sucursales.map((s) => [
          s.id,
          delDia.filter((c) => c.sucursal_id === s.id).reduce((x, c) => x + c.total_controlador, 0),
        ])
      ),
    };
  });
  return { por_sucursal: porSucursal, por_dia: porDia };
};
