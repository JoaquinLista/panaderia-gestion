// Textos y conversiones que comparten las pantallas de cierre de caja.
import { aPesos, formatearMonto } from './cuadre.js';

export const TURNOS = { MEDIODIA: 'Mediodía', NOCHE: 'Noche' };
export const DEL_TURNO = { MEDIODIA: 'del mediodía', NOCHE: 'de la noche' };

/** "2026-09-28" → "28/09" */
export const diaMes = (fecha) => fecha.split('-').reverse().slice(0, 2).join('/');

/** Pesos que vienen de la API (1500.5) a centavos, sin errores de redondeo. */
export const centavosDe = (pesos) => Math.round(pesos * 100);

/** Pesos de la API al texto de un campo: 1500.5 → "1.500,5". */
export const aCampo = (pesos) => formatearMonto(String(pesos).replace('.', ','));

/** Valor de un campo de gasto: el monto con puntos de miles, el detalle tal cual. */
export const valorGasto = (nombre, evento) =>
  nombre === 'monto' ? formatearMonto(evento.target.value) : evento.target.value;

/** Gasto nuevo, vacío, para el formulario. */
export const GASTO_VACIO = Object.freeze({ categoria_id: '', detalle: '', monto: '' });

/** Un gasto del formulario está completo si tiene categoría, detalle y monto. */
export const gastoCompleto = (gasto, centavos) =>
  gasto.categoria_id !== '' && gasto.detalle.trim() !== '' && centavos !== null && centavos > 0;

/** Gasto del formulario como lo recibe la API. */
export const gastoParaApi = (gasto, centavos) => ({
  categoria_id: Number(gasto.categoria_id),
  detalle: gasto.detalle.trim(),
  monto: aPesos(centavos),
});
