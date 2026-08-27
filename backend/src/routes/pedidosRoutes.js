import { Router } from 'express';
import { getPedidos, postPedido, putEstadoPedido } from '../controllers/pedidosController.js';

const router = Router();

router.get('/', getPedidos);
router.post('/', postPedido);
router.put('/:id/estado', putEstadoPedido);

export default router;
