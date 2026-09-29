/**
 * Caja central: reglas de cómo mueve la plata cada tipo de movimiento.
 * Todo en centavos enteros, como el cuadre del cierre (ver cuadre.js).
 *
 * Hay dos cuentas, como en la planilla "Retiros": la caja central (efectivo)
 * y el Banco Patagonia.
 */
export const CUENTAS = Object.freeze(['CAJA', 'BANCO']);

/** Movimientos que carga la dueña. */
export const TIPOS = Object.freeze(['SALDO_INICIAL', 'DEPOSITO', 'PAGO', 'RETIRO_DUENO', 'AJUSTE']);

/** Lo que entra de cada sucursal: no se carga, sale de cada cierre. */
export const RETIRO_SUCURSAL = 'RETIRO_SUCURSAL';

/**
 * Efectivo que se lleva la caja central de un cierre: lo contado menos el
 * cambio fijo que queda en la sucursal. Es la columna "Retiro" de la planilla.
 * @param {{ efectivoContado: number, cambioFijo: number }} cierre en centavos
 */
export const retiroDeCierre = ({ efectivoContado, cambioFijo }) => efectivoContado - cambioFijo;

/**
 * Cuánto cambia cada cuenta con un movimiento.
 * @param {{ tipo: string, cuenta: string, centavos: number }} mov
 * @returns {{ CAJA: number, BANCO: number }}
 */
export const efecto = ({ tipo, cuenta, centavos }) => {
  const cambio = { CAJA: 0, BANCO: 0 };
  switch (tipo) {
    case RETIRO_SUCURSAL:
      cambio.CAJA = centavos;
      break;
    case 'DEPOSITO':
      cambio.CAJA = -centavos;
      cambio.BANCO = centavos;
      break;
    case 'PAGO':
    case 'RETIRO_DUENO':
      cambio[cuenta] = -centavos;
      break;
    case 'SALDO_INICIAL':
    case 'AJUSTE': // el ajuste ya viene con su signo
      cambio[cuenta] = centavos;
      break;
    default:
      throw new Error(`Tipo de movimiento desconocido: ${tipo}`);
  }
  return cambio;
};

/** Cuentas que toca un movimiento (el depósito toca las dos). */
export const cuentasQueToca = (mov) => {
  const cambio = efecto({ ...mov, centavos: 1 });
  return CUENTAS.filter((c) => cambio[c] !== 0);
};

/**
 * Orden del día: primero el saldo inicial (es la plata con la que arranca el
 * día), después todo en el orden en que se cargó.
 * @param {{ fecha: string, tipo: string, momento: string|Date, orden?: number }} a
 * @param {{ fecha: string, tipo: string, momento: string|Date, orden?: number }} b
 */
export const compararMovimientos = (a, b) => {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  const inicialA = a.tipo === 'SALDO_INICIAL' ? 0 : 1;
  const inicialB = b.tipo === 'SALDO_INICIAL' ? 0 : 1;
  if (inicialA !== inicialB) return inicialA - inicialB;
  const momento = new Date(a.momento) - new Date(b.momento);
  if (momento !== 0) return momento;
  return (a.orden ?? 0) - (b.orden ?? 0);
};

/**
 * Agrega a cada movimiento el saldo de cada cuenta después de él, como la
 * columna del saldo de la planilla. Los movimientos tienen que venir ordenados.
 * @template {{ tipo: string, cuenta: string, centavos: number }} M
 * @param {M[]} movimientos
 * @returns {(M & { saldoCaja: number, saldoBanco: number })[]}
 */
export const conSaldos = (movimientos) => {
  const saldo = { CAJA: 0, BANCO: 0 };
  return movimientos.map((mov) => {
    const cambio = efecto(mov);
    saldo.CAJA += cambio.CAJA;
    saldo.BANCO += cambio.BANCO;
    return { ...mov, saldoCaja: saldo.CAJA, saldoBanco: saldo.BANCO };
  });
};
