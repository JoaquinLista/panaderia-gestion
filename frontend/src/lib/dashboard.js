// Textos y cuentas chicas de la pantalla "Resumen" (Sprint 7).
import { nombreMes } from './cajaCentral.js';
import { TURNOS } from './cierres.js';

export const MEDIOS = [
  ['efectivo', 'Efectivo'],
  ['debito', 'Débito'],
  ['credito', 'Crédito'],
  ['qr', 'QR'],
];

const porcentaje = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/** "septiembre de 2026" → "septiembre" */
export const soloMes = (mes) => nombreMes(mes).split(' ')[0];

/**
 * Cómo leer una variación contra el mes anterior.
 * @param {number | null} valor  porcentaje, o null si antes era cero
 * @param {'sube' | 'baja'} bueno  si para este número subir es bueno (ventas) o malo (gastos)
 * @returns {{ texto: string, tono: 'bien' | 'mal' | 'igual' | 'sin-datos', sube?: boolean }}
 */
export const leerVariacion = (valor, bueno = 'sube') => {
  if (valor === null) return { texto: 'sin datos para comparar', tono: 'sin-datos' };
  if (valor === 0) return { texto: 'igual', tono: 'igual' };
  const sube = valor > 0;
  return {
    texto: `${sube ? 'Subió' : 'Bajó'} ${porcentaje.format(Math.abs(valor))} %`,
    tono: sube === (bueno === 'sube') ? 'bien' : 'mal',
    sube,
  };
};

/** Qué cierres faltan, en palabras: "Café: mediodía y noche". */
export const describirPendientes = (sucursal) =>
  `${sucursal.sucursal}: ${sucursal.turnos_pendientes.map((t) => TURNOS[t].toLowerCase()).join(' y ')}`;

/** Ancho de una barra en %, respecto del mayor de la lista (mínimo visible 2 %). */
export const anchoBarra = (valor, maximo) =>
  maximo <= 0 || valor <= 0 ? 0 : Math.max(2, Math.round((valor / maximo) * 100));

/** "2026-09-29" → "29" */
export const dia = (fecha) => String(Number(fecha.slice(8)));
