import { createHash, timingSafeEqual } from 'node:crypto';

const resumen = (texto) => createHash('sha256').update(texto).digest();

/**
 * En Azure el backend tiene su propia dirección y la cuenta de estudiante no
 * deja ocultarla de internet. Nginx le agrega a cada request la cabecera
 * X-Clave-Interna con un secreto que sólo conocen las dos apps: sin ella el
 * backend contesta 404, como si no existiera.
 *
 * Sin CLAVE_INTERNA (docker compose) no pide nada. /api/health queda libre
 * porque Azure lo consulta directo para saber si la versión arrancó.
 * Se lee el entorno en cada request para poder probarlo.
 * @param {NodeJS.ProcessEnv} env
 */
export const soloDesdeLaPantalla =
  (env = process.env) =>
  (req, res, next) => {
    const clave = env.CLAVE_INTERNA?.trim();
    if (!clave || req.path === '/api/health') return next();
    const recibida = req.get('x-clave-interna') ?? '';
    // Se comparan los resúmenes: mismo largo y en tiempo constante.
    if (timingSafeEqual(resumen(recibida), resumen(clave))) return next();
    res.status(404).json({ error: 'No encontrado' });
  };
