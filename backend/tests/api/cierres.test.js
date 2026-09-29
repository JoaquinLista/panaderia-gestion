import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

import { SESION_ADMIN, SESION_EMPLEADA_CAJA, usarSesion } from '../helpers/sesiones.js';

// Sesión falsa (los 401/403 están en permisos.test.js) y base falsa.
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

const SUCURSALES = {
  1: { id: 1, nombre: 'Galpón Central', tipo: 'DEPOSITO' },
  2: { id: 2, nombre: 'Viedma (Chacra)', tipo: 'FABRICA' },
  3: { id: 3, nombre: 'Estrada', tipo: 'VENTA' },
};

// Lo que "guardó" la transacción, para devolverlo en el SELECT posterior.
let insertado;
let gastosInsertados;
let cierresDeHoy;
let ultimoCambio;
let client;

const filaCierre = (extra = {}) => ({
  id: 10,
  sucursal_id: 3,
  sucursal_nombre: 'Estrada',
  fecha: '2026-09-29',
  turno: 'NOCHE',
  numero_z: null,
  total_controlador: '485300.00',
  efectivo_contado: '232500.00',
  cambio_fijo: '20000.00',
  posnet: '168900.00',
  transferencias: '92400.00',
  diferencia: '0.00',
  comentario: null,
  cargado_por: 2,
  cargado_por_nombre: 'EMPLEADA',
  creado_en: '2026-09-30T00:10:00.000Z',
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  usarSesion(SESION_EMPLEADA_CAJA);
  insertado = null;
  gastosInsertados = [];
  cierresDeHoy = [];
  ultimoCambio = [];

  client = {
    query: vi.fn(async (sql, params) => {
      if (sql.startsWith('INSERT INTO cierres_caja')) {
        insertado = params;
        return { rows: [{ id: 10 }] };
      }
      if (sql.startsWith('INSERT INTO cierre_gastos')) {
        gastosInsertados.push(params);
        return { rows: [] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  db.getClient.mockResolvedValue(client);

  db.query.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM sucursales WHERE id')) {
      return { rows: SUCURSALES[params[0]] ? [SUCURSALES[params[0]]] : [] };
    }
    if (sql.includes('WHERE c.id = $1')) {
      const [, , , , total, efectivo, cambio, posnet, transf, diferencia, comentario] = insertado;
      return {
        rows: [
          filaCierre({
            total_controlador: total,
            efectivo_contado: efectivo,
            cambio_fijo: cambio,
            posnet,
            transferencias: transf,
            diferencia,
            comentario,
          }),
        ],
      };
    }
    if (sql.includes('WHERE c.sucursal_id = $1 AND c.fecha = $2')) return { rows: cierresDeHoy };
    if (sql.includes('SELECT cambio_fijo FROM cierres_caja')) return { rows: ultimoCambio };
    if (sql.includes('FROM cierre_gastos')) {
      return {
        rows: gastosInsertados.map(([cierreId, detalle, monto], i) => ({
          id: i + 1,
          cierre_id: cierreId,
          detalle,
          monto,
        })),
      };
    }
    throw new Error(`Consulta no simulada: ${sql}`);
  });
});

// Ejemplo del desglose: Estrada, noche, cuadra.
const cierreEstrada = (extra = {}) => ({
  turno: 'NOCHE',
  total_controlador: 485300,
  efectivo_contado: 232500,
  cambio_fijo: 20000,
  posnet: 168900,
  transferencias: 92400,
  gastos: [
    { detalle: 'Sodero', monto: 6000 },
    { detalle: 'Bolsas', monto: '5500.00' },
  ],
  ...extra,
});

describe('POST /api/cierres', () => {
  it('la empleada carga el cierre de su sucursal del día y cuadra', async () => {
    const res = await request(app).post('/api/cierres').send(cierreEstrada());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 10, sucursal_nombre: 'Estrada', diferencia: 0 });
    expect(res.body.total_controlador).toBe(485300);
    expect(res.body.gastos).toEqual([
      { id: 1, detalle: 'Sodero', monto: 6000 },
      { id: 2, detalle: 'Bolsas', monto: 5500 },
    ]);
    // sucursal del día, fecha de Argentina, el usuario de la sesión
    expect(insertado[0]).toBe(3);
    expect(insertado[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(insertado[11]).toBe(SESION_EMPLEADA_CAJA.usuario.id);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('con diferencia se guarda igual: faltan $2.000', async () => {
    const res = await request(app)
      .post('/api/cierres')
      .send(cierreEstrada({ total_controlador: 487300, comentario: '  Se revisa mañana  ' }));
    expect(res.status).toBe(201);
    expect(res.body.diferencia).toBe(-2000);
    expect(res.body.comentario).toBe('Se revisa mañana');
  });

  it('la diferencia la calcula el servidor, no la que mande el formulario', async () => {
    const res = await request(app)
      .post('/api/cierres')
      .send(cierreEstrada({ total_controlador: 487300, diferencia: 0 }));
    expect(res.body.diferencia).toBe(-2000);
  });

  it('posnet, transferencias, gastos, número de Z y comentario son opcionales', async () => {
    const res = await request(app).post('/api/cierres').send({
      turno: 'mediodia',
      total_controlador: '1000',
      efectivo_contado: '1500',
      cambio_fijo: '500',
      comentario: '   ',
    });
    expect(res.status).toBe(201);
    expect(res.body.diferencia).toBe(0);
    expect(insertado[2]).toBe('MEDIODIA');
    expect(insertado[3]).toBeNull();
    expect(insertado[10]).toBeNull();
    expect(gastosInsertados).toEqual([]);
  });

  it('guarda el número de Z', async () => {
    await request(app)
      .post('/api/cierres')
      .send(cierreEstrada({ numero_z: '1532' }));
    expect(insertado[3]).toBe(1532);
  });

  it('la empleada no puede cerrar otra sucursal', async () => {
    const res = await request(app)
      .post('/api/cierres')
      .send(cierreEstrada({ sucursal_id: 2 }));
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Estrada');
    expect(db.getClient).not.toHaveBeenCalled();
  });

  it('la empleada puede mandar su propia sucursal', async () => {
    const res = await request(app)
      .post('/api/cierres')
      .send(cierreEstrada({ sucursal_id: '3' }));
    expect(res.status).toBe(201);
  });

  it('la dueña elige la sucursal', async () => {
    usarSesion(SESION_ADMIN);
    const res = await request(app)
      .post('/api/cierres')
      .send(cierreEstrada({ sucursal_id: 2 }));
    expect(res.status).toBe(201);
    expect(insertado[0]).toBe(2);
  });

  it.each([
    [undefined, 'Elegí la sucursal'],
    ['abc', 'Elegí la sucursal'],
    [99, 'No existe esa sucursal'],
    [1, 'El galpón no tiene caja'],
  ])('la dueña con sucursal_id %j: 400', async (sucursalId, mensaje) => {
    usarSesion(SESION_ADMIN);
    const res = await request(app)
      .post('/api/cierres')
      .send(cierreEstrada({ sucursal_id: sucursalId }));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(mensaje);
  });

  it.each([
    ['sin turno', { turno: undefined }, 'Elegí el turno'],
    ['turno inválido', { turno: 'TARDE' }, 'Elegí el turno'],
    ['sin total del controlador', { total_controlador: undefined }, 'total_controlador'],
    ['sin cambio fijo', { cambio_fijo: '' }, 'cambio_fijo'],
    ['monto con tres decimales', { posnet: '10.123' }, 'posnet'],
    ['monto negativo', { efectivo_contado: -5 }, 'efectivo_contado'],
    ['gastos que no son lista', { gastos: 'sodero' }, 'lista'],
    ['gasto sin detalle', { gastos: [{ monto: 100 }] }, 'detalle'],
    ['gasto con detalle largo', { gastos: [{ detalle: 'x'.repeat(121), monto: 1 }] }, 'detalle'],
    ['gasto en cero', { gastos: [{ detalle: 'Sodero', monto: 0 }] }, 'mayor a cero'],
    [
      'demasiados gastos',
      { gastos: Array.from({ length: 31 }, () => ({ detalle: 'x', monto: 1 })) },
      'hasta 30',
    ],
    ['número de Z inválido', { numero_z: 'Z-12' }, 'número de Z'],
    ['número de Z en cero', { numero_z: 0 }, 'número de Z'],
    ['comentario largo', { comentario: 'x'.repeat(501) }, 'comentario'],
    ['comentario que no es texto', { comentario: 5 }, 'comentario'],
  ])('%s: 400', async (_caso, cambio, mensaje) => {
    const res = await request(app).post('/api/cierres').send(cierreEstrada(cambio));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(mensaje);
    expect(db.getClient).not.toHaveBeenCalled();
  });

  it('sin cuerpo: 400', async () => {
    const res = await request(app).post('/api/cierres');
    expect(res.status).toBe(400);
  });

  it('si el turno ya estaba cerrado: 409 con un mensaje claro', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.startsWith('INSERT INTO cierres_caja')) {
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }
      return { rows: [] };
    });
    const res = await request(app).post('/api/cierres').send(cierreEstrada());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Ya se cargó el cierre de la noche de hoy en Estrada');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('otro error de la base: 500 y deshace todo', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.startsWith('INSERT INTO cierre_gastos')) throw new Error('se cortó la base');
      if (sql.startsWith('INSERT INTO cierres_caja')) return { rows: [{ id: 10 }] };
      return { rows: [] };
    });
    const res = await request(app).post('/api/cierres').send(cierreEstrada());
    expect(res.status).toBe(500);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('GET /api/cierres/hoy', () => {
  it('sin cierres todavía: los dos turnos pendientes y sin cambio sugerido', async () => {
    const res = await request(app).get('/api/cierres/hoy');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      sucursal: { id: 3, nombre: 'Estrada' },
      cierres: [],
      turnos_pendientes: ['MEDIODIA', 'NOCHE'],
      cambio_sugerido: null,
    });
    expect(res.body.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('con el mediodía cerrado: falta la noche y sugiere el último cambio', async () => {
    cierresDeHoy = [filaCierre({ turno: 'MEDIODIA' })];
    ultimoCambio = [{ cambio_fijo: '20000.00' }];
    const res = await request(app).get('/api/cierres/hoy');
    expect(res.body.turnos_pendientes).toEqual(['NOCHE']);
    expect(res.body.cambio_sugerido).toBe(20000);
    expect(res.body.cierres[0]).toMatchObject({ turno: 'MEDIODIA', efectivo_contado: 232500 });
  });

  it('la dueña pide la sucursal por query', async () => {
    usarSesion(SESION_ADMIN);
    const res = await request(app).get('/api/cierres/hoy?sucursal_id=2');
    expect(res.status).toBe(200);
    expect(res.body.sucursal.nombre).toBe('Viedma (Chacra)');
  });

  it('la dueña sin sucursal: 400', async () => {
    usarSesion(SESION_ADMIN);
    const res = await request(app).get('/api/cierres/hoy');
    expect(res.status).toBe(400);
  });

  it('la empleada no puede mirar otra sucursal', async () => {
    const res = await request(app).get('/api/cierres/hoy?sucursal_id=2');
    expect(res.status).toBe(403);
  });
});
