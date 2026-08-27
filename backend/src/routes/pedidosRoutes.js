import { Router } from 'express';
import { getPedidos, postPedido } from '../controllers/pedidosController.js';

const router = Router();

router.get('/', getPedidos);
router.post('/', postPedido);

export default router;
