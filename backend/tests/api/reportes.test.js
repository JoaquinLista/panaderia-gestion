import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/middlewares/autenticacion.js', async () => {
  const { requerirSesionFalsa } = await import('../helpers/sesiones.js');
  return { requerirSesion: requerirSesionFalsa };
});
vi.mock('../../src/config/db.js', () => {
  const query = vi.fn();
  return { default: { query }, query, getClient: vi.fn() };
});

const db = await import('../../src/config/db.js');
const { usarSesion, SESION_EMPLEADA, SESION_ADMIN } = await import('../helpers/sesiones.js');
const { reportesPorUsuario } = await import('../../src/routes/reportesRoutes.js');
const { default: app } = await import('../../src/app.js');

beforeEach(() => {
  vi.clearAllMocks();
  reportesPorUsuario.resetAll();
  usarSesion(SESION_ADMIN);
  vi.stubEnv('GITHUB_TOKEN_REPORTES', '');
});

const reporte = { que_paso: 'El botón de guardar no hace nada', seccion: 'Cierre de caja' };

describe('POST /api/reportes', () => {
  it('cualquier persona con sesión puede reportar, también una empleada', async () => {
    usarSesion(SESION_EMPLEADA);
    db.query.mockResolvedValueOnce({
      rows: [{ id: 4, ...reporte, esperado: null, version: null }],
    });
    const res = await request(app).post('/api/reportes').send(reporte);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 4, issue_url: null });
  });

  it('un texto muy corto responde 400', async () => {
    const res = await request(app).post('/api/reportes').send({ que_paso: 'mal' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/al menos 10/);
  });

  it('más de 10 reportes por hora responde 429', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1, ...reporte, esperado: null, version: null }] });
    for (let i = 0; i < 10; i += 1) {
      expect((await request(app).post('/api/reportes').send(reporte)).status).toBe(201);
    }
    const res = await request(app).post('/api/reportes').send(reporte);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/muchos reportes/);
  });
});
