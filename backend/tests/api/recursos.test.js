import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Base de datos falsa: cada test decide qué devuelve `query`.
// Las rutas de negocio piden sesión: acá se entra como admin sin pasar por el login.
vi.mock('../../src/middlewares/autenticacion.js', async () => {
  const { requerirSesionFalsa } = await import('../helpers/sesiones.js');
  return { requerirSesion: requerirSesionFalsa };
});

vi.mock('../../src/config/db.js', () => {
  const query = vi.fn();
  return { default: { query }, query, getClient: vi.fn() };
});

const { query } = await import('../../src/config/db.js');
const { default: app } = await import('../../src/app.js');
const { obtenerSucursalPorId } = await import('../../src/services/sucursalesService.js');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET de catálogos', () => {
  it.each([
    ['/api/sucursales', [{ id: 1, nombre: 'Galpón Central', tipo: 'DEPOSITO' }]],
    ['/api/productos', [{ id: 1, nombre: 'Medialunas', unidad_medida: 'docena' }]],
    ['/api/insumos', [{ id: 1, nombre: 'Harina 000', bajo_stock: true }]],
  ])('%s devuelve las filas de la base', async (ruta, filas) => {
    query.mockResolvedValue({ rows: filas });
    const res = await request(app).get(ruta);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(filas);
  });

  it.each(['/api/sucursales', '/api/productos', '/api/insumos', '/api/pedidos'])(
    '%s responde 500 si la base falla, sin romper el servidor',
    async (ruta) => {
      query.mockRejectedValue(new Error('se cayó la base'));
      const res = await request(app).get(ruta);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('se cayó la base');
    }
  );
});

describe('GET /api/pedidos', () => {
  it('adjunta los renglones a cada pedido', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, pedido_id: 1, rubro_id: 3 }] });
    const res = await request(app).get('/api/pedidos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, items: [{ id: 10, pedido_id: 1, rubro_id: 3 }] },
      { id: 2, items: [] },
    ]);
  });

  it('con ?estado=abiertos pide sólo los pendientes y en camino, sin límite', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/pedidos?estado=abiertos');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/p\.estado = ANY\(\$1::text\[\]\)/);
    expect(sql).not.toMatch(/LIMIT/);
    expect(params).toEqual([['PENDIENTE', 'EN_CAMINO']]);
  });

  it('sin filtro devuelve el historial reciente con un límite', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/pedidos');
    expect(query.mock.calls[0][0]).toMatch(/LIMIT 200/);
  });

  it('no consulta renglones si no hay pedidos', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/pedidos');
    expect(res.body).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('rubros: la dueña arma la lista', () => {
  const RUBRO = { id: 13, nombre: 'Prepizzas', sucursal_origen_id: 2, activo: true, orden: 130 };
  const baseDeRubros = (sql) => {
    if (sql.startsWith('SELECT id, nombre, tipo FROM sucursales')) {
      return { rows: [{ id: 2, nombre: 'Viedma (Chacra)', tipo: 'FABRICA' }] };
    }
    if (sql.includes('INSERT INTO rubros')) return { rows: [{ id: 13 }] };
    if (sql.startsWith('UPDATE rubros')) return { rowCount: 1 };
    return { rows: [RUBRO] };
  };

  it('POST /api/pedidos/rubros crea y responde 201', async () => {
    query.mockImplementation(async (sql) => baseDeRubros(sql));
    const res = await request(app)
      .post('/api/pedidos/rubros')
      .send({ nombre: 'Prepizzas', sucursal_origen_id: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(RUBRO);
  });

  it('PUT /api/pedidos/rubros/:id lo cambia', async () => {
    query.mockImplementation(async (sql) => baseDeRubros(sql));
    const res = await request(app).put('/api/pedidos/rubros/13').send({ activo: false });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(RUBRO);
  });

  it.each([
    ['post', '/api/pedidos/rubros'],
    ['put', '/api/pedidos/rubros/13'],
  ])('%s %s sin datos responde 400', async (metodo, ruta) => {
    const res = await request(app)[metodo](ruta);
    expect(res.status).toBe(400);
  });

  it('GET /api/pedidos/rubros?todos=1 incluye los desactivados para la dueña', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/pedidos/rubros?todos=1');
    expect(query.mock.calls[0][0]).not.toMatch(/WHERE r\.activo/);
  });
});

describe('POST /api/insumos', () => {
  it.each([
    [{ stock_actual: 5 }, /nombre/],
    [{ nombre: '   ', stock_actual: 5 }, /nombre/],
    [{ nombre: 'Harina' }, /stock_actual/],
    [{ nombre: 'Harina', stock_actual: 'mucho' }, /stock_actual/],
    [{ nombre: 'Harina', stock_actual: -1 }, /negativo/],
  ])('rechaza %j con 400', async (body, mensaje) => {
    const res = await request(app).post('/api/insumos').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(mensaje);
    expect(query).not.toHaveBeenCalled();
  });

  it('guarda el insumo limpiando el nombre y con valores por defecto', async () => {
    query.mockResolvedValue({ rows: [{ id: 4, nombre: 'Azúcar' }] });
    const res = await request(app)
      .post('/api/insumos')
      .send({ nombre: ' Azúcar ', stock_actual: '20' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 4, nombre: 'Azúcar' });
    expect(query.mock.calls[0][1]).toEqual(['Azúcar', 20, null, null]);
  });

  it('pasa stock mínimo y unidad cuando vienen', async () => {
    query.mockResolvedValue({ rows: [{ id: 4 }] });
    await request(app)
      .post('/api/insumos')
      .send({ nombre: 'Levadura', stock_actual: 3, stock_minimo: '5', unidad_medida: ' kg ' });
    expect(query.mock.calls[0][1]).toEqual(['Levadura', 3, 5, 'kg']);
  });
});

describe('obtenerSucursalPorId', () => {
  it('devuelve la sucursal o null', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 2, nombre: 'Estrada' }] });
    await expect(obtenerSucursalPorId(2)).resolves.toEqual({ id: 2, nombre: 'Estrada' });
    query.mockResolvedValueOnce({ rows: [] });
    await expect(obtenerSucursalPorId(99)).resolves.toBeNull();
  });
});
