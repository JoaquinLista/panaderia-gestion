import {
  cambiarEstadoPedido,
  crearPedidos,
  listarPedidos,
  listarRubros,
  marcarItem,
  obtenerRecorrido,
} from '../services/pedidosService.js';
import { actualizarRubro, crearRubro } from '../services/rubrosService.js';
import { ACCIONES, sucursalRestringida } from '../domain/permisos.js';

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

/**
 * GET /api/pedidos/rubros: lo que se puede pedir y de dónde sale.
 * Con ?todos=1, la dueña ve también los desactivados para administrarlos.
 */
export const getRubros = async (req, res, next) => {
  try {
    const incluirInactivos =
      req.query.todos === '1' && req.sesion.permisos.includes(ACCIONES.ADMINISTRAR_RUBROS);
    res.json(await listarRubros({ incluirInactivos }));
  } catch (error) {
    next(error);
  }
};

/** POST /api/pedidos/rubros. Body: { nombre, sucursal_origen_id, orden? }. */
export const postRubro = async (req, res, next) => {
  try {
    res.status(201).json(await crearRubro(req.body ?? {}));
  } catch (error) {
    next(error);
  }
};

/** PUT /api/pedidos/rubros/:id. Body: cualquiera de { nombre, sucursal_origen_id, orden, activo }. */
export const putRubro = async (req, res, next) => {
  try {
    res.json(await actualizarRubro(req.params.id, req.body ?? {}));
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
