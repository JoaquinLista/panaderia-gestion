/**
 * Roles de usuario.
 *
 * - DUENIO   : acceso total, sin sucursal asociada. Puede hacer cualquier acción.
 * - DEPOSITO : opera el Depósito Central (prepara los pedidos de insumos). NO ve el
 *              stock: sólo lo agrega o lo saca (movimientos), sin conocer los totales.
 * - FABRICA  : opera una sucursal que fabrica (Viedma): pide insumos, prepara y
 *              despacha pedidos de productos.
 * - VENTA    : opera un punto de venta: pide productos y confirma recepciones.
 * - CHOFER   : transporta; marca los pedidos como despachados y entregados.
 */

export const ROLES = ['DUENIO', 'DEPOSITO', 'FABRICA', 'VENTA', 'CHOFER'];

/** Roles que trabajan asociados a una sucursal concreta (sucursal_id obligatorio). */
export const ROLES_CON_SUCURSAL = ['DEPOSITO', 'FABRICA', 'VENTA'];

/** Roles que pueden crear pedidos. */
export const ROLES_CREAN_PEDIDOS = ['FABRICA', 'VENTA'];

/** Roles que ven el stock de insumos (cantidades, mínimos, alertas). Sólo el dueño. */
export const ROLES_VEN_STOCK = ['DUENIO'];

export const esRolValido = (rol) => ROLES.includes(rol);
