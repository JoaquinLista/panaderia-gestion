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
  // Una coma al final es alguien que está por escribir los decimales.
  let limpio = String(texto ?? '')
    .replace(/[\s$]/g, '')
    .replace(/,$/, '');
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

/**
 * Da formato a un monto mientras se escribe: puntos de miles y coma decimal
 * ("15000,5" → "15.000,5"), para que se note si sobra o falta un cero.
 * Los puntos que escribe la persona se toman como separadores de miles (el
 * campo los pone solo); los decimales van con coma y son como mucho dos.
 * @param {string} texto
 */
export const formatearMonto = (texto) => {
  const limpio = String(texto ?? '').replace(/[^\d,]/g, '');
  const coma = limpio.indexOf(',');
  const enteros = (coma === -1 ? limpio : limpio.slice(0, coma)).replace(/^0+(?=\d)/, '');
  if (coma === -1) return enteros.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimales = limpio
    .slice(coma + 1)
    .replace(/,/g, '')
    .slice(0, 2);
  const miles = (enteros || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${miles},${decimales}`;
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
 *   debito: number, credito: number, qr: number, transferencias?: number, gastos: number[]
 * }} c  todos los montos en centavos
 * @returns {{ efectivoVentas: number, totalGastos: number, totalCargado: number, diferencia: number }}
 *   `diferencia` positiva: sobra plata; negativa: falta.
 */
export const calcularCuadre = ({
  totalControlador,
  efectivoContado,
  cambioFijo,
  debito,
  credito,
  qr,
  transferencias = 0,
  gastos,
}) => {
  const efectivoVentas = efectivoContado - cambioFijo;
  const totalGastos = gastos.reduce((suma, g) => suma + g, 0);
  const totalCargado = efectivoVentas + debito + credito + qr + transferencias + totalGastos;
  return { efectivoVentas, totalGastos, totalCargado, diferencia: totalCargado - totalControlador };
};
