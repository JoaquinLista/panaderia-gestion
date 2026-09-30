import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SESION_ADMIN, SESION_CHOFER, SESION_EMPLEADA } from '../helpers/sesiones.js';

// Reemplazamos la capa de base de datos: estos tests prueban las reglas de
// negocio del servicio, no PostgreSQL.
vi.mock('../../src/config/db.js', () => ({
  query: vi.fn(),
  getClient: vi.fn(),
}));

const { query, getClient } = await import('../../src/config/db.js');
const { crearPedidos, cambiarEstadoPedido, marcarItem, obtenerRecorrido, MAX_ITEMS } =
  await import('../../src/services/pedidosService.js');

/** Cliente de transacción falso: responde a cada query con lo que diga `responder`. */
const clienteFalso = (responder) => ({
  query: vi.fn(async (sql, params) => responder(sql, params) ?? { rows: [] }),
  release: vi.fn(),
});

// Estrada (3) pide; las facturas salen de la fábrica (2) y los insumos del galpón (1).
const RUBROS = [
  { id: 20, nombre: 'Facturas', sucursal_origen_id: 2, sucursal_origen_nombre: 'Viedma (Chacra)' },
  { id: 110, nombre: 'Insumos', sucursal_origen_id: 1, sucursal_origen_nombre: 'Galpón Central' },
];

const pedidoValido = {
  items: [{ rubro_id: 20, detalle: '2 latas de medialunas' }],
};

/** Base que acepta el pedido: la sucursal existe y los rubros también. */
const baseQueAcepta = () => {
  let siguienteId = 40;
  return clienteFalso((sql) => {
    if (sql.startsWith('SELECT id, nombre FROM sucursales'))
      return { rows: [{ id: 3, nombre: 'Estrada' }] };
    if (sql.includes('FROM rubros')) return { rows: RUBROS };
    if (sql.includes('INSERT INTO pedidos')) return { rows: [{ id: siguienteId++ }] };
    return undefined;
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [] });
});

describe('crearPedidos: validaciones', () => {
  it.each([
    [{ items: [] }, /al menos un renglón/],
    [{ items: 'facturas' }, /al menos un renglón/],
    [{ items: [{ detalle: 'algo' }] }, /necesita un rubro/],
    [{ items: [{ rubro_id: 20, detalle: '   ' }] }, /observación/],
    [{ items: [{ rubro_id: 20, detalle: 'x'.repeat(501) }] }, /hasta 500/],
    [{ ...pedidoValido, nota: 'x'.repeat(301) }, /hasta 300/],
    [
      { items: Array.from({ length: MAX_ITEMS + 1 }, () => ({ rubro_id: 20, detalle: 'x' })) },
      /hasta 30 renglones/,
    ],
  ])('rechaza %j con 400 sin tocar la base', async (body, mensaje) => {
    await expect(crearPedidos(body, SESION_EMPLEADA)).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(mensaje),
    });
    expect(getClient).not.toHaveBeenCalled();
  });

  it('la dueña tiene que decir para qué sucursal pide', async () => {
    await expect(crearPedidos(pedidoValido, SESION_ADMIN)).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/sucursal que pide/),
    });
  });

  it('la empleada no puede pedir para otra sucursal', async () => {
    await expect(
      crearPedidos({ ...pedidoValido, sucursal_id: 4 }, SESION_EMPLEADA)
    ).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/Estrada/) });
  });

  it('hace rollback si un rubro no existe o está desactivado', async () => {
    const client = baseQueAcepta();
    getClient.mockResolvedValue(client);
    await expect(
      crearPedidos({ items: [{ rubro_id: 999, detalle: 'algo' }] }, SESION_EMPLEADA)
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/rubro/) });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('no deja que la fábrica se pida facturas a sí misma', async () => {
    getClient.mockResolvedValue(baseQueAcepta());
    await expect(
      crearPedidos({ ...pedidoValido, sucursal_id: 2 }, SESION_ADMIN)
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/sale de Viedma/) });
  });
});

describe('crearPedidos: guardado', () => {
  it('separa los renglones en un pedido por lugar de origen, con quien lo pidió', async () => {
    const client = baseQueAcepta();
    getClient.mockResolvedValue(client);

    await crearPedidos(
      {
        nota: ' antes de las 7 ',
        urgente: true,
        items: [
          { rubro_id: 20, detalle: ' 2 latas de medialunas ' },
          { rubro_id: 110, detalle: '1 bolsa de harina' },
          { rubro_id: 20, detalle: '1 lata de vigilantes' },
        ],
      },
      SESION_EMPLEADA
    );

    const pedidos = client.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO pedidos'));
    expect(pedidos.map(([, params]) => params)).toEqual([
      [2, 3, 'antes de las 7', true, SESION_EMPLEADA.usuario.id],
      [1, 3, 'antes de las 7', true, SESION_EMPLEADA.usuario.id],
    ]);
    const items = client.query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO pedido_items')
    );
    expect(items.map(([, params]) => params)).toEqual([
      [40, 20, '2 latas de medialunas'],
      [40, 20, '1 lata de vigilantes'],
      [41, 110, '1 bolsa de harina'],
    ]);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('sin "urgente" explícito el pedido no es urgente y sin nota queda null', async () => {
    const client = baseQueAcepta();
    getClient.mockResolvedValue(client);
    await crearPedidos({ ...pedidoValido, urgente: 'si' }, SESION_EMPLEADA);
    const [, params] = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO pedidos'));
    expect(params.slice(2, 4)).toEqual([null, false]);
  });
});

describe('cambiarEstadoPedido', () => {
  /** Pedido de Estrada (3) en el estado dado. */
  const conPedido = (estado, destino = 3) => {
    const client = clienteFalso((sql) =>
      sql.startsWith('SELECT estado')
        ? { rows: [{ estado, sucursal_destino_id: destino }] }
        : undefined
    );
    getClient.mockResolvedValue(client);
    return client;
  };

  it('rechaza un id inválido sin tocar la base', async () => {
    await expect(cambiarEstadoPedido('x', 'EN_CAMINO', SESION_CHOFER)).rejects.toMatchObject({
      status: 400,
    });
    expect(getClient).not.toHaveBeenCalled();
  });

  it('rechaza un estado desconocido', async () => {
    await expect(cambiarEstadoPedido(1, 'DESPACHADO', SESION_CHOFER)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('devuelve 404 si el pedido no existe', async () => {
    getClient.mockResolvedValue(clienteFalso(() => ({ rows: [] })));
    await expect(cambiarEstadoPedido(99, 'EN_CAMINO', SESION_CHOFER)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('devuelve 409 ante una transición inválida o repetida', async () => {
    conPedido('PENDIENTE');
    await expect(cambiarEstadoPedido(1, 'ENTREGADO', SESION_CHOFER)).rejects.toMatchObject({
      status: 409,
    });
    conPedido('EN_CAMINO');
    await expect(cambiarEstadoPedido(1, 'EN_CAMINO', SESION_CHOFER)).rejects.toMatchObject({
      status: 409,
    });
    conPedido('RECIBIDO');
    await expect(cambiarEstadoPedido(1, 'CANCELADO', SESION_EMPLEADA)).rejects.toThrow(
      /ya no cambia/
    );
  });

  it('el chofer pone el pedido en camino y queda la hora', async () => {
    const client = conPedido('PENDIENTE');
    query.mockResolvedValueOnce({ rows: [{ id: 1, estado: 'EN_CAMINO' }] });

    const pedido = await cambiarEstadoPedido(1, 'en_camino', SESION_CHOFER);

    expect(client.query).toHaveBeenCalledWith(
      'UPDATE pedidos SET estado = $1, en_camino_en = now() WHERE id = $2',
      ['EN_CAMINO', 1]
    );
    expect(pedido).toMatchObject({ estado: 'EN_CAMINO', items: [] });
  });

  it('la empleada no puede marcar el reparto', async () => {
    const client = conPedido('PENDIENTE');
    await expect(cambiarEstadoPedido(1, 'EN_CAMINO', SESION_EMPLEADA)).rejects.toMatchObject({
      status: 403,
      message: expect.stringMatching(/chofer/),
    });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('el chofer no puede confirmar que llegó: lo hace la sucursal', async () => {
    conPedido('ENTREGADO');
    await expect(cambiarEstadoPedido(1, 'RECIBIDO', SESION_CHOFER)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('la empleada confirma lo que llegó a su sucursal', async () => {
    const client = conPedido('ENTREGADO');
    await cambiarEstadoPedido(1, 'RECIBIDO', SESION_EMPLEADA);
    expect(client.query).toHaveBeenCalledWith(
      'UPDATE pedidos SET estado = $1, recibido_en = now() WHERE id = $2',
      ['RECIBIDO', 1]
    );
  });

  it('la empleada no puede cancelar el pedido de otra sucursal', async () => {
    conPedido('PENDIENTE', 4);
    await expect(cambiarEstadoPedido(1, 'CANCELADO', SESION_EMPLEADA)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('la dueña puede hacer cualquier paso', async () => {
    conPedido('PENDIENTE', 4);
    await expect(cambiarEstadoPedido(1, 'CANCELADO', SESION_ADMIN)).resolves.toBeNull();
    conPedido('PENDIENTE', 4);
    await expect(cambiarEstadoPedido(1, 'EN_CAMINO', SESION_ADMIN)).resolves.toBeNull();
  });
});

describe('marcarItem', () => {
  it('rechaza ids y estados inválidos sin tocar la base', async () => {
    await expect(marcarItem('x', 1, 'LLEVADO')).rejects.toMatchObject({ status: 400 });
    await expect(marcarItem(1, 'y', 'LLEVADO')).rejects.toMatchObject({ status: 400 });
    await expect(marcarItem(1, 1, 'ROTO')).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
  });

  it('devuelve 404 si el pedido no existe', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(marcarItem(9, 1, 'LLEVADO')).rejects.toMatchObject({ status: 404 });
  });

  it('no deja tildar un pedido ya entregado', async () => {
    query.mockResolvedValueOnce({ rows: [{ estado: 'ENTREGADO' }] });
    await expect(marcarItem(1, 1, 'LLEVADO')).rejects.toMatchObject({ status: 409 });
  });

  it('devuelve 404 si el renglón no es de ese pedido', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ estado: 'PENDIENTE' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(marcarItem(1, 77, 'LLEVADO')).rejects.toMatchObject({ status: 404 });
  });

  it('marca el renglón y devuelve el pedido', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ estado: 'EN_CAMINO' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 1, estado: 'EN_CAMINO' }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, pedido_id: 1, estado: 'NO_HABIA' }] });
    const pedido = await marcarItem(1, 5, 'no_habia');
    expect(query).toHaveBeenNthCalledWith(
      2,
      'UPDATE pedido_items SET estado = $1 WHERE id = $2 AND pedido_id = $3',
      ['NO_HABIA', 5, 1]
    );
    expect(pedido.items).toEqual([{ id: 5, pedido_id: 1, estado: 'NO_HABIA' }]);
  });
});

describe('obtenerRecorrido', () => {
  it('arma el recorrido con los pedidos abiertos', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await obtenerRecorrido()).toEqual({ cargar: [], paradas: [] });
    expect(query.mock.calls[0][1]).toEqual([['PENDIENTE', 'EN_CAMINO']]);
  });
});
