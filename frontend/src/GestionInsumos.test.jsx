import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import { apiFalsa, sucursales, productos } from './test/apiFalsa.js';

const insumos = [
  {
    id: 1,
    nombre: 'Harina 000',
    stock_actual: '150.00',
    stock_minimo: '200.00',
    unidad_medida: 'kg',
    bajo_stock: true,
  },
  {
    id: 2,
    nombre: 'Manteca',
    stock_actual: '80.00',
    stock_minimo: '40.00',
    unidad_medida: 'kg',
    bajo_stock: false,
  },
];

const abrirInsumos = async (rutasExtra = {}) => {
  const user = userEvent.setup();
  const fetchMock = apiFalsa({
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/productos': () => [200, productos],
    'GET /api/pedidos': () => [200, []],
    'GET /api/insumos': () => [200, insumos],
    ...rutasExtra,
  });
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Stock e insumos' }));
  return { user, fetchMock };
};

describe('Stock e insumos', () => {
  it('avisa qué insumos están por debajo del mínimo', async () => {
    await abrirInsumos();
    expect(
      await screen.findByText(/1 insumo\(s\) por debajo del stock mínimo: Harina 000/)
    ).toBeInTheDocument();
    expect(screen.getByText('BAJO STOCK')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('muestra un mensaje si no hay insumos', async () => {
    await abrirInsumos({ 'GET /api/insumos': () => [200, []] });
    expect(await screen.findByText('No hay insumos cargados.')).toBeInTheDocument();
  });

  it('al editar, completa el formulario con los datos del insumo', async () => {
    const { user } = await abrirInsumos();
    const [editarHarina] = await screen.findAllByRole('button', { name: 'Editar' });
    await user.click(editarHarina);
    expect(screen.getByLabelText('Nombre')).toHaveValue('Harina 000');
    expect(screen.getByLabelText('Stock actual')).toHaveValue(150);
    expect(screen.getByLabelText('Stock mínimo')).toHaveValue(200);

    await user.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
  });

  it('valida el nombre antes de enviar', async () => {
    const { user } = await abrirInsumos();
    await user.type(screen.getByLabelText('Nombre'), '   ');
    await user.type(screen.getByLabelText('Stock actual'), '5');
    await user.click(screen.getByRole('button', { name: 'Guardar insumo' }));
    expect(screen.getByText('El nombre del insumo es obligatorio.')).toBeInTheDocument();
  });

  it('guarda un insumo nuevo y recarga la lista', async () => {
    const { user, fetchMock } = await abrirInsumos({ 'POST /api/insumos': () => [201, { id: 3 }] });
    await user.type(screen.getByLabelText('Nombre'), 'Levadura');
    await user.type(screen.getByLabelText('Stock actual'), '12');
    await user.type(screen.getByLabelText('Stock mínimo'), '15');
    await user.click(screen.getByRole('button', { name: 'Guardar insumo' }));

    expect(await screen.findByText('Insumo guardado correctamente.')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({
      nombre: 'Levadura',
      stock_actual: 12,
      stock_minimo: 15,
      unidad_medida: 'kg',
    });
  });

  it('muestra el error del backend al guardar', async () => {
    const { user } = await abrirInsumos({
      'POST /api/insumos': () => [400, { error: 'El campo "stock_actual" no puede ser negativo' }],
    });
    await user.type(screen.getByLabelText('Nombre'), 'Sal');
    await user.type(screen.getByLabelText('Stock actual'), '1');
    await user.click(screen.getByRole('button', { name: 'Guardar insumo' }));
    expect(await screen.findByText(/no puede ser negativo/)).toBeInTheDocument();
  });
});

describe('Red de sucursales', () => {
  it('agrupa las sucursales por tipo', async () => {
    const user = userEvent.setup();
    apiFalsa({
      'GET /api/sucursales': () => [200, sucursales],
      'GET /api/productos': () => [200, productos],
      'GET /api/pedidos': () => [200, []],
    });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Sucursales' }));
    await screen.findByRole('heading', { name: 'Viedma (Chacra)' });

    expect(screen.getByText('Nodos totales', { selector: 'p' }).previousSibling).toHaveTextContent(
      '4'
    );
    expect(
      screen.getByText('Puntos de venta', { selector: 'p' }).previousSibling
    ).toHaveTextContent('2');
    expect(screen.getByRole('heading', { name: 'Viedma (Chacra)' })).toBeInTheDocument();
  });
});
