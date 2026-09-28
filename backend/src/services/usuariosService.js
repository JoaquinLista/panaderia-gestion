import { query } from '../config/db.js';
import { hashearPassword, LARGO_MINIMO_PASSWORD } from '../domain/password.js';
import { ROLES } from '../domain/permisos.js';

const errorHttp = (status, mensaje) => Object.assign(new Error(mensaje), { status });

const COLUMNAS = 'id, usuario, nombre, rol, puede_cerrar_caja, activo';

/** Lo que ve la pantalla de usuarios: nunca el hash de la contraseña. */
const aPublico = (fila) => ({
  id: fila.id,
  usuario: fila.usuario,
  nombre: fila.nombre,
  rol: fila.rol,
  puedeCerrarCaja: fila.puede_cerrar_caja,
  activo: fila.activo,
});

const validarRol = (rol) => {
  if (!Object.values(ROLES).includes(rol)) {
    throw errorHttp(400, `Rol inválido. Válidos: ${Object.values(ROLES).join(', ')}`);
  }
};

const validarNombre = (nombre) => {
  if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 120) {
    throw errorHttp(400, 'El nombre es obligatorio (hasta 120 caracteres)');
  }
};

const validarPassword = (password) => {
  if (typeof password !== 'string' || password.length < LARGO_MINIMO_PASSWORD) {
    throw errorHttp(
      400,
      `La contraseña tiene que tener al menos ${LARGO_MINIMO_PASSWORD} caracteres`
    );
  }
};

// El permiso de cerrar caja sólo tiene sentido para una empleada: el admin ya
// puede y el chofer no (matriz aprobada por el PM).
const cajaSegunRol = (rol, puedeCerrarCaja) => rol === ROLES.EMPLEADA && Boolean(puedeCerrarCaja);

const buscarPorId = async (id) => {
  const { rows } = await query(`SELECT ${COLUMNAS} FROM usuarios WHERE id = $1`, [id]);
  if (!rows[0]) throw errorHttp(404, 'No existe ese usuario');
  return rows[0];
};

export const listarUsuarios = async () => {
  const { rows } = await query(
    `SELECT ${COLUMNAS} FROM usuarios ORDER BY activo DESC, lower(nombre) ASC`
  );
  return rows.map(aPublico);
};

/**
 * Alta de un usuario. El nombre de usuario no distingue mayúsculas.
 * @param {{ usuario: string, nombre: string, password: string, rol: string, puedeCerrarCaja?: boolean }} datos
 */
export const crearUsuario = async ({ usuario, nombre, password, rol, puedeCerrarCaja } = {}) => {
  if (typeof usuario !== 'string' || !/^\S{3,60}$/.test(usuario.trim())) {
    throw errorHttp(400, 'El usuario tiene que tener entre 3 y 60 caracteres, sin espacios');
  }
  validarNombre(nombre);
  validarPassword(password);
  validarRol(rol);

  const { rows } = await query(
    `INSERT INTO usuarios (usuario, nombre, password_hash, rol, puede_cerrar_caja)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (lower(usuario)) DO NOTHING
     RETURNING ${COLUMNAS}`,
    [
      usuario.trim(),
      nombre.trim(),
      await hashearPassword(password),
      rol,
      cajaSegunRol(rol, puedeCerrarCaja),
    ]
  );
  if (!rows[0]) throw errorHttp(409, 'Ya existe un usuario con ese nombre');
  return aPublico(rows[0]);
};

/**
 * Cambia nombre, rol, permiso de caja o si está activo. Desactivar a alguien
 * corta sus sesiones abiertas.
 * @param {number} id
 * @param {{ nombre?: string, rol?: string, puedeCerrarCaja?: boolean, activo?: boolean }} cambios
 * @param {{ idSesion: number }} quien  el admin que hace el cambio
 */
export const actualizarUsuario = async (id, cambios = {}, { idSesion }) => {
  const actual = await buscarPorId(id);
  const nombre = cambios.nombre ?? actual.nombre;
  const rol = cambios.rol ?? actual.rol;
  const activo = cambios.activo ?? actual.activo;
  const caja = cajaSegunRol(rol, cambios.puedeCerrarCaja ?? actual.puede_cerrar_caja);

  validarNombre(nombre);
  validarRol(rol);
  if (typeof activo !== 'boolean') throw errorHttp(400, 'El campo "activo" es true o false');
  // Así nunca se queda el negocio sin nadie que pueda administrar.
  if (id === idSesion && (rol !== actual.rol || !activo)) {
    throw errorHttp(400, 'No podés cambiar tu propio rol ni desactivar tu propio usuario');
  }

  const cortarSesiones = actual.activo && !activo;
  const { rows } = await query(
    `UPDATE usuarios
        SET nombre = $2, rol = $3, puede_cerrar_caja = $4, activo = $5,
            sesiones_desde = CASE WHEN $6 THEN $7 ELSE sesiones_desde END,
            actualizado_en = now()
      WHERE id = $1
      RETURNING ${COLUMNAS}`,
    [id, nombre.trim(), rol, caja, activo, cortarSesiones, new Date()]
  );
  return aPublico(rows[0]);
};

/**
 * La dueña le pone una contraseña nueva a alguien que se la olvidó. Corta
 * todas las sesiones abiertas de ese usuario (por si le robaron el celular).
 * La hora de corte sale del reloj del backend, el mismo que firma los tokens.
 * @param {number} id
 * @param {string} password
 */
export const resetearPassword = async (id, password) => {
  validarPassword(password);
  const { rowCount } = await query(
    `UPDATE usuarios
        SET password_hash = $2, sesiones_desde = $3, actualizado_en = now()
      WHERE id = $1`,
    [id, await hashearPassword(password), new Date()]
  );
  if (rowCount === 0) throw errorHttp(404, 'No existe ese usuario');
};
