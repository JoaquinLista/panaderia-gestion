import { Router } from 'express';
import { MemoryStore, rateLimit } from 'express-rate-limit';

import { postReporte } from '../controllers/reportesController.js';

// Se exporta para que los tests puedan reiniciar el contador.
export const reportesPorUsuario = new MemoryStore();

/**
 * Hasta 10 reportes por hora por persona: alcanza para cualquier uso real y
 * evita que un error de la pantalla (o alguien) llene GitHub de issues.
 */
const limiteReportes = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `usuario-${req.sesion.usuario.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: reportesPorUsuario,
  message: { error: 'Ya mandaste muchos reportes. Probá de nuevo en un rato.' },
});

const router = Router();

// No pide un permiso especial: cualquiera que use la app puede avisar de un problema.
router.post('/', limiteReportes, postReporte);

export default router;
