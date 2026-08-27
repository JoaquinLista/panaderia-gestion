import { query } from '../config/db.js';

/**
 * Devuelve todas las sucursales ordenadas por tipo y nombre.
 */
export const listarSucursales = async () => {
  const { rows } = await query(
    `SELECT id, nombre, tipo
       FROM sucursales
      ORDER BY
        CASE tipo
          WHEN 'DEPOSITO' THEN 0
          WHEN 'FABRICA'  THEN 1
          WHEN 'VENTA'    THEN 2
          ELSE 3
        END,
        nombre ASC`
  );
  return rows;
};

/**
 * Devuelve una sucursal por id o null si no existe.
 * @param {number} id
 */
export const obtenerSucursalPorId = async (id) => {
  const { rows } = await query(
    'SELECT id, nombre, tipo FROM sucursales WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
};
