import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';

import { SESION_ADMIN, usarSesion } from '../helpers/sesiones.js';

// Sesión falsa y servicios falsos: acá se prueba la descarga (ruta, nombre y
// tipo de archivo). El contenido está en tests/unit/planillas.test.js y contra
// Postgres en tests/integracion.
vi.mock('../../src/middlewares/autenticacion.js', async () => {
  const { requerirSesionFalsa } = await import('../helpers/sesiones.js');
  return { requerirSesion: requerirSesionFalsa };
});
vi.mock('../../src/config/db.js', () => {
  const query = vi.fn();
  return { default: { query }, query, getClient: vi.fn() };
});
vi.mock('../../src/services/cajaCentralService.js', async (original) => ({
  ...(await original()),
  listarMovimientos: vi.fn(async () => ({ movimientos: [] })),
  resumenMensual: vi.fn(async () => ({
    entradas_por_sucursal: [],
    total_entradas: 0,
    depositos: 0,
    retiros_por_dueno: [{ dueno_id: 1, dueno: 'Fernanda', total: 0 }],
    total_retiros_duenos: 0,
    gastos_por_categoria: [],
    ajustes: 0,
    saldo_caja: 0,
    saldo_banco: 0,
  })),
}));
vi.mock('../../src/services/cierresService.js', async (original) => ({
  ...(await original()),
  listarCierres: vi.fn(async () => []),
  listarCategorias: vi.fn(async () => [{ id: 1, nombre: 'Personal' }]),
}));

vi.mock('../../src/services/dashboardService.js', async (original) => ({
  ...(await original()),
  resumenDelMes: vi.fn(async (mes) => {
    if (mes === '2026-13') {
      throw Object.assign(new Error('"mes" tiene que tener el formato AAAA-MM'), { status: 400 });
    }
    const vacio = {
      ventas: 0,
      medios: { efectivo: 0, debito: 0, credito: 0, qr: 0 },
      gastos: { sucursales: 0, caja_central: 0, obra: 0, total: 0 },
      retiros_duenos: 0,
      resultado: 0,
    };
    return {
      mes: mes ?? '2026-09',
      desde: '2026-09-01',
      hasta: '2026-09-29',
      ...vacio,
      retiros_por_dueno: [],
      ventas_por_sucursal: [],
      ventas_por_dia: [],
      anterior: { mes: '2026-08', desde: '2026-08-01', hasta: '2026-08-29', ...vacio },
      variacion: { ventas: null, gastos: null, retiros_duenos: null, resultado: null },
    };
  }),
}));

const dashboard = await import('../../src/services/dashboardService.js');
const caja = await import('../../src/services/cajaCentralService.js');
const cierres = await import('../../src/services/cierresService.js');
const { default: app } = await import('../../src/app.js');

// Supertest junta la respuesta binaria en un Buffer.
const binario = (res, fin) => {
  const partes = [];
  res.on('data', (p) => partes.push(p));
  res.on('end', () => fin(null, Buffer.concat(partes)));
};

const hojas = async (buffer) => {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  return libro.worksheets.map((h) => h.name);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers({ now: new Date('2026-09-29T21:00:00Z'), toFake: ['Date'] });
  usarSesion(SESION_ADMIN);
});

describe('GET /api/caja-central/excel', () => {
  it('descarga la planilla del mes en curso', async () => {
    const res = await request(app).get('/api/caja-central/excel').buffer(true).parse(binario);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="caja-central-2026-09.xlsx"'
    );
    expect(await hojas(res.body)).toEqual(['Caja 2026-09', 'Resumen']);
    expect(caja.listarMovimientos).toHaveBeenCalledWith(
      { desde: '2026-09-01', hasta: '2026-09-30' },
      expect.any(Date)
    );
  });

  it('un mes inválido es un 400', async () => {
    const res = await request(app).get('/api/caja-central/excel?mes=2026-13');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('"mes" tiene que tener el formato AAAA-MM');
  });
});

describe('GET /api/cierres/excel', () => {
  it('sin fechas descarga los cierres del mes hasta hoy', async () => {
    const res = await request(app).get('/api/cierres/excel').buffer(true).parse(binario);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="egresos-de-caja-2026-09-01-a-2026-09-29.xlsx"'
    );
    expect(await hojas(res.body)).toEqual(['Egresos de caja']);
    expect(cierres.listarCierres).toHaveBeenCalledWith(
      { sucursal_id: undefined, desde: '2026-09-01', hasta: '2026-09-29' },
      { limite: null }
    );
  });

  it('usa los filtros de la revisión', async () => {
    const res = await request(app)
      .get('/api/cierres/excel?sucursal_id=3&desde=2026-08-01&hasta=2026-08-15')
      .buffer(true)
      .parse(binario);
    expect(res.headers['content-disposition']).toContain('egresos-de-caja-2026-08-01-a-2026-08-15');
    expect(cierres.listarCierres).toHaveBeenCalledWith(
      { sucursal_id: '3', desde: '2026-08-01', hasta: '2026-08-15' },
      { limite: null }
    );
  });

  it('sólo "hasta": desde el primero de ese mes', async () => {
    await request(app).get('/api/cierres/excel?hasta=2026-08-15').buffer(true).parse(binario);
    expect(cierres.listarCierres).toHaveBeenCalledWith(
      expect.objectContaining({ desde: '2026-08-01', hasta: '2026-08-15' }),
      { limite: null }
    );
  });

  it('si falla la consulta es un 500', async () => {
    cierres.listarCierres.mockRejectedValueOnce(new Error('se cayó la base'));
    const res = await request(app).get('/api/cierres/excel');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/dashboard/excel', () => {
  it('descarga el resumen del mes en curso', async () => {
    const res = await request(app).get('/api/dashboard/excel').buffer(true).parse(binario);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="resumen-2026-09.xlsx"');
    expect(await hojas(res.body)).toEqual(['Resumen', 'Ventas por día']);
    expect(dashboard.resumenDelMes).toHaveBeenCalledWith(undefined, expect.any(Date));
  });

  it('de otro mes', async () => {
    const res = await request(app)
      .get('/api/dashboard/excel?mes=2026-08')
      .buffer(true)
      .parse(binario);
    expect(res.headers['content-disposition']).toContain('resumen-2026-08.xlsx');
    expect(dashboard.resumenDelMes).toHaveBeenCalledWith('2026-08', expect.any(Date));
  });

  it('un mes inválido es un 400', async () => {
    const res = await request(app).get('/api/dashboard/excel?mes=2026-13');
    expect(res.status).toBe(400);
  });
});
