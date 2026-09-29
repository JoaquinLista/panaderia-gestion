import { Router } from 'express';
import { getDia, getMes } from '../controllers/dashboardController.js';
import { getExcelResumen } from '../controllers/planillasController.js';
import { ACCIONES } from '../domain/permisos.js';
import { permitir } from '../middlewares/permisos.js';

const router = Router();

// Son los números de todo el negocio: sólo los dueños.
router.use(permitir(ACCIONES.VER_DASHBOARD));

router.get('/dia', getDia);
router.get('/mes', getMes);
router.get('/excel', getExcelResumen);

export default router;
