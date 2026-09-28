import { NOMBRE_COOKIE } from '../config/auth.js';
import { sesionDesdeToken } from '../services/authService.js';

/**
 * Corta con 401 si el request no trae una sesión válida. Si la trae, la deja en
 * `req.sesion` (usuario, sucursal del día y permisos) para las rutas siguientes.
 */
export const requerirSesion = async (req, res, next) => {
  try {
    const token = req.cookies?.[NOMBRE_COOKIE];
    const sesion = token ? await sesionDesdeToken(token) : null;
    if (!sesion) {
      res.status(401).json({ error: 'Tu sesión venció o no iniciaste sesión' });
      return;
    }
    req.sesion = sesion;
    next();
  } catch (error) {
    next(error);
  }
};
