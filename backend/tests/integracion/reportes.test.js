import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';
import request from 'supertest';

// Reportar un problema contra un Postgres real: se guarda con quién y desde
// dónde, aunque no haya token de GitHub.
const URL_ADMIN = process.env.TEST_DATABASE_URL;
if (!URL_ADMIN) {
  throw new Error(
    'Falta TEST_DATABASE_URL (ej: postgres://postgres:postgres@localhost:5432/postgres)'
  );
}

const BASE = 'lf_test_reportes';
const admin = new pg.Client({ connectionString: URL_ADMIN });

const url = new URL(URL_ADMIN);
vi.stubEnv('POSTGRES_HOST', url.hostname);
vi.stubEnv('POSTGRES_PORT', url.port || '5432');
vi.stubEnv('POSTGRES_USER', decodeURIComponent(url.username));
vi.stubEnv('POSTGRES_PASSWORD', decodeURIComponent(url.password));
vi.stubEnv('POSTGRES_DB', BASE);

vi.stubEnv('JWT_SECRET', 'secreto-de-integracion-de-al-menos-32-caracteres'); // gitleaks:allow
vi.stubEnv('GITHUB_TOKEN_REPORTES', '');

let app;
let pool;
let cookie;

beforeAll(async () => {
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${BASE}`);

  ({ default: app } = await import('../../src/app.js'));
  ({ default: pool } = await import('../../src/config/db.js'));
  const { aplicarMigraciones } = await import('../../src/db/migrar.js');
  const { asegurarAdminInicial } = await import('../../src/services/authService.js');
  await aplicarMigraciones({ log: () => {} });
  await asegurarAdminInicial({ usuario: 'dueña', password: 'clave-de-la-dueña', log: () => {} });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ usuario: 'dueña', password: 'clave-de-la-dueña' });
  cookie = login.headers['set-cookie'].find((c) => c.startsWith('sesion='));
});

afterAll(async () => {
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
  await admin.end();
});

describe('reportes de problemas', () => {
  it('se guardan con la persona, la sección y la versión', async () => {
    const res = await request(app)
      .post('/api/reportes')
      .set('Cookie', cookie)
      .send({ que_paso: 'El Excel sale vacío', seccion: 'Resumen', version: 'abc' });
    expect(res.status).toBe(201);
    expect(res.body.issue_url).toBeNull();
    const { rows } = await pool.query(
      `SELECT u.usuario, r.sucursal_id, r.que_paso, r.seccion, r.version, r.issue_url
         FROM reportes_problema r JOIN usuarios u ON u.id = r.usuario_id WHERE r.id = $1`,
      [res.body.id]
    );
    expect(rows[0]).toEqual({
      usuario: 'dueña',
      sucursal_id: null,
      que_paso: 'El Excel sale vacío',
      seccion: 'Resumen',
      version: 'abc',
      issue_url: null,
    });
  });

  it('la base rechaza un texto demasiado corto aunque no pase por la API', async () => {
    await expect(
      pool.query(
        `INSERT INTO reportes_problema (usuario_id, que_paso) SELECT id, 'corto' FROM usuarios LIMIT 1`
      )
    ).rejects.toThrow(/check/);
  });
});
