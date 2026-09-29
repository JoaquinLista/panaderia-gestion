import { permisosDe } from '../../src/domain/permisos.js';

const sesion = (id, rol, sucursal = null, puedeCerrarCaja = false) => ({
  usuario: { id, usuario: rol.toLowerCase(), nombre: rol, rol, puedeCerrarCaja },
  sucursal,
  permisos: permisosDe({ rol, puedeCerrarCaja }),
});

export const SESION_ADMIN = sesion(1, 'ADMIN');
export const SESION_EMPLEADA = sesion(2, 'EMPLEADA', { id: 3, nombre: 'Estrada', tipo: 'VENTA' });
// Empleada a la que la dueña le dio el permiso de cerrar caja.
export const SESION_EMPLEADA_CAJA = sesion(
  4,
  'EMPLEADA',
  { id: 3, nombre: 'Estrada', tipo: 'VENTA' },
  true
);
export const SESION_CHOFER = sesion(3, 'CHOFER');

/**
 * Reemplazo de `requerirSesion` para los tests de las rutas de negocio: deja
 * la sesión que diga `sesionActual()` (por defecto la del admin). El login real
 * se prueba en tests/api/auth.test.js y tests/api/permisos.test.js.
 */
let actual = SESION_ADMIN;
export const usarSesion = (s) => {
  actual = s;
};
export const requerirSesionFalsa = (req, _res, next) => {
  req.sesion = actual;
  next();
};
