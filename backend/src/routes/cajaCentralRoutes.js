import { Router } from 'express';
import {
  deleteMovimiento,
  getDuenos,
  getMensual,
  getMovimientos,
  getResumen,
  postMovimiento,
} from '../controllers/cajaCentralController.js';
import { ACCIONES } from '../domain/permisos.js';
import { permitir } from '../middlewares/permisos.js';

const router = Router();

// Son los números del negocio y los retiros de la familia: sólo los dueños.
router.use(permitir(ACCIONES.ADMINISTRAR_CAJA_CENTRAL));

router.get('/duenos', getDuenos);
router.get('/resumen', getResumen);
router.get('/mensual', getMensual);
router.get('/movimientos', getMovimientos);
router.post('/movimientos', postMovimiento);
router.delete('/movimientos/:id', deleteMovimiento);

export default router;
