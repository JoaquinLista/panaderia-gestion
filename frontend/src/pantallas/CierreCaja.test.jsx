import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';
import {
  apiFalsa,
  categorias,
  sucursales,
  productos,
  sesionAdmin,
  sesionEmpleada,
} from '../test/apiFalsa.js';

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
    'GET /api/cierres/categorias': () => [200, categorias],
    ...rutas,
  });
  render(<App />);
  // Los dueños arrancan en el resumen: se va a la pestaña del cierre.
  await user.click(await screen.findByRole('button', { name: 'Cierre de caja' }));
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
  await user.type(form().getByLabelText('Débito'), '100000');
  await user.type(form().getByLabelText('Crédito'), '68.900');
  await user.type(form().getByLabelText('QR'), '92400,00');
  await user.click(form().getByRole('button', { name: '+ Agregar gasto' }));
  await user.selectOptions(form().getByLabelText('Categoría del gasto 1'), 'Proveedores');
  await user.type(form().getByLabelText('Detalle del gasto 1'), 'Sodero');
  await user.type(form().getByLabelText('Monto del gasto 1'), '6.000');
  await user.click(form().getByRole('button', { name: '+ Agregar gasto' }));
  await user.selectOptions(form().getByLabelText('Categoría del gasto 2'), 'Varios');
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
    expect(form().getByLabelText('Cambio fijo que queda')).toHaveValue('20.000');
    expect(form().getByText('Sugerido: el del último cierre.')).toBeInTheDocument();
  });

  it('muestra que no hay diferencia mientras carga y envía los montos en pesos', async () => {
    const { user, fetchMock } = await abrir({
      rutas: { 'POST /api/cierres': () => [201, cierreNoche] },
    });
    await cargarEstrada(user);
    expect(screen.getByRole('status')).toHaveTextContent('Sin diferencia');

    await user.type(form().getByLabelText('Número de Z (opcional)'), '1532');
    await user.click(form().getByRole('button', { name: 'Enviar cierre de la noche' }));

    expect(await screen.findByText('Cierre de la noche enviado.')).toBeInTheDocument();
    expect(cuerpoDe(fetchMock, 'POST', '/api/cierres')).toEqual({
      turno: 'NOCHE',
      numero_z: '1532',
      total_controlador: '485300.00',
      efectivo_contado: '232500.00',
      cambio_fijo: '20000.00',
      debito: '100000.00',
      credito: '68900.00',
      qr: '92400.00',
      gastos: [
        { categoria_id: 6, detalle: 'Sodero', monto: '6000.00' },
        { categoria_id: 10, detalle: 'Bolsas', monto: '5500.00' },
      ],
      comentario: '',
    });
  });

  it('muestra la cuenta renglón por renglón: el cambio se resta del efectivo', async () => {
    const { user } = await abrir();
    await cargarEstrada(user);
    await user.click(screen.getByText('Ver la cuenta'));
    const renglones = Object.fromEntries(
      [...document.querySelectorAll('.cuenta-cierre dl > div')].map((d) => [
        d.querySelector('dt').textContent,
        d.querySelector('dd').textContent.replace(/\s/g, ' '),
      ])
    );
    expect(renglones).toEqual({
      'Efectivo contado': '$ 232.500,00',
      'Menos el cambio fijo': '$ 20.000,00',
      'Vendido en efectivo': '$ 212.500,00',
      Débito: '$ 100.000,00',
      Crédito: '$ 68.900,00',
      QR: '$ 92.400,00',
      'Gastos pagados con la caja': '$ 11.500,00',
      Total: '$ 485.300,00',
      'Total del controlador (Z)': '$ 485.300,00',
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

  it('pone los puntos de miles mientras se escribe y no pide transferencias', async () => {
    const { user } = await abrir();
    const debito = form().getByLabelText('Débito');
    await user.type(debito, '15456,599');
    expect(debito).toHaveValue('15.456,59');
    expect(debito).toHaveAttribute('aria-invalid', 'false');
    await user.click(form().getByRole('button', { name: '+ Agregar gasto' }));
    await user.type(form().getByLabelText('Monto del gasto 1'), '1500');
    expect(form().getByLabelText('Monto del gasto 1')).toHaveValue('1.500');
    expect(form().queryByLabelText(/transferencias/i)).not.toBeInTheDocument();
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

  it('cada gasto lleva una categoría, en el orden de la planilla', async () => {
    const { user, fetchMock } = await abrir();
    await cargarEstrada(user);
    const opciones = within(form().getByLabelText('Categoría del gasto 1')).getAllByRole('option');
    expect(opciones.map((o) => o.textContent)).toEqual([
      'Categoría…',
      'Personal',
      'Proveedores',
      'Varios',
    ]);

    await user.selectOptions(form().getByLabelText('Categoría del gasto 2'), '');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(form().getByRole('button', { name: 'Enviar cierre de la noche' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Cada gasto necesita categoría');
    expect(cuerpoDe(fetchMock, 'POST', '/api/cierres')).toBeUndefined();
  });

  it('si no se pueden traer las categorías lo muestra', async () => {
    await abrir({
      rutas: { 'GET /api/cierres/categorias': () => [500, { error: 'Sin categorías' }] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin categorías');
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
    expect(screen.getByText('SIN DIFERENCIA')).toBeInTheDocument();
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
      debito: '0.00',
      credito: '0.00',
      qr: '0.00',
      gastos: [],
    });
  });
});

describe('cierre de caja: borrador guardado en el celular', () => {
  const CLAVE = 'cierre-borrador:2:2:2026-09-28';
  const borradores = () =>
    Object.keys(localStorage).filter((k) => k.startsWith('cierre-borrador:'));
  const sinConexion = () => {
    throw new TypeError('Failed to fetch');
  };

  it('si se corta internet al enviar, lo cargado queda y vuelve al abrir otra vez', async () => {
    const { user } = await abrir({ rutas: { 'POST /api/cierres': sinConexion } });
    await cargarEstrada(user);
    await user.type(form().getByLabelText('Comentario (opcional)'), 'Todo bien');
    await user.click(form().getByRole('button', { name: 'Enviar cierre de la noche' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hay conexión. Lo que cargaste quedó guardado en este celular'
    );
    expect(borradores()).toEqual([CLAVE]);

    // Se cierra la pestaña y se vuelve a abrir.
    cleanup();
    await abrir();
    expect(
      screen.getByText('Recuperamos lo que habías cargado y todavía no se envió.')
    ).toBeInTheDocument();
    expect(form().getByLabelText('Noche')).toBeChecked();
    expect(form().getByLabelText('Total del controlador (Z)')).toHaveValue('485.300');
    expect(form().getByLabelText('Detalle del gasto 2')).toHaveValue('Bolsas');
    expect(form().getByLabelText('Comentario (opcional)')).toHaveValue('Todo bien');
  });

  it('al enviar bien se borra el borrador', async () => {
    const { user } = await abrir({
      rutas: { 'POST /api/cierres': () => [201, cierreNoche] },
    });
    await cargarEstrada(user);
    expect(borradores()).toEqual([CLAVE]);
    await user.click(form().getByRole('button', { name: 'Enviar cierre de la noche' }));
    expect(await screen.findByText('Cierre de la noche enviado.')).toBeInTheDocument();
    expect(borradores()).toEqual([]);
    expect(screen.queryByText(/Recuperamos/)).not.toBeInTheDocument();
  });

  it('con sólo el cambio sugerido no guarda nada', async () => {
    await abrir();
    expect(form().getByLabelText('Cambio fijo que queda')).toHaveValue('20.000');
    expect(borradores()).toEqual([]);
  });

  it('descarta el borrador de un turno que ya cerró otra persona y los de otros días', async () => {
    localStorage.setItem(
      CLAVE,
      JSON.stringify({ turno: 'MEDIODIA', datos: { totalControlador: '999' }, gastos: [] })
    );
    localStorage.setItem('cierre-borrador:2:2:2026-09-27', JSON.stringify({ turno: 'NOCHE' }));
    localStorage.setItem('otra-cosa', 'queda');
    await abrir({
      rutas: {
        'GET /api/cierres/hoy': () => [
          200,
          hoyEstrada({
            turnos_pendientes: ['NOCHE'],
            cierres: [{ ...cierreNoche, turno: 'MEDIODIA' }],
          }),
        ],
      },
    });
    expect(screen.queryByText(/Recuperamos/)).not.toBeInTheDocument();
    expect(form().getByLabelText('Total del controlador (Z)')).toHaveValue('');
    expect(borradores()).toEqual([]);
    expect(localStorage.getItem('otra-cosa')).toBe('queda');
  });

  it('si el celular no deja guardar, el cierre funciona igual', async () => {
    for (const metodo of ['getItem', 'setItem', 'removeItem', 'key']) {
      vi.spyOn(Storage.prototype, metodo).mockImplementation(() => {
        throw new Error('Sin permiso');
      });
    }
    const { user, fetchMock } = await abrir({
      rutas: { 'POST /api/cierres': () => [201, cierreNoche] },
    });
    await cargarEstrada(user);
    await user.click(form().getByRole('button', { name: 'Enviar cierre de la noche' }));
    expect(await screen.findByText('Cierre de la noche enviado.')).toBeInTheDocument();
    expect(cuerpoDe(fetchMock, 'POST', '/api/cierres')).toMatchObject({ turno: 'NOCHE' });
  });
});
