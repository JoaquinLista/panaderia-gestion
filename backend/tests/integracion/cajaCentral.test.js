import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';
import request from 'supertest';
import ExcelJS from 'exceljs';

// Caja central de punta a punta contra un Postgres real: el retiro de cada
// cierre entra solo, las salidas bajan el saldo y los totales del mes salen
// como en la planilla "Retiros".
const URL_ADMIN = process.env.TEST_DATABASE_URL;
if (!URL_ADMIN) {
  throw new Error(
    'Falta TEST_DATABASE_URL (ej: postgres://postgres:postgres@localhost:5432/postgres)'
  );
}

const BASE = 'lf_test_caja_central';
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
let cookieLucia;
let dueñaId;
const ids = {};

const entrar = async (body) => {
  const res = await request(app).post('/api/auth/login').send(body);
  expect(res.status).toBe(200);
  return res.headers['set-cookie'].find((c) => c.startsWith('sesion='));
};

const get = (ruta) => request(app).get(`/api/caja-central${ruta}`).set('Cookie', cookieDueña);
const cargar = (body) =>
  request(app).post('/api/caja-central/movimientos').set('Cookie', cookieDueña).send(body);

// Un cierre cargado directo en la base, con la fecha que haga falta.
const cierre = async ({ sucursal, fecha, turno, efectivo, cambio, gastos = [] }) => {
  const {
    rows: [{ id }],
  } = await pool.query(
    `INSERT INTO cierres_caja (sucursal_id, fecha, turno, total_controlador, efectivo_contado,
                               cambio_fijo, diferencia, cargado_por)
     VALUES ($1, $2, $3, 0, $4, $5, 0, $6) RETURNING id`,
    [ids[sucursal], fecha, turno, efectivo, cambio, dueñaId]
  );
  for (const [categoria, monto] of gastos) {
    await pool.query(
      `INSERT INTO cierre_gastos (cierre_id, categoria_id, detalle, monto) VALUES ($1, $2, 'x', $3)`,
      [id, ids[categoria], monto]
    );
  }
  return id;
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
  ({
    rows: [{ id: dueñaId }],
  } = await pool.query(`SELECT id FROM usuarios WHERE usuario = 'dueña'`));
  for (const tabla of ['sucursales', 'categorias_gasto', 'duenos']) {
    const { rows } = await pool.query(`SELECT id, nombre FROM ${tabla}`);
    for (const r of rows) ids[r.nombre] = r.id;
  }

  cookieDueña = await entrar({ usuario: 'dueña', password: 'clave-de-la-dueña' });
  cookieLucia = await entrar({
    usuario: 'lucia',
    password: 'clave-de-lucia',
    sucursalId: ids.Estrada,
  });

  // Un cierre de antes del saldo inicial: esa plata ya está contada en el saldo.
  await cierre({
    sucursal: 'Estrada',
    fecha: '2026-08-31',
    turno: 'NOCHE',
    efectivo: 50000,
    cambio: 20000,
  });
});

afterAll(async () => {
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
  await admin.end();
  vi.unstubAllEnvs();
});

describe('caja central contra Postgres', () => {
  it('trae los dueños de la planilla', async () => {
    const res = await get('/duenos');
    expect(res.status).toBe(200);
    expect(res.body.map((d) => d.nombre)).toEqual(['Fernanda', 'Gabriel', 'Mary']);
  });

  it('la empleada no puede ver la caja central', async () => {
    const res = await request(app).get('/api/caja-central/resumen').set('Cookie', cookieLucia);
    expect(res.status).toBe(403);
  });

  it('sin saldo inicial, la caja arranca en cero y cuenta todos los cierres', async () => {
    const res = await get('/resumen?fecha=2026-08-31');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      saldo_caja: 30000,
      saldo_banco: 0,
      saldo_inicial: { caja: null, banco: null },
      total_entradas: 30000,
    });
  });

  it('la dueña carga el saldo inicial de cada cuenta', async () => {
    const caja = await cargar({
      tipo: 'SALDO_INICIAL',
      cuenta: 'CAJA',
      fecha: '2026-09-01',
      monto: '1000000',
    });
    expect(caja.status).toBe(201);
    expect(caja.body).toMatchObject({ tipo: 'SALDO_INICIAL', cuenta: 'CAJA', monto: 1000000 });
    const banco = await cargar({
      tipo: 'SALDO_INICIAL',
      cuenta: 'BANCO',
      fecha: '2026-09-01',
      monto: 500000,
    });
    expect(banco.status).toBe(201);

    const otra = await cargar({ tipo: 'SALDO_INICIAL', cuenta: 'CAJA', monto: 1 });
    expect(otra.status).toBe(409);
    expect(otra.body.error).toContain('anulalo');
  });

  it('el retiro de cada cierre entra solo y las salidas bajan el saldo', async () => {
    await cierre({
      sucursal: 'Estrada',
      fecha: '2026-09-02',
      turno: 'MEDIODIA',
      efectivo: '113000.50',
      cambio: 15000,
      gastos: [['Varios', 6000]],
    });
    await cierre({
      sucursal: 'Café',
      fecha: '2026-09-02',
      turno: 'NOCHE',
      efectivo: 232500,
      cambio: 20000,
      gastos: [
        ['Carne', 12000],
        ['Varios', 1000],
      ],
    });
    // Un cierre en el que no quedó plata para retirar no aparece.
    await cierre({
      sucursal: 'Patagonia',
      fecha: '2026-09-02',
      turno: 'NOCHE',
      efectivo: 20000,
      cambio: 20000,
    });

    const deposito = await cargar({
      tipo: 'DEPOSITO',
      cuenta: 'BANCO', // se ignora: el depósito siempre va de la caja al banco
      fecha: '2026-09-02',
      monto: '800000',
    });
    expect(deposito.status).toBe(201);
    expect(deposito.body.cuenta).toBe('CAJA');

    const pago = await cargar({
      tipo: 'PAGO',
      cuenta: 'BANCO',
      fecha: '2026-09-02',
      monto: '300000',
      categoria_id: ids.Proveedores,
      concepto: 'Molino Fénix, harina',
    });
    expect(pago.status).toBe(201);
    expect(pago.body).toMatchObject({ categoria: 'Proveedores', concepto: 'Molino Fénix, harina' });

    const retiro = await cargar({
      tipo: 'RETIRO_DUENO',
      cuenta: 'CAJA',
      fecha: '2026-09-02',
      monto: '100000',
      dueno_id: ids.Fernanda,
    });
    expect(retiro.status).toBe(201);
    expect(retiro.body.dueno).toBe('Fernanda');

    const ajuste = await cargar({
      tipo: 'AJUSTE',
      cuenta: 'CAJA',
      fecha: '2026-09-02',
      monto: '-500.50',
      concepto: 'Arqueo: faltaban 500,50',
    });
    expect(ajuste.status).toBe(201);
    expect(ajuste.body.monto).toBe(-500.5);

    const res = await get('/resumen?fecha=2026-09-02');
    expect(res.status).toBe(200);
    // Caja: 1.000.000 + 98.000,50 + 212.500 − 800.000 − 100.000 − 500,50 = 410.000
    // Banco: 500.000 + 800.000 − 300.000 = 1.000.000
    expect(res.body).toMatchObject({
      fecha: '2026-09-02',
      saldo_caja: 410000,
      saldo_banco: 1000000,
      saldo_inicial: {
        caja: { fecha: '2026-09-01', monto: 1000000 },
        banco: { fecha: '2026-09-01', monto: 500000 },
      },
      total_entradas: 310500.5,
    });
    expect(res.body.entradas.map((e) => [e.sucursal, e.turno, e.monto])).toEqual([
      ['Estrada', 'MEDIODIA', 98000.5],
      ['Café', 'NOCHE', 212500],
    ]);
    expect(res.body.movimientos.map((m) => m.tipo)).toEqual([
      'DEPOSITO',
      'PAGO',
      'RETIRO_DUENO',
      'AJUSTE',
    ]);
  });

  it('lista los movimientos del mes con el saldo después de cada uno', async () => {
    const res = await get('/movimientos?desde=2026-09-01&hasta=2026-09-30');
    expect(res.status).toBe(200);
    expect(res.body.movimientos.map((m) => [m.tipo, m.saldo_caja, m.saldo_banco])).toEqual([
      ['SALDO_INICIAL', 1000000, 0],
      ['SALDO_INICIAL', 1000000, 500000],
      ['RETIRO_SUCURSAL', 1098000.5, 500000],
      ['RETIRO_SUCURSAL', 1310500.5, 500000],
      ['DEPOSITO', 510500.5, 1300000],
      ['PAGO', 510500.5, 1000000],
      ['RETIRO_DUENO', 410500.5, 1000000],
      ['AJUSTE', 410000, 1000000],
    ]);
    // El cierre de agosto quedó antes del saldo inicial.
    expect(res.body.movimientos.some((m) => m.fecha === '2026-08-31')).toBe(false);
  });

  it('filtra por cuenta, tipo, categoría y dueño', async () => {
    const banco = await get('/movimientos?desde=2026-09-01&hasta=2026-09-30&cuenta=banco');
    expect(banco.body.movimientos.map((m) => m.tipo)).toEqual([
      'SALDO_INICIAL',
      'DEPOSITO',
      'PAGO',
    ]);
    const deFernanda = await get(
      `/movimientos?desde=2026-09-01&hasta=2026-09-30&dueno_id=${ids.Fernanda}`
    );
    expect(deFernanda.body.movimientos).toHaveLength(1);
    const proveedores = await get(
      `/movimientos?desde=2026-09-01&hasta=2026-09-30&categoria_id=${ids.Proveedores}`
    );
    expect(proveedores.body.movimientos).toHaveLength(1);
    const sucursales = await get(
      '/movimientos?desde=2026-09-01&hasta=2026-09-30&tipo=retiro_sucursal'
    );
    expect(sucursales.body.movimientos).toHaveLength(2);
  });

  it('el resumen del mes suma por sucursal, por dueño y por categoría', async () => {
    const res = await get('/mensual?mes=2026-09');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      mes: '2026-09',
      desde: '2026-09-01',
      hasta: '2026-09-30',
      entradas_por_sucursal: [
        { sucursal: 'Café', total: 212500 },
        { sucursal: 'Estrada', total: 98000.5 },
      ],
      total_entradas: 310500.5,
      depositos: 800000,
      retiros_por_dueno: [
        { dueno: 'Fernanda', total: 100000 },
        { dueno: 'Gabriel', total: 0 },
        { dueno: 'Mary', total: 0 },
      ],
      total_retiros_duenos: 100000,
      ajustes: -500.5,
      saldo_caja: 410000,
      saldo_banco: 1000000,
    });
    expect(
      res.body.gastos_por_categoria.map((k) => [
        k.categoria,
        k.en_sucursales,
        k.en_caja_central,
        k.total,
      ])
    ).toEqual([
      ['Carne', 12000, 0, 12000],
      ['Proveedores', 0, 300000, 300000],
      ['Varios', 7000, 0, 7000],
    ]);
  });

  it('una corrección del cierre cambia lo que entró a la caja central', async () => {
    const estrada = await pool.query(
      `SELECT id FROM cierres_caja WHERE fecha = '2026-09-02' AND turno = 'MEDIODIA'`
    );
    const res = await request(app)
      .put(`/api/cierres/${estrada.rows[0].id}`)
      .set('Cookie', cookieDueña)
      .send({ efectivo_contado: '114000.50' });
    expect(res.status).toBe(200);
    const resumen = await get('/resumen?fecha=2026-09-02');
    expect(resumen.body.saldo_caja).toBe(411000);
  });

  it('no deja cargar antes del saldo inicial ni con fecha futura', async () => {
    const antes = await cargar({
      tipo: 'DEPOSITO',
      fecha: '2026-08-15',
      monto: 1000,
    });
    expect(antes.status).toBe(400);
    expect(antes.body.error).toContain('anterior al saldo inicial de la caja central (01/09)');

    const futura = await cargar({ tipo: 'DEPOSITO', fecha: '2099-01-01', monto: 1000 });
    expect(futura.status).toBe(400);
  });

  it('un movimiento anulado deja de contar y no se anula dos veces', async () => {
    const pago = await cargar({
      tipo: 'PAGO',
      cuenta: 'CAJA',
      fecha: '2026-09-02',
      monto: 1000,
      categoria_id: ids.Gasoil,
      concepto: 'Mal cargado',
    });
    expect((await get('/resumen?fecha=2026-09-02')).body.saldo_caja).toBe(410000);

    const anular = () =>
      request(app)
        .delete(`/api/caja-central/movimientos/${pago.body.id}`)
        .set('Cookie', cookieDueña);
    expect((await anular()).body).toEqual({ id: pago.body.id, anulado: true });
    expect((await get('/resumen?fecha=2026-09-02')).body.saldo_caja).toBe(411000);
    expect((await anular()).status).toBe(409);

    const noExiste = await request(app)
      .delete('/api/caja-central/movimientos/999999')
      .set('Cookie', cookieDueña);
    expect(noExiste.status).toBe(404);
  });

  it('el saldo inicial anulado se puede volver a cargar, pero no después de otros movimientos', async () => {
    const { rows } = await pool.query(
      `SELECT id FROM movimientos_caja WHERE tipo = 'SALDO_INICIAL' AND cuenta = 'BANCO'`
    );
    await request(app)
      .delete(`/api/caja-central/movimientos/${rows[0].id}`)
      .set('Cookie', cookieDueña);
    const tarde = await cargar({
      tipo: 'SALDO_INICIAL',
      cuenta: 'BANCO',
      fecha: '2026-09-10',
      monto: 1000,
    });
    expect(tarde.status).toBe(400);
    expect(tarde.body.error).toContain('anteriores al 10/09');
    const bien = await cargar({
      tipo: 'SALDO_INICIAL',
      cuenta: 'BANCO',
      fecha: '2026-09-01',
      monto: 600000,
    });
    expect(bien.status).toBe(201);
    expect((await get('/resumen?fecha=2026-09-02')).body.saldo_banco).toBe(1100000);
  });

  it('la base rechaza montos que no respetan las reglas aunque se salteen la API', async () => {
    await expect(
      pool.query(
        `INSERT INTO movimientos_caja (fecha, tipo, cuenta, monto, cargado_por)
         VALUES ('2026-09-02', 'RETIRO_DUENO', 'CAJA', 100, $1)`,
        [dueñaId]
      )
    ).rejects.toThrow(/check/);
    await expect(
      pool.query(
        `INSERT INTO movimientos_caja (fecha, tipo, cuenta, monto, concepto, cargado_por)
         VALUES ('2026-09-02', 'AJUSTE', 'CAJA', 0, 'nada', $1)`,
        [dueñaId]
      )
    ).rejects.toThrow(/check/);
  });

  it('las planillas de Excel salen con los totales del mes', async () => {
    const descargar = async (ruta) => {
      const res = await request(app)
        .get(ruta)
        .set('Cookie', cookieDueña)
        .buffer(true)
        .parse((r, fin) => {
          const partes = [];
          r.on('data', (p) => partes.push(p));
          r.on('end', () => fin(null, Buffer.concat(partes)));
        });
      expect(res.status).toBe(200);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(res.body);
      return libro.worksheets[0];
    };
    // La última fila son los totales; se leen por encabezado.
    const totales = (hoja) => {
      const encabezados = hoja.getRow(1).values;
      const valores = hoja.getRow(hoja.rowCount).values;
      return Object.fromEntries(encabezados.map((e, i) => [e, valores[i]]).filter(([e]) => e));
    };

    const caja = await descargar('/api/caja-central/excel?mes=2026-09');
    expect(totales(caja)).toMatchObject({
      Fecha: 'Total',
      // Estrada (ya corregido) 99.000,50 + Café 212.500
      'Retiro sucursales': 311500.5,
      Depósitos: 800000,
      Fernanda: 100000,
      Gabriel: 0,
      Egresos: 300000, // el pago de gasoil se anuló
      Ajustes: -500.5,
    });

    const cierres = await descargar('/api/cierres/excel?desde=2026-09-01&hasta=2026-09-30');
    expect(cierres.rowCount).toBe(5); // encabezado, 3 cierres y totales
    expect(totales(cierres)).toMatchObject({ Retiro: 311500.5, Carne: 12000, Varios: 7000 });
  });
});
