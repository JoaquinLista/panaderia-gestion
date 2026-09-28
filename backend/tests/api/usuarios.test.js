import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Se entra como admin sin pasar por el login (los 401/403 están en permisos.test.js).
vi.mock('../../src/middlewares/autenticacion.js', async () => {
  const { requerirSesionFalsa } = await import('../helpers/sesiones.js');
  return { requerirSesion: requerirSesionFalsa };
});
vi.mock('../../src/config/db.js', () => {
  const query = vi.fn();
  return { default: { query }, query, getClient: vi.fn() };
});

const { query } = await import('../../src/config/db.js');
const { default: app } = await import('../../src/app.js');

const fila = (extra = {}) => ({
  id: 2,
  usuario: 'lucia',
  nombre: 'Lucía',
  rol: 'EMPLEADA',
  puede_cerrar_caja: false,
  activo: true,
  sesiones_desde: new Date('2026-01-01T00:00:00Z'),
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('/api/usuarios', () => {
  it('GET lista los usuarios', async () => {
    query.mockResolvedValue({ rows: [fila()] });
    const res = await request(app).get('/api/usuarios');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ usuario: 'lucia', puedeCerrarCaja: false });
  });

  it('POST crea un usuario y responde 201', async () => {
    query.mockResolvedValue({ rows: [fila()] });
    const res = await request(app)
      .post('/api/usuarios')
      .send({ usuario: 'lucia', nombre: 'Lucía', password: 'clave-larga', rol: 'EMPLEADA' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(2);
  });

  it('POST sin datos responde 400', async () => {
    const res = await request(app).post('/api/usuarios');
    expect(res.status).toBe(400);
  });

  it('PATCH cambia el usuario', async () => {
    query
      .mockResolvedValueOnce({ rows: [fila()] })
      .mockResolvedValueOnce({ rows: [fila({ activo: false })] });
    const res = await request(app).patch('/api/usuarios/2').send({ activo: false });
    expect(res.status).toBe(200);
    expect(res.body.activo).toBe(false);
  });

  it.each(['abc', '0', '-1'])('PATCH con id %s responde 404', async (id) => {
    const res = await request(app).patch(`/api/usuarios/${id}`).send({});
    expect(res.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });

  it('PUT password de otra persona responde 204 sin tocar la cookie de la dueña', async () => {
    query.mockResolvedValue({ rowCount: 1 });
    const res = await request(app)
      .put('/api/usuarios/2/password')
      .send({ password: 'clave-nueva-123' });
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('PUT de su propia contraseña le renueva la sesión para no sacarla de la app', async () => {
    query
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [fila({ id: 1, usuario: 'admin', rol: 'ADMIN' })] });
    const res = await request(app)
      .put('/api/usuarios/1/password')
      .send({ password: 'clave-nueva-123' });
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie'][0]).toMatch(/^sesion=.+HttpOnly/);
  });

  it('PUT password corta responde 400', async () => {
    const res = await request(app).put('/api/usuarios/2/password').send({ password: '123' });
    expect(res.status).toBe(400);
  });
});
