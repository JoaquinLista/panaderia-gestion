import { query } from '../config/db.js';

/**
 * Lista de rubros que piden las sucursales (Sprint 9, #77): la dueña agrega,
 * renombra, cambia de dónde sale cada uno, lo ordena o lo desactiva.
 * Un rubro no se borra: los pedidos viejos lo siguen mostrando.
 */

const errorHttp = (status, mensaje) => Object.assign(new Error(mensaje), { status });

export const LARGO_NOMBRE = 60;

/** Sólo la fábrica y el galpón preparan pedidos. */
const TIPOS_QUE_PREPARAN = ['FABRICA', 'DEPOSITO'];

const SELECT_RUBRO = `
  SELECT r.id, r.nombre, r.activo, r.orden,
         r.sucursal_origen_id, s.nombre AS sucursal_origen_nombre
    FROM rubros r
    JOIN sucursales s ON s.id = r.sucursal_origen_id`;

const idValido = (crudo) => {
  const id = Number(crudo);
  if (!Number.isInteger(id) || id <= 0) throw errorHttp(400, 'Id de rubro inválido');
  return id;
};

const validarNombre = (crudo) => {
  const nombre = String(crudo ?? '').trim();
  if (nombre === '') throw errorHttp(400, 'Escribí el nombre del rubro');
  if (nombre.length > LARGO_NOMBRE) {
    throw errorHttp(400, `El nombre puede tener hasta ${LARGO_NOMBRE} letras`);
  }
  return nombre;
};

const validarOrden = (crudo) => {
  const orden = Number(crudo);
  if (!Number.isInteger(orden) || orden < 0) {
    throw errorHttp(400, 'El orden tiene que ser un número entero, 0 o más');
  }
  return orden;
};

/** La sucursal de origen tiene que existir y ser la fábrica o el galpón. */
const validarOrigen = async (crudo) => {
  const id = Number(crudo);
  if (!Number.isInteger(id) || id <= 0) throw errorHttp(400, 'Elegí de dónde sale el rubro');
  const { rows } = await query('SELECT id, nombre, tipo FROM sucursales WHERE id = $1', [id]);
  if (!rows[0]) throw errorHttp(400, `No existe la sucursal #${id}`);
  if (!TIPOS_QUE_PREPARAN.includes(rows[0].tipo)) {
    throw errorHttp(400, `${rows[0].nombre} no prepara pedidos: elegí la fábrica o el galpón`);
  }
  return id;
};

const obtenerRubro = async (id) => {
  const { rows } = await query(`${SELECT_RUBRO} WHERE r.id = $1`, [id]);
  return rows[0] ?? null;
};

/** El índice único de nombre (sin importar mayúsculas) avisa si ya existe. */
const conNombreUnico = async (nombre, operacion) => {
  try {
    return await operacion();
  } catch (error) {
    if (error.code === '23505') throw errorHttp(409, `Ya existe el rubro "${nombre}"`);
    throw error;
  }
};

/**
 * @param {{ nombre: string, sucursal_origen_id: number, orden?: number }} datos
 * Sin orden, va al final de la lista.
 */
export const crearRubro = async (datos) => {
  const nombre = validarNombre(datos.nombre);
  const origen = await validarOrigen(datos.sucursal_origen_id);
  const orden =
    datos.orden === undefined || datos.orden === null ? null : validarOrden(datos.orden);

  const { rows } = await conNombreUnico(nombre, () =>
    query(
      `INSERT INTO rubros (nombre, sucursal_origen_id, orden)
       VALUES ($1, $2, COALESCE($3, (SELECT COALESCE(MAX(orden), 0) + 10 FROM rubros)))
       RETURNING id`,
      [nombre, origen, orden]
    )
  );
  return obtenerRubro(rows[0].id);
};

/**
 * Cambia sólo los campos que vienen: nombre, sucursal_origen_id, orden, activo.
 * @param {number | string} idCrudo
 * @param {{ nombre?: string, sucursal_origen_id?: number, orden?: number, activo?: boolean }} datos
 */
export const actualizarRubro = async (idCrudo, datos) => {
  const id = idValido(idCrudo);
  const cambios = [];
  const valores = [];
  const agregar = (columna, valor) => {
    valores.push(valor);
    cambios.push(`${columna} = $${valores.length}`);
  };

  let nombre;
  if (datos.nombre !== undefined) {
    nombre = validarNombre(datos.nombre);
    agregar('nombre', nombre);
  }
  if (datos.sucursal_origen_id !== undefined) {
    agregar('sucursal_origen_id', await validarOrigen(datos.sucursal_origen_id));
  }
  if (datos.orden !== undefined) agregar('orden', validarOrden(datos.orden));
  if (datos.activo !== undefined) {
    if (typeof datos.activo !== 'boolean') throw errorHttp(400, '"activo" tiene que ser sí o no');
    agregar('activo', datos.activo);
  }
  if (cambios.length === 0) throw errorHttp(400, 'No hay nada para cambiar');

  valores.push(id);
  const { rowCount } = await conNombreUnico(nombre, () =>
    query(`UPDATE rubros SET ${cambios.join(', ')} WHERE id = $${valores.length}`, valores)
  );
  if (rowCount === 0) throw errorHttp(404, `No existe el rubro #${id}`);
  return obtenerRubro(id);
};
