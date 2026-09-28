import { Router } from 'express';

import {
  getUsuarios,
  postUsuario,
  patchUsuario,
  putPassword,
} from '../controllers/usuariosController.js';
import { ACCIONES } from '../domain/permisos.js';
import { permitir } from '../middlewares/permisos.js';

// Administrar usuarios es sólo para dueños y socios (ADMIN).
const router = Router();
router.use(permitir(ACCIONES.ADMINISTRAR_USUARIOS));

router.get('/', getUsuarios);
router.post('/', postUsuario);
router.patch('/:id', patchUsuario);
router.put('/:id/password', putPassword);

export default router;
