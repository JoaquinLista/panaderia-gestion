import {
  anularMovimiento,
  crearMovimiento,
  listarDuenos,
  listarMovimientos,
  resumenDelDia,
  resumenMensual,
} from '../services/cajaCentralService.js';

/** GET /api/caja-central/duenos: quiénes pueden retirar plata. */
export const getDuenos = async (req, res, next) => {
  try {
    res.json(await listarDuenos());
  } catch (error) {
    next(error);
  }
};

/** GET /api/caja-central/resumen[?fecha=]: saldos y lo que entró y salió ese día. */
export const getResumen = async (req, res, next) => {
  try {
    res.json(await resumenDelDia(req.query.fecha));
  } catch (error) {
    next(error);
  }
};

/** GET /api/caja-central/mensual[?mes=AAAA-MM]: totales del mes por sucursal, dueño y categoría. */
export const getMensual = async (req, res, next) => {
  try {
    res.json(await resumenMensual(req.query.mes));
  } catch (error) {
    next(error);
  }
};

/** GET /api/caja-central/movimientos?desde=&hasta=&cuenta=&tipo=&categoria_id=&dueno_id= */
export const getMovimientos = async (req, res, next) => {
  try {
    res.json(await listarMovimientos(req.query));
  } catch (error) {
    next(error);
  }
};

/** POST /api/caja-central/movimientos: depósito, pago, retiro de un dueño, ajuste o saldo inicial. */
export const postMovimiento = async (req, res, next) => {
  try {
    res.status(201).json(await crearMovimiento(req.body ?? {}, req.sesion));
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/caja-central/movimientos/:id: anula un movimiento mal cargado. */
export const deleteMovimiento = async (req, res, next) => {
  try {
    res.json(await anularMovimiento(req.params.id, req.sesion));
  } catch (error) {
    next(error);
  }
};
