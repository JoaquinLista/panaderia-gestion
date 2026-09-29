/**
 * Cuadre del cierre de caja: copia de backend/src/domain/cuadre.js, probada
 * con los mismos casos (src/lib/cuadre.test.js). Así la diferencia que ve
 * quien carga es la misma que guarda la API. La API vuelve a calcularla.
 */

const MONTO_MAXIMO_CENTAVOS = 9_999_999_999; // NUMERIC(12,2)

/**
 * Pasa un monto en pesos a centavos enteros. Devuelve null si no es válido.
 * @param {number | string} valor  con punto decimal ("1500.5")
 */
export const aCentavos = (valor) => {
  const texto = typeof valor === 'number' ? String(valor) : valor;
  if (typeof texto !== 'string' || !/^\d+(\.\d{1,2})?$/.test(texto.trim())) return null;
  const [enteros, decimales = ''] = texto.trim().split('.');
  const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
  return centavos <= MONTO_MAXIMO_CENTAVOS ? centavos : null;
};

/** Centavos a pesos en el formato que recibe la API ("1500.50"). */
export const aPesos = (centavos) => {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};

/**
 * Lee un monto como lo escribe alguien en Argentina: "1.500,50", "1500,5",
 * "1500.50", "$ 12.000" o "12000". Devuelve centavos, 0 si está vacío, o null
 * si no se entiende.
 * @param {string} texto
 */
export const leerMonto = (texto) => {
  let limpio = String(texto ?? '').replace(/[\s$]/g, '');
  if (limpio === '') return 0;
  if (limpio.includes(',')) {
    // Con coma decimal, los puntos son separadores de miles.
    limpio = limpio.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    // "12.000" o "1.500.000": puntos de miles, sin decimales.
    limpio = limpio.replace(/\./g, '');
  }
  return aCentavos(limpio);
};

const formatoPesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

/** Centavos a texto para mostrar: "$ 1.500,50". */
export const mostrarPesos = (centavos) => formatoPesos.format(centavos / 100);

/**
 * @param {{
 *   totalControlador: number, efectivoContado: number, cambioFijo: number,
 *   posnet: number, transferencias: number, gastos: number[]
 * }} c  todos los montos en centavos
 * @returns {{ efectivoVentas: number, totalGastos: number, totalCargado: number, diferencia: number }}
 *   `diferencia` positiva: sobra plata; negativa: falta.
 */
export const calcularCuadre = ({
  totalControlador,
  efectivoContado,
  cambioFijo,
  posnet,
  transferencias,
  gastos,
}) => {
  const efectivoVentas = efectivoContado - cambioFijo;
  const totalGastos = gastos.reduce((suma, g) => suma + g, 0);
  const totalCargado = efectivoVentas + posnet + transferencias + totalGastos;
  return { efectivoVentas, totalGastos, totalCargado, diferencia: totalCargado - totalControlador };
};
