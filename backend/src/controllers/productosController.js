import { listarProductos } from '../services/productosService.js';

/**
 * GET /api/productos
 */
export const getProductos = async (req, res, next) => {
  try {
    const productos = await listarProductos();
    res.json(productos);
  } catch (error) {
    next(error);
  }
};
