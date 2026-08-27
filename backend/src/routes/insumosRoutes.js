import { Router } from 'express';
import { getInsumos, postInsumo } from '../controllers/insumosController.js';

const router = Router();

router.get('/', getInsumos);
router.post('/', postInsumo);

export default router;
