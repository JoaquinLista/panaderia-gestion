import { Router } from 'express';
import {
  getInsumos,
  getCatalogoInsumos,
  postInsumo,
} from '../controllers/insumosController.js';
import { requireRol } from '../middleware/auth.js';

const router = Router();

// El catálogo (sin stock) lo necesita cualquiera para armar pedidos de insumos.
router.get('/catalogo', getCatalogoInsumos);

// El stock de insumos sólo lo ven y lo tocan los dueños.
router.get('/', requireRol('DUENIO'), getInsumos);
router.post('/', requireRol('DUENIO'), postInsumo);

export default router;
