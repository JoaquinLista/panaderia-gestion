import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';
import { apiFalsa, sucursales, sesionAdmin, sesionChofer } from '../test/apiFalsa.js';

const VIEDMA = { id: 1, nombre: 'Viedma (Chacra)' };
const GALPON = { id: 5, nombre: 'Galpón Central' };
const ESTRADA = { id: 2, nombre: 'Estrada' };
const CAFE = { id: 3, nombre: 'Café' };

const renglon = (pedidoId, itemId, sucursal, detalle, extra = {}) => ({
  pedido_id: pedidoId,
  item_id: itemId,
  sucursal,
  detalle,
  urgente: false,
  estado: 'PENDIENTE',
  ...extra,
});

const pedido = (id, estado, destino, origen, extra = {}) => ({
  id,
  estado,
  urgente: false,
  nota: null,
  fecha_creacion: '2026-09-30T08:00:00',
  sucursal_origen_id: origen.id,
  sucursal_origen_nombre: origen.nombre,
  sucursal_destino_id: destino.id,
  sucursal_destino_nombre: destino.nombre,
  items: [{ id: id * 10, rubro_nombre: 'Facturas', detalle: 'algo', estado: 'PENDIENTE' }],
  ...extra,
});

const RECORRIDO = {
  cargar: [
    {
      origen: VIEDMA,
      rubros: [
        {
          rubro: { id: 20, nombre: 'Facturas' },
          renglones: [
            renglon(1, 11, CAFE, '3 latas de medialunas', { urgente: true }),
            renglon(2, 21, ESTRADA, '2 latas de vigilantes', { estado: 'LLEVADO' }),
          ],
        },
        {
          rubro: { id: 10, nombre: 'Pan' },
          renglones: [renglon(2, 22, ESTRADA, '10 kg de pan francés')],
        },
      ],
    },
    {
      origen: GALPON,
      rubros: [
        {
          rubro: { id: 110, nombre: 'Insumos' },
          renglones: [renglon(3, 31, ESTRADA, '2 bolsas de harina')],
        },
      ],
    },
  ],
  paradas: [
    {
      sucursal: CAFE,
      urgente: true,
      pedidos: [pedido(1, 'PENDIENTE', CAFE, VIEDMA, { urgente: true, nota: 'antes de las 7' })],
    },
    {
      sucursal: ESTRADA,
      urgente: false,
      pedidos: [
        pedido(4, 'EN_CAMINO', ESTRADA, VIEDMA, {
          items: [{ id: 41, rubro_nombre: 'Tortas', detalle: '1 torta', estado: 'NO_HABIA' }],
        }),
      ],
    },
  ],
};

const abrir = async ({ sesion = sesionChofer, recorrido = RECORRIDO, rutas = {} } = {}) => {
  const fetchMock = apiFalsa({
    'GET /api/auth/me': () => [200, sesion],
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/pedidos/recorrido': () => [200, recorrido],
    'PUT /api/pedidos/1/items/11': () => [200, {}],
    'PUT /api/pedidos/2/items/21': () => [200, {}],
    'PUT /api/pedidos/1/estado': () => [200, {}],
    'PUT /api/pedidos/2/estado': () => [200, {}],
    'PUT /api/pedidos/4/estado': () => [200, {}],
    ...rutas,
  });
  render(<App />);
  const user = userEvent.setup();
  if (sesion === sesionAdmin) {
    await user.click(await screen.findByRole('button', { name: 'Recorrido' }));
  }
  await screen.findByText('3 latas de medialunas', { exact: false });
  return { user, fetchMock };
};

const puts = (fetchMock) =>
  fetchMock.mock.calls
    .filter(([, op]) => op?.method === 'PUT')
    .map(([url, op]) => [url, JSON.parse(op.body)]);

const renglonCon = (texto) => screen.getByText(texto, { exact: false }).closest('li');

describe('Recorrido del chofer', () => {
  it('muestra qué cargar en cada lugar, por rubro, y a quién va', async () => {
    await abrir();
    const viedma = screen.getByRole('region', { name: 'Cargar en Viedma (Chacra)' });
    expect(
      within(viedma)
        .getAllByRole('heading', { level: 4 })
        .map((h) => h.textContent)
    ).toEqual(['Facturas', 'Pan']);
    expect(renglonCon('3 latas de medialunas')).toHaveTextContent('Café:');
    expect(within(renglonCon('3 latas de medialunas')).getByText('Urgente')).toBeInTheDocument();

    const galpon = screen.getByRole('region', { name: 'Cargar en Galpón Central' });
    expect(within(galpon).getByText('2 bolsas de harina', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('2 paradas con pedidos abiertos.')).toBeInTheDocument();
  });

  it('tilda un renglón como que lo lleva', async () => {
    const { user, fetchMock } = await abrir();
    await user.click(
      within(renglonCon('3 latas de medialunas')).getByRole('button', { name: 'Lo llevo' })
    );
    expect(puts(fetchMock)).toEqual([['/api/pedidos/1/items/11', { estado: 'LLEVADO' }]]);
  });

  it('marca que no había', async () => {
    const { user, fetchMock } = await abrir();
    await user.click(
      within(renglonCon('3 latas de medialunas')).getByRole('button', { name: 'No había' })
    );
    expect(puts(fetchMock)).toEqual([['/api/pedidos/1/items/11', { estado: 'NO_HABIA' }]]);
  });

  it('un renglón ya tildado se puede deshacer', async () => {
    const { user, fetchMock } = await abrir();
    const tildado = renglonCon('2 latas de vigilantes');
    expect(within(tildado).getByText('Lo llevo')).toHaveClass('badge');
    await user.click(within(tildado).getByRole('button', { name: 'Deshacer' }));
    expect(puts(fetchMock)).toEqual([['/api/pedidos/2/items/21', { estado: 'PENDIENTE' }]]);
  });

  it('al salir de un lugar pone en camino cada pedido una sola vez', async () => {
    const { user, fetchMock } = await abrir();
    await user.click(screen.getByRole('button', { name: 'Salgo de Viedma (Chacra)' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saliste de Viedma (Chacra) con 2 pedidos.'
    );
    expect(puts(fetchMock)).toEqual([
      ['/api/pedidos/1/estado', { estado: 'EN_CAMINO' }],
      ['/api/pedidos/2/estado', { estado: 'EN_CAMINO' }],
    ]);
  });

  it('dice "1 pedido" en singular', async () => {
    const { user } = await abrir({
      rutas: { 'PUT /api/pedidos/3/estado': () => [200, {}] },
    });
    await user.click(screen.getByRole('button', { name: 'Salgo de Galpón Central' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saliste de Galpón Central con 1 pedido.'
    );
  });

  it('las paradas muestran urgentes, notas y lo que no había; entrega lo que está en camino', async () => {
    const { user, fetchMock } = await abrir();
    const cafe = screen.getByRole('heading', { name: 'Café', level: 3 }).closest('li');
    expect(within(cafe).getByText('Urgente')).toBeInTheDocument();
    expect(within(cafe).getByText('Nota: antes de las 7')).toBeInTheDocument();
    expect(within(cafe).getByText('Falta cargarlo en Viedma (Chacra).')).toBeInTheDocument();
    expect(within(cafe).queryByRole('button', { name: 'Entregado' })).not.toBeInTheDocument();

    const estrada = screen.getByRole('heading', { name: 'Estrada', level: 3 }).closest('li');
    expect(within(estrada).getByText('No había')).toBeInTheDocument();
    await user.click(within(estrada).getByRole('button', { name: 'Entregado' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Entregado en Estrada.');
    expect(puts(fetchMock)).toEqual([['/api/pedidos/4/estado', { estado: 'ENTREGADO' }]]);
  });

  it('si el backend rechaza el cambio muestra el error', async () => {
    const { user } = await abrir({
      rutas: {
        'PUT /api/pedidos/1/items/11': () => [409, { error: 'El pedido #1 ya está cerrado' }],
      },
    });
    await user.click(
      within(renglonCon('3 latas de medialunas')).getByRole('button', { name: 'Lo llevo' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('El pedido #1 ya está cerrado');
  });

  it('sin pedidos abiertos lo dice', async () => {
    apiFalsa({
      'GET /api/auth/me': () => [200, sesionChofer],
      'GET /api/sucursales': () => [200, sucursales],
      'GET /api/pedidos/recorrido': () => [200, { cargar: [], paradas: [] }],
    });
    render(<App />);
    expect(await screen.findByText('No hay nada para cargar.')).toBeInTheDocument();
    expect(screen.getByText('No hay entregas.')).toBeInTheDocument();
    expect(screen.getByText('0 paradas con pedidos abiertos.')).toBeInTheDocument();
  });

  it('si no carga el recorrido muestra el error', async () => {
    apiFalsa({
      'GET /api/auth/me': () => [200, sesionChofer],
      'GET /api/sucursales': () => [200, sucursales],
      'GET /api/pedidos/recorrido': () => [500, { error: 'No se pudo leer el recorrido' }],
    });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo leer el recorrido');
  });

  it('la dueña también lo ve y puede actualizarlo', async () => {
    const { user, fetchMock } = await abrir({ sesion: sesionAdmin });
    await user.click(screen.getByRole('button', { name: 'Actualizar' }));
    const pedidas = fetchMock.mock.calls.filter(([url]) => url === '/api/pedidos/recorrido');
    expect(pedidas.length).toBeGreaterThanOrEqual(2);
  });
});
