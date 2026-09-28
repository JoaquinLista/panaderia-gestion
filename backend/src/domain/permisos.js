/**
 * Matriz de permisos: qué puede hacer cada rol. Es la única fuente de verdad:
 * la API la usa para decidir y /api/auth/me se la pasa al frontend para que
 * muestre sólo los botones que corresponden. Aprobada por el PM (Sprint 2).
 */
export const ROLES = Object.freeze({
  ADMIN: 'ADMIN', // dueños y socios
  EMPLEADA: 'EMPLEADA', // atiende una sucursal, la que elige al iniciar sesión
  CHOFER: 'CHOFER', // lleva mercadería y carga o saca cosas del galpón
});

export const ACCIONES = Object.freeze({
  VER_SUCURSALES: 'sucursales:ver',
  VER_PRODUCTOS: 'productos:ver',
  VER_INSUMOS: 'insumos:ver',
  CARGAR_INSUMOS: 'insumos:cargar',
  VER_PEDIDOS: 'pedidos:ver',
  CREAR_PEDIDO: 'pedidos:crear',
  CAMBIAR_ESTADO_PEDIDO: 'pedidos:cambiar-estado',
  CERRAR_CAJA: 'caja:cerrar',
  ADMINISTRAR_USUARIOS: 'usuarios:administrar',
});

const MATRIZ = Object.freeze({
  [ROLES.ADMIN]: Object.values(ACCIONES),
  // La empleada ve y crea pedidos sólo de su sucursal del día: ese filtro lo
  // aplica la API, acá sólo se dice que la acción le corresponde.
  [ROLES.EMPLEADA]: [
    ACCIONES.VER_SUCURSALES,
    ACCIONES.VER_PRODUCTOS,
    ACCIONES.VER_PEDIDOS,
    ACCIONES.CREAR_PEDIDO,
  ],
  [ROLES.CHOFER]: [
    ACCIONES.VER_SUCURSALES,
    ACCIONES.VER_PRODUCTOS,
    ACCIONES.VER_INSUMOS,
    ACCIONES.CARGAR_INSUMOS,
    ACCIONES.VER_PEDIDOS,
    ACCIONES.CAMBIAR_ESTADO_PEDIDO,
  ],
});

/**
 * Lista de acciones permitidas para un usuario. El cierre de caja se suma a
 * una empleada sólo si la dueña le dio ese permiso.
 * @param {{ rol: string, puedeCerrarCaja?: boolean }} usuario
 */
export const permisosDe = ({ rol, puedeCerrarCaja = false }) => {
  const permisos = [...(MATRIZ[rol] ?? [])];
  if (rol === ROLES.EMPLEADA && puedeCerrarCaja) permisos.push(ACCIONES.CERRAR_CAJA);
  return permisos;
};

/**
 * Sucursal a la que queda limitada una sesión: la empleada sólo ve y crea
 * pedidos de su sucursal del día. Admin y chofer no tienen límite (null).
 * @param {{ usuario: { rol: string }, sucursal: { id: number } | null }} sesion
 */
export const sucursalRestringida = (sesion) =>
  sesion.usuario.rol === ROLES.EMPLEADA ? sesion.sucursal.id : null;

/**
 * @param {{ rol: string, puedeCerrarCaja?: boolean }} usuario
 * @param {string} accion
 */
export const puede = (usuario, accion) => permisosDe(usuario).includes(accion);
