/**
 * Fechas del negocio. Todas las sucursales están en Río Negro: el "día" de un
 * cierre es el de Argentina, no el del servidor (en la nube suele estar en
 * UTC y a las 21 h de Viedma ya sería el día siguiente).
 */
export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

// en-CA formatea como AAAA-MM-DD, el formato que espera una columna DATE.
const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * @param {Date} [ahora]
 * @returns {string} fecha de hoy en Argentina, AAAA-MM-DD
 */
export const hoyEnArgentina = (ahora = new Date()) => formato.format(ahora);

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * ¿Es una fecha real con formato AAAA-MM-DD? "2026-02-30" no lo es.
 * @param {unknown} texto
 */
export const esFecha = (texto) => {
  const partes = typeof texto === 'string' && FECHA.exec(texto);
  if (!partes) return false;
  const [, anio, mes, dia] = partes.map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
};

/**
 * Primer y último día de un mes.
 * @param {string} mes AAAA-MM
 * @returns {{ desde: string, hasta: string } | null} null si el mes no es válido
 */
export const rangoDelMes = (mes) => {
  if (typeof mes !== 'string' || !esFecha(`${mes}-01`)) return null;
  const [anio, numero] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
};
