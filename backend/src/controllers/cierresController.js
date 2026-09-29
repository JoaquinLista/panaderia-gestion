import { crearCierre, cierresDeHoy } from '../services/cierresService.js';

/**
 * POST /api/cierres
 * Carga el cierre de un turno. La empleada, en su sucursal del día; la dueña
 * manda `sucursal_id`.
 */
export const postCierre = async (req, res, next) => {
  try {
    const cierre = await crearCierre(req.body ?? {}, req.sesion);
    res.status(201).json(cierre);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/cierres/hoy[?sucursal_id=]
 * Turnos de hoy ya cerrados en la sucursal y el cambio fijo a sugerir.
 */
export const getCierresDeHoy = async (req, res, next) => {
  try {
    res.json(await cierresDeHoy(req.sesion, req.query.sucursal_id));
  } catch (error) {
    next(error);
  }
};
