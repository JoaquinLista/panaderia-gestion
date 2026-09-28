import { configAuth, DURACION_SESION_MS, NOMBRE_COOKIE } from '../config/auth.js';
import { autenticar, firmarSesion } from '../services/authService.js';

// httpOnly: el JavaScript de la página no puede leer la cookie.
// SameSite=Strict: el navegador no la manda desde otros sitios (protege de CSRF).
const opcionesCookie = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: configAuth().cookieSegura,
  path: '/api',
});

/** Firma la sesión y la deja en la cookie de la respuesta. */
export const ponerCookieSesion = (res, sesion) => {
  res.cookie(NOMBRE_COOKIE, firmarSesion(sesion), {
    ...opcionesCookie(),
    maxAge: DURACION_SESION_MS,
  });
};

/**
 * POST /api/auth/login  { usuario, password, sucursalId? }
 */
export const login = async (req, res, next) => {
  try {
    const sesion = await autenticar(req.body ?? {});
    ponerCookieSesion(res, sesion);
    res.json(sesion);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout
 */
export const logout = (req, res) => {
  res.clearCookie(NOMBRE_COOKIE, opcionesCookie());
  res.status(204).end();
};

/**
 * GET /api/auth/me
 */
export const me = (req, res) => {
  res.json(req.sesion);
};
