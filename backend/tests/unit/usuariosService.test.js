import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/db.js', () => ({ query: vi.fn() }));

const { query } = await import('../../src/config/db.js');
const { listarUsuarios, crearUsuario, actualizarUsuario, resetearPassword } =
  await import('../../src/services/usuariosService.js');

const fila = (extra = {}) => ({
  id: 2,
  usuario: 'lucia',
  nombre: 'Lucía',
  rol: 'EMPLEADA',
  puede_cerrar_caja: false,
  activo: true,
  ...extra,
});

const COMO_ADMIN = { idSesion: 1 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listarUsuarios', () => {
  it('devuelve los usuarios sin el hash de la contraseña', async () => {
    query.mockResolvedValue({ rows: [fila({ password_hash: 'scrypt$...' })] });
    expect(await listarUsuarios()).toEqual([
      {
        id: 2,
        usuario: 'lucia',
        nombre: 'Lucía',
        rol: 'EMPLEADA',
        puedeCerrarCaja: false,
        activo: true,
      },
    ]);
  });
});

describe('crearUsuario', () => {
  const datos = { usuario: ' lucia ', nombre: ' Lucía ', password: 'clave-larga', rol: 'EMPLEADA' };

  it('guarda el hash, limpia espacios y devuelve el usuario', async () => {
    query.mockResolvedValue({ rows: [fila()] });
    const creado = await crearUsuario({ ...datos, puedeCerrarCaja: true });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(lower\(usuario\)\) DO NOTHING/);
    expect(params[0]).toBe('lucia');
    expect(params[1]).toBe('Lucía');
    expect(params[2]).toMatch(/^scrypt\$/);
    expect(params[4]).toBe(true);
    expect(creado.usuario).toBe('lucia');
  });

  it('el permiso de caja no se guarda para un chofer', async () => {
    query.mockResolvedValue({ rows: [fila({ rol: 'CHOFER' })] });
    await crearUsuario({ ...datos, rol: 'CHOFER', puedeCerrarCaja: true });
    expect(query.mock.calls[0][1][4]).toBe(false);
  });

  it('responde 409 si el usuario ya existe', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(crearUsuario(datos)).rejects.toMatchObject({ status: 409 });
  });

  it.each([
    ['usuario corto', { usuario: 'ab' }, /entre 3 y 60/],
    ['usuario con espacios', { usuario: 'lu cia' }, /sin espacios/],
    ['sin nombre', { nombre: '  ' }, /nombre es obligatorio/],
    ['contraseña corta', { password: '1234' }, /al menos 8/],
    ['rol inexistente', { rol: 'GALPON' }, /Rol inválido/],
  ])('rechaza %s', async (_caso, cambio, mensaje) => {
    await expect(crearUsuario({ ...datos, ...cambio })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(mensaje),
    });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('actualizarUsuario', () => {
  it('cambia rol y permiso de caja y devuelve el usuario', async () => {
    query
      .mockResolvedValueOnce({ rows: [fila({ rol: 'CHOFER' })] })
      .mockResolvedValueOnce({ rows: [fila({ puede_cerrar_caja: true })] });
    const usuario = await actualizarUsuario(
      2,
      { rol: 'EMPLEADA', puedeCerrarCaja: true },
      COMO_ADMIN
    );
    const params = query.mock.calls[1][1];
    expect(params.slice(0, 6)).toEqual([2, 'Lucía', 'EMPLEADA', true, true, false]);
    expect(usuario.puedeCerrarCaja).toBe(true);
  });

  it('desactivar corta las sesiones abiertas', async () => {
    query
      .mockResolvedValueOnce({ rows: [fila()] })
      .mockResolvedValueOnce({ rows: [fila({ activo: false })] });
    await actualizarUsuario(2, { activo: false }, COMO_ADMIN);
    const params = query.mock.calls[1][1];
    expect(params[4]).toBe(false);
    expect(params[5]).toBe(true);
    expect(params[6]).toBeInstanceOf(Date);
  });

  it('responde 404 si no existe', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(actualizarUsuario(99, {}, COMO_ADMIN)).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ['desactivarse', { activo: false }],
    ['quitarse el rol de admin', { rol: 'EMPLEADA' }],
  ])('un admin no puede %s a sí mismo', async (_caso, cambios) => {
    query.mockResolvedValueOnce({ rows: [fila({ id: 1, rol: 'ADMIN' })] });
    await expect(actualizarUsuario(1, cambios, COMO_ADMIN)).rejects.toMatchObject({
      status: 400,
      message: 'No podés cambiar tu propio rol ni desactivar tu propio usuario',
    });
  });

  it('rechaza valores inválidos', async () => {
    query.mockResolvedValue({ rows: [fila()] });
    await expect(actualizarUsuario(2, { activo: 'no' }, COMO_ADMIN)).rejects.toMatchObject({
      status: 400,
    });
    await expect(actualizarUsuario(2, { rol: 'JEFE' }, COMO_ADMIN)).rejects.toMatchObject({
      status: 400,
    });
    await expect(actualizarUsuario(2, { nombre: '' }, COMO_ADMIN)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('resetearPassword', () => {
  it('guarda el hash nuevo y corta las sesiones', async () => {
    query.mockResolvedValue({ rowCount: 1 });
    await resetearPassword(2, 'clave-nueva-123');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/sesiones_desde = \$3/);
    expect(params[1]).toMatch(/^scrypt\$/);
    expect(params[2]).toBeInstanceOf(Date);
  });

  it('responde 404 si no existe', async () => {
    query.mockResolvedValue({ rowCount: 0 });
    await expect(resetearPassword(99, 'clave-nueva-123')).rejects.toMatchObject({ status: 404 });
  });

  it('no acepta una contraseña corta', async () => {
    await expect(resetearPassword(2, 'corta')).rejects.toMatchObject({ status: 400 });
    await expect(resetearPassword(2, undefined)).rejects.toMatchObject({ status: 400 });
  });
});
