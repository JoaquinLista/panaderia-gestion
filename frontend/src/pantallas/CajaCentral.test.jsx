import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';
import { apiFalsa, categorias, productos, sesionAdmin, sucursales } from '../test/apiFalsa.js';

const DUENOS = [
  { id: 1, nombre: 'Fernanda' },
  { id: 2, nombre: 'Gabriel' },
  { id: 3, nombre: 'Mary' },
];

const entrada = {
  id: null,
  cierre_id: 20,
  fecha: '2026-09-29',
  tipo: 'RETIRO_SUCURSAL',
  cuenta: 'CAJA',
  monto: 98000.5,
  sucursal_id: 2,
  sucursal: 'Estrada',
  turno: 'MEDIODIA',
  saldo_caja: 1098000.5,
  saldo_banco: 500000,
};

const resumen = (extra = {}) => ({
  fecha: '2026-09-29',
  saldo_caja: 1098000.5,
  saldo_banco: 500000,
  saldo_inicial: {
    caja: { fecha: '2026-09-01', monto: 1000000 },
    banco: { fecha: '2026-09-01', monto: 500000 },
  },
  entradas: [entrada],
  total_entradas: 98000.5,
  movimientos: [],
  ...extra,
});

const movimientos = {
  desde: '2026-09-01',
  hasta: '2026-09-30',
  movimientos: [
    {
      id: 1,
      fecha: '2026-09-01',
      tipo: 'SALDO_INICIAL',
      cuenta: 'CAJA',
      monto: 1000000,
      concepto: null,
      saldo_caja: 1000000,
      saldo_banco: 0,
    },
    entrada,
    {
      id: 5,
      fecha: '2026-09-29',
      tipo: 'RETIRO_DUENO',
      cuenta: 'CAJA',
      monto: 100000,
      dueno_id: 1,
      dueno: 'Fernanda',
      concepto: null,
      saldo_caja: 998000.5,
      saldo_banco: 500000,
    },
  ],
};

const mensual = {
  mes: '2026-09',
  entradas_por_sucursal: [{ sucursal_id: 2, sucursal: 'Estrada', total: 98000.5 }],
  total_entradas: 98000.5,
  depositos: 800000,
  retiros_por_dueno: [
    { dueno_id: 1, dueno: 'Fernanda', total: 100000 },
    { dueno_id: 2, dueno: 'Gabriel', total: 0 },
  ],
  total_retiros_duenos: 100000,
  gastos_por_categoria: [
    { categoria_id: 6, categoria: 'Proveedores', en_sucursales: 0, en_caja_central: 300000 },
  ],
};

const MES = '/api/caja-central/movimientos?desde=2026-09-01&hasta=2026-09-30';

const abrir = async (rutas = {}) => {
  const user = userEvent.setup();
  const fetchMock = apiFalsa({
    'GET /api/auth/me': () => [200, sesionAdmin],
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/productos': () => [200, productos],
    'GET /api/cierres/categorias': () => [200, categorias],
    'GET /api/caja-central/duenos': () => [200, DUENOS],
    'GET /api/caja-central/resumen': () => [200, resumen()],
    [`GET ${MES}`]: () => [200, movimientos],
    'GET /api/caja-central/mensual?mes=2026-09': () => [200, mensual],
    ...rutas,
  });
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Caja central' }));
  return { user, fetchMock };
};

const llamadas = (fetchMock, metodo, url) =>
  fetchMock.mock.calls.filter(([u, o = {}]) => u === url && (o.method ?? 'GET') === metodo);
const cuerpo = (fetchMock, metodo, url) => JSON.parse(llamadas(fetchMock, metodo, url)[0][1].body);
const form = () => within(screen.getByRole('form', { name: 'Cargar movimiento' }));
const texto = (el) => el.textContent.replace(/\s/g, ' ');

describe('caja central: hoy', () => {
  it('muestra el saldo de cada cuenta y lo que entró de cada sucursal', async () => {
    await abrir();
    expect(await screen.findByRole('heading', { name: 'Hoy 29/09' })).toBeInTheDocument();
    expect(texto(screen.getByLabelText('Saldo de la caja central'))).toBe('$ 1.098.000,50');
    expect(texto(screen.getByLabelText('Saldo del banco'))).toBe('$ 500.000,00');
    const entradas = screen.getByRole('list', { name: 'Entradas de hoy' });
    expect(texto(entradas)).toContain('Estrada · Mediodía+ $ 98.000,50');
    expect(texto(entradas)).toContain('Total$ 98.000,50');
    expect(screen.queryByText(/Todavía no cargaste/)).not.toBeInTheDocument();
  });

  it('sin saldo inicial lo pide y el formulario arranca ahí', async () => {
    await abrir({
      'GET /api/caja-central/resumen': () => [
        200,
        resumen({ saldo_inicial: { caja: null, banco: null }, entradas: [], total_entradas: 0 }),
      ],
    });
    expect(await screen.findByText(/Todavía no cargaste con cuánto arranca/)).toBeInTheDocument();
    expect(screen.getByText('Todavía no entró nada hoy.')).toBeInTheDocument();
    expect(form().getByLabelText('Qué pasó')).toHaveValue('SALDO_INICIAL');
  });

  it('con los dos saldos iniciales cargados ya no los ofrece', async () => {
    await abrir();
    await screen.findByRole('form', { name: 'Cargar movimiento' });
    expect(
      within(form().getByLabelText('Qué pasó')).queryByRole('option', { name: 'Saldo inicial' })
    ).not.toBeInTheDocument();
    expect(form().getByLabelText('Qué pasó')).toHaveValue('DEPOSITO');
    expect(form().queryByLabelText('Sale de')).not.toBeInTheDocument();
  });

  it('si no puede cargar la caja central lo dice', async () => {
    await abrir({ 'GET /api/caja-central/resumen': () => [500, { error: 'Base caída' }] });
    expect(await screen.findByRole('alert')).toHaveTextContent('Base caída');
  });
});

describe('caja central: cargar un movimiento', () => {
  it('carga un pago desde el banco y recarga los saldos', async () => {
    const { user, fetchMock } = await abrir({
      'POST /api/caja-central/movimientos': () => [201, { id: 9 }],
    });
    await screen.findByRole('form', { name: 'Cargar movimiento' });
    await user.selectOptions(form().getByLabelText('Qué pasó'), 'Pago');
    await user.selectOptions(form().getByLabelText('Sale de'), 'Banco Patagonia');
    await user.selectOptions(form().getByLabelText('Categoría'), 'Proveedores');
    await user.type(form().getByLabelText('Monto'), '300000');
    expect(form().getByLabelText('Monto')).toHaveValue('300.000');
    await user.type(form().getByLabelText('Concepto'), 'Molino, harina');
    await user.click(form().getByRole('button', { name: 'Guardar movimiento' }));

    expect(await screen.findByText('Pago guardado.')).toBeInTheDocument();
    expect(cuerpo(fetchMock, 'POST', '/api/caja-central/movimientos')).toEqual({
      tipo: 'PAGO',
      cuenta: 'BANCO',
      fecha: '2026-09-29',
      monto: '300000.00',
      categoria_id: 6,
      concepto: 'Molino, harina',
    });
    expect(form().getByLabelText('Monto')).toHaveValue('');
    expect(llamadas(fetchMock, 'GET', '/api/caja-central/resumen').length).toBe(2);
    expect(llamadas(fetchMock, 'GET', MES).length).toBe(2);
  });

  it.each([
    ['Pago', [], 'Escribí el monto.'],
    ['Pago', [['Monto', '100']], 'Elegí la categoría del pago.'],
    ['Retiro de un dueño', [['Monto', '100']], 'Elegí quién se lleva la plata.'],
    ['Ajuste de arqueo', [['Monto', '100']], 'Escribí el motivo del ajuste.'],
  ])('%s sin completar: "%s"', async (tipo, campos, mensaje) => {
    const { user, fetchMock } = await abrir();
    await screen.findByRole('form', { name: 'Cargar movimiento' });
    await user.selectOptions(form().getByLabelText('Qué pasó'), tipo);
    for (const [label, valor] of campos) await user.type(form().getByLabelText(label), valor);
    await user.click(form().getByRole('button', { name: 'Guardar movimiento' }));
    expect(screen.getByRole('alert')).toHaveTextContent(mensaje);
    expect(llamadas(fetchMock, 'POST', '/api/caja-central/movimientos')).toHaveLength(0);
  });

  it('el pago sin concepto no se envía', async () => {
    const { user, fetchMock } = await abrir();
    await screen.findByRole('form', { name: 'Cargar movimiento' });
    await user.selectOptions(form().getByLabelText('Qué pasó'), 'Pago');
    await user.selectOptions(form().getByLabelText('Categoría'), 'Varios');
    await user.type(form().getByLabelText('Monto'), '100');
    await user.click(form().getByRole('button', { name: 'Guardar movimiento' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribí en qué se pagó.');
    expect(llamadas(fetchMock, 'POST', '/api/caja-central/movimientos')).toHaveLength(0);
  });

  it('un ajuste porque faltaba plata va con el monto negativo', async () => {
    const { user, fetchMock } = await abrir({
      'POST /api/caja-central/movimientos': () => [201, { id: 9 }],
    });
    await screen.findByRole('form', { name: 'Cargar movimiento' });
    await user.selectOptions(form().getByLabelText('Qué pasó'), 'Ajuste de arqueo');
    expect(form().getByLabelText('En el arqueo')).toHaveValue('FALTA');
    await user.type(form().getByLabelText('Monto'), '500,50');
    await user.type(form().getByLabelText('Motivo'), 'Arqueo del viernes');
    fireEvent.change(form().getByLabelText('Fecha'), { target: { value: '2026-09-26' } });
    await user.click(form().getByRole('button', { name: 'Guardar movimiento' }));
    await screen.findByText('Ajuste de arqueo guardado.');
    expect(cuerpo(fetchMock, 'POST', '/api/caja-central/movimientos')).toMatchObject({
      tipo: 'AJUSTE',
      cuenta: 'CAJA',
      fecha: '2026-09-26',
      monto: '-500.50',
    });
  });

  it('un ajuste porque sobraba plata va positivo', async () => {
    const { user, fetchMock } = await abrir({
      'POST /api/caja-central/movimientos': () => [201, { id: 9 }],
    });
    await screen.findByRole('form', { name: 'Cargar movimiento' });
    await user.selectOptions(form().getByLabelText('Qué pasó'), 'Ajuste de arqueo');
    await user.selectOptions(form().getByLabelText('En el arqueo'), 'Sobraba plata');
    await user.type(form().getByLabelText('Monto'), '200');
    await user.type(form().getByLabelText('Motivo'), 'Arqueo');
    await user.click(form().getByRole('button', { name: 'Guardar movimiento' }));
    await screen.findByText('Ajuste de arqueo guardado.');
    expect(cuerpo(fetchMock, 'POST', '/api/caja-central/movimientos').monto).toBe('200.00');
  });

  it('el retiro de un dueño manda quién se la lleva; el depósito no pide cuenta', async () => {
    const { user, fetchMock } = await abrir({
      'POST /api/caja-central/movimientos': () => [201, { id: 9 }],
    });
    await screen.findByRole('form', { name: 'Cargar movimiento' });
    await user.type(form().getByLabelText('Monto'), '800000');
    await user.click(form().getByRole('button', { name: 'Guardar movimiento' }));
    await screen.findByText('Depósito al banco guardado.');
    expect(cuerpo(fetchMock, 'POST', '/api/caja-central/movimientos')).toEqual({
      tipo: 'DEPOSITO',
      fecha: '2026-09-29',
      monto: '800000.00',
      concepto: null,
    });

    await user.selectOptions(form().getByLabelText('Qué pasó'), 'Retiro de un dueño');
    await user.selectOptions(form().getByLabelText('Quién se la lleva'), 'Gabriel');
    await user.type(form().getByLabelText('Monto'), '50000');
    await user.click(form().getByRole('button', { name: 'Guardar movimiento' }));
    await screen.findByText('Retiro de un dueño guardado.');
    const [, segunda] = llamadas(fetchMock, 'POST', '/api/caja-central/movimientos');
    expect(JSON.parse(segunda[1].body)).toMatchObject({
      tipo: 'RETIRO_DUENO',
      cuenta: 'CAJA',
      dueno_id: 2,
    });
  });

  it('el saldo inicial, una vez cargado, deja el formulario en depósito', async () => {
    const { user, fetchMock } = await abrir({
      'GET /api/caja-central/resumen': () => [
        200,
        resumen({ saldo_inicial: { caja: null, banco: null } }),
      ],
      'POST /api/caja-central/movimientos': () => [201, { id: 9 }],
    });
    await screen.findByRole('form', { name: 'Cargar movimiento' });
    expect(form().getByLabelText('Cuenta')).toHaveValue('CAJA');
    await user.type(form().getByLabelText('Monto'), '1.000.000');
    await user.type(form().getByLabelText('Concepto (opcional)'), 'Lo que había');
    await user.click(form().getByRole('button', { name: 'Guardar movimiento' }));
    await screen.findByText('Saldo inicial guardado.');
    expect(cuerpo(fetchMock, 'POST', '/api/caja-central/movimientos')).toMatchObject({
      tipo: 'SALDO_INICIAL',
      monto: '1000000.00',
      concepto: 'Lo que había',
    });
    expect(form().getByLabelText('Qué pasó')).toHaveValue('DEPOSITO');
  });

  it('muestra el error de la API', async () => {
    const { user } = await abrir({
      'POST /api/caja-central/movimientos': () => [
        400,
        { error: 'La fecha es anterior al saldo inicial de la caja central (01/09)' },
      ],
    });
    await screen.findByRole('form', { name: 'Cargar movimiento' });
    await user.type(form().getByLabelText('Monto'), '100');
    await user.click(form().getByRole('button', { name: 'Guardar movimiento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('anterior al saldo inicial');
  });
});

describe('caja central: movimientos y resumen del mes', () => {
  it('lista el mes con lo más nuevo arriba y el saldo de la caja', async () => {
    await abrir();
    const lista = await screen.findByRole('list', { name: 'Movimientos del mes' });
    const filas = within(lista).getAllByRole('listitem').map(texto);
    expect(filas[0]).toContain('Retiro de Fernanda− $ 100.000,00');
    expect(filas[0]).toContain('29/09 · Caja central · caja $ 998.000,50');
    expect(filas[1]).toContain('Estrada · Mediodía+ $ 98.000,50');
    expect(filas[2]).toContain('Saldo inicial+ $ 1.000.000,00');
    // Lo que entra de una sucursal sale del cierre: no se anula acá.
    expect(within(lista).getAllByRole('button', { name: /^Anular/ })).toHaveLength(2);
  });

  it('muestra el depósito como un pase de la caja al banco', async () => {
    await abrir({
      [`GET ${MES}`]: () => [
        200,
        {
          movimientos: [
            {
              id: 7,
              fecha: '2026-09-02',
              tipo: 'DEPOSITO',
              cuenta: 'CAJA',
              monto: 800000,
              concepto: null,
              saldo_caja: 0,
            },
          ],
        },
      ],
    });
    const lista = await screen.findByRole('list', { name: 'Movimientos del mes' });
    expect(texto(lista)).toContain('Depósito al banco$ 800.000,00');
    expect(texto(lista)).toContain('Caja central → Banco Patagonia');
  });

  it('filtra por dueño y por categoría', async () => {
    const { user, fetchMock } = await abrir({
      [`GET ${MES}&dueno_id=1`]: () => [200, { movimientos: [] }],
      [`GET ${MES}&dueno_id=1&categoria_id=6`]: () => [200, { movimientos: [] }],
    });
    await screen.findByRole('list', { name: 'Movimientos del mes' });
    await user.selectOptions(screen.getByLabelText('Dueño'), 'Fernanda');
    expect(
      await screen.findByText('No hay movimientos en septiembre de 2026.')
    ).toBeInTheDocument();
    expect(llamadas(fetchMock, 'GET', `${MES}&dueno_id=1`)).toHaveLength(1);
    await user.selectOptions(
      screen.getByLabelText('Categoría', { selector: '#filtro-categoria' }),
      'Proveedores'
    );
    await screen.findByText('No hay movimientos en septiembre de 2026.');
  });

  it('anula un movimiento después de confirmar', async () => {
    const { user, fetchMock } = await abrir({
      'DELETE /api/caja-central/movimientos/5': () => [200, { id: 5, anulado: true }],
    });
    const lista = await screen.findByRole('list', { name: 'Movimientos del mes' });
    await user.click(within(lista).getByRole('button', { name: 'Anular Retiro de Fernanda' }));
    await user.click(within(lista).getByRole('button', { name: 'No' }));
    expect(llamadas(fetchMock, 'DELETE', '/api/caja-central/movimientos/5')).toHaveLength(0);

    await user.click(within(lista).getByRole('button', { name: 'Anular Retiro de Fernanda' }));
    expect(within(lista).getByText(/¿Anular este movimiento\?/)).toBeInTheDocument();
    await user.click(within(lista).getByRole('button', { name: 'Sí, anular' }));
    await screen.findByRole('button', { name: 'Anular Retiro de Fernanda' });
    expect(llamadas(fetchMock, 'DELETE', '/api/caja-central/movimientos/5')).toHaveLength(1);
    expect(llamadas(fetchMock, 'GET', '/api/caja-central/resumen').length).toBe(2);
  });

  it('si no se puede anular lo dice', async () => {
    const { user } = await abrir({
      'DELETE /api/caja-central/movimientos/5': () => [409, { error: 'Ya estaba anulado' }],
    });
    const lista = await screen.findByRole('list', { name: 'Movimientos del mes' });
    await user.click(within(lista).getByRole('button', { name: 'Anular Retiro de Fernanda' }));
    await user.click(within(lista).getByRole('button', { name: 'Sí, anular' }));
    expect(await screen.findByText('Ya estaba anulado')).toBeInTheDocument();
  });

  it('si no puede traer los movimientos lo dice', async () => {
    await abrir({ [`GET ${MES}`]: () => [500, { error: 'Sin movimientos' }] });
    expect(await screen.findByText('Sin movimientos')).toBeInTheDocument();
  });

  it('cambia de mes', async () => {
    const { fetchMock } = await abrir({
      'GET /api/caja-central/movimientos?desde=2026-08-01&hasta=2026-08-31': () => [
        200,
        { movimientos: [] },
      ],
      'GET /api/caja-central/mensual?mes=2026-08': () => [
        200,
        { ...mensual, entradas_por_sucursal: [], gastos_por_categoria: [] },
      ],
    });
    await screen.findByRole('list', { name: 'Movimientos del mes' });
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2026-08' } });
    expect(await screen.findByText('No hay movimientos en agosto de 2026.')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Resumen de agosto de 2026' })
    ).toBeInTheDocument();
    expect(screen.getByText('Sin gastos este mes.')).toBeInTheDocument();
    // Borrar el mes no deja la pantalla sin mes.
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '' } });
    expect(screen.getByLabelText('Mes')).toHaveValue('2026-08');
    expect(llamadas(fetchMock, 'GET', '/api/caja-central/mensual?mes=2026-08')).toHaveLength(1);
  });

  it('el resumen del mes suma por sucursal, dueño y categoría', async () => {
    await abrir();
    expect(
      await screen.findByRole('heading', { name: 'Resumen de septiembre de 2026' })
    ).toBeInTheDocument();
    expect(texto(screen.getByRole('list', { name: 'Entradas del mes por sucursal' }))).toContain(
      'Estrada$ 98.000,50'
    );
    expect(texto(screen.getByRole('list', { name: 'Retiros del mes por dueño' }))).toContain(
      'Fernanda$ 100.000,00Gabriel$ 0,00'
    );
    expect(texto(screen.getByText('Depositado en el banco').parentElement)).toContain(
      '$ 800.000,00'
    );
    const tabla = screen.getByRole('table', { name: 'Gastos del mes por categoría' });
    expect(texto(tabla)).toContain('Proveedores$ 0,00$ 300.000,00');
  });

  it('si no puede traer el resumen del mes lo dice', async () => {
    await abrir({
      'GET /api/caja-central/mensual?mes=2026-09': () => [500, { error: 'Sin resumen' }],
    });
    expect(await screen.findByText('Sin resumen')).toBeInTheDocument();
  });

  it('si no puede traer los dueños lo dice', async () => {
    await abrir({ 'GET /api/caja-central/duenos': () => [500, { error: 'Sin dueños' }] });
    expect(await screen.findByText('Sin dueños')).toBeInTheDocument();
  });

  it('descarga el Excel del mes', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:planilla');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { user, fetchMock } = await abrir({
      'GET /api/caja-central/excel?mes=2026-09': () => [200, 'xlsx'],
    });
    await user.click(await screen.findByRole('button', { name: 'Descargar Excel del mes' }));
    expect(llamadas(fetchMock, 'GET', '/api/caja-central/excel?mes=2026-09')).toHaveLength(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('si no se puede descargar el Excel lo dice', async () => {
    const { user } = await abrir({
      'GET /api/caja-central/excel?mes=2026-09': () => [500, { error: 'Sin planilla' }],
    });
    await user.click(await screen.findByRole('button', { name: 'Descargar Excel del mes' }));
    expect(await screen.findByText('Sin planilla')).toBeInTheDocument();
  });
});
