import { Router } from 'express';
import { postLogin, postLogout, getMe } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/login', postLogin);
router.post('/logout', postLogout);
router.get('/me', requireAuth, getMe);

export default router;
