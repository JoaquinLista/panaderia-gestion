import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';

import { crearLogger } from '../../src/observabilidad/logger.js';
import { idDelRequest, nivelSegunRespuesta } from '../../src/observabilidad/registroHttp.js';
import { rutaDe } from '../../src/observabilidad/metricas.js';

/** Un destino que guarda cada línea de log como objeto. */
const capturar = () => {
  const lineas = [];
  const destino = new Writable({
    write(chunk, _enc, listo) {
      lineas.push(JSON.parse(chunk.toString()));
      listo();
    },
  });
  return { lineas, destino };
};

describe('logger', () => {
  it('escribe JSON con nivel, mensaje, servicio y versión', () => {
    const { lineas, destino } = capturar();
    crearLogger({ APP_VERSION: 'abc123' }, destino).info('hola');
    expect(lineas[0]).toMatchObject({
      level: 30,
      msg: 'hola',
      servicio: 'backend',
      version: 'abc123',
    });
    expect(lineas[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('nunca escribe la cookie de sesión ni contraseñas', () => {
    const { lineas, destino } = capturar();
    crearLogger({}, destino).info(
      { req: { headers: { cookie: 'sesion=secreta' } }, body: { password: 'clave123' } },
      'login'
    );
    expect(JSON.stringify(lineas[0])).not.toMatch(/secreta|clave123/);
    expect(lineas[0].req.headers.cookie).toBe('[oculto]');
  });

  it('respeta LOG_LEVEL', () => {
    const { lineas, destino } = capturar();
    const logger = crearLogger({ LOG_LEVEL: 'warn' }, destino);
    logger.info('no');
    logger.warn('sí');
    expect(lineas.map((l) => l.msg)).toEqual(['sí']);
  });
});

describe('id del request', () => {
  it('usa el que manda Nginx si es válido', () => {
    expect(idDelRequest({ headers: { 'x-request-id': 'a1b2-c3' } })).toBe('a1b2-c3');
  });

  it('genera uno nuevo si no viene o trae caracteres raros', () => {
    expect(idDelRequest({ headers: {} })).toMatch(/^[0-9a-f-]{36}$/);
    expect(idDelRequest({ headers: { 'x-request-id': 'x\ninyectado' } })).toMatch(
      /^[0-9a-f-]{36}$/
    );
  });

  it('el nivel del log depende de cómo terminó', () => {
    expect(nivelSegunRespuesta({}, { statusCode: 200 })).toBe('info');
    expect(nivelSegunRespuesta({}, { statusCode: 404 })).toBe('warn');
    expect(nivelSegunRespuesta({}, { statusCode: 503 })).toBe('error');
    expect(nivelSegunRespuesta({}, { statusCode: 200 }, new Error('x'))).toBe('error');
  });
});

describe('ruta para las métricas', () => {
  it('reemplaza los ids por :id y saca la consulta', () => {
    const ruta = { path: '/:id' };
    expect(rutaDe({ route: ruta, originalUrl: '/api/cierres/17' })).toBe('/api/cierres/:id');
    expect(rutaDe({ route: ruta, originalUrl: '/api/pedidos/3/estado' })).toBe(
      '/api/pedidos/:id/estado'
    );
    expect(rutaDe({ route: ruta, originalUrl: '/api/dashboard/dia?fecha=2026-09-29' })).toBe(
      '/api/dashboard/dia'
    );
  });

  it('lo que no es una ruta va junto', () => {
    expect(rutaDe({ originalUrl: '/api/cualquier-cosa' })).toBe('sin_ruta');
  });
});
