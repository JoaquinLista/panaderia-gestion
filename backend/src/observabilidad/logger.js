/**
 * Logs estructurados (Sprint 8, #18).
 *
 * Cada línea es un JSON con la hora, el nivel, el mensaje y, en los requests,
 * el id del request: así se pueden filtrar y contar en cualquier herramienta
 * (Azure Log Analytics, Grafana Loki, `docker compose logs | jq`).
 */
import pino from 'pino';

import { versionActual } from '../config/servidor.js';

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {pino.DestinationStream} [destino] para los tests
 */
export const crearLogger = (env = process.env, destino = undefined) =>
  pino(
    {
      level: env.LOG_LEVEL?.trim() || 'info',
      base: { servicio: 'backend', version: versionActual(env) },
      timestamp: pino.stdTimeFunctions.isoTime,
      // Nunca a los logs: la cookie de sesión, contraseñas ni tokens.
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'res.headers["set-cookie"]',
          '*.password',
          '*.password_actual',
          '*.password_nueva',
        ],
        censor: '[oculto]',
      },
    },
    destino
  );

export const logger = crearLogger();
