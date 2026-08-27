/**
 * Quién puede llevar un pedido a cada estado.
 *
 * `posicion` indica contra qué sucursal del pedido se compara la del usuario:
 *   - 'origen'  : el usuario debe pertenecer a la sucursal de origen
 *   - 'destino' : el usuario debe pertenecer a la sucursal de destino
 *   - 'global'  : no importa la sucursal (p. ej. el chofer)
 *
 * El rol DUENIO puede hacer cualquier transición.
 */
const REGLAS = {
  EN_PREPARACION: { posicion: 'origen', roles: ['FABRICA', 'DEPOSITO'] },
  DESPACHADO: { posicion: 'global', roles: ['CHOFER'] },
  ENTREGADO: { posicion: 'global', roles: ['CHOFER'] },
  RECIBIDO: { posicion: 'destino', roles: ['FABRICA', 'VENTA'] },
  CANCELADO: { posicion: 'destino', roles: ['FABRICA', 'VENTA'] },
};

/** Descripción legible de quién puede hacer una transición (para mensajes de error). */
export const describirAutorizacion = (hacia) => {
  const regla = REGLAS[hacia];
  if (!regla) return 'nadie';
  const roles = regla.roles.join(' o ');
  if (regla.posicion === 'global') return `${roles} (o el dueño)`;
  return `${roles} de la sucursal de ${regla.posicion} (o el dueño)`;
};

/**
 * @param {{ rol: string, sucursal_id: number|null }} usuario
 * @param {{ sucursal_origen_id: number, sucursal_destino_id: number }} pedido
 * @param {string} hacia estado destino
 */
export const usuarioPuedeTransicionar = (usuario, pedido, hacia) => {
  if (!usuario) return false;
  if (usuario.rol === 'DUENIO') return true;

  const regla = REGLAS[hacia];
  if (!regla || !regla.roles.includes(usuario.rol)) return false;
  if (regla.posicion === 'global') return true;

  const objetivo =
    regla.posicion === 'origen' ? pedido.sucursal_origen_id : pedido.sucursal_destino_id;
  return Number(usuario.sucursal_id) === Number(objetivo);
};
