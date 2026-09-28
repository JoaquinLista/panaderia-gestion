/**
 * Corta con 403 si la sesión no tiene permiso para la acción. Va siempre
 * después de `requerirSesion`, que deja la sesión en `req.sesion`.
 * La matriz de permisos está en domain/permisos.js.
 * @param {string} accion  una de ACCIONES (ej. 'pedidos:crear')
 */
export const permitir = (accion) => (req, res, next) => {
  if (!req.sesion?.permisos?.includes(accion)) {
    res.status(403).json({ error: 'No tenés permiso para hacer esto' });
    return;
  }
  next();
};
