import { readFile } from 'node:fs/promises';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { runner } from 'node-pg-migrate';

import { DIRECTORIO_MIGRACIONES } from '../../src/db/migrar.js';

const URL_ADMIN = process.env.TEST_DATABASE_URL;
if (!URL_ADMIN) {
  throw new Error(
    'Falta TEST_DATABASE_URL (ej: postgres://postgres:postgres@localhost:5432/postgres)'
  );
}

const urlDe = (base) => {
  const url = new URL(URL_ADMIN);
  url.pathname = `/${base}`;
  return url.toString();
};

const admin = new pg.Client({ connectionString: URL_ADMIN });

/** Crea una base vacía con ese nombre y devuelve un cliente conectado a ella. */
const baseNueva = async (nombre) => {
  await admin.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${nombre}`);
  const client = new pg.Client({ connectionString: urlDe(nombre) });
  await client.connect();
  return client;
};

const migrar = (client) =>
  runner({
    dbClient: client,
    dir: DIRECTORIO_MIGRACIONES,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    checkOrder: true,
    log: () => {},
  });

const nombresSucursales = async (client) =>
  (await client.query('SELECT nombre FROM sucursales ORDER BY nombre')).rows.map((r) => r.nombre);

const SUCURSALES = ['Café', 'Estrada', 'Galpón Central', 'Patagonia', 'Viedma (Chacra)'];

const clientes = [];

beforeAll(async () => {
  await admin.connect();
});

afterAll(async () => {
  for (const c of clientes) await c.end();
  await admin.query('DROP DATABASE IF EXISTS lf_test_vacia WITH (FORCE)');
  await admin.query('DROP DATABASE IF EXISTS lf_test_tp2 WITH (FORCE)');
  await admin.end();
});

describe('migraciones sobre una base vacía', () => {
  let db;

  beforeAll(async () => {
    db = await baseNueva('lf_test_vacia');
    clientes.push(db);
  });

  it('crean todas las tablas y los datos de referencia', async () => {
    const aplicadas = await migrar(db);
    expect(aplicadas.map((m) => m.name)).toEqual([
      '0001_esquema-inicial',
      '0002_datos-iniciales',
      '0003_usuarios',
      '0004_sesiones-desde',
      '0005_cierres-caja',
      '0006_revision-cierres',
      '0007_medios-y-categorias',
      '0008_caja-central',
      '0009_reportes-problema',
      '0010_pedidos-por-rubro',
    ]);
    expect(await nombresSucursales(db)).toEqual(SUCURSALES);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM usuarios');
    expect(rows[0].n).toBe(0);
  });

  it('cargan los rubros de pedidos con el lugar de donde sale cada uno', async () => {
    const { rows } = await db.query(
      `SELECT r.nombre, s.nombre AS origen FROM rubros r
         JOIN sucursales s ON s.id = r.sucursal_origen_id ORDER BY r.orden`
    );
    expect(rows[0]).toEqual({ nombre: 'Pan', origen: 'Viedma (Chacra)' });
    expect(rows).toContainEqual({ nombre: 'Insumos', origen: 'Galpón Central' });
    expect(rows).toHaveLength(12);
  });

  it('no hacen nada si se corren de nuevo', async () => {
    expect(await migrar(db)).toEqual([]);
  });

  it('no permiten dos usuarios iguales sin importar mayúsculas', async () => {
    const alta = (usuario) =>
      db.query(
        `INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES ($1, 'Pablo', 'x', 'CHOFER')`,
        [usuario]
      );
    await alta('pablo');
    await expect(alta('Pablo')).rejects.toThrow(/usuarios_usuario_unico/);
  });

  it('rechazan roles que no existen (no hay rol de galpón)', async () => {
    await expect(
      db.query(
        `INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES ('g', 'G', 'x', 'GALPON')`
      )
    ).rejects.toThrow(/check/i);
  });
});

describe('migraciones sobre una base creada con el init.sql del TP2', () => {
  let db;

  beforeAll(async () => {
    db = await baseNueva('lf_test_tp2');
    clientes.push(db);
    await db.query(await readFile(new URL('./fixtures/esquema-tp2.sql', import.meta.url), 'utf8'));
    // Un pedido cargado antes de la migración, para comprobar que no se pierde.
    await db.query(
      `INSERT INTO pedidos (sucursal_origen_id, sucursal_destino_id, estado)
       VALUES (1, 2, 'DESPACHADO') RETURNING id`
    );
    await db.query(
      `INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad)
       SELECT 1, id, 12 FROM productos WHERE nombre = 'Medialunas'`
    );
  });

  it('actualizan el esquema sin perder datos y renombran las sucursales', async () => {
    const antes = await nombresSucursales(db);
    expect(antes).toContain('Panadería Viedma');

    await migrar(db);

    expect(await nombresSucursales(db)).toEqual(SUCURSALES);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM pedidos');
    expect(rows[0].n).toBe(1);
    // El pedido despachado quedó en camino y su detalle pasó a un renglón de "Otros".
    const { rows: pedido } = await db.query(
      `SELECT p.estado, r.nombre AS rubro, i.detalle FROM pedidos p
         JOIN pedido_items i ON i.pedido_id = p.id JOIN rubros r ON r.id = i.rubro_id`
    );
    expect(pedido).toEqual([
      { estado: 'EN_CAMINO', rubro: 'Otros', detalle: '12 docena de Medialunas' },
    ]);
    await expect(
      db.query(`UPDATE pedidos SET estado = 'RECIBIDO' WHERE id = 1`)
    ).resolves.toBeDefined();
  });
});
