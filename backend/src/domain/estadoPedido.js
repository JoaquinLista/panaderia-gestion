/**
 * Máquina de estados del pedido.
 *
 * Fuente de verdad de los estados posibles y de las transiciones permitidas.
 * Regla: sólo se avanza hacia adelante, un paso a la vez. CANCELADO es
 * alcanzable únicamente mientras el pedido todavía no se despachó.
 *
 *   PENDIENTE ─▶ EN_PREPARACION ─▶ DESPACHADO ─▶ ENTREGADO ─▶ RECIBIDO
 *       │              │           (chofer)      (chofer)    (destino confirma)
 *       └──────────────┴──────────▶ CANCELADO
 */

export const ESTADOS = [
  'PENDIENTE',
  'EN_PREPARACION',
  'DESPACHADO',
  'ENTREGADO',
  'RECIBIDO',
  'CANCELADO',
];

/** Estados en los que se puede crear un pedido (RECIBIDO y CANCELADO no son estados iniciales). */
export const ESTADOS_INICIALES = ['PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO'];

/** Para cada estado, la lista de estados a los que puede transicionar. */
export const TRANSICIONES = {
  PENDIENTE: ['EN_PREPARACION', 'CANCELADO'],
  EN_PREPARACION: ['DESPACHADO', 'CANCELADO'],
  DESPACHADO: ['ENTREGADO'],
  ENTREGADO: ['RECIBIDO'],
  RECIBIDO: [],
  CANCELADO: [],
};

export const esEstadoValido = (estado) => ESTADOS.includes(estado);

export const esEstadoInicialValido = (estado) => ESTADOS_INICIALES.includes(estado);

export const transicionesDesde = (estado) => TRANSICIONES[estado] ?? [];

export const puedeTransicionar = (desde, hacia) => transicionesDesde(desde).includes(hacia);

export const esEstadoFinal = (estado) => transicionesDesde(estado).length === 0;
