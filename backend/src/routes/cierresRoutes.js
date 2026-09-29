import { Router } from 'express';
import {
  getCategorias,
  getCierre,
  getCierres,
  getCierresDeHoy,
  getPendientes,
  postCierre,
  putCierre,
  putRevisado,
} from '../controllers/cierresController.js';
import { ACCIONES } from '../domain/permisos.js';
import { permitir } from '../middlewares/permisos.js';

const router = Router();

// Cargar el cierre del turno: admin o empleada con el permiso.
router.get('/hoy', permitir(ACCIONES.CERRAR_CAJA), getCierresDeHoy);
router.post('/', permitir(ACCIONES.CERRAR_CAJA), postCierre);
router.get('/categorias', permitir(ACCIONES.CERRAR_CAJA), getCategorias);

// Revisar y corregir: sólo la dueña o un socio. La empleada no puede editar
// un cierre después de enviarlo (#10).
router.get('/', permitir(ACCIONES.REVISAR_CAJA), getCierres);
router.get('/pendientes', permitir(ACCIONES.REVISAR_CAJA), getPendientes);
router.get('/:id', permitir(ACCIONES.REVISAR_CAJA), getCierre);
router.put('/:id', permitir(ACCIONES.REVISAR_CAJA), putCierre);
router.put('/:id/revisado', permitir(ACCIONES.REVISAR_CAJA), putRevisado);

export default router;
