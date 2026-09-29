/**
 * Un log por request, con un id que viaja en la cabecera X-Request-Id.
 *
 * Nginx genera el id y se lo pasa al backend; el backend lo devuelve en la
 * respuesta. Si alguien reporta un error, con ese id se encuentra su línea.
 */
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';

import { logger as loggerBase } from './logger.js';

// Un id que viene de afuera se acepta sólo si es corto y sin caracteres raros.
const ID_VALIDO = /^[\w-]{1,64}$/;

// Consultas automáticas que no aportan nada al log (cada pocos segundos).
const SIN_LOG = new Set(['/api/health', '/metrics']);

/** @param {import('node:http').IncomingMessage} req */
export const idDelRequest = (req) => {
  const recibido = req.headers['x-request-id'];
  return typeof recibido === 'string' && ID_VALIDO.test(recibido) ? recibido : randomUUID();
};

/** Nivel según cómo terminó: 5xx es un error nuestro, 4xx un aviso. */
export const nivelSegunRespuesta = (req, res, err) => {
  if (err || res.statusCode >= 500) return 'error';
  if (res.statusCode >= 400) return 'warn';
  return 'info';
};

export const registroHttp = (logger = loggerBase) =>
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = idDelRequest(req);
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customLogLevel: nivelSegunRespuesta,
    autoLogging: { ignore: (req) => SIN_LOG.has(req.url?.split('?')[0]) },
    // originalUrl: adentro de cada router, req.url pierde el prefijo (/api/cierres).
    // Lo justo para entender el request, sin cabeceras ni cuerpo.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    customSuccessMessage: (req, res) => `${req.method} ${req.originalUrl} ${res.statusCode}`,
    customErrorMessage: (req, res) => `${req.method} ${req.originalUrl} ${res.statusCode}`,
  });
