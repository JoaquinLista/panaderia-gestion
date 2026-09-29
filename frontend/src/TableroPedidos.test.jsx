import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import { apiFalsa, sucursales, productos } from './test/apiFalsa.js';

const pedido = (id, estado) => ({
  id,
  estado,
  sucursal_origen_id: 1,
  sucursal_destino_id: 2,
  sucursal_origen_nombre: 'Viedma (Chacra)',
  sucursal_destino_nombre: 'Estrada',
  fecha_creacion: '2026-09-28T08:00:00',
  detalles: [
    { id: 1, producto_nombre: 'Medialunas', cantidad: '12.00', producto_unidad: 'docena' },
  ],
});

// La dueña entra al cierre de caja: se abre la pestaña de pedidos.
const montar = async (rutasExtra = {}, pedidos = []) => {
  const fetchMock = apiFalsa({
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/productos': () => [200, productos],
    'GET /api/pedidos': () => [200, pedidos],
    ...rutasExtra,
  });
  render(<App />);
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Tablero de Pedidos' }));
  return fetchMock;
};

// Espera a que el formulario tenga las sucursales cargadas (origen y destino por defecto).
const formularioListo = async () => {
  await screen.findAllByRole('option', { name: 'Estrada (VENTA)' });
};

describe('Tablero de pedidos', () => {
  it('muestra un mensaje cuando no hay pedidos', async () => {
    await montar();
    expect(await screen.findByText('Todavía no hay pedidos cargados.')).toBeInTheDocument();
  });

  it('lista los pedidos con su detalle y estado', async () => {
    await montar({}, [pedido(7, 'PENDIENTE')]);
    const fila = (await screen.findByText('Medialunas — 12 docena')).closest('tr');
    expect(within(fila).getByText('PENDIENTE')).toBeInTheDocument();
    expect(within(fila).getByText('Viedma (Chacra)')).toBeInTheDocument();
  });

  it('no deja registrar un pedido con origen y destino iguales', async () => {
    const user = userEvent.setup();
    await montar();
    await formularioListo();
    // Origen por defecto: la primera sucursal (Galpón Central, id 5).
    await user.selectOptions(screen.getByLabelText('Sucursal de destino'), '5');
    await user.click(screen.getByRole('button', { name: 'Registrar pedido' }));
    expect(screen.getByText('El origen y el destino deben ser distintos.')).toBeInTheDocument();
  });

  it('pide al menos un producto con cantidad', async () => {
    const user = userEvent.setup();
    await montar();
    await formularioListo();
    await user.click(screen.getByRole('button', { name: 'Registrar pedido' }));
    expect(
      screen.getByText('Agregá al menos un producto con cantidad mayor a 0.')
    ).toBeInTheDocument();
  });

  it('registra un pedido con varios productos y limpia el formulario', async () => {
    const user = userEvent.setup();
    const fetchMock = await montar({ 'POST /api/pedidos': () => [201, { id: 9 }] });
    await formularioListo();

    await user.selectOptions(screen.getByLabelText('Producto'), '1');
    await user.type(screen.getByLabelText('Cantidad'), '12');
    await user.click(screen.getByRole('button', { name: '+ Agregar producto' }));
    const [, segundoProducto] = screen.getAllByLabelText('Producto');
    const [, segundaCantidad] = screen.getAllByLabelText('Cantidad');
    await user.selectOptions(segundoProducto, '2');
    await user.type(segundaCantidad, '30');
    await user.click(screen.getByRole('button', { name: 'Registrar pedido' }));

    expect(await screen.findByText('Pedido registrado correctamente.')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({
      sucursal_origen_id: 5,
      sucursal_destino_id: 1,
      estado: 'PENDIENTE',
      detalles: [
        { producto_id: 1, cantidad: 12 },
        { producto_id: 2, cantidad: 30 },
      ],
    });
    expect(screen.getAllByLabelText('Producto')).toHaveLength(1);
  });

  it('permite quitar un ítem pero siempre deja al menos uno', async () => {
    const user = userEvent.setup();
    await montar();
    await formularioListo();
    await user.click(screen.getByRole('button', { name: '+ Agregar producto' }));
    expect(screen.getAllByLabelText('Producto')).toHaveLength(2);
    await user.click(screen.getAllByRole('button', { name: 'Quitar ítem' })[0]);
    await user.click(screen.getByRole('button', { name: 'Quitar ítem' }));
    expect(screen.getAllByLabelText('Producto')).toHaveLength(1);
  });

  it('muestra el error del backend si el alta falla', async () => {
    const user = userEvent.setup();
    await montar({ 'POST /api/pedidos': () => [400, { error: 'Alguna sucursal no existe' }] });
    await formularioListo();
    await user.selectOptions(screen.getByLabelText('Producto'), '1');
    await user.type(screen.getByLabelText('Cantidad'), '1');
    await user.click(screen.getByRole('button', { name: 'Registrar pedido' }));
    expect(await screen.findByText('Alguna sucursal no existe')).toBeInTheDocument();
  });

  it('avanza el estado de un pedido', async () => {
    const user = userEvent.setup();
    const fetchMock = await montar(
      { 'PUT /api/pedidos/7/estado': () => [200, pedido(7, 'EN_PREPARACION')] },
      [pedido(7, 'PENDIENTE')]
    );
    await user.click(await screen.findByRole('button', { name: 'Marcar en preparación' }));
    expect(
      await screen.findByText('Pedido #7: estado actualizado a EN PREPARACION.')
    ).toBeInTheDocument();
    const put = fetchMock.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(JSON.parse(put[1].body)).toEqual({ estado: 'EN_PREPARACION' });
  });

  it('pide confirmación antes de cancelar y no hace nada si se rechaza', async () => {
    const user = userEvent.setup();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = await montar({}, [pedido(7, 'PENDIENTE')]);
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(confirmar).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false);
  });

  it('muestra el error si la transición es inválida', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await montar({ 'PUT /api/pedidos/7/estado': () => [409, { error: 'Transición inválida' }] }, [
      pedido(7, 'PENDIENTE'),
    ]);
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText('Transición inválida')).toBeInTheDocument();
  });

  it('no ofrece acciones para un pedido en estado final', async () => {
    await montar({}, [pedido(7, 'RECIBIDO')]);
    const fila = (await screen.findByText('RECIBIDO')).closest('tr');
    expect(within(fila).queryByRole('button')).not.toBeInTheDocument();
  });

  it('muestra el error si no se pueden cargar los pedidos', async () => {
    await montar({ 'GET /api/pedidos': () => [500, { error: 'Base caída' }] });
    expect(await screen.findByText('Base caída')).toBeInTheDocument();
  });
});
