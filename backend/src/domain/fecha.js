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
