import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';
import { apiFalsa, sucursales, productos, sesionAdmin, sesionEmpleada } from '../test/apiFalsa.js';

const SIN_SESION = () => [401, { error: 'Tu sesión venció o no iniciaste sesión' }];

/** Abre la app sin sesión. `login` decide qué responde el backend al entrar. */
const abrirSinSesion = (login = () => [200, sesionAdmin], rutasExtra = {}) => {
  const user = userEvent.setup();
  const fetchMock = apiFalsa({
    'GET /api/auth/me': SIN_SESION,
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/productos': () => [200, productos],
    'GET /api/pedidos': () => [200, []],
    'POST /api/auth/login': login,
    ...rutasExtra,
  });
  render(<App />);
  return { user, fetchMock };
};

const llamadasA = (fetchMock, metodo, url) =>
  fetchMock.mock.calls.filter(([u, o = {}]) => u === url && (o.method ?? 'GET') === metodo);

const bodyDelLogin = (fetchMock) =>
  JSON.parse(llamadasA(fetchMock, 'POST', '/api/auth/login')[0][1].body);

describe('pantalla de login', () => {
  it('sin sesión muestra el login y no el panel', async () => {
    abrirSinSesion();
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pedidos' })).not.toBeInTheDocument();
  });

  it('mientras consulta la sesión muestra "Cargando…"', () => {
    abrirSinSesion();
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });

  it('ofrece las sucursales para trabajar, pero no el galpón', async () => {
    abrirSinSesion();
    const select = await screen.findByLabelText('¿Dónde trabajás hoy?');
    await within(select).findByRole('option', { name: 'Estrada' });
    const opciones = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(opciones).toEqual(['No aplica (dueños y chofer)', 'Viedma (Chacra)', 'Estrada', 'Café']);
  });

  it('la dueña entra sin elegir sucursal y ve su nombre', async () => {
    const { user, fetchMock } = abrirSinSesion();
    await user.type(await screen.findByLabelText('Usuario'), '  dueña ');
    await user.type(screen.getByLabelText('Contraseña'), 'clave-segura');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('button', { name: 'Pedidos' })).toBeInTheDocument();
    expect(screen.getByText('Marta')).toBeInTheDocument();
    expect(screen.getByText('Administración')).toBeInTheDocument();
    expect(bodyDelLogin(fetchMock)).toEqual({ usuario: 'dueña', password: 'clave-segura' });
  });

  it('la empleada entra con la sucursal del día', async () => {
    const { user, fetchMock } = abrirSinSesion(() => [200, sesionEmpleada]);
    await user.type(await screen.findByLabelText('Usuario'), 'lucia');
    await user.type(screen.getByLabelText('Contraseña'), 'clave-de-lucia');
    const select = screen.getByLabelText('¿Dónde trabajás hoy?');
    await within(select).findByRole('option', { name: 'Estrada' });
    await user.selectOptions(select, 'Estrada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Lucía')).toBeInTheDocument();
    expect(bodyDelLogin(fetchMock)).toEqual({
      usuario: 'lucia',
      password: 'clave-de-lucia',
      sucursalId: 2,
    });
  });

  it('con datos incorrectos muestra el error del backend y deja volver a intentar', async () => {
    const { user } = abrirSinSesion(() => [401, { error: 'Usuario o contraseña incorrectos' }]);
    await user.type(await screen.findByLabelText('Usuario'), 'dueña');
    await user.type(screen.getByLabelText('Contraseña'), 'otra');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('pide usuario y contraseña antes de llamar al backend', async () => {
    const { user, fetchMock } = abrirSinSesion();
    await user.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Ingresá tu usuario y contraseña');
    expect(llamadasA(fetchMock, 'POST', '/api/auth/login')).toHaveLength(0);
  });

  it('si no cargan las sucursales igual se puede entrar', async () => {
    const { user } = abrirSinSesion(undefined, { 'GET /api/sucursales': () => [500, {}] });
    await user.type(await screen.findByLabelText('Usuario'), 'dueña');
    await user.type(screen.getByLabelText('Contraseña'), 'clave-segura');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Marta')).toBeInTheDocument();
  });
});

describe('sesión abierta', () => {
  it('con una sesión de antes entra directo al panel', async () => {
    apiFalsa({
      'GET /api/sucursales': () => [200, sucursales],
      'GET /api/productos': () => [200, productos],
      'GET /api/pedidos': () => [200, []],
    });
    render(<App />);
    expect(await screen.findByText('Marta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('cerrar sesión avisa al backend y vuelve al login', async () => {
    const user = userEvent.setup();
    const fetchMock = apiFalsa({
      'GET /api/sucursales': () => [200, sucursales],
      'GET /api/productos': () => [200, productos],
      'GET /api/pedidos': () => [200, []],
      'POST /api/auth/logout': () => [204, undefined],
    });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(llamadasA(fetchMock, 'POST', '/api/auth/logout')).toHaveLength(1);
  });

  it('si la API responde 401 en medio del uso, vuelve al login', async () => {
    // Lo primero que pide el panel son las sucursales, y la API dice que la sesión venció.
    apiFalsa({ 'GET /api/sucursales': SIN_SESION });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });
});
