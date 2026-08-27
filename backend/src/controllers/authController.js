import { autenticar, obtenerUsuarioPorId } from '../services/authService.js';
import { COOKIE_NAME, cookieOptions, firmarToken } from '../config/auth.js';

/** Proyección pública del usuario (lo que ve el frontend). */
const publico = (u) => ({
  id: u.id,
  email: u.email,
  nombre: u.nombre,
  rol: u.rol,
  sucursal_id: u.sucursal_id ?? null,
  sucursal_nombre: u.sucursal_nombre ?? null,
});

/**
 * POST /api/auth/login
 */
export const postLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const usuario = await autenticar(email, password);
    if (!usuario) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    res.cookie(COOKIE_NAME, firmarToken(usuario), cookieOptions);
    // Reobtenemos con el JOIN a sucursales para incluir sucursal_nombre.
    const completo = await obtenerUsuarioPorId(usuario.id);
    res.json(publico(completo ?? usuario));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout
 */
export const postLogout = (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
};

/**
 * GET /api/auth/me
 */
export const getMe = (req, res) => {
  res.json(publico(req.usuario));
};
