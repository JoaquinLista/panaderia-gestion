import { Router } from 'express';
import { getSucursales } from '../controllers/sucursalesController.js';

const router = Router();

router.get('/', getSucursales);

export default router;
