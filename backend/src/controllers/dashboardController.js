import { resumenDelDia, resumenDelMes } from '../services/dashboardService.js';

/** GET /api/dashboard/dia[?fecha=AAAA-MM-DD]: ventas del día por sucursal y cierres que faltan. */
export const getDia = async (req, res, next) => {
  try {
    res.json(await resumenDelDia(req.query.fecha));
  } catch (error) {
    next(error);
  }
};

/** GET /api/dashboard/mes[?mes=AAAA-MM]: acumulado del mes y comparación con el anterior. */
export const getMes = async (req, res, next) => {
  try {
    res.json(await resumenDelMes(req.query.mes));
  } catch (error) {
    next(error);
  }
};
