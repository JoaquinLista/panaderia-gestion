import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

import { SESION_ADMIN, usarSesion } from '../helpers/sesiones.js';

// Sesión falsa (los 403 están en permisos.test.js) y una base en memoria que
// contesta las consultas del servicio. La plata y el orden de verdad se
// prueban contra Postgres en tests/integracion/cajaCentral.test.js.
vi.mock('../../src/middlewares/autenticacion.js', async () => {
  const { requerirSesionFalsa } = await import('../helpers/sesiones.js');
  return { requerirSesion: requerirSesionFalsa };
});
vi.mock('../../src/config/db.js', () => {
  const query = vi.fn();
  return { default: { query }, query, getClient: vi.fn() };
});

const db = await import('../../src/config/db.js');
const { default: app } = await import('../../src/app.js');

const DUENOS = [
  { id: 1, nombre: 'Fernanda', activo: true },
  { id: 2, nombre: 'Gabriel', activo: true },
  { id: 3, nombre: 'Nelfo', activo: false },
];
const CATEGORIAS = [
  { id: 3, nombre: 'Carne', activa: true },
  { id: 6, nombre: 'Proveedores', activa: true },
  { id: 11, nombre: 'Vieja', activa: false },
];

let movimientos;
let cierres;
let gastos;
let fallarInsert;

const fila = (m) => ({
  ...m,
  categoria: CATEGORIAS.find((k) => k.id === m.categoria_id)?.nombre ?? null,
  dueno: DUENOS.find((d) => d.id === m.dueno_id)?.nombre ?? null,
  cargado_por_nombre: 'Marta',
});

const responder = async (sql, params = []) => {
  if (sql.includes('FROM duenos WHERE activo')) {
    return { rows: DUENOS.filter((d) => d.activo).map(({ id, nombre }) => ({ id, nombre })) };
  }
  if (sql.includes('FROM duenos WHERE id = $1 AND activo')) {
    return { rows: DUENOS.filter((d) => d.id === params[0] && d.activo) };
  }
  if (sql.includes('FROM categorias_gasto WHERE id = $1 AND activa')) {
    return { rows: CATEGORIAS.filter((k) => k.id === params[0] && k.activa) };
  }
  if (sql.includes('FROM categorias_gasto ORDER BY')) return { rows: CATEGORIAS };
  if (sql.includes("tipo = 'SALDO_INICIAL' AND anulado_en IS NULL")) {
    return {
      rows: movimientos.filter((m) => m.tipo === 'SALDO_INICIAL' && !m.anulado),
    };
  }
  if (sql.includes('count(*)::int AS cantidad')) {
    const [fecha, cuenta] = params;
    const n = movimientos.filter(
      (m) =>
        !m.anulado &&
        m.fecha < fecha &&
        (m.cuenta === cuenta || (m.tipo === 'DEPOSITO' && cuenta === 'BANCO'))
    ).length;
    return { rows: [{ cantidad: n }] };
  }
  if (sql.includes('WHERE m.anulado_en IS NULL AND m.fecha <= $1')) {
    return { rows: movimientos.filter((m) => !m.anulado && m.fecha <= params[0]).map(fila) };
  }
  if (sql.includes('WHERE m.id = $1')) {
    return { rows: movimientos.filter((m) => m.id === params[0]).map(fila) };
  }
  if (sql.includes('FROM cierres_caja c')) {
    const [hasta, desde] = params;
    return { rows: cierres.filter((c) => c.fecha <= hasta && (!desde || c.fecha >= desde)) };
  }
  if (sql.includes('FROM cierre_gastos g')) return { rows: gastos };
  if (sql.startsWith('INSERT INTO movimientos_caja')) {
    if (fallarInsert) throw fallarInsert;
    const [fecha, tipo, cuenta, monto, categoria_id, dueno_id, concepto] = params;
    const id = movimientos.length + 100;
    movimientos.push({
      id,
      fecha,
      tipo,
      cuenta,
      monto,
      categoria_id,
      dueno_id,
      concepto,
      creado_en: `2026-09-29T12:00:${String(movimientos.length).padStart(2, '0')}Z`,
    });
    return { rows: [{ id }] };
  }
  if (sql.startsWith('UPDATE movimientos_caja SET anulado_en')) {
    const m = movimientos.find((x) => x.id === params[0] && !x.anulado);
    if (!m) return { rows: [] };
    m.anulado = true;
    return { rows: [{ id: m.id }] };
  }
  if (sql.includes('SELECT id FROM movimientos_caja WHERE id = $1')) {
    return { rows: movimientos.filter((m) => m.id === params[0]) };
  }
  throw new Error(`Consulta no simulada: ${sql}`);
};

const mov = (extra) => ({
  categoria_id: null,
  dueno_id: null,
  concepto: null,
  creado_en: '2026-09-01T10:00:00Z',
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // 29/09 a las 18 h de Argentina.
  vi.useFakeTimers({ now: new Date('2026-09-29T21:00:00Z'), toFake: ['Date'] });
  usarSesion(SESION_ADMIN);
  movimientos = [];
  cierres = [];
  gastos = [];
  fallarInsert = null;
  db.query.mockImplementation(responder);
});

afterEach(() => {
  vi.useRealTimers();
});

const cargar = (body) => request(app).post('/api/caja-central/movimientos').send(body);

describe('GET /api/caja-central/duenos', () => {
  it('trae los dueños activos', async () => {
    const res = await request(app).get('/api/caja-central/duenos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, nombre: 'Fernanda' },
      { id: 2, nombre: 'Gabriel' },
    ]);
  });
});

describe('POST /api/caja-central/movimientos', () => {
  it('sin fecha, el movimiento es de hoy en Argentina', async () => {
    const res = await cargar({ tipo: 'deposito', monto: 1500.5 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      fecha: '2026-09-29',
      tipo: 'DEPOSITO',
      cuenta: 'CAJA',
      monto: 1500.5,
      cierre_id: null,
      cargado_por_nombre: 'Marta',
    });
    expect(res.body).not.toHaveProperty('saldo_caja');
  });

  it.each([
    [{ tipo: 'REGALO', cuenta: 'CAJA', monto: 1 }, 'Elegí el tipo de movimiento'],
    [{ tipo: 'PAGO', cuenta: 'BILLETERA', monto: 1 }, 'Elegí la cuenta: CAJA o BANCO'],
    [{ tipo: 'PAGO', monto: 1 }, 'Elegí la cuenta'],
    [{ tipo: 'DEPOSITO', monto: 1, fecha: '2026-02-30' }, '"fecha" tiene que ser una fecha'],
    [{ tipo: 'DEPOSITO', monto: 1, fecha: '2026-09-30' }, 'fecha futura'],
    [{ tipo: 'DEPOSITO', monto: 0 }, 'mayor a cero'],
    [{ tipo: 'DEPOSITO', monto: '-10' }, 'mayor a cero'],
    [{ tipo: 'DEPOSITO' }, 'mayor a cero'],
    [{ tipo: 'AJUSTE', cuenta: 'CAJA', monto: '-0', concepto: 'x' }, 'distinto de cero'],
    [{ tipo: 'AJUSTE', cuenta: 'CAJA', monto: -10 }, 'Escribí el motivo del ajuste'],
    [{ tipo: 'PAGO', cuenta: 'CAJA', monto: 10, categoria_id: 6 }, 'Escribí el concepto del pago'],
    [{ tipo: 'PAGO', cuenta: 'CAJA', monto: 10, concepto: 'x' }, 'Elegí la categoría del pago'],
    [
      { tipo: 'PAGO', cuenta: 'CAJA', monto: 10, concepto: 'x', categoria_id: 11 },
      'Esa categoría no existe',
    ],
    [{ tipo: 'RETIRO_DUENO', cuenta: 'CAJA', monto: 10 }, 'Elegí quién retira la plata'],
    [{ tipo: 'RETIRO_DUENO', cuenta: 'CAJA', monto: 10, dueno_id: 3 }, 'Ese dueño no existe'],
    [{ tipo: 'DEPOSITO', monto: 10, concepto: 42 }, 'El concepto tiene que ser un texto'],
    [{ tipo: 'DEPOSITO', monto: 10, concepto: 'x'.repeat(201) }, 'hasta 200 caracteres'],
  ])('%j → 400 "%s"', async (body, mensaje) => {
    const res = await cargar(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(mensaje);
    expect(movimientos).toEqual([]);
  });

  it('el ajuste puede restar y guarda el motivo', async () => {
    const res = await cargar({
      tipo: 'AJUSTE',
      cuenta: 'BANCO',
      monto: ' -250,00'.replace(',', '.'),
      concepto: '  Comisión del banco  ',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ monto: -250, concepto: 'Comisión del banco' });
  });

  it('el pago y el retiro guardan categoría y dueño; el resto no', async () => {
    const pago = await cargar({
      tipo: 'PAGO',
      cuenta: 'BANCO',
      monto: '300000',
      categoria_id: '6',
      dueno_id: 1,
      concepto: 'Harina',
    });
    expect(pago.body).toMatchObject({ categoria: 'Proveedores', dueno: null });
    const retiro = await cargar({
      tipo: 'RETIRO_DUENO',
      cuenta: 'CAJA',
      monto: 1000,
      dueno_id: 2,
      categoria_id: 6,
    });
    expect(retiro.body).toMatchObject({ dueno: 'Gabriel', categoria: null, concepto: null });
  });

  it('no deja dos saldos iniciales de la misma cuenta', async () => {
    movimientos.push(
      mov({ id: 1, fecha: '2026-09-01', tipo: 'SALDO_INICIAL', cuenta: 'CAJA', monto: '100.00' })
    );
    const res = await cargar({ tipo: 'SALDO_INICIAL', cuenta: 'CAJA', monto: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(
      'Ya está cargado el saldo inicial de la caja central: anulalo para cargar otro'
    );
  });

  it('si dos saldos iniciales llegan a la vez, la base deja pasar uno', async () => {
    fallarInsert = Object.assign(new Error('duplicate key'), { code: '23505' });
    const res = await cargar({ tipo: 'SALDO_INICIAL', cuenta: 'BANCO', monto: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Ya está cargado el saldo inicial de el Banco Patagonia');
  });

  it('otro error de la base es un 500', async () => {
    fallarInsert = new Error('se cayó la base');
    const res = await cargar({ tipo: 'DEPOSITO', monto: 10 });
    expect(res.status).toBe(500);
  });

  it('el saldo inicial tiene que ser el primer movimiento de la cuenta', async () => {
    movimientos.push(
      mov({ id: 1, fecha: '2026-09-05', tipo: 'DEPOSITO', cuenta: 'CAJA', monto: '5.00' })
    );
    const res = await cargar({
      tipo: 'SALDO_INICIAL',
      cuenta: 'BANCO',
      monto: 10,
      fecha: '2026-09-10',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      'Hay movimientos de el Banco Patagonia anteriores al 10/09: el saldo inicial tiene que ser el primero'
    );
  });

  it('un depósito no puede ser anterior al saldo inicial del banco', async () => {
    movimientos.push(
      mov({ id: 1, fecha: '2026-09-10', tipo: 'SALDO_INICIAL', cuenta: 'BANCO', monto: '5.00' })
    );
    const res = await cargar({ tipo: 'DEPOSITO', monto: 10, fecha: '2026-09-09' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      'La fecha es anterior al saldo inicial de el Banco Patagonia (10/09)'
    );
  });
});

describe('DELETE /api/caja-central/movimientos/:id', () => {
  it('anula el movimiento', async () => {
    movimientos.push(
      mov({ id: 7, fecha: '2026-09-05', tipo: 'DEPOSITO', cuenta: 'CAJA', monto: '5.00' })
    );
    const res = await request(app).delete('/api/caja-central/movimientos/7');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 7, anulado: true });
    const [, params] = db.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE'));
    expect(params).toEqual([7, SESION_ADMIN.usuario.id]);
  });

  it('uno ya anulado da 409 y uno que no existe, 404', async () => {
    movimientos.push(
      mov({
        id: 7,
        fecha: '2026-09-05',
        tipo: 'DEPOSITO',
        cuenta: 'CAJA',
        monto: '5.00',
        anulado: true,
      })
    );
    const otraVez = await request(app).delete('/api/caja-central/movimientos/7');
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error).toBe('Ese movimiento ya estaba anulado');
    const noExiste = await request(app).delete('/api/caja-central/movimientos/8');
    expect(noExiste.status).toBe(404);
  });

  it.each(['abc', '0', '-3', '99999999999'])('id "%s" → 404', async (id) => {
    const res = await request(app).delete(`/api/caja-central/movimientos/${id}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No existe ese movimiento');
  });
});

describe('consultas', () => {
  beforeEach(() => {
    movimientos.push(
      mov({ id: 1, fecha: '2026-09-01', tipo: 'SALDO_INICIAL', cuenta: 'CAJA', monto: '1000.00' }),
      mov({
        id: 2,
        fecha: '2026-09-29',
        tipo: 'RETIRO_DUENO',
        cuenta: 'CAJA',
        monto: '100.00',
        dueno_id: 3, // Nelfo ya no está activo, pero retiró este mes
        creado_en: '2026-09-29T20:00:00Z',
      }),
      mov({
        id: 3,
        fecha: '2026-09-29',
        tipo: 'PAGO',
        cuenta: 'CAJA',
        monto: '50.00',
        categoria_id: 3,
        concepto: 'Carne',
        creado_en: '2026-09-29T21:00:00Z',
      })
    );
    cierres.push(
      {
        cierre_id: 20,
        fecha: '2026-09-29',
        turno: 'MEDIODIA',
        sucursal_id: 3,
        sucursal: 'Estrada',
        efectivo_contado: '700.00',
        cambio_fijo: '200.00',
        creado_en: '2026-09-29T16:00:00Z',
        cargado_por_nombre: 'Lucía',
      },
      {
        cierre_id: 21,
        fecha: '2026-08-31',
        turno: 'NOCHE',
        sucursal_id: 3,
        sucursal: 'Estrada',
        efectivo_contado: '900.00',
        cambio_fijo: '200.00',
        creado_en: '2026-09-01T00:00:00Z',
        cargado_por_nombre: 'Lucía',
      }
    );
    gastos.push({ categoria_id: 3, total: '25.50' });
  });

  it('el resumen de hoy muestra saldos, entradas y salidas', async () => {
    const res = await request(app).get('/api/caja-central/resumen');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fecha: '2026-09-29',
      saldo_caja: 1350,
      saldo_banco: 0,
      saldo_inicial: { caja: { fecha: '2026-09-01', monto: 1000 }, banco: null },
      total_entradas: 500,
    });
    expect(res.body.entradas).toEqual([
      expect.objectContaining({
        cierre_id: 20,
        sucursal: 'Estrada',
        turno: 'MEDIODIA',
        monto: 500,
      }),
    ]);
    expect(res.body.movimientos.map((m) => m.tipo)).toEqual(['RETIRO_DUENO', 'PAGO']);
    // El cierre de agosto quedó antes del saldo inicial.
    const [, params] = db.query.mock.calls.find(([sql]) => sql.includes('FROM cierres_caja c'));
    expect(params).toEqual(['2026-09-29', '2026-09-01']);
  });

  it('el resumen de un día sin nada tiene saldo cero', async () => {
    movimientos = [];
    cierres = [];
    const res = await request(app).get('/api/caja-central/resumen?fecha=2026-01-01');
    expect(res.body).toMatchObject({
      saldo_caja: 0,
      saldo_banco: 0,
      entradas: [],
      movimientos: [],
    });
  });

  it('una fecha inválida es un 400', async () => {
    const res = await request(app).get('/api/caja-central/resumen?fecha=ayer');
    expect(res.status).toBe(400);
  });

  it('sin fechas, lista los movimientos del mes hasta hoy', async () => {
    const res = await request(app).get('/api/caja-central/movimientos');
    expect(res.status).toBe(200);
    expect(res.body.desde).toBe('2026-09-01');
    expect(res.body.hasta).toBe('2026-09-29');
    expect(res.body.movimientos.map((m) => [m.tipo, m.saldo_caja])).toEqual([
      ['SALDO_INICIAL', 1000],
      ['RETIRO_SUCURSAL', 1500],
      ['RETIRO_DUENO', 1400],
      ['PAGO', 1350],
    ]);
  });

  it.each([
    ['desde=2026-09-10&hasta=2026-09-01', '"desde" no puede ser posterior'],
    ['desde=10-09-2026', '"desde" tiene que ser una fecha'],
    ['cuenta=billetera', 'La cuenta es CAJA o BANCO'],
    ['tipo=regalo', 'Tipo de movimiento inválido'],
    ['categoria_id=x', 'categoria_id inválido'],
    ['dueno_id=-1', 'dueno_id inválido'],
  ])('?%s → 400', async (filtro, mensaje) => {
    const res = await request(app).get(`/api/caja-central/movimientos?${filtro}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(mensaje);
  });

  it('filtra por cuenta, tipo, categoría y dueño', async () => {
    const pedir = async (filtro) =>
      (await request(app).get(`/api/caja-central/movimientos?${filtro}`)).body.movimientos.map(
        (m) => m.tipo
      );
    expect(await pedir('cuenta=BANCO')).toEqual([]);
    expect(await pedir('tipo=pago')).toEqual(['PAGO']);
    expect(await pedir('categoria_id=3')).toEqual(['PAGO']);
    expect(await pedir('dueno_id=3')).toEqual(['RETIRO_DUENO']);
  });

  it('el resumen del mes junta sucursales, dueños y categorías', async () => {
    const res = await request(app).get('/api/caja-central/mensual');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      mes: '2026-09',
      desde: '2026-09-01',
      hasta: '2026-09-30',
      entradas_por_sucursal: [{ sucursal_id: 3, sucursal: 'Estrada', total: 500 }],
      total_entradas: 500,
      depositos: 0,
      retiros_por_dueno: [
        { dueno_id: 1, dueno: 'Fernanda', total: 0 },
        { dueno_id: 2, dueno: 'Gabriel', total: 0 },
        { dueno_id: 3, dueno: 'Nelfo', total: 100 },
      ],
      total_retiros_duenos: 100,
      gastos_por_categoria: [
        {
          categoria_id: 3,
          categoria: 'Carne',
          en_sucursales: 25.5,
          en_caja_central: 50,
          total: 75.5,
        },
      ],
      ajustes: 0,
      saldo_caja: 1350,
      saldo_banco: 0,
    });
  });

  it('un mes inválido es un 400', async () => {
    const res = await request(app).get('/api/caja-central/mensual?mes=2026-13');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('"mes" tiene que tener el formato AAAA-MM');
  });
});
