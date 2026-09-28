import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Las rutas de negocio piden sesión: acá se entra como admin sin pasar por el login.
vi.mock('../../src/middlewares/autenticacion.js', async () => {
  const { requerirSesionFalsa } = await import('../helpers/sesiones.js');
  return { requerirSesion: requerirSesionFalsa };
});

vi.mock('../../src/config/db.js', () => {
  const query = vi.fn();
  return { default: { query }, query, getClient: vi.fn() };
});

const db = await import('../../src/config/db.js');
const { default: app } = await import('../../src/app.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('API', () => {
  it('GET /api/health responde ok cuando la base está arriba', async () => {
    db.default.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('GET /api/health responde 503 cuando la base no contesta', async () => {
    db.default.query.mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('devuelve 404 en JSON para rutas desconocidas', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no encontrada/);
  });

  it('POST /api/pedidos sin sucursales responde 400', async () => {
    const res = await request(app).post('/api/pedidos').send({ detalles: [] });
    expect(res.status).toBe(400);
  });

  it('PUT /api/pedidos/:id/estado sin estado responde 400', async () => {
    const res = await request(app).put('/api/pedidos/1/estado').send({});
    expect(res.status).toBe(400);
  });

  it('los errores de servicio con status se traducen a la respuesta HTTP', async () => {
    const res = await request(app).put('/api/pedidos/1/estado').send({ estado: 'PERDIDO' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Estado inválido/);
  });
});
