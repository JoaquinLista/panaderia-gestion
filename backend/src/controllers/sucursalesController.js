import { listarSucursales } from '../services/sucursalesService.js';

/**
 * GET /api/sucursales
 */
export const getSucursales = async (req, res, next) => {
  try {
    const sucursales = await listarSucursales();
    res.json(sucursales);
  } catch (error) {
    next(error);
  }
};
