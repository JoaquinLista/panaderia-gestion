import {
  crearCierre,
  cierresDeHoy,
  cierresPendientes,
  corregirCierre,
  detalleCierre,
  listarCierres,
  marcarRevisado,
} from '../services/cierresService.js';

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

/** GET /api/cierres?sucursal_id=&desde=&hasta=&a_revisar=true (sólo la dueña) */
export const getCierres = async (req, res, next) => {
  try {
    res.json(await listarCierres(req.query));
  } catch (error) {
    next(error);
  }
};

/** GET /api/cierres/pendientes: sucursales que no cargaron algún turno de hoy. */
export const getPendientes = async (req, res, next) => {
  try {
    res.json(await cierresPendientes());
  } catch (error) {
    next(error);
  }
};

/** GET /api/cierres/:id con el historial de correcciones. */
export const getCierre = async (req, res, next) => {
  try {
    res.json(await detalleCierre(req.params.id));
  } catch (error) {
    next(error);
  }
};

/** PUT /api/cierres/:id: la dueña corrige; cada cambio queda registrado. */
export const putCierre = async (req, res, next) => {
  try {
    res.json(await corregirCierre(req.params.id, req.body ?? {}, req.sesion));
  } catch (error) {
    next(error);
  }
};

/** PUT /api/cierres/:id/revisado { revisado: true | false } */
export const putRevisado = async (req, res, next) => {
  try {
    res.json(await marcarRevisado(req.params.id, req.body?.revisado, req.sesion));
  } catch (error) {
    next(error);
  }
};
