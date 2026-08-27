import { listarInsumos, guardarInsumo } from '../services/insumosService.js';

/**
 * GET /api/insumos
 */
export const getInsumos = async (req, res, next) => {
  try {
    const insumos = await listarInsumos();
    res.json(insumos);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/insumos
 * Crea un insumo o actualiza el stock de uno existente (upsert por nombre).
 */
export const postInsumo = async (req, res, next) => {
  try {
    const { nombre, stock_actual } = req.body ?? {};

    if (!nombre || String(nombre).trim() === '') {
      return res.status(400).json({ error: 'El campo "nombre" es obligatorio' });
    }
    if (stock_actual === undefined || stock_actual === null || Number.isNaN(Number(stock_actual))) {
      return res.status(400).json({ error: 'El campo "stock_actual" es obligatorio y numérico' });
    }
    if (Number(stock_actual) < 0) {
      return res.status(400).json({ error: 'El campo "stock_actual" no puede ser negativo' });
    }

    const insumo = await guardarInsumo(req.body);
    res.status(201).json(insumo);
  } catch (error) {
    next(error);
  }
};
