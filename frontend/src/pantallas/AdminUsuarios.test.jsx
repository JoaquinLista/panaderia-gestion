import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App.jsx';
import { apiFalsa, sucursales, productos } from '../test/apiFalsa.js';

const usuarios = () => [
  { id: 1, usuario: 'dueña', nombre: 'Marta', rol: 'ADMIN', puedeCerrarCaja: false, activo: true },
  {
    id: 2,
    usuario: 'lucia',
    nombre: 'Lucía',
    rol: 'EMPLEADA',
    puedeCerrarCaja: false,
    activo: true,
  },
  {
    id: 3,
    usuario: 'marcos',
    nombre: 'Marcos',
    rol: 'CHOFER',
    puedeCerrarCaja: false,
    activo: false,
  },
];

const abrirUsuarios = async (rutasExtra = {}) => {
  const user = userEvent.setup();
  const fetchMock = apiFalsa({
    'GET /api/sucursales': () => [200, sucursales],
    'GET /api/productos': () => [200, productos],
    'GET /api/pedidos': () => [200, []],
    'GET /api/usuarios': () => [200, usuarios()],
    ...rutasExtra,
  });
  render(<App />);
  await user.click(await screen.findByRole('button', { name: 'Usuarios' }));
  await screen.findByText('3 usuario(s).');
  return { user, fetchMock };
};

const cuerpoDe = (fetchMock, metodo, url) => {
  const llamada = fetchMock.mock.calls.find(([u, o = {}]) => u === url && o.method === metodo);
  return llamada && JSON.parse(llamada[1].body);
};

const filaDe = (nombre) =>
  within(screen.getByRole('list', { name: 'Usuarios' }))
    .getByText(nombre)
    .closest('li');
const formulario = () => within(screen.getByRole('form', { name: 'Nuevo usuario' }));

describe('administración de usuarios', () => {
  it('lista los usuarios y marca los desactivados', async () => {
    await abrirUsuarios();
    expect(within(filaDe('Marcos')).getByText('DESACTIVADO')).toBeInTheDocument();
    expect(within(filaDe('Lucía')).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
  });

  it('la dueña no puede cambiarse el rol ni desactivarse', async () => {
    await abrirUsuarios();
    const yo = filaDe('Marta');
    expect(within(yo).getByLabelText('Rol de Marta')).toBeDisabled();
    expect(within(yo).queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
  });

  it('crea una empleada con permiso de caja', async () => {
    const { user, fetchMock } = await abrirUsuarios({
      'POST /api/usuarios': () => [201, { id: 4 }],
    });
    await user.type(formulario().getByLabelText('Usuario'), 'sofi');
    await user.type(formulario().getByLabelText('Nombre'), 'Sofía');
    await user.type(formulario().getByLabelText('Contraseña inicial'), 'clave-de-sofi');
    await user.click(formulario().getByLabelText('Puede cerrar la caja'));
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByText('Usuario "sofi" creado.')).toBeInTheDocument();
    expect(cuerpoDe(fetchMock, 'POST', '/api/usuarios')).toEqual({
      usuario: 'sofi',
      nombre: 'Sofía',
      password: 'clave-de-sofi',
      rol: 'EMPLEADA',
      puedeCerrarCaja: true,
    });
    expect(formulario().getByLabelText('Usuario')).toHaveValue('');
  });

  it('el permiso de caja sólo se ofrece para empleadas', async () => {
    const { user } = await abrirUsuarios();
    await user.selectOptions(formulario().getByLabelText('Rol'), 'CHOFER');
    expect(formulario().queryByLabelText('Puede cerrar la caja')).not.toBeInTheDocument();
  });

  it('muestra el error del backend al crear', async () => {
    const { user } = await abrirUsuarios({
      'POST /api/usuarios': () => [409, { error: 'Ya existe un usuario con ese nombre' }],
    });
    await user.type(formulario().getByLabelText('Usuario'), 'lucia');
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un usuario con ese nombre'
    );
    expect(formulario().getByLabelText('Usuario')).toHaveValue('lucia');
  });

  it('cambia el rol, el permiso de caja y el estado', async () => {
    const { user, fetchMock } = await abrirUsuarios({
      'PATCH /api/usuarios/2': () => [200, {}],
      'PATCH /api/usuarios/3': () => [200, {}],
    });
    await user.click(within(filaDe('Lucía')).getByLabelText('Puede cerrar la caja'));
    expect(await screen.findByText('Permiso de caja de Lucía actualizado.')).toBeInTheDocument();
    expect(cuerpoDe(fetchMock, 'PATCH', '/api/usuarios/2')).toEqual({ puedeCerrarCaja: true });

    await user.click(within(filaDe('Marcos')).getByRole('button', { name: 'Activar' }));
    expect(await screen.findByText('Marcos puede volver a entrar.')).toBeInTheDocument();

    await user.selectOptions(within(filaDe('Lucía')).getByLabelText('Rol de Lucía'), 'CHOFER');
    expect(await screen.findByText('Rol de Lucía actualizado.')).toBeInTheDocument();
  });

  it('desactiva a alguien', async () => {
    const { user } = await abrirUsuarios({ 'PATCH /api/usuarios/2': () => [200, {}] });
    await user.click(within(filaDe('Lucía')).getByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByText('Lucía ya no puede entrar.')).toBeInTheDocument();
  });

  it('cambia la contraseña de alguien que se la olvidó', async () => {
    const { user, fetchMock } = await abrirUsuarios({
      'PUT /api/usuarios/2/password': () => [204, undefined],
    });
    await user.click(within(filaDe('Lucía')).getByRole('button', { name: 'Cambiar contraseña' }));
    await user.type(screen.getByLabelText('Contraseña nueva para Lucía'), 'nueva-clave-1');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    expect(
      await screen.findByText('Contraseña de Lucía cambiada. Sus sesiones abiertas se cerraron.')
    ).toBeInTheDocument();
    expect(cuerpoDe(fetchMock, 'PUT', '/api/usuarios/2/password')).toEqual({
      password: 'nueva-clave-1',
    });
    expect(screen.queryByLabelText('Contraseña nueva para Lucía')).not.toBeInTheDocument();
  });

  it('si la contraseña no sirve, el formulario queda abierto con el error', async () => {
    const { user } = await abrirUsuarios({
      'PUT /api/usuarios/2/password': () => [
        400,
        { error: 'La contraseña tiene que tener al menos 8 caracteres' },
      ],
    });
    await user.click(within(filaDe('Lucía')).getByRole('button', { name: 'Cambiar contraseña' }));
    await user.type(screen.getByLabelText('Contraseña nueva para Lucía'), '123');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/al menos 8/);
    expect(screen.getByLabelText('Contraseña nueva para Lucía')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Contraseña nueva para Lucía')).not.toBeInTheDocument();
  });

  it('muestra el error si no se puede cargar la lista', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    apiFalsa({
      'GET /api/sucursales': () => [200, sucursales],
      'GET /api/productos': () => [200, productos],
      'GET /api/pedidos': () => [200, []],
      'GET /api/usuarios': () => [500, { error: 'base caída' }],
    });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Usuarios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('base caída');
  });
});
