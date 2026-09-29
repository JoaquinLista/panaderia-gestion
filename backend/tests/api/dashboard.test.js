import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// Sesión falsa de admin (los 403 están en permisos.test.js) y una base que
// contesta las tres consultas del servicio. Las cuentas con Postgres de verdad
// están en tests/integracion/dashboard.test.js.
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

const SUCURSALES = [
  { id: 2, nombre: 'Café' },
  { id: 3, nombre: 'Estrada' },
];

let cierres;
let movimientos;

const cierre = (extra) => ({
  sucursal_id: 3,
  fecha: '2026-09-29',
  turno: 'MEDIODIA',
  total_controlador: '1000.50',
  efectivo_contado: '700.50',
  cambio_fijo: '100.00',
  debito: '300.00',
  credito: '0.00',
  qr: '50.00',
  diferencia: '0.00',
  gastos: '50.00',
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 29/09/2026 a las 15 h de Argentina.
  vi.setSystemTime(new Date('2026-09-29T18:00:00Z'));
  cierres = [cierre(), cierre({ fecha: '2026-08-20', total_controlador: '500.00' })];
  movimientos = [
    {
      tipo: 'PAGO',
      monto: '100.00',
      dueno_id: null,
      dueno: null,
      categoria: 'Obra',
      fecha: '2026-09-02',
    },
    {
      tipo: 'RETIRO_DUENO',
      monto: '200.00',
      dueno_id: 1,
      dueno: 'Fernanda',
      categoria: null,
      fecha: '2026-09-03',
    },
  ];
  db.default.query.mockImplementation(async (sql, params = []) => {
    if (sql.includes('FROM sucursales')) return { rows: SUCURSALES };
    const [desde, hasta] = params;
    const entre = (f) => f >= desde && f <= hasta;
    if (sql.includes('FROM cierres_caja')) return { rows: cierres.filter((c) => entre(c.fecha)) };
    if (sql.includes('FROM movimientos_caja')) {
      return { rows: movimientos.filter((m) => entre(m.fecha)) };
    }
    throw new Error(`Consulta no esperada: ${sql}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('GET /api/dashboard/dia', () => {
  it('sin fecha es hoy: ventas por sucursal y turnos que faltan', async () => {
    const res = await request(app).get('/api/dashboard/dia');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fecha: '2026-09-29',
      es_hoy: true,
      total: { vendido: 1000.5, efectivo: 650.5, debito: 300, qr: 50, gastos: 50 },
      turnos_pendientes: 3,
    });
    expect(res.body.sucursales[1]).toMatchObject({
      sucursal_id: 3,
      sucursal: 'Estrada',
      turnos_cargados: ['MEDIODIA'],
      turnos_pendientes: ['NOCHE'],
    });
  });

  it('rechaza fechas inválidas o que todavía no llegaron', async () => {
    expect((await request(app).get('/api/dashboard/dia?fecha=29-09-2026')).status).toBe(400);
    const futuro = await request(app).get('/api/dashboard/dia?fecha=2026-09-30');
    expect(futuro.status).toBe(400);
    expect(futuro.body.error).toMatch(/Todavía no llegó/);
  });
});

describe('GET /api/dashboard/mes', () => {
  it('sin mes es el actual, hasta hoy, comparado con los mismos días del anterior', async () => {
    const res = await request(app).get('/api/dashboard/mes');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      mes: '2026-09',
      hasta: '2026-09-29',
      en_curso: true,
      ventas: 1000.5,
      gastos: { sucursales: 50, caja_central: 0, obra: 100, total: 150 },
      retiros_duenos: 200,
      resultado: 650.5,
      retiros_por_dueno: [{ dueno_id: 1, dueno: 'Fernanda', total: 200 }],
      anterior: { mes: '2026-08', hasta: '2026-08-29', ventas: 500, resultado: 450 },
      variacion: { ventas: 100.1, gastos: 200, retiros_duenos: null, resultado: 44.6 },
    });
    expect(res.body.ventas_por_dia).toHaveLength(29);
    expect(res.body.ventas_por_sucursal[1]).toMatchObject({
      sucursal_id: 3,
      vendido: 1000.5,
      cierres: 1,
    });
  });

  it('rechaza un mes inválido o que no empezó', async () => {
    expect((await request(app).get('/api/dashboard/mes?mes=septiembre')).status).toBe(400);
    const futuro = await request(app).get('/api/dashboard/mes?mes=2026-10');
    expect(futuro.status).toBe(400);
    expect(futuro.body.error).toMatch(/todavía no empezó/);
  });

  it('si la base falla responde 500', async () => {
    db.default.query.mockRejectedValue(new Error('se cayó'));
    expect((await request(app).get('/api/dashboard/mes')).status).toBe(500);
    expect((await request(app).get('/api/dashboard/dia')).status).toBe(500);
  });
});
