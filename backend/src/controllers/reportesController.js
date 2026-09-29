import { crearReporte } from '../services/reportesService.js';

/** POST /api/reportes: cualquier persona con sesión reporta un problema. */
export const postReporte = async (req, res, next) => {
  try {
    res.status(201).json(await crearReporte(req.body, req.sesion));
  } catch (error) {
    next(error);
  }
};
