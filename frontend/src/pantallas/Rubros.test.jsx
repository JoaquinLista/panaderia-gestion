import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';
import { apiFalsa, sucursales, sesionAdmin } from '../test/apiFalsa.js';

const rubro = (id, nombre, orden, extra = {}) => ({
  id,
  nombre,
  orden,
  activo: true,
  sucursal_origen_id: 1,
  sucursal_origen_nombre: 'Viedma (Chacra)',
  ...extra,
});

const RUBROS = [
  rubro(10, 'Pan', 10),
  rubro(20, 'Facturas', 20),
  rubro(110, 'Insumos', 30, { sucursal_origen_id: 5, sucursal_origen_nombre: 'Galpón Central' }),
  rubro(130, 'Prepizzas', 40, { activo: false }),
];

const abrir = async (rutas = {}) => {
  const fetchMock = apiFalsa({
    'GET /api/auth/me': () => [200, sesionAdmin],
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/pedidos/rubros?todos=1': () => [200, RUBROS],
    'POST /api/pedidos/rubros': () => [201, rubro(140, 'Tartas', 50)],
    'PUT /api/pedidos/rubros/10': () => [200, {}],
    'PUT /api/pedidos/rubros/20': () => [200, {}],
    'PUT /api/pedidos/rubros/110': () => [200, {}],
    'PUT /api/pedidos/rubros/130': () => [200, {}],
    ...rutas,
  });
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Rubros' }));
  await screen.findByText('Facturas');
  return { user, fetchMock };
};

const enviados = (fetchMock, metodo) =>
  fetchMock.mock.calls
    .filter(([, op]) => op?.method === metodo)
    .map(([url, op]) => [url, JSON.parse(op.body)]);

const fila = (nombre) => screen.getByText(nombre, { selector: 'strong' }).closest('li');

describe('Rubros: la dueña arma la lista', () => {
  it('muestra todos en orden, con de dónde sale cada uno y los desactivados', async () => {
    await abrir();
    const nombres = screen
      .getAllByRole('listitem')
      .map((li) => within(li).getByText(/./, { selector: 'strong' }).textContent);
    expect(nombres).toEqual(['Pan', 'Facturas', 'Insumos', 'Prepizzas']);
    expect(fila('Insumos')).toHaveTextContent('Sale de Galpón Central');
    expect(within(fila('Prepizzas')).getByText('Desactivado')).toBeInTheDocument();
  });

  it('para elegir de dónde sale ofrece sólo la fábrica y el galpón', async () => {
    await abrir();
    const opciones = within(screen.getByLabelText('¿De dónde sale?'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(opciones).toEqual(['Elegir…', 'Galpón Central', 'Viedma (Chacra)']);
  });

  it('agrega un rubro', async () => {
    const { user, fetchMock } = await abrir();
    await user.type(screen.getByLabelText('Nombre'), '  Tartas ');
    await user.selectOptions(screen.getByLabelText('¿De dónde sale?'), 'Viedma (Chacra)');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Agregaste Tartas. Ya lo pueden pedir las sucursales.'
    );
    expect(enviados(fetchMock, 'POST')).toEqual([
      ['/api/pedidos/rubros', { nombre: 'Tartas', sucursal_origen_id: 1 }],
    ]);
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
  });

  it('pide nombre y lugar antes de agregar', async () => {
    const { user, fetchMock } = await abrir();
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escribí el nombre y elegí de dónde sale.');
    expect(enviados(fetchMock, 'POST')).toEqual([]);
  });

  it('muestra el error del backend y no borra lo escrito', async () => {
    const { user } = await abrir({
      'POST /api/pedidos/rubros': () => [409, { error: 'Ya existe el rubro "Pan"' }],
    });
    await user.type(screen.getByLabelText('Nombre'), 'Pan');
    await user.selectOptions(screen.getByLabelText('¿De dónde sale?'), 'Viedma (Chacra)');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe el rubro "Pan"');
    expect(screen.getByLabelText('Nombre')).toHaveValue('Pan');
  });

  it('desactiva y activa', async () => {
    const { user, fetchMock } = await abrir();
    await user.click(screen.getByRole('button', { name: 'Desactivar Facturas' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Facturas ya no aparece para pedir.'
    );
    await user.click(screen.getByRole('button', { name: 'Activar Prepizzas' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Prepizzas se puede pedir de nuevo.'
    );
    expect(enviados(fetchMock, 'PUT')).toEqual([
      ['/api/pedidos/rubros/20', { activo: false }],
      ['/api/pedidos/rubros/130', { activo: true }],
    ]);
  });

  it('edita el nombre y de dónde sale; cancelar no manda nada', async () => {
    const { user, fetchMock } = await abrir();
    await user.click(screen.getByRole('button', { name: 'Editar Pan' }));
    let form = screen.getByRole('form', { name: 'Editar Pan' });
    await user.clear(within(form).getByLabelText('Nombre'));
    await user.type(within(form).getByLabelText('Nombre'), 'Otra cosa');
    await user.click(within(form).getByRole('button', { name: 'Cancelar' }));
    expect(enviados(fetchMock, 'PUT')).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Editar Pan' }));
    form = screen.getByRole('form', { name: 'Editar Pan' });
    expect(within(form).getByLabelText('Nombre')).toHaveValue('Pan');
    await user.clear(within(form).getByLabelText('Nombre'));
    await user.type(within(form).getByLabelText('Nombre'), 'Pan francés');
    await user.selectOptions(within(form).getByLabelText('¿De dónde sale?'), 'Galpón Central');
    await user.click(within(form).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Cambios guardados.');
    expect(enviados(fetchMock, 'PUT')).toEqual([
      ['/api/pedidos/rubros/10', { nombre: 'Pan francés', sucursal_origen_id: 5 }],
    ]);
  });

  it('si no se puede guardar la edición queda abierta con el error', async () => {
    const { user } = await abrir({
      'PUT /api/pedidos/rubros/10': () => [409, { error: 'Ya existe el rubro "Facturas"' }],
    });
    await user.click(screen.getByRole('button', { name: 'Editar Pan' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe el rubro "Facturas"');
    expect(screen.getByRole('form', { name: 'Editar Pan' })).toBeInTheDocument();
  });

  it('sube y baja rubros; el primero no sube y el último no baja', async () => {
    const { user, fetchMock } = await abrir();
    expect(screen.getByRole('button', { name: 'Subir Pan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bajar Prepizzas' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Subir Insumos' }));
    expect(enviados(fetchMock, 'PUT')).toEqual([
      ['/api/pedidos/rubros/110', { orden: 20 }],
      ['/api/pedidos/rubros/20', { orden: 30 }],
    ]);
  });

  it('si no carga la lista muestra el error', async () => {
    apiFalsa({
      'GET /api/auth/me': () => [200, sesionAdmin],
      'GET /api/sucursales': () => [200, sucursales],
      'GET /api/pedidos/rubros?todos=1': () => [500, { error: 'No se pudo leer' }],
    });
    render(<App />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Rubros' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo leer');
  });
});
