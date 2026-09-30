import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';
import request from 'supertest';

// Pedidos de punta a punta contra un Postgres real (Sprint 9, #77): Estrada
// pide facturas e insumos, el chofer ve qué cargar, lo lleva y Estrada
// confirma que le llegó.
const URL_ADMIN = process.env.TEST_DATABASE_URL;
if (!URL_ADMIN) {
  throw new Error(
    'Falta TEST_DATABASE_URL (ej: postgres://postgres:postgres@localhost:5432/postgres)'
  );
}

const BASE = 'lf_test_pedidos';
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
const cookie = {};
const ids = {};
let creados;

const entrar = async (body) => {
  const res = await request(app).post('/api/auth/login').send(body);
  expect(res.status).toBe(200);
  return res.headers['set-cookie'].find((c) => c.startsWith('sesion='));
};

const como = (quien) => ({
  get: (ruta) => request(app).get(`/api/pedidos${ruta}`).set('Cookie', cookie[quien]),
  post: (body) => request(app).post('/api/pedidos').set('Cookie', cookie[quien]).send(body),
  put: (ruta, body) =>
    request(app).put(`/api/pedidos${ruta}`).set('Cookie', cookie[quien]).send(body),
});

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
  for (const [usuario, rol] of [
    ['lucia', 'EMPLEADA'],
    ['pablo', 'CHOFER'],
  ]) {
    await pool.query(
      `INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES ($1, $1, $2, $3)`,
      [usuario, await hashearPassword(`clave-de-${usuario}`), rol]
    );
  }
  for (const tabla of ['sucursales', 'rubros']) {
    const { rows } = await pool.query(`SELECT id, nombre FROM ${tabla}`);
    for (const r of rows) ids[r.nombre] = r.id;
  }

  cookie.dueña = await entrar({ usuario: 'dueña', password: 'clave-de-la-dueña' });
  cookie.lucia = await entrar({
    usuario: 'lucia',
    password: 'clave-de-lucia',
    sucursalId: ids.Estrada,
  });
  cookie.pablo = await entrar({ usuario: 'pablo', password: 'clave-de-pablo' });
});

afterAll(async () => {
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
  await admin.end();
  vi.unstubAllEnvs();
});

describe('pedidos contra Postgres', () => {
  it('la sucursal ve los rubros que puede pedir', async () => {
    const res = await como('lucia').get('/rubros');
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.nombre).slice(0, 2)).toEqual(['Pan', 'Facturas']);
  });

  it('Estrada pide facturas e insumos: sale un pedido para la fábrica y otro para el galpón', async () => {
    const res = await como('lucia').post({
      urgente: true,
      nota: 'Antes de las 7',
      items: [
        { rubro_id: ids.Facturas, detalle: '2 latas de medialunas, 2 latas de vigilantes' },
        { rubro_id: ids.Insumos, detalle: '1 bolsa de harina' },
      ],
    });
    expect(res.status).toBe(201);
    creados = res.body;
    expect(
      creados.map((p) => [p.sucursal_origen_nombre, p.sucursal_destino_nombre, p.estado])
    ).toEqual([
      ['Viedma (Chacra)', 'Estrada', 'PENDIENTE'],
      ['Galpón Central', 'Estrada', 'PENDIENTE'],
    ]);
    expect(creados[0]).toMatchObject({
      urgente: true,
      nota: 'Antes de las 7',
      creado_por_nombre: 'lucia',
      items: [
        {
          rubro_nombre: 'Facturas',
          detalle: '2 latas de medialunas, 2 latas de vigilantes',
          estado: 'PENDIENTE',
        },
      ],
    });
  });

  it('el chofer ve qué cargar en cada lugar y una sola parada en Estrada', async () => {
    const res = await como('pablo').get('/recorrido');
    expect(res.status).toBe(200);
    expect(
      res.body.cargar.map((c) => [c.origen.nombre, c.rubros.map((r) => r.rubro.nombre)])
    ).toEqual([
      ['Galpón Central', ['Insumos']],
      ['Viedma (Chacra)', ['Facturas']],
    ]);
    expect(res.body.paradas).toHaveLength(1);
    expect(res.body.paradas[0]).toMatchObject({ sucursal: { nombre: 'Estrada' }, urgente: true });
  });

  it('la empleada no puede sacar el pedido a la calle', async () => {
    const res = await como('lucia').put(`/${creados[0].id}/estado`, { estado: 'EN_CAMINO' });
    expect(res.status).toBe(403);
  });

  it('el chofer tilda lo que carga, sale y entrega', async () => {
    const [facturas] = creados;
    let res = await como('pablo').put(`/${facturas.id}/items/${facturas.items[0].id}`, {
      estado: 'LLEVADO',
    });
    expect(res.status).toBe(200);
    expect(res.body.items[0].estado).toBe('LLEVADO');

    res = await como('pablo').put(`/${facturas.id}/estado`, { estado: 'EN_CAMINO' });
    expect(res.status).toBe(200);
    expect(res.body.en_camino_en).not.toBeNull();

    // Ya salió: en el recorrido no hay que cargarlo de nuevo, pero la parada sigue.
    const recorrido = await como('pablo').get('/recorrido');
    expect(recorrido.body.cargar.map((c) => c.origen.nombre)).toEqual(['Galpón Central']);

    res = await como('pablo').put(`/${facturas.id}/estado`, { estado: 'ENTREGADO' });
    expect(res.status).toBe(200);
  });

  it('el chofer no confirma por la sucursal; Estrada sí', async () => {
    const [facturas] = creados;
    expect((await como('pablo').put(`/${facturas.id}/estado`, { estado: 'RECIBIDO' })).status).toBe(
      403
    );
    const res = await como('lucia').put(`/${facturas.id}/estado`, { estado: 'RECIBIDO' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'RECIBIDO' });
    expect(res.body.recibido_en).not.toBeNull();
  });

  it('un pedido recibido ya no se tilda', async () => {
    const [facturas] = creados;
    const res = await como('pablo').put(`/${facturas.id}/items/${facturas.items[0].id}`, {
      estado: 'NO_HABIA',
    });
    expect(res.status).toBe(409);
  });

  it('Estrada cancela el de insumos mientras no salió, y ya no aparece abierto', async () => {
    const res = await como('lucia').put(`/${creados[1].id}/estado`, { estado: 'CANCELADO' });
    expect(res.status).toBe(200);
    const abiertos = await como('dueña').get('?estado=abiertos');
    expect(abiertos.body).toEqual([]);
    const historial = await como('lucia').get('');
    expect(historial.body.map((p) => p.estado).sort()).toEqual(['CANCELADO', 'RECIBIDO']);
  });

  it('la fábrica no puede pedirse facturas a sí misma', async () => {
    const res = await como('dueña').post({
      sucursal_id: ids['Viedma (Chacra)'],
      items: [{ rubro_id: ids.Facturas, detalle: '1 lata' }],
    });
    expect(res.status).toBe(400);
  });
});
