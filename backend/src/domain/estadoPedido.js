/**
 * Máquina de estados del pedido (Sprint 9, #77).
 *
 * Fuente de verdad de los estados posibles, de las transiciones permitidas y
 * de quién puede hacer cada una: el reparto (chofer o dueña) mueve el pedido
 * por la calle; la sucursal que pidió lo cancela o confirma que le llegó.
 *
 *   PENDIENTE ─▶ EN_CAMINO ─▶ ENTREGADO ─▶ RECIBIDO
 *       │         (reparto)    (reparto)    (sucursal)
 *       │             └────────────────────▲ si el chofer no marcó "entregado"
 *       └─▶ CANCELADO (sucursal, mientras no salió)
 */

export const ESTADOS = ['PENDIENTE', 'EN_CAMINO', 'ENTREGADO', 'RECIBIDO', 'CANCELADO'];

/** Pedidos que todavía tiene que mirar el chofer. */
export const ESTADOS_ABIERTOS = ['PENDIENTE', 'EN_CAMINO'];

/** Quién hace cada paso: 'reparto' (chofer o dueña) o 'sucursal' (la que pidió). */
export const TRANSICIONES = {
  PENDIENTE: { EN_CAMINO: 'reparto', CANCELADO: 'sucursal' },
  EN_CAMINO: { ENTREGADO: 'reparto', RECIBIDO: 'sucursal' },
  ENTREGADO: { RECIBIDO: 'sucursal' },
  RECIBIDO: {},
  CANCELADO: {},
};

/** Columna con la hora en que el pedido llegó a cada estado. */
export const COLUMNA_HORA = {
  EN_CAMINO: 'en_camino_en',
  ENTREGADO: 'entregado_en',
  RECIBIDO: 'recibido_en',
  CANCELADO: 'cancelado_en',
};

/** Estados de cada renglón: el chofer tilda lo que carga o marca que no había. */
export const ESTADOS_ITEM = ['PENDIENTE', 'LLEVADO', 'NO_HABIA'];

export const esEstadoValido = (estado) => ESTADOS.includes(estado);

export const esEstadoItemValido = (estado) => ESTADOS_ITEM.includes(estado);

export const transicionesDesde = (estado) => Object.keys(TRANSICIONES[estado] ?? {});

export const puedeTransicionar = (desde, hacia) => transicionesDesde(desde).includes(hacia);

/** 'reparto', 'sucursal' o null si la transición no existe. */
export const quienTransiciona = (desde, hacia) => TRANSICIONES[desde]?.[hacia] ?? null;

export const esEstadoFinal = (estado) => transicionesDesde(estado).length === 0;

export const estaAbierto = (estado) => ESTADOS_ABIERTOS.includes(estado);
