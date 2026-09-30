import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';
import {
  apiFalsa,
  sucursales,
  sesionAdmin,
  sesionChofer,
  sesionEmpleada,
} from '../test/apiFalsa.js';

const RUBROS = [
  { id: 10, nombre: 'Pan', sucursal_origen_id: 1, sucursal_origen_nombre: 'Viedma (Chacra)' },
  { id: 20, nombre: 'Facturas', sucursal_origen_id: 1, sucursal_origen_nombre: 'Viedma (Chacra)' },
  { id: 110, nombre: 'Insumos', sucursal_origen_id: 5, sucursal_origen_nombre: 'Galpón Central' },
];

const pedido = (id, estado, extra = {}) => ({
  id,
  estado,
  urgente: false,
  nota: null,
  fecha_creacion: '2026-09-30T08:00:00',
  sucursal_origen_id: 1,
  sucursal_origen_nombre: 'Viedma (Chacra)',
  sucursal_destino_id: 2,
  sucursal_destino_nombre: 'Estrada',
  creado_por_nombre: 'Lucía',
  items: [
    {
      id: id * 10,
      rubro_nombre: 'Facturas',
      detalle: '2 latas de medialunas',
      estado: 'PENDIENTE',
    },
  ],
  ...extra,
});

/** Abre la app con esa sesión y va a Pedidos. */
const abrir = async (sesion, { pedidos = [], rutas = {} } = {}) => {
  const fetchMock = apiFalsa({
    'GET /api/auth/me': () => [200, sesion],
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/pedidos': () => [200, pedidos],
    'GET /api/pedidos/rubros': () => [200, RUBROS],
    ...rutas,
  });
  render(<App />);
  const user = userEvent.setup();
  if (sesion === sesionAdmin) {
    await user.click(await screen.findByRole('button', { name: 'Pedidos' }));
  }
  return { user, fetchMock };
};

const enviados = (fetchMock, metodo, ruta) =>
  fetchMock.mock.calls
    .filter(([url, op]) => url === ruta && op?.method === metodo)
    .map(([, op]) => JSON.parse(op.body));

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Pedidos: la sucursal pide', () => {
  it('la empleada pide para su sucursal tocando un rubro y escribiendo qué necesita', async () => {
    const { user, fetchMock } = await abrir(sesionEmpleada, {
      rutas: {
        'POST /api/pedidos': () => [
          201,
          [
            pedido(1, 'PENDIENTE'),
            pedido(2, 'PENDIENTE', { sucursal_origen_nombre: 'Galpón Central' }),
          ],
        ],
      },
    });
    expect(await screen.findByText('Pedido de Estrada.')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: '+ Facturas' }));
    await user.type(screen.getByLabelText('Facturas'), '2 latas de medialunas, 2 de vigilantes');
    await user.click(screen.getByRole('button', { name: '+ Insumos' }));
    // El último rubro agregado queda listo para escribir.
    expect(screen.getByLabelText('Insumos')).toHaveFocus();
    await user.keyboard('1 bolsa de harina');
    await user.type(screen.getByLabelText('Nota para el chofer (opcional)'), 'antes de las 7');
    await user.click(screen.getByLabelText('Es urgente'));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    expect(
      await screen.findByText('Pedido enviado. Lo prepara Viedma (Chacra) y Galpón Central.')
    ).toBeInTheDocument();
    expect(enviados(fetchMock, 'POST', '/api/pedidos')).toEqual([
      {
        nota: 'antes de las 7',
        urgente: true,
        items: [
          { rubro_id: 20, detalle: '2 latas de medialunas, 2 de vigilantes' },
          { rubro_id: 110, detalle: '1 bolsa de harina' },
        ],
      },
    ]);
    // El formulario queda limpio para el próximo pedido.
    expect(screen.queryByLabelText('Facturas')).not.toBeInTheDocument();
  });

  it('no deja enviar un rubro sin escribir qué se necesita', async () => {
    const { user, fetchMock } = await abrir(sesionEmpleada);
    await user.click(await screen.findByRole('button', { name: '+ Pan' }));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Escribí qué necesitás/);
    expect(enviados(fetchMock, 'POST', '/api/pedidos')).toEqual([]);
  });

  it('se puede quitar un rubro agregado por error', async () => {
    const { user } = await abrir(sesionEmpleada);
    await user.click(await screen.findByRole('button', { name: '+ Pan' }));
    await user.click(screen.getByRole('button', { name: 'Quitar Pan' }));
    expect(screen.queryByLabelText('Pan')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar pedido' })).not.toBeInTheDocument();
  });

  it('muestra el error de la API si el pedido no se guarda', async () => {
    const { user } = await abrir(sesionEmpleada, {
      rutas: {
        'POST /api/pedidos': () => [400, { error: 'Algún rubro no existe o está desactivado' }],
      },
    });
    await user.click(await screen.findByRole('button', { name: '+ Pan' }));
    await user.type(screen.getByLabelText('Pan'), '3 bolsas');
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Algún rubro no existe');
  });

  it('la dueña elige la sucursal, y la fábrica no ve los rubros que ella misma hace', async () => {
    const { user, fetchMock } = await abrir(sesionAdmin, {
      rutas: { 'POST /api/pedidos': () => [201, [pedido(1, 'PENDIENTE')]] },
    });
    const sucursal = await screen.findByLabelText('¿Para qué sucursal?');
    // El galpón no pide.
    expect(
      within(sucursal).queryByRole('option', { name: 'Galpón Central' })
    ).not.toBeInTheDocument();

    await user.selectOptions(sucursal, 'Viedma (Chacra)');
    expect(screen.getByRole('button', { name: '+ Insumos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Facturas' })).not.toBeInTheDocument();

    await user.selectOptions(sucursal, 'Café');
    await user.click(screen.getByRole('button', { name: '+ Facturas' }));
    await user.type(screen.getByLabelText('Facturas'), '1 lata');
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await screen.findByText(/Pedido enviado/);
    expect(enviados(fetchMock, 'POST', '/api/pedidos')[0]).toMatchObject({ sucursal_id: 3 });
  });

  it('el chofer no pide: sólo ve los pedidos', async () => {
    await abrir(sesionChofer, { pedidos: [pedido(1, 'PENDIENTE')] });
    expect(await screen.findByRole('button', { name: 'Salió' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pedir mercadería' })).not.toBeInTheDocument();
  });
});

describe('Pedidos: en curso y anteriores', () => {
  it('sin pedidos lo dice', async () => {
    await abrir(sesionEmpleada);
    expect(await screen.findByText('No hay pedidos en curso.')).toBeInTheDocument();
  });

  it('muestra cada pedido con sus renglones, la nota, lo que no había y si es urgente', async () => {
    await abrir(sesionEmpleada, {
      pedidos: [
        pedido(1, 'EN_CAMINO', {
          urgente: true,
          nota: 'antes de las 7',
          items: [
            { id: 1, rubro_nombre: 'Facturas', detalle: '2 latas', estado: 'LLEVADO' },
            { id: 2, rubro_nombre: 'Pan', detalle: '3 bolsas', estado: 'NO_HABIA' },
          ],
        }),
        pedido(2, 'RECIBIDO'),
      ],
    });
    const [tarjeta] = (
      await screen.findAllByRole('heading', { name: 'De Viedma (Chacra)', level: 3 })
    ).map((h) => h.closest('li'));
    expect(within(tarjeta).getByText('En camino')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Urgente')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Llevado')).toBeInTheDocument();
    expect(within(tarjeta).getByText('No había')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Nota: antes de las 7')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Anteriores' })).toBeInTheDocument();
    expect(screen.getByText('Recibido')).toBeInTheDocument();
  });

  it('la sucursal confirma que le llegó', async () => {
    const { user, fetchMock } = await abrir(sesionEmpleada, {
      pedidos: [pedido(4, 'ENTREGADO')],
      rutas: { 'PUT /api/pedidos/4/estado': () => [200, pedido(4, 'RECIBIDO')] },
    });
    await user.click(await screen.findByRole('button', { name: 'Llegó' }));
    await waitFor(() =>
      expect(enviados(fetchMock, 'PUT', '/api/pedidos/4/estado')).toEqual([{ estado: 'RECIBIDO' }])
    );
  });

  it('cancelar pide confirmación', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user, fetchMock } = await abrir(sesionEmpleada, { pedidos: [pedido(4, 'PENDIENTE')] });
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(confirmar).toHaveBeenCalledWith('¿Cancelar el pedido de Estrada?');
    expect(enviados(fetchMock, 'PUT', '/api/pedidos/4/estado')).toEqual([]);
  });

  it('el chofer lo saca a la calle y muestra el error si la API no deja', async () => {
    const { user, fetchMock } = await abrir(sesionChofer, {
      pedidos: [pedido(4, 'PENDIENTE')],
      rutas: {
        'PUT /api/pedidos/4/estado': () => [
          409,
          { error: 'El pedido #4 ya está en estado EN_CAMINO' },
        ],
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Salió' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya está en estado EN_CAMINO');
    expect(enviados(fetchMock, 'PUT', '/api/pedidos/4/estado')).toEqual([{ estado: 'EN_CAMINO' }]);
  });

  it('la dueña ve para quién es y de dónde sale cada pedido', async () => {
    await abrir(sesionAdmin, { pedidos: [pedido(1, 'PENDIENTE')] });
    expect(
      await screen.findByRole('heading', { name: 'Estrada · de Viedma (Chacra)' })
    ).toBeInTheDocument();
  });
});
