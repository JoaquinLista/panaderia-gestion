import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';
import { apiFalsa, productos, sesionAdmin, sucursales } from '../test/apiFalsa.js';

const fila = (id, nombre, vendido, cargados) => ({
  sucursal_id: id,
  sucursal: nombre,
  vendido,
  efectivo: vendido / 2,
  debito: vendido / 2,
  credito: 0,
  qr: 0,
  gastos: 0,
  diferencia: 0,
  turnos_cargados: cargados,
  turnos_pendientes: ['MEDIODIA', 'NOCHE'].filter((t) => !cargados.includes(t)),
});

const dia = (extra = {}) => ({
  fecha: '2026-09-29',
  es_hoy: true,
  total: {
    vendido: 150000.5,
    efectivo: 90000.5,
    debito: 40000,
    credito: 15000,
    qr: 5000,
    gastos: 0,
  },
  sucursales: [fila(3, 'Café', 0, []), fila(2, 'Estrada', 150000.5, ['MEDIODIA'])],
  turnos_pendientes: 3,
  ...extra,
});

const mes = (extra = {}) => ({
  mes: '2026-09',
  desde: '2026-09-01',
  hasta: '2026-09-29',
  en_curso: true,
  ventas: 3000000,
  medios: { efectivo: 2000000, debito: 800000, credito: 150000, qr: 50000 },
  gastos: { sucursales: 100000, caja_central: 300000, obra: 50000, total: 450000 },
  retiros_duenos: 500000,
  resultado: 2050000,
  retiros_por_dueno: [{ dueno_id: 1, dueno: 'Fernanda', total: 500000 }],
  ventas_por_sucursal: [
    { sucursal_id: 3, sucursal: 'Café', vendido: 1000000, cierres: 50, turnos_sin_cargar: 8 },
    { sucursal_id: 2, sucursal: 'Estrada', vendido: 2000000, cierres: 58, turnos_sin_cargar: 0 },
  ],
  ventas_por_dia: Array.from({ length: 29 }, (_, i) => ({
    fecha: `2026-09-${String(i + 1).padStart(2, '0')}`,
    vendido: 100000,
    por_sucursal: {},
  })),
  anterior: { mes: '2026-08', desde: '2026-08-01', hasta: '2026-08-29', ventas: 2500000 },
  variacion: { ventas: 20, gastos: 12.5, retiros_duenos: null, resultado: -3 },
  ...extra,
});

const abrir = async (rutas = {}) => {
  const user = userEvent.setup();
  const fetchMock = apiFalsa({
    'GET /api/auth/me': () => [200, sesionAdmin],
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/productos': () => [200, productos],
    'GET /api/dashboard/dia?fecha=2026-09-29': () => [200, dia()],
    'GET /api/dashboard/mes?mes=2026-09': () => [200, mes()],
    ...rutas,
  });
  render(<App />);
  await screen.findByRole('heading', { name: 'Hoy 29/09' });
  return { user, fetchMock };
};

const texto = (el) => el.textContent.replace(/\s/g, ' ');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 29/09/2026 a las 15 h de Argentina.
  vi.setSystemTime(new Date('2026-09-29T18:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resumen: hoy', () => {
  it('los dueños arrancan acá: lo vendido en la red y por medio de pago', async () => {
    await abrir();
    expect(screen.getByRole('button', { name: 'Resumen' })).toBeInTheDocument();
    expect(texto(screen.getByLabelText('Vendido en el día'))).toBe('$ 150.000,50');
    const hoy = screen.getByRole('region', { name: 'Hoy 29/09' });
    expect(texto(hoy)).toContain('Efectivo$ 90.000,50');
    expect(texto(hoy)).toContain('QR$ 5.000,00');
  });

  it('marca los cierres que faltan y las sucursales sin ninguno', async () => {
    await abrir();
    const aviso = screen.getByRole('status');
    expect(texto(aviso)).toContain('Faltan 3 cierresEl de la noche se carga a las 21.');
    expect(texto(aviso)).toContain('Café: mediodía y noche');
    expect(texto(aviso)).toContain('Estrada: noche');
    const porSucursal = screen.getByRole('list', { name: 'Vendido por sucursal' });
    const [cafe, estrada] = within(porSucursal).getAllByRole('listitem');
    expect(texto(cafe)).toContain('Cafésin cierres');
    expect(within(cafe).getByText('sin cierres')).toHaveClass('pill-danger');
    expect(within(estrada).getByText('falta 1 cierre')).toHaveClass('pill-warn');
  });

  it('con todos los cierres cargados lo dice en verde', async () => {
    await abrir({
      'GET /api/dashboard/dia?fecha=2026-09-29': () => [
        200,
        dia({
          sucursales: [fila(2, 'Estrada', 150000.5, ['MEDIODIA', 'NOCHE'])],
          turnos_pendientes: 0,
        }),
      ],
    });
    const estado = screen.getByRole('status');
    expect(estado).toHaveClass('estado-ok');
    expect(texto(estado)).toBe('Están todos los cierres cargados');
    const porSucursal = screen.getByRole('list', { name: 'Vendido por sucursal' });
    expect(within(porSucursal).getByText('completo')).toHaveClass('pill-ok');
  });

  it('otro día: sin la aclaración de la noche', async () => {
    await abrir({
      'GET /api/dashboard/dia?fecha=2026-09-28': () => [
        200,
        dia({
          fecha: '2026-09-28',
          es_hoy: false,
          sucursales: [fila(2, 'Estrada', 1000, ['MEDIODIA'])],
          turnos_pendientes: 1,
        }),
      ],
    });
    const selector = screen.getByLabelText('Ver otro día');
    fireEvent.change(selector, { target: { value: '2026-09-28' } });
    expect(await screen.findByRole('heading', { name: 'El 28/09' })).toBeInTheDocument();
    expect(texto(screen.getByRole('status'))).toBe('Falta 1 cierreEstrada: noche');
  });

  it('muestra el error de la API', async () => {
    await abrir({
      'GET /api/dashboard/mes?mes=2026-09': () => [500, { error: 'Se cayó la base' }],
    });
    expect(await screen.findByText('Se cayó la base')).toBeInTheDocument();
  });
});

describe('resumen: el mes', () => {
  it('acumulado, resultado y comparación con los mismos días del mes anterior', async () => {
    await abrir();
    const region = await screen.findByRole('region', { name: 'septiembre de 2026' });
    expect(texto(region)).toContain('Del 1 al 29, comparado con los mismos días de agosto.');
    expect(texto(within(region).getByLabelText('Ventas'))).toBe('$ 3.000.000,00');
    expect(texto(within(region).getByLabelText('Resultado'))).toBe('$ 2.050.000,00');
    // Ventas que suben: bien. Gastos que suben: mal. Resultado que baja: mal.
    const indicadores = within(region).getAllByText(/Subió|Bajó|sin datos/);
    expect(indicadores.map((i) => [texto(i), i.className])).toEqual([
      ['Subió 20 % vs. agosto', 'variacion variacion-bien'],
      ['Subió 12,5 % vs. agosto', 'variacion variacion-mal'],
      ['sin datos para comparar', 'variacion variacion-sin-datos'],
      ['Bajó 3 % vs. agosto', 'variacion variacion-mal'],
    ]);
  });

  it('ventas por sucursal con los cierres que faltan, gastos y retiros', async () => {
    await abrir();
    await screen.findByRole('region', { name: 'septiembre de 2026' });
    const sucursales = screen.getByRole('list', { name: 'Ventas del mes por sucursal' });
    expect(texto(sucursales)).toContain('Café8 sin cierre$ 1.000.000,00');
    expect(texto(screen.getByRole('list', { name: 'Gastos del mes' }))).toContain(
      'Obra$ 50.000,00'
    );
    expect(texto(screen.getByRole('list', { name: 'Retiros de los dueños' }))).toContain(
      'Fernanda$ 500.000,00'
    );
    expect(screen.getByRole('img', { name: 'Ventas de cada día del mes' }).children).toHaveLength(
      29
    );
  });

  it('un mes terminado se compara entero', async () => {
    await abrir({
      'GET /api/dashboard/mes?mes=2026-08': () => [
        200,
        mes({
          mes: '2026-08',
          hasta: '2026-08-31',
          en_curso: false,
          retiros_por_dueno: [],
          anterior: { mes: '2026-07' },
        }),
      ],
    });
    await screen.findByRole('region', { name: 'septiembre de 2026' });
    const selector = screen.getByLabelText('Ver otro mes');
    fireEvent.change(selector, { target: { value: '2026-08' } });
    const region = await screen.findByRole('region', { name: 'agosto de 2026' });
    expect(texto(region)).toContain('Mes completo, comparado con julio completo.');
    expect(screen.queryByRole('list', { name: 'Retiros de los dueños' })).not.toBeInTheDocument();
  });

  it('descarga el Excel del mes', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:planilla');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { user, fetchMock } = await abrir({
      'GET /api/dashboard/excel?mes=2026-09': () => [200, 'xlsx'],
    });
    await user.click(await screen.findByRole('button', { name: 'Descargar Excel del mes' }));
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toContain('/api/dashboard/excel?mes=2026-09');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('si no se puede descargar el Excel lo dice', async () => {
    const { user } = await abrir({
      'GET /api/dashboard/excel?mes=2026-09': () => [500, { error: 'Sin planilla' }],
    });
    await user.click(await screen.findByRole('button', { name: 'Descargar Excel del mes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin planilla');
  });
});
