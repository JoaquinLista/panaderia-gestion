import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';
import {
  apiFalsa,
  sucursales,
  sesionAdmin,
  sesionEmpleada,
  sesionChofer,
} from '../test/apiFalsa.js';

const pedido = {
  id: 7,
  estado: 'PENDIENTE',
  urgente: false,
  sucursal_origen_id: 1,
  sucursal_destino_id: 2,
  sucursal_origen_nombre: 'Viedma (Chacra)',
  sucursal_destino_nombre: 'Estrada',
  fecha_creacion: '2026-09-28T08:00:00',
  items: [],
};

const abrirComo = (sesion) => {
  apiFalsa({
    'GET /api/auth/me': () => [200, sesion],
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/pedidos': () => [200, [pedido]],
    'GET /api/pedidos/rubros': () => [200, []],
    'GET /api/pedidos/recorrido': () => [200, { cargar: [], paradas: [] }],
  });
  render(<App />);
};

const pestañas = async () => {
  const nav = await screen.findByRole('navigation', { name: 'Secciones' });
  return (
    within(nav)
      .getAllByRole('button')
      // Sin el ícono de adelante, que es decorativo.
      .map((b) => b.textContent.replace(b.querySelector('.menu-icono').textContent, ''))
  );
};

describe('pestañas según el rol', () => {
  it.each([
    [
      'admin',
      sesionAdmin,
      [
        'Resumen',
        'Cierre de caja',
        'Revisión de cierres',
        'Caja central',
        'Recorrido',
        'Pedidos',
        'Rubros',
        'Stock e insumos',
        'Sucursales',
        'Usuarios',
        'Reportar un problema',
      ],
    ],
    ['empleada', sesionEmpleada, ['Pedidos', 'Sucursales', 'Reportar un problema']],
    [
      'chofer',
      sesionChofer,
      ['Recorrido', 'Pedidos', 'Stock e insumos', 'Sucursales', 'Reportar un problema'],
    ],
  ])('%s ve sólo sus pestañas', async (_rol, sesion, esperadas) => {
    abrirComo(sesion);
    expect(await pestañas()).toEqual(esperadas);
  });
});

describe('menú de secciones', () => {
  it.each([
    ['admin', sesionAdmin, ['Plata', 'Panaderías', 'Equipo']],
    ['empleada', sesionEmpleada, ['Panaderías']],
  ])('%s ve las secciones agrupadas y sin grupos vacíos', async (_rol, sesion, grupos) => {
    abrirComo(sesion);
    const nav = await screen.findByRole('navigation', { name: 'Secciones' });
    expect(
      within(nav)
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-labelledby'))
    ).toHaveLength(grupos.length);
    for (const g of grupos) expect(within(nav).getByRole('group', { name: g })).toBeInTheDocument();
  });

  it('el botón del menú dice en qué sección estás y se cierra al elegir otra', async () => {
    const user = userEvent.setup();
    abrirComo(sesionChofer);
    const abrir = await screen.findByRole('button', { name: 'Menú · Recorrido' });
    expect(abrir).toHaveAttribute('aria-expanded', 'false');

    await user.click(abrir);
    expect(abrir).toHaveAttribute('aria-expanded', 'true');
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    expect(nav).toHaveClass('abierto');
    expect(within(nav).getByRole('button', { name: 'Recorrido' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    await user.click(within(nav).getByRole('button', { name: 'Sucursales' }));
    expect(screen.getByRole('button', { name: 'Menú · Sucursales' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(nav).not.toHaveClass('abierto');
    expect(within(nav).getByRole('button', { name: 'Sucursales' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});

describe('reportar un problema', () => {
  it('se abre desde el menú y al cancelar vuelve a la sección en la que estabas', async () => {
    const user = userEvent.setup();
    abrirComo(sesionChofer);
    await user.click(await screen.findByRole('button', { name: 'Menú · Recorrido' }));
    const nav = screen.getByRole('navigation', { name: 'Secciones' });
    await user.click(within(nav).getByRole('button', { name: 'Reportar un problema' }));

    expect(screen.getByRole('form', { name: 'Reportar un problema' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menú · Reportar un problema' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Reportar un problema' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(nav).getByRole('button', { name: 'Recorrido' })).not.toHaveAttribute(
      'aria-current'
    );

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('form', { name: 'Reportar un problema' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menú · Recorrido' })).toBeInTheDocument();
  });
});

describe('pedidos según el rol', () => {
  it('la empleada pide para su sucursal del día, sin poder cambiarla', async () => {
    abrirComo(sesionEmpleada);
    expect(await screen.findByText('Pedido de Estrada.')).toBeInTheDocument();
    expect(screen.queryByLabelText('¿Para qué sucursal?')).not.toBeInTheDocument();
  });

  it('la empleada no ve los botones del reparto', async () => {
    abrirComo(sesionEmpleada);
    expect(await screen.findByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salió' })).not.toBeInTheDocument();
  });

  it('el chofer arranca en su recorrido', async () => {
    abrirComo(sesionChofer);
    expect(await screen.findByRole('heading', { name: 'Para cargar' })).toBeInTheDocument();
  });

  it('el chofer mueve los pedidos pero no los crea', async () => {
    abrirComo(sesionChofer);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Pedidos' }));
    expect(await screen.findByRole('button', { name: 'Salió' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pedir mercadería' })).not.toBeInTheDocument();
  });

  it('el admin elige para qué sucursal pide', async () => {
    abrirComo(sesionAdmin);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Pedidos' }));
    expect(await screen.findByLabelText('¿Para qué sucursal?')).toBeEnabled();
  });
});
