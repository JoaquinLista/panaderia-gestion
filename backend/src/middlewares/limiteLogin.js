import { rateLimit, MemoryStore } from 'express-rate-limit';

// Los intentos se cuentan en memoria: alcanza con una sola instancia del backend.
// Se exporta para que los tests puedan reiniciar el contador.
export const intentosLogin = new MemoryStore();

/**
 * Máximo 5 intentos fallidos por minuto por IP: frena a quien prueba
 * contraseñas a lo bruto. Los ingresos correctos no cuentan.
 */
export const limiteLogin = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: intentosLogin,
  message: { error: 'Demasiados intentos. Esperá un minuto y volvé a probar.' },
});
