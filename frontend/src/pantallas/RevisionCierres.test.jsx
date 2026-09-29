import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';
import { apiFalsa, sucursales, productos, sesionAdmin } from '../test/apiFalsa.js';

const cierre = (extra = {}) => ({
  id: 10,
  sucursal_id: 2,
  sucursal_nombre: 'Estrada',
  fecha: '2026-09-28',
  turno: 'NOCHE',
  numero_z: 1532,
  total_controlador: 205350,
  efectivo_contado: 113000,
  cambio_fijo: 15000,
  posnet: 74250,
  transferencias: 31100,
  diferencia: -2000,
  comentario: 'Faltó cargar un gasto',
  cargado_por_nombre: 'Lucía',
  revisado_en: null,
  revisado_por_nombre: null,
  a_revisar: true,
  gastos: [{ id: 1, detalle: 'Sodero', monto: 6000 }],
  correcciones: [],
  ...extra,
});

const pendientes = {
  fecha: '2026-09-28',
  sucursales: [
    { id: 1, nombre: 'Viedma (Chacra)', turnos_pendientes: ['MEDIODIA', 'NOCHE'] },
    { id: 2, nombre: 'Estrada', turnos_pendientes: [] },
    { id: 3, nombre: 'Café', turnos_pendientes: ['NOCHE'] },
  ],
};

const abrir = async (rutas = {}) => {
  const user = userEvent.setup();
  const fetchMock = apiFalsa({
    'GET /api/auth/me': () => [200, sesionAdmin],
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/productos': () => [200, productos],
    'GET /api/cierres/pendientes': () => [200, pendientes],
    'GET /api/cierres': () => [
      200,
      [
        cierre(),
        cierre({ id: 11, turno: 'MEDIODIA', diferencia: 0, a_revisar: false, comentario: null }),
      ],
    ],
    'GET /api/cierres/10': () => [200, cierre()],
    ...rutas,
  });
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Revisión de cierres' }));
  await screen.findByRole('list', { name: 'Cierres' });
  return { user, fetchMock };
};

const llamadas = (fetchMock, metodo, url) =>
  fetchMock.mock.calls.filter(([u, o = {}]) => u === url && (o.method ?? 'GET') === metodo);
const lista = () => within(screen.getByRole('list', { name: 'Cierres' }));
const corregir = () => within(screen.getByRole('form', { name: 'Corregir cierre' }));

describe('revisión de cierres: lista', () => {
  it('muestra qué sucursales no cerraron hoy', async () => {
    await abrir();
    const faltan = screen.getByRole('list', { name: 'Cierres que faltan hoy' });
    expect(faltan).toHaveTextContent('Viedma (Chacra)falta mediodía y noche');
    expect(faltan).toHaveTextContent('Caféfalta noche');
    expect(faltan).not.toHaveTextContent('Estrada');
  });

  it('si todas cerraron lo dice', async () => {
    await abrir({
      'GET /api/cierres/pendientes': () => [
        200,
        { ...pendientes, sucursales: [{ id: 2, nombre: 'Estrada', turnos_pendientes: [] }] },
      ],
    });
    expect(screen.getByText('Todas las sucursales cargaron los dos cierres.')).toBeInTheDocument();
  });

  it('marca los que hay que revisar con la diferencia y el comentario', async () => {
    await abrir();
    const fila = lista().getByRole('button', { name: '28/09 · Estrada · Noche' }).closest('li');
    expect(within(fila).getByText('A REVISAR')).toBeInTheDocument();
    expect(fila.textContent.replace(/\s/g, ' ')).toContain('FALTAN $ 2.000,00');
    expect(within(fila).getByText('“Faltó cargar un gasto”')).toBeInTheDocument();
    const otra = lista().getByRole('button', { name: '28/09 · Estrada · Mediodía' }).closest('li');
    expect(within(otra).getByText('SIN DIFERENCIA')).toBeInTheDocument();
  });

  it('filtra por sucursal, fechas y "a revisar"', async () => {
    const { user, fetchMock } = await abrir({
      'GET /api/cierres?sucursal_id=3&desde=2026-09-01&hasta=2026-09-30&a_revisar=true': () => [
        200,
        [],
      ],
    });
    await user.selectOptions(screen.getByLabelText('Sucursal'), 'Café');
    await user.type(screen.getByLabelText('Desde'), '2026-09-01');
    await user.type(screen.getByLabelText('Hasta'), '2026-09-30');
    await user.click(screen.getByLabelText('Sólo los que hay que revisar'));
    expect(await screen.findByText('No hay cierres con estos filtros.')).toBeInTheDocument();
    expect(
      llamadas(
        fetchMock,
        'GET',
        '/api/cierres?sucursal_id=3&desde=2026-09-01&hasta=2026-09-30&a_revisar=true'
      )
    ).toHaveLength(1);
    expect(
      within(screen.getByLabelText('Sucursal')).queryByRole('option', { name: 'Galpón Central' })
    ).not.toBeInTheDocument();
  });

  it('muestra el error si no puede cargar', async () => {
    const user = userEvent.setup();
    apiFalsa({
      'GET /api/sucursales': () => [200, sucursales],
      'GET /api/productos': () => [200, productos],
      'GET /api/cierres/pendientes': () => [500, { error: 'Base caída' }],
      'GET /api/cierres': () => [200, []],
    });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Revisión de cierres' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Base caída');
  });
});

describe('revisión de cierres: detalle', () => {
  const abrirDetalle = async (rutas = {}) => {
    const r = await abrir(rutas);
    await r.user.click(lista().getByRole('button', { name: '28/09 · Estrada · Noche' }));
    await screen.findByRole('form', { name: 'Corregir cierre' });
    return r;
  };

  it('muestra los datos cargados y la diferencia', async () => {
    await abrirDetalle();
    expect(screen.getByRole('heading', { name: 'Estrada · 28/09 · Noche' })).toBeInTheDocument();
    expect(corregir().getByLabelText('Total del controlador (Z)')).toHaveValue('205.350');
    expect(corregir().getByLabelText('Detalle del gasto 1')).toHaveValue('Sodero');
    expect(screen.getByRole('status').textContent.replace(/\s/g, ' ')).toContain(
      'Sobran $ 4.000,00'
    );
    expect(screen.getByText('Sin correcciones.')).toBeInTheDocument();
  });

  it('corrige el cierre y muestra el historial', async () => {
    const corregido = cierre({
      total_controlador: 209350,
      diferencia: 0,
      a_revisar: false,
      correcciones: [
        {
          id: 1,
          campo: 'total_controlador',
          valor_anterior: '205350.00',
          valor_nuevo: '209350.00',
          usuario_nombre: 'Marta',
          creado_en: '2026-09-29T00:30:00Z',
        },
      ],
    });
    const { user, fetchMock } = await abrirDetalle({
      'PUT /api/cierres/10': () => [200, corregido],
    });
    const total = corregir().getByLabelText('Total del controlador (Z)');
    await user.clear(total);
    await user.type(total, '209.350');
    expect(screen.getByRole('status')).toHaveTextContent('Sin diferencia');
    await user.click(corregir().getByRole('button', { name: 'Guardar corrección' }));

    expect(await screen.findByText('Corrección guardada.')).toBeInTheDocument();
    const [, opciones] = llamadas(fetchMock, 'PUT', '/api/cierres/10')[0];
    expect(JSON.parse(opciones.body)).toMatchObject({
      fecha: '2026-09-28',
      turno: 'NOCHE',
      numero_z: '1532',
      total_controlador: '209350.00',
      gastos: [{ detalle: 'Sodero', monto: '6000.00' }],
    });
    // Las transferencias de un cierre viejo cuentan en la diferencia pero no se reenvían.
    expect(JSON.parse(opciones.body)).not.toHaveProperty('transferencias');
    const historial = screen.getByRole('list', { name: 'Historial de correcciones' });
    expect(historial.textContent.replace(/\s/g, ' ')).toContain(
      'Total del controlador (Z): $ 205.350,00 → $ 209.350,00'
    );
    expect(historial).toHaveTextContent('Marta');
    // se recargó la lista
    expect(llamadas(fetchMock, 'GET', '/api/cierres').length).toBeGreaterThan(1);
  });

  it('no guarda con un monto vacío', async () => {
    const { user, fetchMock } = await abrirDetalle();
    await user.clear(corregir().getByLabelText('Posnet (débito, crédito y QR)'));
    await user.click(corregir().getByRole('button', { name: 'Guardar corrección' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Revisá los montos');
    expect(llamadas(fetchMock, 'PUT', '/api/cierres/10')).toHaveLength(0);
  });

  it('agrega y quita gastos', async () => {
    const { user } = await abrirDetalle();
    await user.click(corregir().getByRole('button', { name: '+ Agregar gasto' }));
    expect(corregir().getByLabelText('Detalle del gasto 2')).toHaveValue('');
    await user.click(corregir().getByRole('button', { name: 'Quitar gasto 1' }));
    await user.click(corregir().getByRole('button', { name: 'Quitar gasto 1' }));
    expect(corregir().getByText('Sin gastos.')).toBeInTheDocument();
  });

  it('muestra el error de la API al corregir', async () => {
    const { user } = await abrirDetalle({
      'PUT /api/cierres/10': () => [409, { error: 'Ya hay un cierre de esa sucursal' }],
    });
    await user.selectOptions(corregir().getByLabelText('Turno'), 'Mediodía');
    await user.click(corregir().getByRole('button', { name: 'Guardar corrección' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya hay un cierre');
  });

  it('marca revisado y se puede deshacer', async () => {
    const revisado = cierre({
      a_revisar: false,
      revisado_en: '2026-09-29T00:40:00Z',
      revisado_por_nombre: 'Marta',
    });
    let actual = cierre();
    const { user, fetchMock } = await abrirDetalle({
      'PUT /api/cierres/10/revisado': (body) => {
        actual = body.revisado ? revisado : cierre();
        return [200, actual];
      },
    });
    await user.click(screen.getByRole('button', { name: 'Marcar revisado' }));
    expect(await screen.findByText('Marcado como revisado.')).toBeInTheDocument();
    expect(screen.getByText(/revisado por Marta/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Volver a dejar a revisar' }));
    expect(await screen.findByText('Vuelve a estar a revisar.')).toBeInTheDocument();
    expect(llamadas(fetchMock, 'PUT', '/api/cierres/10/revisado')).toHaveLength(2);
  });

  it('vuelve a la lista', async () => {
    const { user } = await abrirDetalle();
    await user.click(screen.getByRole('button', { name: '← Volver a la lista' }));
    expect(await screen.findByRole('list', { name: 'Cierres' })).toBeInTheDocument();
  });

  it('si el cierre no se puede abrir, lo dice', async () => {
    const { user } = await abrir({
      'GET /api/cierres/10': () => [404, { error: 'No existe ese cierre' }],
    });
    await user.click(lista().getByRole('button', { name: '28/09 · Estrada · Noche' }));
    expect(await screen.findByText('No existe ese cierre')).toBeInTheDocument();
  });
});
