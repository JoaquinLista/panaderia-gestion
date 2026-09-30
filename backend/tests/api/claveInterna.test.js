import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/config/db.js', () => {
  const query = vi.fn();
  return { default: { query }, query, getClient: vi.fn() };
});

const db = await import('../../src/config/db.js');
const { default: app } = await import('../../src/app.js');

beforeEach(() => {
  vi.clearAllMocks();
  db.query.mockResolvedValue({ rows: [] });
});

afterEach(() => {
  delete process.env.CLAVE_INTERNA;
});

describe('clave interna entre la pantalla y el backend', () => {
  it('sin CLAVE_INTERNA (docker compose) no pide nada', async () => {
    const res = await request(app).get('/api/sucursales');
    expect(res.status).toBe(200);
  });

  describe('con CLAVE_INTERNA (Azure)', () => {
    beforeEach(() => {
      process.env.CLAVE_INTERNA = 'secreto-de-prueba';
    });

    it('sin la cabecera contesta 404, como si no existiera', async () => {
      const res = await request(app).get('/api/sucursales');
      expect(res.status).toBe(404);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('con una clave equivocada también 404', async () => {
      const res = await request(app).get('/api/sucursales').set('X-Clave-Interna', 'otra');
      expect(res.status).toBe(404);
    });

    it('las métricas tampoco se ven sin la clave', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(404);
    });

    it('con la clave que pone Nginx pasa', async () => {
      const res = await request(app)
        .get('/api/sucursales')
        .set('X-Clave-Interna', 'secreto-de-prueba');
      expect(res.status).toBe(200);
    });

    it('/api/health queda libre para que Azure sepa si arrancó', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
