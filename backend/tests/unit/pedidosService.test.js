import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reemplazamos la capa de base de datos: estos tests prueban las reglas de
// negocio del servicio, no PostgreSQL.
vi.mock('../../src/config/db.js', () => ({
  query: vi.fn(),
  getClient: vi.fn(),
}));

const { query, getClient } = await import('../../src/config/db.js');
const { crearPedido, cambiarEstadoPedido } = await import('../../src/services/pedidosService.js');

/** Cliente de transacción falso: responde a cada query con lo que diga `responder`. */
const clienteFalso = (responder) => ({
  query: vi.fn(async (sql, params) => responder(sql, params) ?? { rows: [] }),
  release: vi.fn(),
});

const pedidoValido = {
  sucursal_origen_id: 1,
  sucursal_destino_id: 2,
  detalles: [{ producto_id: 1, cantidad: 12 }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('crearPedido: validaciones', () => {
  it('rechaza origen y destino iguales', async () => {
    await expect(crearPedido({ ...pedidoValido, sucursal_destino_id: 1 })).rejects.toMatchObject({
      status: 400,
    });
    expect(getClient).not.toHaveBeenCalled();
  });

  it('rechaza sucursales no numéricas', async () => {
    await expect(crearPedido({ ...pedidoValido, sucursal_origen_id: 'abc' })).rejects.toMatchObject(
      { status: 400 }
    );
  });

  it('rechaza un estado inicial final (RECIBIDO)', async () => {
    await expect(crearPedido({ ...pedidoValido, estado: 'recibido' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rechaza un pedido sin detalles', async () => {
    await expect(crearPedido({ ...pedidoValido, detalles: [] })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rechaza cantidades menores o iguales a cero', async () => {
    await expect(
      crearPedido({ ...pedidoValido, detalles: [{ producto_id: 1, cantidad: 0 }] })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('hace rollback si alguna sucursal no existe', async () => {
    const client = clienteFalso((sql) =>
      sql.startsWith('SELECT id FROM sucursales') ? { rows: [{ id: 1 }] } : undefined
    );
    getClient.mockResolvedValue(client);

    await expect(crearPedido(pedidoValido)).rejects.toMatchObject({ status: 400 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('inserta pedido y detalles en una transacción', async () => {
    const client = clienteFalso((sql) => {
      if (sql.startsWith('SELECT id FROM sucursales')) return { rows: [{ id: 1 }, { id: 2 }] };
      if (sql.includes('INSERT INTO pedidos')) return { rows: [{ id: 7 }] };
      return undefined;
    });
    getClient.mockResolvedValue(client);
    query
      .mockResolvedValueOnce({ rows: [{ id: 7, estado: 'PENDIENTE' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, pedido_id: 7, producto_id: 1, cantidad: 12 }] });

    const pedido = await crearPedido(pedidoValido);

    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(pedido).toMatchObject({ id: 7, detalles: [{ producto_id: 1 }] });
  });
});

describe('cambiarEstadoPedido', () => {
  it('rechaza un id inválido sin tocar la base', async () => {
    await expect(cambiarEstadoPedido('x', 'DESPACHADO')).rejects.toMatchObject({ status: 400 });
    expect(getClient).not.toHaveBeenCalled();
  });

  it('rechaza un estado desconocido', async () => {
    await expect(cambiarEstadoPedido(1, 'PERDIDO')).rejects.toMatchObject({ status: 400 });
  });

  it('devuelve 404 si el pedido no existe', async () => {
    getClient.mockResolvedValue(clienteFalso(() => ({ rows: [] })));
    await expect(cambiarEstadoPedido(99, 'DESPACHADO')).rejects.toMatchObject({ status: 404 });
  });

  it('devuelve 409 ante una transición inválida', async () => {
    getClient.mockResolvedValue(clienteFalso(() => ({ rows: [{ estado: 'PENDIENTE' }] })));
    await expect(cambiarEstadoPedido(1, 'ENTREGADO')).rejects.toMatchObject({ status: 409 });
  });

  it('devuelve 409 si el pedido ya está en ese estado', async () => {
    getClient.mockResolvedValue(clienteFalso(() => ({ rows: [{ estado: 'DESPACHADO' }] })));
    await expect(cambiarEstadoPedido(1, 'DESPACHADO')).rejects.toMatchObject({ status: 409 });
  });

  it('devuelve 409 con mensaje de estado final', async () => {
    getClient.mockResolvedValue(clienteFalso(() => ({ rows: [{ estado: 'RECIBIDO' }] })));
    await expect(cambiarEstadoPedido(1, 'CANCELADO')).rejects.toThrow(/estado final/);
  });

  it('actualiza el estado cuando la transición es válida', async () => {
    const client = clienteFalso((sql) =>
      sql.startsWith('SELECT estado') ? { rows: [{ estado: 'EN_PREPARACION' }] } : undefined
    );
    getClient.mockResolvedValue(client);
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, estado: 'DESPACHADO' }] })
      .mockResolvedValueOnce({ rows: [] });

    const pedido = await cambiarEstadoPedido(1, 'despachado');

    expect(client.query).toHaveBeenCalledWith('UPDATE pedidos SET estado = $1 WHERE id = $2', [
      'DESPACHADO',
      1,
    ]);
    expect(pedido).toMatchObject({ estado: 'DESPACHADO', detalles: [] });
  });
});
