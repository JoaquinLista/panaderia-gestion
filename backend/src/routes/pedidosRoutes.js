import { Router } from 'express';
import { getPedidos, postPedido, putEstadoPedido } from '../controllers/pedidosController.js';
import { requireRol } from '../middleware/auth.js';
import { ROLES_CREAN_PEDIDOS } from '../domain/roles.js';

const router = Router();

router.get('/', getPedidos);
router.post('/', requireRol(...ROLES_CREAN_PEDIDOS), postPedido);
// El estado lo cambian distintos roles según la transición: se valida en el servicio.
router.put('/:id/estado', putEstadoPedido);

export default router;
