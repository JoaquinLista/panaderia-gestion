import { Router } from 'express';
import { getInsumos, postInsumo } from '../controllers/insumosController.js';
import { ACCIONES } from '../domain/permisos.js';
import { permitir } from '../middlewares/permisos.js';

const router = Router();

router.get('/', permitir(ACCIONES.VER_INSUMOS), getInsumos);
router.post('/', permitir(ACCIONES.CARGAR_INSUMOS), postInsumo);

export default router;
