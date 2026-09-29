import { Router } from 'express';
import { getCierresDeHoy, postCierre } from '../controllers/cierresController.js';
import { ACCIONES } from '../domain/permisos.js';
import { permitir } from '../middlewares/permisos.js';

const router = Router();

router.get('/hoy', permitir(ACCIONES.CERRAR_CAJA), getCierresDeHoy);
router.post('/', permitir(ACCIONES.CERRAR_CAJA), postCierre);

export default router;
