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
  it('adjunta el detalle a cada pedido', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, pedido_id: 1, producto_id: 3 }] });
    const res = await request(app).get('/api/pedidos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, detalles: [{ id: 10, pedido_id: 1, producto_id: 3 }] },
      { id: 2, detalles: [] },
    ]);
  });

  it('no consulta detalles si no hay pedidos', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/pedidos');
    expect(res.body).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
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
