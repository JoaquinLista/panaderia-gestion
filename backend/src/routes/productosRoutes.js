import { Router } from 'express';
import { getProductos } from '../controllers/productosController.js';
import { ACCIONES } from '../domain/permisos.js';
import { permitir } from '../middlewares/permisos.js';

const router = Router();

router.get('/', permitir(ACCIONES.VER_PRODUCTOS), getProductos);

export default router;
