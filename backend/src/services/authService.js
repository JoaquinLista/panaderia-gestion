import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

import { query } from '../config/db.js';
import { configAuth, DURACION_SESION_MS } from '../config/auth.js';
import { hashearPassword, verificarPassword, LARGO_MINIMO_PASSWORD } from '../domain/password.js';
import { permisosDe, ROLES } from '../domain/permisos.js';

// Mismo mensaje si el usuario no existe, si la contraseña está mal o si está
// desactivado: así no se puede averiguar qué usuarios existen.
export const MENSAJE_CREDENCIALES = 'Usuario o contraseña incorrectos';

const errorHttp = (status, mensaje) => Object.assign(new Error(mensaje), { status });

const COLUMNAS_USUARIO = 'id, usuario, nombre, password_hash, rol, puede_cerrar_caja, activo';

// Hash de una contraseña al azar que no es de nadie. Si el usuario no existe se
// verifica igual contra este hash, para que la respuesta tarde lo mismo.
let hashFicticio;
const obtenerHashFicticio = () => {
  hashFicticio ??= hashearPassword(randomBytes(16).toString('hex'));
  return hashFicticio;
};

const buscarUsuarioPorNombre = async (usuario) => {
  const { rows } = await query(
    `SELECT ${COLUMNAS_USUARIO} FROM usuarios WHERE lower(usuario) = lower($1)`,
    [usuario]
  );
  return rows[0] ?? null;
};

const buscarUsuarioPorId = async (id) => {
  const { rows } = await query(`SELECT ${COLUMNAS_USUARIO} FROM usuarios WHERE id = $1`, [id]);
  return rows[0] ?? null;
};

const buscarSucursal = async (id) => {
  const { rows } = await query('SELECT id, nombre, tipo FROM sucursales WHERE id = $1', [id]);
  return rows[0] ?? null;
};

/** Lo que ve el frontend de la sesión: nunca incluye el hash de la contraseña. */
const armarSesion = (usuario, sucursal) => ({
  usuario: {
    id: usuario.id,
    usuario: usuario.usuario,
    nombre: usuario.nombre,
    rol: usuario.rol,
    puedeCerrarCaja: usuario.puede_cerrar_caja,
  },
  sucursal,
  permisos: permisosDe({ rol: usuario.rol, puedeCerrarCaja: usuario.puede_cerrar_caja }),
});

/**
 * Las empleadas rotan: al entrar eligen dónde trabajan hoy. El galpón no es un
 * lugar de trabajo (no tiene personal), así que no se puede elegir.
 */
const sucursalDelDia = async (sucursalId) => {
  const id = Number(sucursalId);
  if (!Number.isInteger(id) || id <= 0) {
    throw errorHttp(400, 'Elegí la sucursal donde trabajás hoy');
  }
  const sucursal = await buscarSucursal(id);
  if (!sucursal || sucursal.tipo === 'DEPOSITO') {
    throw errorHttp(400, 'Esa sucursal no está disponible para trabajar');
  }
  return sucursal;
};

/**
 * Valida usuario y contraseña y devuelve la sesión.
 * @param {{ usuario?: string, password?: string, sucursalId?: number }} datos
 */
export const autenticar = async ({ usuario, password, sucursalId } = {}) => {
  if (typeof usuario !== 'string' || !usuario.trim() || typeof password !== 'string' || !password) {
    throw errorHttp(400, 'Ingresá tu usuario y contraseña');
  }
  const encontrado = await buscarUsuarioPorNombre(usuario.trim());
  const hash = encontrado?.password_hash ?? (await obtenerHashFicticio());
  const passwordValida = await verificarPassword(password, hash);
  if (!encontrado || !passwordValida || !encontrado.activo) {
    throw errorHttp(401, MENSAJE_CREDENCIALES);
  }
  const sucursal = encontrado.rol === ROLES.EMPLEADA ? await sucursalDelDia(sucursalId) : null;
  return armarSesion(encontrado, sucursal);
};

/**
 * Token firmado que va en la cookie. Sólo lleva el id del usuario y la
 * sucursal del día: el rol y los permisos se leen de la base en cada request.
 */
export const firmarSesion = (sesion) =>
  jwt.sign({ suc: sesion.sucursal?.id ?? null }, configAuth().secreto, {
    subject: String(sesion.usuario.id),
    expiresIn: DURACION_SESION_MS / 1000,
    algorithm: 'HS256',
  });

/**
 * Recupera la sesión a partir del token de la cookie. Devuelve null si el
 * token es inválido o venció, si el usuario ya no existe o fue desactivado.
 * Como el usuario se lee de la base, desactivar a alguien o cambiarle el rol
 * tiene efecto en su próximo request, sin esperar a que venza el token.
 * @param {string} token
 */
export const sesionDesdeToken = async (token) => {
  let payload;
  try {
    payload = jwt.verify(token, configAuth().secreto, { algorithms: ['HS256'] });
  } catch (_error) {
    return null;
  }
  const usuario = await buscarUsuarioPorId(Number(payload.sub));
  if (!usuario?.activo) return null;
  let sucursal = null;
  if (usuario.rol === ROLES.EMPLEADA) {
    // Si la pasaron a empleada después de entrar, no tiene sucursal del día:
    // tiene que volver a iniciar sesión y elegirla.
    sucursal = payload.suc ? await buscarSucursal(payload.suc) : null;
    if (!sucursal) return null;
  }
  return armarSesion(usuario, sucursal);
};

/**
 * Crea el primer admin con ADMIN_USUARIO y ADMIN_PASSWORD si todavía no hay
 * ningún admin activo. Si ya hay uno, no toca nada: la contraseña del entorno
 * sólo sirve para el primer ingreso.
 */
export const asegurarAdminInicial = async ({
  usuario = process.env.ADMIN_USUARIO,
  password = process.env.ADMIN_PASSWORD,
  log = console.log,
} = {}) => {
  const { rows } = await query(`SELECT 1 FROM usuarios WHERE rol = 'ADMIN' AND activo LIMIT 1`);
  if (rows.length > 0) return false;
  if (!usuario?.trim() || !password) {
    log('[auth] Aviso: no hay ningún admin y faltan ADMIN_USUARIO / ADMIN_PASSWORD.');
    return false;
  }
  if (password.length < LARGO_MINIMO_PASSWORD) {
    throw new Error(`ADMIN_PASSWORD tiene que tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`);
  }
  const { rowCount } = await query(
    `INSERT INTO usuarios (usuario, nombre, password_hash, rol)
     VALUES ($1, 'Administración', $2, 'ADMIN')
     ON CONFLICT (lower(usuario)) DO NOTHING`,
    [usuario.trim(), await hashearPassword(password)]
  );
  if (rowCount === 0) {
    log(
      `[auth] Aviso: ya existe un usuario "${usuario.trim()}" que no es admin; no se creó el admin inicial.`
    );
    return false;
  }
  log(`[auth] Admin inicial "${usuario.trim()}" creado.`);
  return true;
};
