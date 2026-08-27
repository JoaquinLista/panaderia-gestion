import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';

const USUARIO_SELECT = `
  SELECT u.id,
         u.email,
         u.nombre,
         u.rol,
         u.sucursal_id,
         u.activo,
         s.nombre AS sucursal_nombre
    FROM usuarios u
    LEFT JOIN sucursales s ON s.id = u.sucursal_id`;

/**
 * Recupera un usuario por id (sin el hash de contraseña), o null si no existe.
 * @param {number} id
 */
export const obtenerUsuarioPorId = async (id) => {
  const { rows } = await query(`${USUARIO_SELECT} WHERE u.id = $1`, [id]);
  return rows[0] ?? null;
};

/**
 * Valida email + contraseña. Devuelve el usuario (sin hash) o null si no coincide
 * o está inactivo.
 * @param {string} email
 * @param {string} password
 */
export const autenticar = async (email, password) => {
  const correo = String(email ?? '').trim().toLowerCase();
  if (!correo) return null;

  const { rows } = await query(
    `SELECT id, email, nombre, rol, sucursal_id, activo, password_hash
       FROM usuarios
      WHERE email = $1`,
    [correo]
  );
  const usuario = rows[0];
  if (!usuario || !usuario.activo) return null;

  const coincide = await bcrypt.compare(String(password ?? ''), usuario.password_hash);
  if (!coincide) return null;

  delete usuario.password_hash;
  return usuario;
};
