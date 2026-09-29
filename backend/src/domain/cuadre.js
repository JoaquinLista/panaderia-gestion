/**
 * Cuadre del cierre de caja. La cuenta se hace en centavos enteros: con
 * decimales de punto flotante 0,1 + 0,2 no da 0,3 y una caja que cuadra
 * podría "no cuadrar" por un redondeo. El frontend usa una copia de esta
 * función probada con los mismos casos.
 *
 * Fórmula (PM, 2026-09-29): lo que entró por ventas en efectivo es lo que hay
 * en la caja menos el cambio fijo que queda. Eso, más posnet, transferencias
 * y los gastos pagados con plata de la caja, tiene que dar el total del
 * controlador fiscal.
 */

const MONTO_MAXIMO_CENTAVOS = 9_999_999_999; // NUMERIC(12,2)

/**
 * Pasa un monto en pesos a centavos enteros. Acepta número o texto con punto
 * decimal ("1500", "1500.5", 1500.25). Devuelve null si no es un monto válido:
 * negativo, con más de dos decimales o demasiado grande.
 * @param {number | string} valor
 * @returns {number | null}
 */
export const aCentavos = (valor) => {
  const texto = typeof valor === 'number' ? String(valor) : valor;
  if (typeof texto !== 'string' || !/^\d+(\.\d{1,2})?$/.test(texto.trim())) return null;
  const [enteros, decimales = ''] = texto.trim().split('.');
  const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
  return centavos <= MONTO_MAXIMO_CENTAVOS ? centavos : null;
};

/** Centavos a pesos, para responder y guardar (NUMERIC acepta el texto exacto). */
export const aPesos = (centavos) => {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};

/**
 * @param {{
 *   totalControlador: number, efectivoContado: number, cambioFijo: number,
 *   posnet: number, transferencias: number, gastos: number[]
 * }} c  todos los montos en centavos
 * @returns {{ efectivoVentas: number, totalGastos: number, totalCargado: number, diferencia: number }}
 *   en centavos. `diferencia` positiva: sobra plata; negativa: falta.
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
