import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';
import { apiFalsa, sucursales, productos, sesionAdmin, sesionEmpleada } from '../test/apiFalsa.js';

// Lucía, con el permiso de cerrar caja que le dio la dueña.
const sesionLucia = {
  ...sesionEmpleada,
  usuario: { ...sesionEmpleada.usuario, puedeCerrarCaja: true },
  permisos: [...sesionEmpleada.permisos, 'caja:cerrar'],
};

const hoyEstrada = (extra = {}) => ({
  fecha: '2026-09-28',
  sucursal: { id: 2, nombre: 'Estrada' },
  cierres: [],
  turnos_pendientes: ['MEDIODIA', 'NOCHE'],
  cambio_sugerido: 20000,
  ...extra,
});

const cierreNoche = {
  id: 10,
  turno: 'NOCHE',
  total_controlador: 485300,
  diferencia: 0,
  cargado_por_nombre: 'Lucía',
};

const abrir = async ({ sesion = sesionLucia, rutas = {}, esperarHoy = true } = {}) => {
  const user = userEvent.setup();
  const fetchMock = apiFalsa({
    'GET /api/auth/me': () => [200, sesion],
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/productos': () => [200, productos],
    'GET /api/pedidos': () => [200, []],
    'GET /api/cierres/hoy': () => [200, hoyEstrada()],
    ...rutas,
  });
  render(<App />);
  await screen.findByRole('heading', { name: 'Cierre de caja' });
  // Espera a que llegue /cierres/hoy: la fecha aparece junto a la sucursal.
  if (esperarHoy) await screen.findByText(/ · hoy /);
  return { user, fetchMock };
};

const cuerpoDe = (fetchMock, metodo, url) => {
  const llamada = fetchMock.mock.calls.find(([u, o = {}]) => u === url && o.method === metodo);
  return llamada && JSON.parse(llamada[1].body);
};

const form = () => within(screen.getByRole('form', { name: 'Cierre de caja' }));

// Ejemplo del desglose: Estrada, noche.
const cargarEstrada = async (user, { total = '485.300' } = {}) => {
  await user.click(form().getByLabelText('Noche'));
  await user.type(form().getByLabelText('Total del controlador (Z)'), total);
  await user.type(form().getByLabelText('Efectivo contado en la caja'), '232.500');
  await user.type(form().getByLabelText('Posnet (débito y crédito)'), '168900');
  await user.type(form().getByLabelText('QR y transferencias'), '92400,00');
  await user.click(form().getByRole('button', { name: '+ Agregar gasto' }));
  await user.type(form().getByLabelText('Detalle del gasto 1'), 'Sodero');
  await user.type(form().getByLabelText('Monto del gasto 1'), '6.000');
  await user.click(form().getByRole('button', { name: '+ Agregar gasto' }));
  await user.type(form().getByLabelText('Detalle del gasto 2'), 'Bolsas');
  await user.type(form().getByLabelText('Monto del gasto 2'), '5500');
};

describe('cierre de caja: empleada con permiso', () => {
  it('es la primera pestaña y muestra su sucursal del día y la fecha', async () => {
    await abrir();
    expect(screen.getByText('Estrada · hoy 28/09')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sucursal')).not.toBeInTheDocument();
    expect(form().getByLabelText('Mediodía')).toBeChecked();
  });

  it('sugiere el cambio fijo del último cierre', async () => {
    await abrir();
    expect(form().getByLabelText('Cambio fijo que queda')).toHaveValue('20000');
    expect(form().getByText('Sugerido: el del último cierre.')).toBeInTheDocument();
  });

  it('muestra que cuadra mientras carga y envía los montos en pesos', async () => {
    const { user, fetchMock } = await abrir({
      rutas: { 'POST /api/cierres': () => [201, cierreNoche] },
    });
    await cargarEstrada(user);
    expect(screen.getByRole('status')).toHaveTextContent('Cuadra');

    await user.type(form().getByLabelText('Número de Z (opcional)'), '1532');
    await user.click(form().getByRole('button', { name: 'Enviar cierre de la noche' }));

    expect(await screen.findByText('Cierre de la noche enviado.')).toBeInTheDocument();
    expect(cuerpoDe(fetchMock, 'POST', '/api/cierres')).toEqual({
      turno: 'NOCHE',
      numero_z: '1532',
      total_controlador: '485300.00',
      efectivo_contado: '232500.00',
      cambio_fijo: '20000.00',
      posnet: '168900.00',
      transferencias: '92400.00',
      gastos: [
        { detalle: 'Sodero', monto: '6000.00' },
        { detalle: 'Bolsas', monto: '5500.00' },
      ],
      comentario: '',
    });
  });

  it('avisa cuánto falta y deja enviar igual', async () => {
    const { user } = await abrir();
    await cargarEstrada(user, { total: '487300' });
    const aviso = screen.getByRole('status');
    expect(aviso.textContent.replace(/\s/g, ' ')).toContain('Faltan $ 2.000,00');
    expect(aviso).toHaveTextContent('Se guarda igual y la dueña lo revisa');
    expect(form().getByRole('button', { name: 'Enviar cierre de la noche' })).toBeEnabled();
  });

  it('si sobra plata lo dice', async () => {
    const { user } = await abrir();
    await cargarEstrada(user, { total: '485000' });
    expect(screen.getByRole('status').textContent.replace(/\s/g, ' ')).toContain('Sobran $ 300,00');
  });

  it('marca un monto que no se entiende', async () => {
    const { user } = await abrir();
    await user.type(form().getByLabelText('Posnet (débito y crédito)'), '12,5,0');
    expect(form().getByLabelText('Posnet (débito y crédito)')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(form().getByText('No se entiende el monto. Ejemplo: 12.500,50')).toBeInTheDocument();
  });

  it('no envía si faltan datos', async () => {
    const { user, fetchMock } = await abrir();
    await user.click(form().getByRole('button', { name: 'Enviar cierre del mediodía' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Completá el total del controlador');
    expect(cuerpoDe(fetchMock, 'POST', '/api/cierres')).toBeUndefined();
  });

  it('un gasto sin detalle no deja enviar, y se puede quitar', async () => {
    const { user, fetchMock } = await abrir();
    await cargarEstrada(user);
    await user.clear(form().getByLabelText('Detalle del gasto 2'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(form().getByRole('button', { name: 'Enviar cierre de la noche' }));
    expect(cuerpoDe(fetchMock, 'POST', '/api/cierres')).toBeUndefined();

    await user.click(form().getByRole('button', { name: 'Quitar gasto 2' }));
    expect(form().queryByLabelText('Detalle del gasto 2')).not.toBeInTheDocument();
  });

  it('muestra el error de la API, por ejemplo si el turno ya se cargó', async () => {
    const { user } = await abrir({
      rutas: {
        'POST /api/cierres': () => [409, { error: 'Ya se cargó el cierre de la noche de hoy' }],
      },
    });
    await cargarEstrada(user);
    await user.click(form().getByRole('button', { name: 'Enviar cierre de la noche' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya se cargó el cierre');
  });

  it('con el mediodía cerrado sólo ofrece la noche y lista el cierre', async () => {
    await abrir({
      rutas: {
        'GET /api/cierres/hoy': () => [
          200,
          hoyEstrada({
            turnos_pendientes: ['NOCHE'],
            cierres: [{ ...cierreNoche, turno: 'MEDIODIA', diferencia: -2000 }],
          }),
        ],
      },
    });
    expect(form().queryByLabelText('Mediodía')).not.toBeInTheDocument();
    expect(form().getByLabelText('Noche')).toBeChecked();
    const lista = screen.getByRole('list', { name: 'Cierres de hoy' });
    expect(lista.textContent.replace(/\s/g, ' ')).toContain('FALTAN $ 2.000,00');
  });

  it('con los dos turnos cerrados no muestra el formulario', async () => {
    await abrir({
      rutas: {
        'GET /api/cierres/hoy': () => [
          200,
          hoyEstrada({ turnos_pendientes: [], cierres: [cierreNoche], cambio_sugerido: null }),
        ],
      },
    });
    expect(await screen.findByText('Ya se cerraron los dos turnos de hoy.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Cierre de caja' })).not.toBeInTheDocument();
    expect(screen.getByText('CUADRA')).toBeInTheDocument();
  });

  it('si falla la carga de hoy lo muestra', async () => {
    await abrir({
      esperarHoy: false,
      rutas: { 'GET /api/cierres/hoy': () => [500, { error: 'Base caída' }] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Base caída');
  });
});

describe('cierre de caja: la dueña', () => {
  it('elige la sucursal (sin el galpón) y la manda en el cierre', async () => {
    const { user, fetchMock } = await abrir({
      sesion: sesionAdmin,
      esperarHoy: false,
      rutas: {
        'GET /api/cierres/hoy?sucursal_id=3': () => [
          200,
          hoyEstrada({ sucursal: { id: 3, nombre: 'Café' }, cambio_sugerido: null }),
        ],
        'POST /api/cierres': () => [201, { ...cierreNoche, turno: 'MEDIODIA' }],
      },
    });
    const selector = screen.getByLabelText('Sucursal');
    await within(selector).findByRole('option', { name: 'Café' });
    expect(
      within(selector).queryByRole('option', { name: 'Galpón Central' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Cierre de caja' })).not.toBeInTheDocument();

    await user.selectOptions(selector, 'Café');
    expect(await screen.findByText('Café · hoy 28/09')).toBeInTheDocument();
    expect(form().getByLabelText('Cambio fijo que queda')).toHaveValue('');

    await user.type(form().getByLabelText('Total del controlador (Z)'), '1000');
    await user.type(form().getByLabelText('Efectivo contado en la caja'), '1500');
    await user.type(form().getByLabelText('Cambio fijo que queda'), '500');
    await user.click(form().getByRole('button', { name: 'Enviar cierre del mediodía' }));

    expect(await screen.findByText('Cierre del mediodía enviado.')).toBeInTheDocument();
    expect(cuerpoDe(fetchMock, 'POST', '/api/cierres')).toMatchObject({
      sucursal_id: 3,
      turno: 'MEDIODIA',
      numero_z: null,
      posnet: '0.00',
      gastos: [],
    });
  });
});
