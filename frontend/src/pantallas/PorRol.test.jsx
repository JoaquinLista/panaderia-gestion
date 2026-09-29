import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';
import {
  apiFalsa,
  sucursales,
  productos,
  sesionAdmin,
  sesionEmpleada,
  sesionChofer,
} from '../test/apiFalsa.js';

const pedido = {
  id: 7,
  estado: 'PENDIENTE',
  sucursal_origen_id: 2,
  sucursal_destino_id: 1,
  sucursal_origen_nombre: 'Estrada',
  sucursal_destino_nombre: 'Viedma (Chacra)',
  fecha_creacion: '2026-09-28T08:00:00',
  detalles: [],
};

const abrirComo = (sesion) => {
  apiFalsa({
    'GET /api/auth/me': () => [200, sesion],
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/productos': () => [200, productos],
    'GET /api/pedidos': () => [200, [pedido]],
  });
  render(<App />);
};

const pestañas = async () => {
  const nav = await screen.findByRole('navigation');
  return within(nav)
    .getAllByRole('button')
    .map((b) => b.textContent);
};

describe('pestañas según el rol', () => {
  it.each([
    [
      'admin',
      sesionAdmin,
      ['Cierre de caja', 'Tablero de Pedidos', 'Stock e Insumos', 'Red de Sucursales', 'Usuarios'],
    ],
    ['empleada', sesionEmpleada, ['Tablero de Pedidos', 'Red de Sucursales']],
    ['chofer', sesionChofer, ['Tablero de Pedidos', 'Stock e Insumos', 'Red de Sucursales']],
  ])('%s ve sólo sus pestañas', async (_rol, sesion, esperadas) => {
    abrirComo(sesion);
    expect(await pestañas()).toEqual(esperadas);
  });
});

describe('tablero de pedidos según el rol', () => {
  it('la empleada pide desde su sucursal del día, sin poder cambiarla', async () => {
    abrirComo(sesionEmpleada);
    const origen = await screen.findByLabelText('Sucursal de origen');
    await within(origen).findByRole('option', { name: 'Estrada (VENTA)' });

    expect(origen).toBeDisabled();
    await waitFor(() => expect(origen).toHaveValue('2'));
    expect(screen.getByLabelText('Sucursal de destino')).not.toHaveValue('2');
    expect(await screen.findByText('1 pedido(s) de Estrada.')).toBeInTheDocument();
  });

  it('la empleada no ve los botones para cambiar el estado', async () => {
    abrirComo(sesionEmpleada);
    await screen.findByText('1 pedido(s) de Estrada.');
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar en preparación' })).not.toBeInTheDocument();
  });

  it('el chofer mueve los pedidos pero no los crea', async () => {
    abrirComo(sesionChofer);
    expect(
      await screen.findByRole('button', { name: 'Marcar en preparación' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nuevo pedido' })).not.toBeInTheDocument();
    expect(screen.getByText('1 pedido(s) en el sistema.')).toBeInTheDocument();
  });

  it('el admin elige cualquier origen', async () => {
    abrirComo(sesionAdmin);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Tablero de Pedidos' }));
    const origen = await screen.findByLabelText('Sucursal de origen');
    expect(origen).toBeEnabled();
  });
});
