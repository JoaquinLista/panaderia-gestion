import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';
import request from 'supertest';

// Login de punta a punta contra un Postgres real: migraciones, admin inicial,
// índice único sin mayúsculas y la cookie de sesión.
const URL_ADMIN = process.env.TEST_DATABASE_URL;
if (!URL_ADMIN) {
  throw new Error(
    'Falta TEST_DATABASE_URL (ej: postgres://postgres:postgres@localhost:5432/postgres)'
  );
}

const BASE = 'lf_test_auth';
const admin = new pg.Client({ connectionString: URL_ADMIN });

// config/db.js arma el pool con las variables POSTGRES_*: se apuntan a la base
// de prueba antes de importar la app.
const url = new URL(URL_ADMIN);
vi.stubEnv('POSTGRES_HOST', url.hostname);
vi.stubEnv('POSTGRES_PORT', url.port || '5432');
vi.stubEnv('POSTGRES_USER', decodeURIComponent(url.username));
vi.stubEnv('POSTGRES_PASSWORD', decodeURIComponent(url.password));
vi.stubEnv('POSTGRES_DB', BASE);
vi.stubEnv('JWT_SECRET', 'secreto-de-integracion-de-al-menos-32-caracteres');

let app;
let pool;
let asegurarAdminInicial;

beforeAll(async () => {
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${BASE}`);

  ({ default: app } = await import('../../src/app.js'));
  ({ default: pool } = await import('../../src/config/db.js'));
  ({ asegurarAdminInicial } = await import('../../src/services/authService.js'));
  const { aplicarMigraciones } = await import('../../src/db/migrar.js');
  await aplicarMigraciones({ log: () => {} });
});

afterAll(async () => {
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
  await admin.end();
  vi.unstubAllEnvs();
});

describe('login contra Postgres', () => {
  const credenciales = { usuario: 'Dueña', password: 'clave-inicial-123', log: () => {} };

  it('crea el admin inicial una sola vez', async () => {
    expect(await asegurarAdminInicial(credenciales)).toBe(true);
    expect(await asegurarAdminInicial(credenciales)).toBe(false);
    const { rows } = await pool.query('SELECT usuario, rol, password_hash FROM usuarios');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ usuario: 'Dueña', rol: 'ADMIN' });
    expect(rows[0].password_hash).not.toContain('clave-inicial-123');
  });

  it('entra sin importar mayúsculas y /me devuelve la sesión', async () => {
    const entrada = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'dueña', password: 'clave-inicial-123' });
    expect(entrada.status).toBe(200);

    const cookie = entrada.headers['set-cookie'].find((c) => c.startsWith('sesion='));
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.usuario).toMatchObject({ usuario: 'Dueña', rol: 'ADMIN' });
  });

  it('una empleada entra con una sucursal real de la base', async () => {
    const { hashearPassword } = await import('../../src/domain/password.js');
    await pool.query(
      `INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES ('lucia', 'Lucía', $1, 'EMPLEADA')`,
      [await hashearPassword('clave-de-lucia')]
    );
    const { rows } = await pool.query(`SELECT id FROM sucursales WHERE nombre = 'Estrada'`);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'lucia', password: 'clave-de-lucia', sucursalId: rows[0].id });
    expect(res.status).toBe(200);
    expect(res.body.sucursal).toMatchObject({ nombre: 'Estrada', tipo: 'VENTA' });
  });

  it('rechaza la contraseña incorrecta', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'dueña', password: 'otra' });
    expect(res.status).toBe(401);
  });
});
