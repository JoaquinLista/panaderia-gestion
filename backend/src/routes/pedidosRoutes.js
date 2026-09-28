import { Router } from 'express';
import { getPedidos, postPedido, putEstadoPedido } from '../controllers/pedidosController.js';
import { ACCIONES } from '../domain/permisos.js';
import { permitir } from '../middlewares/permisos.js';

const router = Router();

router.get('/', permitir(ACCIONES.VER_PEDIDOS), getPedidos);
router.post('/', permitir(ACCIONES.CREAR_PEDIDO), postPedido);
router.put('/:id/estado', permitir(ACCIONES.CAMBIAR_ESTADO_PEDIDO), putEstadoPedido);

export default router;
