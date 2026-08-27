import { Router } from 'express';
import { getInsumos, postInsumo } from '../controllers/insumosController.js';
import { requireRol } from '../middleware/auth.js';
import { ROLES_GESTIONAN_INSUMOS } from '../domain/roles.js';

const router = Router();

router.get('/', getInsumos);
router.post('/', requireRol(...ROLES_GESTIONAN_INSUMOS), postInsumo);

export default router;
