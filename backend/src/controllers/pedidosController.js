import {
  cambiarEstadoPedido,
  crearPedidos,
  listarPedidos,
  listarRubros,
  marcarItem,
  obtenerRecorrido,
} from '../services/pedidosService.js';
import { sucursalRestringida } from '../domain/permisos.js';

/**
 * GET /api/pedidos?estado=abiertos
 * La empleada sólo ve los pedidos de su sucursal del día (los que pide y los
 * que le piden). Sin filtro, el historial reciente.
 */
export const getPedidos = async (req, res, next) => {
  try {
    const pedidos = await listarPedidos({
      sucursalId: sucursalRestringida(req.sesion),
      abiertos: req.query.estado === 'abiertos',
    });
    res.json(pedidos);
  } catch (error) {
    next(error);
  }
};

/** GET /api/pedidos/rubros: lo que se puede pedir y de dónde sale. */
export const getRubros = async (_req, res, next) => {
  try {
    res.json(await listarRubros());
  } catch (error) {
    next(error);
  }
};

/** GET /api/pedidos/recorrido: qué cargar en cada lugar y una parada por sucursal. */
export const getRecorrido = async (_req, res, next) => {
  try {
    res.json(await obtenerRecorrido());
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/pedidos
 * Body: { sucursal_id?, nota?, urgente?, items: [{ rubro_id, detalle }] }.
 * La empleada pide para su sucursal del día; la dueña, para cualquiera.
 * Responde con los pedidos creados (uno por lugar de donde sale la mercadería).
 */
export const postPedido = async (req, res, next) => {
  try {
    res.status(201).json(await crearPedidos(req.body ?? {}, req.sesion));
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/pedidos/:id/estado
 * El chofer lo pone en camino y entregado; la sucursal lo cancela o confirma.
 */
export const putEstadoPedido = async (req, res, next) => {
  try {
    const { estado } = req.body ?? {};
    if (!estado || String(estado).trim() === '') {
      return res.status(400).json({ error: 'El campo "estado" es obligatorio' });
    }
    res.json(await cambiarEstadoPedido(req.params.id, estado, req.sesion));
  } catch (error) {
    next(error);
  }
};

/** PUT /api/pedidos/:id/items/:itemId: el chofer tilda lo que carga o marca que no había. */
export const putItemPedido = async (req, res, next) => {
  try {
    const { estado } = req.body ?? {};
    if (!estado || String(estado).trim() === '') {
      return res.status(400).json({ error: 'El campo "estado" es obligatorio' });
    }
    res.json(await marcarItem(req.params.id, req.params.itemId, estado));
  } catch (error) {
    next(error);
  }
};
