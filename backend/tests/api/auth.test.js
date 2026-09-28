import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';

import { crearUsuarios, responderConsultas, PASSWORD } from '../helpers/baseFalsa.js';

vi.mock('../../src/config/db.js', () => {
  const query = vi.fn();
  return { default: { query }, query, getClient: vi.fn() };
});

const db = await import('../../src/config/db.js');
const { default: app } = await import('../../src/app.js');
const { intentosLogin } = await import('../../src/middlewares/limiteLogin.js');

let usuarios;

beforeAll(async () => {
  usuarios = await crearUsuarios();
});

beforeEach(() => {
  vi.clearAllMocks();
  intentosLogin.resetAll();
  db.query.mockImplementation(responderConsultas({ usuarios }));
});

const login = (body) => request(app).post('/api/auth/login').send(body);

/** Devuelve la cookie de sesión de una respuesta de login. */
const cookieDe = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('sesion='));

describe('POST /api/auth/login', () => {
  it('la dueña entra y recibe una cookie httpOnly y SameSite=Strict', async () => {
    const res = await login({ usuario: 'dueña', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({ usuario: 'dueña', rol: 'ADMIN' });
    expect(res.body.sucursal).toBeNull();
    expect(res.body.permisos).toContain('usuarios:administrar');
    const cookie = cookieDe(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api/);
    expect(cookie).toMatch(/Max-Age=43200/);
  });

  it('la empleada entra con la sucursal donde trabaja hoy', async () => {
    const res = await login({ usuario: 'lucia', password: PASSWORD, sucursalId: 3 });

    expect(res.status).toBe(200);
    expect(res.body.sucursal).toEqual({ id: 3, nombre: 'Estrada', tipo: 'VENTA' });
    expect(res.body.permisos).toContain('caja:cerrar');
  });

  it('a la empleada le pide la sucursal del día', async () => {
    const res = await login({ usuario: 'lucia', password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Elegí la sucursal donde trabajás hoy');
  });

  it.each([
    ['el galpón', 1],
    ['una sucursal que no existe', 99],
  ])('la empleada no puede elegir %s', async (_caso, sucursalId) => {
    const res = await login({ usuario: 'lucia', password: PASSWORD, sucursalId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Esa sucursal no está disponible para trabajar');
  });

  it.each([
    ['contraseña incorrecta', { usuario: 'dueña', password: 'otra-cosa' }],
    ['usuario inexistente', { usuario: 'nadie', password: PASSWORD }],
    ['usuario desactivado', { usuario: 'ex-empleada', password: PASSWORD, sucursalId: 3 }],
  ])('%s: 401 con el mismo mensaje genérico y sin cookie', async (_caso, body) => {
    const res = await login(body);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Usuario o contraseña incorrectos');
    expect(cookieDe(res)).toBeUndefined();
  });

  it.each([
    ['sin cuerpo', undefined],
    ['sin contraseña', { usuario: 'dueña' }],
    ['usuario en blanco', { usuario: '  ', password: PASSWORD }],
    ['tipos incorrectos', { usuario: ['dueña'], password: 123 }],
  ])('%s: 400', async (_caso, body) => {
    const res = await login(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Ingresá tu usuario y contraseña');
  });

  it('después de 5 intentos fallidos en un minuto responde 429', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await login({ usuario: 'dueña', password: 'mal' })).status).toBe(401);
    }
    const bloqueado = await login({ usuario: 'dueña', password: PASSWORD });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error).toMatch(/Demasiados intentos/);
  });

  it('los ingresos correctos no cuentan para el límite', async () => {
    for (let i = 0; i < 6; i += 1) {
      expect((await login({ usuario: 'marcos', password: PASSWORD })).status).toBe(200);
    }
  });

  it('cuenta los intentos por la IP real que manda Nginx', async () => {
    for (let i = 0; i < 5; i += 1) {
      await login({ usuario: 'dueña', password: 'mal' }).set('X-Forwarded-For', '200.1.1.1');
    }
    const otroCelular = await login({ usuario: 'dueña', password: PASSWORD }).set(
      'X-Forwarded-For',
      '200.2.2.2'
    );
    expect(otroCelular.status).toBe(200);
  });
});

describe('GET /api/auth/me', () => {
  it('sin cookie responde 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/sesión/);
  });

  it('con una cookie inventada responde 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'sesion=no-es-un-token');
    expect(res.status).toBe(401);
  });

  it('con la cookie del login devuelve la misma sesión', async () => {
    const entrada = await login({ usuario: 'lucia', password: PASSWORD, sucursalId: 2 });
    const res = await request(app).get('/api/auth/me').set('Cookie', cookieDe(entrada));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(entrada.body);
  });

  it('si la dueña desactiva a alguien, su sesión se corta en el próximo request', async () => {
    const entrada = await login({ usuario: 'marcos', password: PASSWORD });
    const desactivados = usuarios.map((u) => (u.id === 3 ? { ...u, activo: false } : u));
    db.query.mockImplementation(responderConsultas({ usuarios: desactivados }));

    const res = await request(app).get('/api/auth/me').set('Cookie', cookieDe(entrada));
    expect(res.status).toBe(401);
  });

  it('si falla la base responde 500', async () => {
    const entrada = await login({ usuario: 'marcos', password: PASSWORD });
    db.query.mockRejectedValue(new Error('base caída'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/api/auth/me').set('Cookie', cookieDe(entrada));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/logout', () => {
  it('borra la cookie de sesión', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(cookieDe(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
