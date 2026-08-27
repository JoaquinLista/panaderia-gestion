import { query } from '../config/db.js';

/**
 * Lista todos los insumos e incluye una bandera calculada `bajo_stock`.
 */
export const listarInsumos = async () => {
  const { rows } = await query(
    `SELECT id,
            nombre,
            stock_actual,
            stock_minimo,
            unidad_medida,
            (stock_actual < stock_minimo) AS bajo_stock
       FROM insumos
      ORDER BY nombre ASC`
  );
  return rows;
};

/**
 * Crea un insumo nuevo o actualiza el stock de uno existente (upsert por nombre).
 * @param {{ nombre: string, stock_actual: number, stock_minimo?: number, unidad_medida?: string }} data
 */
export const guardarInsumo = async (data) => {
  const nombre = String(data.nombre).trim();
  const stockActual = Number(data.stock_actual);
  const stockMinimo =
    data.stock_minimo === undefined || data.stock_minimo === null
      ? null
      : Number(data.stock_minimo);
  const unidadMedida =
    data.unidad_medida === undefined || data.unidad_medida === null
      ? null
      : String(data.unidad_medida).trim();

  const { rows } = await query(
    `INSERT INTO insumos (nombre, stock_actual, stock_minimo, unidad_medida)
     VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 'unidad'))
     ON CONFLICT (nombre) DO UPDATE
        SET stock_actual  = EXCLUDED.stock_actual,
            stock_minimo  = COALESCE($3, insumos.stock_minimo),
            unidad_medida = COALESCE($4, insumos.unidad_medida)
     RETURNING id,
               nombre,
               stock_actual,
               stock_minimo,
               unidad_medida,
               (stock_actual < stock_minimo) AS bajo_stock`,
    [nombre, stockActual, stockMinimo, unidadMedida]
  );

  return rows[0];
};
