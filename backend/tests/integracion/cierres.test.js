import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';
import request from 'supertest';

// Cierre de caja de punta a punta contra un Postgres real: login, cuadre,
// plata exacta en NUMERIC y un solo cierre por sucursal, fecha y turno.
const URL_ADMIN = process.env.TEST_DATABASE_URL;
if (!URL_ADMIN) {
  throw new Error(
    'Falta TEST_DATABASE_URL (ej: postgres://postgres:postgres@localhost:5432/postgres)'
  );
}

const BASE = 'lf_test_cierres';
const admin = new pg.Client({ connectionString: URL_ADMIN });

const url = new URL(URL_ADMIN);
vi.stubEnv('POSTGRES_HOST', url.hostname);
vi.stubEnv('POSTGRES_PORT', url.port || '5432');
vi.stubEnv('POSTGRES_USER', decodeURIComponent(url.username));
vi.stubEnv('POSTGRES_PASSWORD', decodeURIComponent(url.password));
vi.stubEnv('POSTGRES_DB', BASE);
vi.stubEnv('JWT_SECRET', 'secreto-de-integracion-de-al-menos-32-caracteres');

let app;
let pool;
let estrada;
let cookieLucia;
let cookieDueña;

const entrar = async (body) => {
  const res = await request(app).post('/api/auth/login').send(body);
  expect(res.status).toBe(200);
  return res.headers['set-cookie'].find((c) => c.startsWith('sesion='));
};

beforeAll(async () => {
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${BASE}`);

  ({ default: app } = await import('../../src/app.js'));
  ({ default: pool } = await import('../../src/config/db.js'));
  const { aplicarMigraciones } = await import('../../src/db/migrar.js');
  const { asegurarAdminInicial } = await import('../../src/services/authService.js');
  const { hashearPassword } = await import('../../src/domain/password.js');
  await aplicarMigraciones({ log: () => {} });
  await asegurarAdminInicial({ usuario: 'dueña', password: 'clave-de-la-dueña', log: () => {} });
  await pool.query(
    `INSERT INTO usuarios (usuario, nombre, password_hash, rol, puede_cerrar_caja)
     VALUES ('lucia', 'Lucía', $1, 'EMPLEADA', true)`,
    [await hashearPassword('clave-de-lucia')]
  );
  const { rows } = await pool.query(`SELECT id FROM sucursales WHERE nombre = 'Estrada'`);
  estrada = rows[0].id;

  cookieLucia = await entrar({ usuario: 'lucia', password: 'clave-de-lucia', sucursalId: estrada });
  cookieDueña = await entrar({ usuario: 'dueña', password: 'clave-de-la-dueña' });
});

afterAll(async () => {
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
  await admin.end();
  vi.unstubAllEnvs();
});

describe('cierre de caja contra Postgres', () => {
  it('Lucía carga el cierre del mediodía y la plata queda exacta', async () => {
    const res = await request(app).post('/api/cierres').set('Cookie', cookieLucia).send({
      turno: 'MEDIODIA',
      numero_z: 1532,
      total_controlador: '0.30',
      efectivo_contado: '1000.10',
      cambio_fijo: '1000.00',
      posnet: '0.20',
      gastos: [],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      sucursal_nombre: 'Estrada',
      turno: 'MEDIODIA',
      diferencia: 0,
      cargado_por_nombre: 'Lucía',
    });

    const { rows } = await pool.query(
      `SELECT efectivo_contado::text, diferencia::text, fecha::text FROM cierres_caja`
    );
    expect(rows[0]).toMatchObject({ efectivo_contado: '1000.10', diferencia: '0.00' });
    expect(rows[0].fecha).toBe(res.body.fecha);
  });

  it('un segundo cierre del mismo turno da 409 y no deja nada a medias', async () => {
    const res = await request(app)
      .post('/api/cierres')
      .set('Cookie', cookieLucia)
      .send({
        turno: 'MEDIODIA',
        total_controlador: 10,
        efectivo_contado: 10,
        cambio_fijo: 0,
        gastos: [{ detalle: 'Sodero', monto: 5 }],
      });
    expect(res.status).toBe(409);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM cierre_gastos');
    expect(rows[0].n).toBe(0);
  });

  it('la noche se carga con gastos y una diferencia que queda guardada', async () => {
    const res = await request(app)
      .post('/api/cierres')
      .set('Cookie', cookieLucia)
      .send({
        turno: 'NOCHE',
        total_controlador: 205350,
        efectivo_contado: 113000,
        cambio_fijo: 15000,
        posnet: 74250,
        transferencias: 31100,
        gastos: [{ detalle: 'Bolsas', monto: '0.01' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.diferencia).toBe(-1999.99);
    expect(res.body.gastos).toEqual([{ id: expect.any(Number), detalle: 'Bolsas', monto: 0.01 }]);
  });

  it('/hoy muestra los dos turnos cerrados y sugiere el último cambio fijo', async () => {
    const res = await request(app).get('/api/cierres/hoy').set('Cookie', cookieLucia);
    expect(res.status).toBe(200);
    expect(res.body.turnos_pendientes).toEqual([]);
    expect(res.body.cierres.map((c) => c.turno)).toEqual(['MEDIODIA', 'NOCHE']);
    expect(res.body.cambio_sugerido).toBe(15000);
  });

  it('la dueña carga el cierre de otra sucursal', async () => {
    const { rows } = await pool.query(`SELECT id FROM sucursales WHERE nombre = 'Café'`);
    const res = await request(app).post('/api/cierres').set('Cookie', cookieDueña).send({
      sucursal_id: rows[0].id,
      turno: 'NOCHE',
      total_controlador: 100,
      efectivo_contado: 100,
      cambio_fijo: 0,
    });
    expect(res.status).toBe(201);
    expect(res.body.sucursal_nombre).toBe('Café');
  });

  it('la base rechaza montos negativos aunque alguien se saltee la API', async () => {
    await expect(
      pool.query(
        `INSERT INTO cierre_gastos (cierre_id, detalle, monto)
         SELECT id, 'x', -1 FROM cierres_caja LIMIT 1`
      )
    ).rejects.toThrow(/check/i);
  });
});
