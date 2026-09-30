// Reglas de los pedidos que usa la pantalla (Sprint 9, #77). Espejo de
// backend/src/domain/estadoPedido.js: el backend es el que decide.

export const ETIQUETA_ESTADO = {
  PENDIENTE: 'Pendiente',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  RECIBIDO: 'Recibido',
  CANCELADO: 'Cancelado',
};

export const BADGE_ESTADO = {
  PENDIENTE: 'badge-warn',
  EN_CAMINO: 'badge-info',
  ENTREGADO: 'badge-info',
  RECIBIDO: 'badge-ok',
  CANCELADO: 'badge-muted',
};

export const ABIERTOS = ['PENDIENTE', 'EN_CAMINO', 'ENTREGADO'];

/**
 * Botones que le tocan a esta sesión para un pedido: el chofer (o la dueña)
 * mueve el reparto; la sucursal que pidió cancela o confirma que le llegó.
 * @returns {Array<{ estado: string, etiqueta: string, peligro?: boolean }>}
 */
export function accionesPedido(pedido, sesion) {
  const permisos = sesion.permisos ?? [];
  const reparto = permisos.includes('pedidos:cambiar-estado');
  const esDeMiSucursal =
    permisos.includes('pedidos:crear') &&
    (!sesion.sucursal || sesion.sucursal.id === pedido.sucursal_destino_id);

  const acciones = [];
  if (reparto && pedido.estado === 'PENDIENTE') {
    acciones.push({ estado: 'EN_CAMINO', etiqueta: 'Salió' });
  }
  if (reparto && pedido.estado === 'EN_CAMINO') {
    acciones.push({ estado: 'ENTREGADO', etiqueta: 'Entregado' });
  }
  if (esDeMiSucursal && ['EN_CAMINO', 'ENTREGADO'].includes(pedido.estado)) {
    acciones.push({ estado: 'RECIBIDO', etiqueta: 'Llegó' });
  }
  if (esDeMiSucursal && pedido.estado === 'PENDIENTE') {
    acciones.push({ estado: 'CANCELADO', etiqueta: 'Cancelar', peligro: true });
  }
  return acciones;
}

/**
 * Rubros que puede pedir una sucursal: no tiene sentido pedirse a sí misma
 * lo que ella misma hace (la fábrica no se pide facturas).
 */
export function rubrosParaPedir(rubros, sucursalId) {
  return rubros.filter((r) => r.sucursal_origen_id !== Number(sucursalId));
}

/** "Viedma (Chacra) y Galpón Central": de dónde salen los pedidos recién creados. */
export function lugaresDeOrigen(pedidos) {
  const nombres = [...new Set(pedidos.map((p) => p.sucursal_origen_nombre))];
  return nombres.length <= 1
    ? (nombres[0] ?? '')
    : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}
