import { COOKIE_NAME, verificarToken } from '../config/auth.js';
import { obtenerUsuarioPorId } from '../services/authService.js';

/**
 * Exige una sesión válida. Deja el usuario en `req.usuario`.
 */
export const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    let payload;
    try {
      payload = verificarToken(token);
    } catch {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }

    const usuario = await obtenerUsuarioPorId(payload.sub);
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Usuario inexistente o inactivo' });
    }

    req.usuario = usuario;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Exige que el usuario tenga alguno de los roles indicados. DUENIO siempre pasa.
 * Debe ir después de requireAuth.
 */
export const requireRol = (...roles) => (req, res, next) => {
  if (!req.usuario) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (req.usuario.rol !== 'DUENIO' && !roles.includes(req.usuario.rol)) {
    return res
      .status(403)
      .json({ error: `Acción no permitida para el rol ${req.usuario.rol}` });
  }
  next();
};
