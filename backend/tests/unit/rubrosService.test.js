import { describe, it, expect, vi, beforeEach } from 'vitest';

// Estos tests prueban las reglas del servicio, no PostgreSQL.
vi.mock('../../src/config/db.js', () => ({ query: vi.fn(), getClient: vi.fn() }));

const { query } = await import('../../src/config/db.js');
const { crearRubro, actualizarRubro, LARGO_NOMBRE } =
  await import('../../src/services/rubrosService.js');

const SUCURSALES = {
  1: { id: 1, nombre: 'Galpón Central', tipo: 'DEPOSITO' },
  2: { id: 2, nombre: 'Viedma (Chacra)', tipo: 'FABRICA' },
  3: { id: 3, nombre: 'Estrada', tipo: 'VENTA' },
};
const RUBRO = {
  id: 13,
  nombre: 'Prepizzas',
  activo: true,
  orden: 130,
  sucursal_origen_id: 2,
  sucursal_origen_nombre: 'Viedma (Chacra)',
};

/** Base falsa: sucursales conocidas, el rubro 13 existe y el resto se registra. */
const base = ({ insert, update } = {}) =>
  query.mockImplementation(async (sql, params) => {
    if (sql.startsWith('SELECT id, nombre, tipo FROM sucursales')) {
      return { rows: SUCURSALES[params[0]] ? [SUCURSALES[params[0]]] : [] };
    }
    if (sql.includes('INSERT INTO rubros')) {
      if (insert) return insert();
      return { rows: [{ id: 13 }] };
    }
    if (sql.startsWith('UPDATE rubros')) {
      if (update) return update(params);
      return { rowCount: 1 };
    }
    if (sql.includes('FROM rubros r')) return { rows: params[0] === 13 ? [RUBRO] : [] };
    return { rows: [] };
  });

const sqlDe = (texto) => query.mock.calls.find(([sql]) => sql.includes(texto));

beforeEach(() => {
  vi.clearAllMocks();
  base();
});

describe('crearRubro', () => {
  it('crea el rubro limpio de espacios y lo devuelve con su lugar', async () => {
    const creado = await crearRubro({ nombre: '  Prepizzas ', sucursal_origen_id: 2 });
    expect(creado).toEqual(RUBRO);
    const [, params] = sqlDe('INSERT INTO rubros');
    expect(params).toEqual(['Prepizzas', 2, null]);
  });

  it('sin orden lo pone al final de la lista', async () => {
    await crearRubro({ nombre: 'Prepizzas', sucursal_origen_id: 2 });
    expect(sqlDe('INSERT INTO rubros')[0]).toMatch(/MAX\(orden\), 0\) \+ 10/);
  });

  it('respeta el orden que le dan', async () => {
    await crearRubro({ nombre: 'Prepizzas', sucursal_origen_id: 1, orden: 5 });
    expect(sqlDe('INSERT INTO rubros')[1]).toEqual(['Prepizzas', 1, 5]);
  });

  it.each([
    [{ sucursal_origen_id: 2 }, 'Escribí el nombre del rubro'],
    [{ nombre: '   ', sucursal_origen_id: 2 }, 'Escribí el nombre del rubro'],
    [
      { nombre: 'x'.repeat(LARGO_NOMBRE + 1), sucursal_origen_id: 2 },
      `El nombre puede tener hasta ${LARGO_NOMBRE} letras`,
    ],
    [{ nombre: 'Prepizzas' }, 'Elegí de dónde sale el rubro'],
    [{ nombre: 'Prepizzas', sucursal_origen_id: 99 }, 'No existe la sucursal #99'],
    [
      { nombre: 'Prepizzas', sucursal_origen_id: 3 },
      'Estrada no prepara pedidos: elegí la fábrica o el galpón',
    ],
    [
      { nombre: 'Prepizzas', sucursal_origen_id: 2, orden: -1 },
      'El orden tiene que ser un número entero, 0 o más',
    ],
    [
      { nombre: 'Prepizzas', sucursal_origen_id: 2, orden: 1.5 },
      'El orden tiene que ser un número entero, 0 o más',
    ],
  ])('rechaza %j con 400', async (datos, mensaje) => {
    await expect(crearRubro(datos)).rejects.toMatchObject({ status: 400, message: mensaje });
    expect(sqlDe('INSERT INTO rubros')).toBeUndefined();
  });

  it('un nombre repetido (sin importar mayúsculas) es 409', async () => {
    base({ insert: () => Promise.reject(Object.assign(new Error('dup'), { code: '23505' })) });
    await expect(crearRubro({ nombre: 'facturas', sucursal_origen_id: 2 })).rejects.toMatchObject({
      status: 409,
      message: 'Ya existe el rubro "facturas"',
    });
  });

  it('otros errores de la base se propagan', async () => {
    base({ insert: () => Promise.reject(new Error('se cayó')) });
    await expect(crearRubro({ nombre: 'Prepizzas', sucursal_origen_id: 2 })).rejects.toThrow(
      'se cayó'
    );
  });
});

describe('actualizarRubro', () => {
  it('cambia sólo lo que viene', async () => {
    const rubro = await actualizarRubro('13', { activo: false });
    expect(rubro).toEqual(RUBRO);
    const [sql, params] = sqlDe('UPDATE rubros');
    expect(sql).toBe('UPDATE rubros SET activo = $1 WHERE id = $2');
    expect(params).toEqual([false, 13]);
  });

  it('puede cambiar todo junto', async () => {
    await actualizarRubro(13, {
      nombre: ' Prepizza ',
      sucursal_origen_id: 1,
      orden: 0,
      activo: true,
    });
    const [sql, params] = sqlDe('UPDATE rubros');
    expect(sql).toBe(
      'UPDATE rubros SET nombre = $1, sucursal_origen_id = $2, orden = $3, activo = $4 WHERE id = $5'
    );
    expect(params).toEqual(['Prepizza', 1, 0, true, 13]);
  });

  it.each([
    ['abc', {}, 'Id de rubro inválido'],
    [13, {}, 'No hay nada para cambiar'],
    [13, { activo: 'no' }, '"activo" tiene que ser sí o no'],
    [13, { nombre: '' }, 'Escribí el nombre del rubro'],
    [13, { sucursal_origen_id: 3 }, 'Estrada no prepara pedidos: elegí la fábrica o el galpón'],
  ])('rubro %s con %j: 400', async (id, datos, mensaje) => {
    await expect(actualizarRubro(id, datos)).rejects.toMatchObject({
      status: 400,
      message: mensaje,
    });
  });

  it('si no existe es 404', async () => {
    base({ update: () => ({ rowCount: 0 }) });
    await expect(actualizarRubro(77, { orden: 3 })).rejects.toMatchObject({
      status: 404,
      message: 'No existe el rubro #77',
    });
  });

  it('renombrar a uno que ya existe es 409', async () => {
    base({ update: () => Promise.reject(Object.assign(new Error('dup'), { code: '23505' })) });
    await expect(actualizarRubro(13, { nombre: 'Pan' })).rejects.toMatchObject({
      status: 409,
      message: 'Ya existe el rubro "Pan"',
    });
  });
});
