import { query } from '../config/db.js';

/**
 * Devuelve el catálogo de productos de panadería.
 */
export const listarProductos = async () => {
  const { rows } = await query(
    `SELECT id, nombre, unidad_medida
       FROM productos
      ORDER BY nombre ASC`
  );
  return rows;
};
