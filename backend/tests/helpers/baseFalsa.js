import { hashearPassword } from '../../src/domain/password.js';

export const PASSWORD = 'clave-segura-123';

export const SUCURSALES = [
  { id: 1, nombre: 'Galpón Central', tipo: 'DEPOSITO' },
  { id: 2, nombre: 'Viedma (Chacra)', tipo: 'FABRICA' },
  { id: 3, nombre: 'Estrada', tipo: 'VENTA' },
];

/** Usuarios de prueba, todos con la misma contraseña. */
export const crearUsuarios = async () => {
  const password_hash = await hashearPassword(PASSWORD);
  const usuario = (id, usuario, rol, extra = {}) => ({
    id,
    usuario,
    nombre: usuario,
    password_hash,
    rol,
    puede_cerrar_caja: false,
    activo: true,
    ...extra,
  });
  return [
    usuario(1, 'dueña', 'ADMIN'),
    usuario(2, 'lucia', 'EMPLEADA', { puede_cerrar_caja: true }),
    usuario(3, 'marcos', 'CHOFER'),
    usuario(4, 'ex-empleada', 'EMPLEADA', { activo: false }),
  ];
};

/**
 * Simula las consultas de authService sobre tablas en memoria.
 * @param {{ usuarios: object[], sucursales?: object[] }} tablas
 */
export const responderConsultas =
  ({ usuarios, sucursales = SUCURSALES }) =>
  async (sql, params = []) => {
    if (sql.includes('FROM usuarios WHERE lower(usuario)')) {
      const nombre = params[0].toLowerCase();
      return { rows: usuarios.filter((u) => u.usuario.toLowerCase() === nombre) };
    }
    if (sql.includes('FROM usuarios WHERE id')) {
      return { rows: usuarios.filter((u) => u.id === params[0]) };
    }
    if (sql.includes('FROM sucursales WHERE id')) {
      return { rows: sucursales.filter((s) => s.id === Number(params[0])) };
    }
    throw new Error(`Consulta no simulada: ${sql}`);
  };
