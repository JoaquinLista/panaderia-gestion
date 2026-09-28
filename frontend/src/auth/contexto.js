import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

/**
 * Sesión actual: `{ sesion, cargando, entrar, salir }`.
 * `sesion` es lo que devuelve /api/auth/me (usuario, sucursal del día y permisos)
 * o null si nadie inició sesión.
 */
export function useAuth() {
  const valor = useContext(AuthContext);
  if (!valor) throw new Error('useAuth se usa dentro de <AuthProvider>');
  return valor;
}

/** ¿La sesión tiene permiso para esta acción? (ej. 'pedidos:crear') */
export const tienePermiso = (sesion, accion) => Boolean(sesion?.permisos?.includes(accion));
