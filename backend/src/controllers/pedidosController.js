import { listarPedidos, crearPedido, cambiarEstadoPedido } from '../services/pedidosService.js';
import { sucursalRestringida } from '../domain/permisos.js';

/**
 * GET /api/pedidos
 * La empleada sólo ve los pedidos de su sucursal del día.
 */
export const getPedidos = async (req, res, next) => {
  try {
    const pedidos = await listarPedidos({ sucursalId: sucursalRestringida(req.sesion) });
    res.json(pedidos);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/pedidos
 * La empleada sólo puede crear pedidos con origen en su sucursal del día.
 */
export const postPedido = async (req, res, next) => {
  try {
    const { sucursal_origen_id, sucursal_destino_id, detalles } = req.body ?? {};

    if (!sucursal_origen_id || !sucursal_destino_id) {
      return res.status(400).json({
        error: 'Los campos "sucursal_origen_id" y "sucursal_destino_id" son obligatorios',
      });
    }
    if (!Array.isArray(detalles) || detalles.length === 0) {
      return res
        .status(400)
        .json({ error: 'El pedido debe incluir un arreglo "detalles" con al menos un ítem' });
    }

    // La empleada pide desde su sucursal del día: no puede cargar pedidos de otra.
    const sucursalPropia = sucursalRestringida(req.sesion);
    if (sucursalPropia && Number(sucursal_origen_id) !== sucursalPropia) {
      return res.status(403).json({
        error: `Sólo podés crear pedidos desde tu sucursal del día (${req.sesion.sucursal.nombre})`,
      });
    }

    const pedido = await crearPedido(req.body);
    res.status(201).json(pedido);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/pedidos/:id/estado
 * Cambia el estado de un pedido validando la transición.
 */
export const putEstadoPedido = async (req, res, next) => {
  try {
    const { estado } = req.body ?? {};

    if (!estado || String(estado).trim() === '') {
      return res.status(400).json({ error: 'El campo "estado" es obligatorio' });
    }

    const pedido = await cambiarEstadoPedido(req.params.id, estado);
    res.json(pedido);
  } catch (error) {
    next(error);
  }
};
