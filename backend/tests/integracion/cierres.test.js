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

describe('revisión de la dueña contra Postgres', () => {
  const cierreNoche = async () => {
    const { rows } = await pool.query(
      `SELECT id FROM cierres_caja WHERE sucursal_id = $1 AND turno = 'NOCHE'`,
      [estrada]
    );
    return rows[0].id;
  };

  it('la empleada no puede ver la lista ni corregir', async () => {
    const id = await cierreNoche();
    expect((await request(app).get('/api/cierres').set('Cookie', cookieLucia)).status).toBe(403);
    const res = await request(app)
      .put(`/api/cierres/${id}`)
      .set('Cookie', cookieLucia)
      .send({ total_controlador: 1 });
    expect(res.status).toBe(403);
  });

  it('lista los cierres a revisar: sólo los que tienen diferencia', async () => {
    const res = await request(app).get('/api/cierres?a_revisar=true').set('Cookie', cookieDueña);
    expect(res.status).toBe(200);
    expect(res.body.map((c) => [c.sucursal_nombre, c.turno])).toEqual([['Estrada', 'NOCHE']]);
    expect(res.body[0].a_revisar).toBe(true);
  });

  it('filtra por sucursal y fechas', async () => {
    const { rows } = await pool.query(
      `SELECT to_char(fecha, 'YYYY-MM-DD') AS f FROM cierres_caja LIMIT 1`
    );
    const hoy = rows[0].f;
    const todos = await request(app)
      .get(`/api/cierres?desde=${hoy}&hasta=${hoy}`)
      .set('Cookie', cookieDueña);
    expect(todos.body).toHaveLength(3);
    const deEstrada = await request(app)
      .get(`/api/cierres?sucursal_id=${estrada}`)
      .set('Cookie', cookieDueña);
    expect(deEstrada.body).toHaveLength(2);
    const ayer = await request(app).get('/api/cierres?hasta=2000-01-01').set('Cookie', cookieDueña);
    expect(ayer.body).toEqual([]);
  });

  it('pendientes: qué sucursal no cargó qué turno de hoy, sin el galpón', async () => {
    const res = await request(app).get('/api/cierres/pendientes').set('Cookie', cookieDueña);
    const porNombre = Object.fromEntries(
      res.body.sucursales.map((s) => [s.nombre, s.turnos_pendientes])
    );
    expect(porNombre).toEqual({
      Café: ['MEDIODIA'],
      Estrada: [],
      Patagonia: ['MEDIODIA', 'NOCHE'],
      'Viedma (Chacra)': ['MEDIODIA', 'NOCHE'],
    });
  });

  it('corregir recalcula la diferencia y guarda cada cambio con el valor anterior', async () => {
    const id = await cierreNoche();
    const res = await request(app)
      .put(`/api/cierres/${id}`)
      .set('Cookie', cookieDueña)
      .send({ total_controlador: '203350.01', comentario: 'Mal tipeada la Z', gastos: [] });
    expect(res.status).toBe(200);
    expect(res.body.diferencia).toBe(-0.01);
    expect(res.body.gastos).toEqual([]);
    const porCampo = Object.fromEntries(
      res.body.correcciones.map((k) => [
        k.campo,
        [k.valor_anterior, k.valor_nuevo, k.usuario_nombre],
      ])
    );
    expect(porCampo).toEqual({
      total_controlador: ['205350.00', '203350.01', 'Administración'],
      comentario: [null, 'Mal tipeada la Z', 'Administración'],
      gastos: ['Bolsas 0.01', 'sin gastos', 'Administración'],
    });
  });

  it('sin cambios responde 400 y no registra nada', async () => {
    const id = await cierreNoche();
    const res = await request(app)
      .put(`/api/cierres/${id}`)
      .set('Cookie', cookieDueña)
      .send({ total_controlador: 203350.01 });
    expect(res.status).toBe(400);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM cierre_correcciones');
    expect(rows[0].n).toBe(3);
  });

  it('mover un cierre a un turno que ya existe da 409', async () => {
    const id = await cierreNoche();
    const res = await request(app)
      .put(`/api/cierres/${id}`)
      .set('Cookie', cookieDueña)
      .send({ turno: 'MEDIODIA' });
    expect(res.status).toBe(409);
  });

  it('marcar revisado lo saca de "a revisar" y se puede deshacer', async () => {
    const id = await cierreNoche();
    const marcado = await request(app)
      .put(`/api/cierres/${id}/revisado`)
      .set('Cookie', cookieDueña)
      .send({ revisado: true });
    expect(marcado.body).toMatchObject({ a_revisar: false, revisado_por_nombre: 'Administración' });
    const lista = await request(app).get('/api/cierres?a_revisar=true').set('Cookie', cookieDueña);
    expect(lista.body).toEqual([]);

    const desmarcado = await request(app)
      .put(`/api/cierres/${id}/revisado`)
      .set('Cookie', cookieDueña)
      .send({ revisado: false });
    expect(desmarcado.body).toMatchObject({ a_revisar: true, revisado_en: null });
  });

  it('un cierre que no existe da 404', async () => {
    const res = await request(app).get('/api/cierres/99999').set('Cookie', cookieDueña);
    expect(res.status).toBe(404);
  });
});
