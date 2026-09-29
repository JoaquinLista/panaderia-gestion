import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// La revisión de la dueña con la base falsa: validaciones y caminos de error.
// El recorrido completo contra Postgres está en tests/integracion/cierres.test.js.
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

const filaCierre = (extra = {}) => ({
  id: 10,
  sucursal_id: 3,
  sucursal_nombre: 'Estrada',
  fecha: '2026-09-28',
  turno: 'NOCHE',
  numero_z: 1532,
  total_controlador: '1000.00',
  efectivo_contado: '1500.00',
  cambio_fijo: '500.00',
  posnet: '0.00',
  transferencias: '0.00',
  diferencia: '0.00',
  comentario: null,
  a_revisar: false,
  ...extra,
});

let client;
let actualizaciones;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  actualizaciones = [];
  db.query.mockImplementation(async (sql) => {
    if (sql.includes('FROM cierre_correcciones')) return { rows: [] };
    if (sql.includes('FROM cierre_gastos')) return { rows: [] };
    if (sql.includes('FROM cierres_caja c')) return { rows: [filaCierre()] };
    if (sql.includes('FROM sucursales s')) {
      return {
        rows: [
          { id: 3, nombre: 'Estrada', cerrados: ['MEDIODIA'] },
          { id: 4, nombre: 'Café', cerrados: [] },
        ],
      };
    }
    if (sql.startsWith('UPDATE cierres_caja')) return { rowCount: 1 };
    throw new Error(`Consulta no simulada: ${sql}`);
  });
  client = {
    query: vi.fn(async (sql, params) => {
      if (sql.includes('FOR UPDATE')) {
        return {
          rows: [
            {
              fecha: '2026-09-28',
              turno: 'NOCHE',
              numero_z: 1532,
              total_controlador: '1000.00',
              efectivo_contado: '1500.00',
              cambio_fijo: '500.00',
              posnet: '0.00',
              transferencias: '0.00',
              comentario: null,
            },
          ],
        };
      }
      if (sql.startsWith('SELECT detalle'))
        return { rows: [{ detalle: 'Sodero', monto: '100.00' }] };
      if (sql.startsWith('UPDATE') || sql.startsWith('INSERT') || sql.startsWith('DELETE')) {
        actualizaciones.push({ sql, params });
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  db.getClient.mockResolvedValue(client);
});

describe('GET /api/cierres', () => {
  it('sin filtros trae los últimos', async () => {
    const res = await request(app).get('/api/cierres');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: 10, total_controlador: 1000, gastos: [] });
    expect(db.query.mock.calls[0][1]).toEqual([]);
  });

  it('arma los filtros como parámetros, sin meter texto en el SQL', async () => {
    await request(app).get(
      '/api/cierres?sucursal_id=3&desde=2026-09-01&hasta=2026-09-30&a_revisar=true'
    );
    const [sql, params] = db.query.mock.calls[0];
    expect(params).toEqual([3, '2026-09-01', '2026-09-30']);
    expect(sql).toContain('c.sucursal_id = $1');
    expect(sql).toContain('c.revisado_en IS NULL');
  });

  it.each([
    ['sucursal_id=abc', 'sucursal_id'],
    ['desde=ayer', 'desde'],
    ['hasta=2026-13-45', 'hasta'],
    ['desde=2026-09-30&hasta=2026-09-01', 'posterior'],
  ])('%s: 400', async (query, mensaje) => {
    const res = await request(app).get(`/api/cierres?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(mensaje);
  });
});

describe('GET /api/cierres/pendientes', () => {
  it('dice qué turnos faltan por sucursal', async () => {
    const res = await request(app).get('/api/cierres/pendientes');
    expect(res.body.sucursales).toEqual([
      { id: 3, nombre: 'Estrada', turnos_pendientes: ['NOCHE'] },
      { id: 4, nombre: 'Café', turnos_pendientes: ['MEDIODIA', 'NOCHE'] },
    ]);
  });
});

describe('GET /api/cierres/:id', () => {
  it('trae el cierre con sus correcciones', async () => {
    const res = await request(app).get('/api/cierres/10');
    expect(res.status).toBe(200);
    expect(res.body.correcciones).toEqual([]);
  });

  it.each(['abc', '0', '99999999999'])('id %s: 404', async (id) => {
    const res = await request(app).get(`/api/cierres/${id}`);
    expect(res.status).toBe(404);
  });

  it('si no existe: 404', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/cierres/11');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/cierres/:id', () => {
  it('cambia fecha, turno, número de Z y montos, y registra cada uno', async () => {
    const res = await request(app).put('/api/cierres/10').send({
      fecha: '2026-09-27',
      turno: 'mediodia',
      numero_z: '1533',
      posnet: '10',
    });
    expect(res.status).toBe(200);
    const registros = actualizaciones
      .filter((a) => a.sql.includes('cierre_correcciones'))
      .map((a) => a.params.slice(2));
    expect(registros).toEqual([
      ['fecha', '2026-09-28', '2026-09-27'],
      ['turno', 'NOCHE', 'MEDIODIA'],
      ['numero_z', '1532', '1533'],
      ['posnet', '0.00', '10.00'],
    ]);
    // no mandó gastos: no se tocan
    expect(actualizaciones.some((a) => a.sql.startsWith('DELETE'))).toBe(false);
    // la diferencia se recalcula con el gasto que ya tenía: 1500 − 500 + 10 + 100 − 1000
    const update = actualizaciones.find((a) => a.sql.startsWith('UPDATE'));
    expect(update.params[10]).toBe('110.00');
  });

  it('reemplaza los gastos si vienen', async () => {
    const res = await request(app)
      .put('/api/cierres/10')
      .send({ gastos: [{ detalle: 'Bolsas', monto: 50 }] });
    expect(res.status).toBe(200);
    expect(actualizaciones.some((a) => a.sql.startsWith('DELETE FROM cierre_gastos'))).toBe(true);
    const registro = actualizaciones.find((a) => a.sql.includes('cierre_correcciones'));
    expect(registro.params.slice(2)).toEqual(['gastos', 'Sodero 100.00', 'Bolsas 50.00']);
  });

  it.each([
    [{ turno: 'TARDE' }, 'Turno inválido'],
    [{ fecha: '28/09/2026' }, 'fecha'],
    [{ total_controlador: '' }, 'total_controlador'],
    [{ numero_z: 'x' }, 'número de Z'],
    [{}, 'No hay cambios'],
  ])('%j: 400 y deshace', async (body, mensaje) => {
    const res = await request(app).put('/api/cierres/10').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(mensaje);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('si el cierre no existe: 404', async () => {
    client.query.mockResolvedValue({ rows: [] });
    const res = await request(app).put('/api/cierres/10').send({ posnet: 1 });
    expect(res.status).toBe(404);
  });

  it('si choca con otro cierre del mismo turno: 409', async () => {
    const original = client.query.getMockImplementation();
    client.query.mockImplementation(async (sql, params) => {
      if (sql.startsWith('UPDATE')) throw Object.assign(new Error('dup'), { code: '23505' });
      return original(sql, params);
    });
    const res = await request(app).put('/api/cierres/10').send({ turno: 'MEDIODIA' });
    expect(res.status).toBe(409);
  });

  it('otro error de la base: 500', async () => {
    client.query.mockRejectedValueOnce(new Error('se cortó'));
    const res = await request(app).put('/api/cierres/10').send({ posnet: 1 });
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/cierres/:id/revisado', () => {
  it.each([true, false])('revisado: %s', async (revisado) => {
    const res = await request(app).put('/api/cierres/10/revisado').send({ revisado });
    expect(res.status).toBe(200);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain(revisado ? 'revisado_en = now()' : 'revisado_en = NULL');
  });

  it('sin el dato: 400', async () => {
    const res = await request(app).put('/api/cierres/10/revisado').send({ revisado: 'si' });
    expect(res.status).toBe(400);
  });

  it('si no existe: 404', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0 });
    const res = await request(app).put('/api/cierres/10/revisado').send({ revisado: true });
    expect(res.status).toBe(404);
  });
});
