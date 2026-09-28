import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

import { crearUsuarios, responderConsultas, PASSWORD } from '../helpers/baseFalsa.js';

vi.mock('../../src/config/db.js', () => ({ query: vi.fn() }));

const { query } = await import('../../src/config/db.js');
const { autenticar, firmarSesion, sesionDesdeToken, asegurarAdminInicial, MENSAJE_CREDENCIALES } =
  await import('../../src/services/authService.js');

const SECRETO = process.env.JWT_SECRET;
let usuarios;

beforeAll(async () => {
  usuarios = await crearUsuarios();
});

beforeEach(() => {
  vi.clearAllMocks();
  query.mockImplementation(responderConsultas({ usuarios }));
});

describe('autenticar', () => {
  it('el usuario no distingue mayúsculas ni espacios alrededor', async () => {
    const sesion = await autenticar({ usuario: '  MARCOS ', password: PASSWORD });
    expect(sesion.usuario).toMatchObject({ id: 3, rol: 'CHOFER' });
  });

  it('ignora la sucursal si no es empleada', async () => {
    const sesion = await autenticar({ usuario: 'dueña', password: PASSWORD, sucursalId: 3 });
    expect(sesion.sucursal).toBeNull();
  });

  it('la sesión nunca incluye el hash de la contraseña', async () => {
    const sesion = await autenticar({ usuario: 'dueña', password: PASSWORD });
    expect(JSON.stringify(sesion)).not.toContain('scrypt');
  });

  it('verifica la contraseña aunque el usuario no exista (mismo tiempo de respuesta)', async () => {
    await expect(autenticar({ usuario: 'nadie', password: PASSWORD })).rejects.toMatchObject({
      status: 401,
      message: MENSAJE_CREDENCIALES,
    });
  });
});

describe('sesionDesdeToken', () => {
  const tokenDe = (payload, opciones = {}) =>
    jwt.sign(payload, SECRETO, { expiresIn: 60, ...opciones });

  it('recupera la sesión de un token propio', async () => {
    const original = await autenticar({ usuario: 'lucia', password: PASSWORD, sucursalId: 3 });
    const sesion = await sesionDesdeToken(firmarSesion(original));
    expect(sesion).toEqual(original);
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const token = jwt.sign({ suc: null }, 'otro-secreto', { subject: '1' });
    expect(await sesionDesdeToken(token)).toBeNull();
  });

  it('rechaza un token vencido', async () => {
    const haceUnRato = Math.floor(Date.now() / 1000) - 60;
    const token = jwt.sign({ suc: null, exp: haceUnRato }, SECRETO, { subject: '1' });
    expect(await sesionDesdeToken(token)).toBeNull();
  });

  it('rechaza un token sin firma (alg none)', async () => {
    const token = jwt.sign({ suc: null }, null, { algorithm: 'none', subject: '1' });
    expect(await sesionDesdeToken(token)).toBeNull();
  });

  it('corta la sesión de un usuario desactivado o borrado', async () => {
    expect(await sesionDesdeToken(tokenDe({ suc: 3 }, { subject: '4' }))).toBeNull();
    expect(await sesionDesdeToken(tokenDe({ suc: null }, { subject: '99' }))).toBeNull();
  });

  it('una empleada sin sucursal del día tiene que volver a entrar', async () => {
    expect(await sesionDesdeToken(tokenDe({ suc: null }, { subject: '2' }))).toBeNull();
    expect(await sesionDesdeToken(tokenDe({ suc: 99 }, { subject: '2' }))).toBeNull();
  });
});

describe('asegurarAdminInicial', () => {
  const log = vi.fn();

  it('no hace nada si ya hay un admin activo', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    expect(await asegurarAdminInicial({ usuario: 'x', password: 'clave-larga', log })).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('crea el admin con la contraseña hasheada', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rowCount: 1 });
    expect(await asegurarAdminInicial({ usuario: ' dueña ', password: 'clave-larga', log })).toBe(
      true
    );
    const [sql, params] = query.mock.calls[1];
    expect(sql).toMatch(/INSERT INTO usuarios/);
    expect(params[0]).toBe('dueña');
    expect(params[1]).toMatch(/^scrypt\$/);
    expect(log).toHaveBeenCalledWith('[auth] Admin inicial "dueña" creado.');
  });

  it('avisa si faltan las variables de entorno', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await asegurarAdminInicial({ usuario: '', password: '', log })).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/faltan ADMIN_USUARIO/));
  });

  it('no acepta una contraseña inicial corta', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(asegurarAdminInicial({ usuario: 'dueña', password: '1234', log })).rejects.toThrow(
      /al menos 8/
    );
  });

  it('avisa si el nombre ya lo usa alguien que no es admin', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rowCount: 0 });
    expect(await asegurarAdminInicial({ usuario: 'lucia', password: 'clave-larga', log })).toBe(
      false
    );
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/ya existe un usuario "lucia"/));
  });
});
