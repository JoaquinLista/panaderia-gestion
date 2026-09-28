import { Router } from 'express';

import { login, logout, me } from '../controllers/authController.js';
import { requerirSesion } from '../middlewares/autenticacion.js';
import { limiteLogin } from '../middlewares/limiteLogin.js';

const router = Router();

router.post('/login', limiteLogin, login);
router.post('/logout', logout);
router.get('/me', requerirSesion, me);

export default router;
