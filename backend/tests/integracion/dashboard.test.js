import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';
import request from 'supertest';

// El resumen de los dueños contra un Postgres real: ventas de los cierres,
// gastos y retiros de la caja central, y la comparación con el mes anterior.
// Se usan meses ya terminados (julio y agosto) para que no dependa de la fecha.
const URL_ADMIN = process.env.TEST_DATABASE_URL;
if (!URL_ADMIN) {
  throw new Error(
    'Falta TEST_DATABASE_URL (ej: postgres://postgres:postgres@localhost:5432/postgres)'
  );
}

const BASE = 'lf_test_dashboard';
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
let cookieDueña;
let dueñaId;
const ids = {};

const get = (ruta) => request(app).get(`/api/dashboard${ruta}`).set('Cookie', cookieDueña);

const cierre = async ({ sucursal, fecha, turno, z, efectivo, cambio, debito = 0, gastos = [] }) => {
  const {
    rows: [{ id }],
  } = await pool.query(
    `INSERT INTO cierres_caja (sucursal_id, fecha, turno, total_controlador, efectivo_contado,
                               cambio_fijo, debito, diferencia, cargado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8) RETURNING id`,
    [ids[sucursal], fecha, turno, z, efectivo, cambio, debito, dueñaId]
  );
  for (const [categoria, monto] of gastos) {
    await pool.query(
      `INSERT INTO cierre_gastos (cierre_id, categoria_id, detalle, monto) VALUES ($1, $2, 'x', $3)`,
      [id, ids[categoria], monto]
    );
  }
};

const movimiento = (tipo, fecha, monto, extra = {}) =>
  pool.query(
    `INSERT INTO movimientos_caja (fecha, tipo, cuenta, monto, categoria_id, dueno_id, concepto,
                                   cargado_por, anulado_en)
     VALUES ($1, $2, 'CAJA', $3, $4, $5, $6, $7, $8)`,
    [
      fecha,
      tipo,
      monto,
      extra.categoria ? ids[extra.categoria] : null,
      extra.dueno ? ids[extra.dueno] : null,
      tipo === 'PAGO' ? 'concepto' : null,
      dueñaId,
      extra.anulado ? new Date() : null,
    ]
  );

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
  ({
    rows: [{ id: dueñaId }],
  } = await pool.query(`SELECT id FROM usuarios WHERE usuario = 'dueña'`));
  for (const tabla of ['sucursales', 'categorias_gasto', 'duenos']) {
    const { rows } = await pool.query(`SELECT id, nombre FROM ${tabla}`);
    for (const r of rows) ids[r.nombre] = r.id;
  }
  const login = await request(app)
    .post('/api/auth/login')
    .send({ usuario: 'dueña', password: 'clave-de-la-dueña' });
  cookieDueña = login.headers['set-cookie'].find((c) => c.startsWith('sesion='));

  // Julio: 200.000 vendidos, 10.000 de gastos, 50.000 de retiros.
  await cierre({
    sucursal: 'Estrada',
    fecha: '2026-07-15',
    turno: 'NOCHE',
    z: 200000,
    efectivo: 190000,
    cambio: 10000,
    debito: 20000,
  });
  await movimiento('PAGO', '2026-07-20', 10000, { categoria: 'Proveedores' });
  await movimiento('RETIRO_DUENO', '2026-07-31', 50000, { dueno: 'Gabriel' });

  // Agosto.
  await cierre({
    sucursal: 'Estrada',
    fecha: '2026-08-10',
    turno: 'MEDIODIA',
    z: 100000.5,
    efectivo: 75000.5,
    cambio: 10000,
    debito: 30000,
    gastos: [['Carne', 5000]],
  });
  await cierre({
    sucursal: 'Estrada',
    fecha: '2026-08-10',
    turno: 'NOCHE',
    z: 150000,
    efectivo: 160000,
    cambio: 10000,
  });
  await cierre({
    sucursal: 'Café',
    fecha: '2026-08-11',
    turno: 'NOCHE',
    z: 50000,
    efectivo: 60000,
    cambio: 10000,
  });
  await movimiento('PAGO', '2026-08-12', 30000, { categoria: 'Proveedores' });
  await movimiento('PAGO', '2026-08-13', 20000, { categoria: 'Obra' });
  await movimiento('PAGO', '2026-08-14', 99999, { categoria: 'Proveedores', anulado: true });
  await movimiento('RETIRO_DUENO', '2026-08-20', 40000, { dueno: 'Fernanda' });
  await movimiento('DEPOSITO', '2026-08-21', 500000);
});

afterAll(async () => {
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
  await admin.end();
  vi.unstubAllEnvs();
});

describe('resumen de los dueños contra Postgres', () => {
  it('el día suma los dos turnos por sucursal y marca los que faltan', async () => {
    const res = await get('/dia?fecha=2026-08-10');
    expect(res.status).toBe(200);
    expect(res.body.es_hoy).toBe(false);
    const estrada = res.body.sucursales.find((s) => s.sucursal === 'Estrada');
    expect(estrada).toMatchObject({
      vendido: 250000.5,
      efectivo: 220000.5, // 65.000,50 + 5.000 de gastos + 150.000
      debito: 30000,
      gastos: 5000,
      turnos_pendientes: [],
    });
    // El galpón no vende: no aparece.
    expect(res.body.sucursales.map((s) => s.sucursal)).not.toContain('Galpón Central');
    expect(res.body.total.vendido).toBe(250000.5);
    // Las otras tres sucursales no cargaron ninguno de los dos turnos.
    expect(res.body.turnos_pendientes).toBe(6);
  });

  it('el mes: ventas, gastos, retiros, resultado y comparación con el anterior', async () => {
    const res = await get('/mes?mes=2026-08');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      mes: '2026-08',
      desde: '2026-08-01',
      hasta: '2026-08-31',
      en_curso: false,
      ventas: 300000.5,
      gastos: { sucursales: 5000, caja_central: 30000, obra: 20000, total: 55000 },
      retiros_duenos: 40000,
      // El depósito no cuenta y el pago anulado tampoco.
      resultado: 205000.5,
      retiros_por_dueno: [{ dueno: 'Fernanda', total: 40000 }],
      anterior: { mes: '2026-07', ventas: 200000, resultado: 140000 },
      variacion: { ventas: 50, gastos: 450, retiros_duenos: -20, resultado: 46.4 },
    });
    const cafe = res.body.ventas_por_sucursal.find((s) => s.sucursal === 'Café');
    expect(cafe).toMatchObject({ vendido: 50000, cierres: 1, turnos_sin_cargar: 61 });
    expect(res.body.ventas_por_dia).toHaveLength(31);
    expect(res.body.ventas_por_dia[9]).toMatchObject({ fecha: '2026-08-10', vendido: 250000.5 });
  });

  it('valida la fecha y el mes', async () => {
    expect((await get('/dia?fecha=2026-02-30')).status).toBe(400);
    expect((await get('/mes?mes=2026-13')).status).toBe(400);
    expect((await get('/mes?mes=2999-01')).status).toBe(400);
  });
});
