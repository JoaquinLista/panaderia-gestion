import { listarPedidos, crearPedido } from '../services/pedidosService.js';

/**
 * GET /api/pedidos
 */
export const getPedidos = async (req, res, next) => {
  try {
    const pedidos = await listarPedidos();
    res.json(pedidos);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/pedidos
 */
export const postPedido = async (req, res, next) => {
  try {
    const { sucursal_origen_id, sucursal_destino_id, detalles } = req.body ?? {};

    if (!sucursal_origen_id || !sucursal_destino_id) {
      return res
        .status(400)
        .json({ error: 'Los campos "sucursal_origen_id" y "sucursal_destino_id" son obligatorios' });
    }
    if (!Array.isArray(detalles) || detalles.length === 0) {
      return res
        .status(400)
        .json({ error: 'El pedido debe incluir un arreglo "detalles" con al menos un ítem' });
    }

    const pedido = await crearPedido(req.body);
    res.status(201).json(pedido);
  } catch (error) {
    next(error);
  }
};
