import {
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  resetearPassword,
} from '../services/usuariosService.js';
import { ponerCookieSesion } from './authController.js';
import { sesionDesdeUsuario } from '../services/authService.js';

const idDe = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw Object.assign(new Error('No existe ese usuario'), { status: 404 });
  }
  return id;
};

/**
 * GET /api/usuarios
 */
export const getUsuarios = async (req, res, next) => {
  try {
    res.json(await listarUsuarios());
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/usuarios  { usuario, nombre, password, rol, puedeCerrarCaja? }
 */
export const postUsuario = async (req, res, next) => {
  try {
    res.status(201).json(await crearUsuario(req.body ?? {}));
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/usuarios/:id  { nombre?, rol?, puedeCerrarCaja?, activo? }
 */
export const patchUsuario = async (req, res, next) => {
  try {
    const usuario = await actualizarUsuario(idDe(req), req.body ?? {}, {
      idSesion: req.sesion.usuario.id,
    });
    res.json(usuario);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/usuarios/:id/password  { password }
 * Si la dueña cambia su propia contraseña, se le da una sesión nueva para que
 * no la saque de la app (las demás sesiones suyas sí se cortan).
 */
export const putPassword = async (req, res, next) => {
  try {
    const id = idDe(req);
    await resetearPassword(id, req.body?.password);
    if (id === req.sesion.usuario.id) {
      ponerCookieSesion(res, await sesionDesdeUsuario(id, req.sesion.sucursal));
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
