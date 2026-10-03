import { Router } from 'express';
import {
  getPedidos,
  getRecorrido,
  getRubros,
  postPedido,
  postRubro,
  putEstadoPedido,
  putItemPedido,
  putRubro,
} from '../controllers/pedidosController.js';
import { ACCIONES } from '../domain/permisos.js';
import { permitir } from '../middlewares/permisos.js';

const router = Router();

router.get('/', permitir(ACCIONES.VER_PEDIDOS), getPedidos);
router.get('/rubros', permitir(ACCIONES.VER_PEDIDOS), getRubros);
router.post('/rubros', permitir(ACCIONES.ADMINISTRAR_RUBROS), postRubro);
router.put('/rubros/:id', permitir(ACCIONES.ADMINISTRAR_RUBROS), putRubro);
router.get('/recorrido', permitir(ACCIONES.CAMBIAR_ESTADO_PEDIDO), getRecorrido);
router.post('/', permitir(ACCIONES.CREAR_PEDIDO), postPedido);
// Chofer y sucursal mueven el pedido; el servicio decide qué paso le toca a cada uno.
router.put('/:id/estado', permitir(ACCIONES.VER_PEDIDOS), putEstadoPedido);
router.put('/:id/items/:itemId', permitir(ACCIONES.CAMBIAR_ESTADO_PEDIDO), putItemPedido);

export default router;
