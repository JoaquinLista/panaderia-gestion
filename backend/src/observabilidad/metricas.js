/**
 * Métricas para Prometheus (Sprint 8, #18), en GET /metrics.
 *
 * Técnicas: cuánto tardan los requests y cuántos terminan en error.
 * De negocio (KPI 1 del PRD): qué cierres de caja de hoy ya están cargados.
 * Prometheus las lee cada tanto y guarda la historia; Grafana las dibuja.
 */
import client from 'prom-client';

import { query } from '../config/db.js';
import { hoyEnArgentina } from '../domain/fecha.js';
import { logger } from './logger.js';

export const TURNOS = ['MEDIODIA', 'NOCHE'];

export const registro = new client.Registry();

// Memoria, CPU y event loop de Node, con el prefijo de la app.
client.collectDefaultMetrics({ register: registro, prefix: 'lafueguina_' });

const duracion = new client.Histogram({
  name: 'lafueguina_http_duracion_segundos',
  help: 'Tiempo de respuesta de la API, por ruta y código HTTP',
  labelNames: ['metodo', 'ruta', 'codigo'],
  // De 5 ms a 5 s: la API contesta en decenas de milisegundos.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registro],
});

const errores = new client.Counter({
  name: 'lafueguina_http_errores_total',
  help: 'Respuestas 5xx de la API (errores nuestros, no del usuario)',
  labelNames: ['metodo', 'ruta', 'codigo'],
  registers: [registro],
});

/**
 * Qué cierres de hoy están cargados, uno por sucursal y turno (1 sí, 0 no).
 * Se calcula desde la base cada vez que Prometheus pregunta, así nunca queda
 * desfasado aunque el backend se reinicie o haya más de una copia corriendo.
 * @param {Date} [ahora]
 */
export const cierresDeHoy = async (ahora = new Date()) => {
  const { rows } = await query(
    `SELECT s.nombre AS sucursal, t.turno, (c.id IS NOT NULL) AS cargado
       FROM sucursales s
      CROSS JOIN unnest($2::text[]) AS t(turno)
       LEFT JOIN cierres_caja c
         ON c.sucursal_id = s.id AND c.fecha = $1 AND c.turno = t.turno
      WHERE s.tipo <> 'DEPOSITO'
      ORDER BY s.nombre, t.turno`,
    [hoyEnArgentina(ahora), TURNOS]
  );
  return rows;
};

new client.Gauge({
  name: 'lafueguina_cierre_cargado_hoy',
  help: 'Cierre de caja de hoy cargado (1) o pendiente (0), por sucursal y turno',
  labelNames: ['sucursal', 'turno'],
  registers: [registro],
  async collect() {
    this.reset();
    try {
      for (const fila of await cierresDeHoy()) {
        this.set({ sucursal: fila.sucursal, turno: fila.turno }, fila.cargado ? 1 : 0);
      }
    } catch (error) {
      // Sin base no hay dato: la serie desaparece y Grafana lo muestra vacío,
      // en vez de un 0 que se leería como "no cargaron el cierre".
      logger.warn({ err: error }, 'No se pudieron leer los cierres para las métricas');
    }
  },
});

/**
 * La ruta con los ids reemplazados (/api/cierres/17 → /api/cierres/:id): si no,
 * cada id sería una serie nueva. Todos los ids de la API son números. Lo que no
 * coincide con ninguna ruta (404 de una dirección inventada) va junto en
 * "sin_ruta", para que nadie pueda llenar Prometheus pidiendo URLs al azar.
 */
export const rutaDe = (req) =>
  req.route
    ? (req.originalUrl ?? req.url).split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id')
    : 'sin_ruta';

/** Middleware: mide cada request de la API al terminar. */
export const medirRequests = (req, res, next) => {
  const fin = duracion.startTimer();
  res.on('finish', () => {
    const etiquetas = { metodo: req.method, ruta: rutaDe(req), codigo: String(res.statusCode) };
    fin(etiquetas);
    if (res.statusCode >= 500) errores.inc(etiquetas);
  });
  next();
};

/** GET /metrics en el formato de texto de Prometheus. */
export const exponerMetricas = async (req, res) => {
  res.set('Content-Type', registro.contentType);
  res.send(await registro.metrics());
};
