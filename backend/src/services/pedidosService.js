import { query, getClient } from '../config/db.js';

const ESTADOS_VALIDOS = ['PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO'];

/**
 * Lista todos los pedidos con la info de sus sucursales y el detalle de productos.
 */
export const listarPedidos = async () => {
  const { rows: pedidos } = await query(
    `SELECT p.id,
            p.estado,
            p.fecha_creacion,
            p.sucursal_origen_id,
            p.sucursal_destino_id,
            so.nombre AS sucursal_origen_nombre,
            sd.nombre AS sucursal_destino_nombre
       FROM pedidos p
       JOIN sucursales so ON so.id = p.sucursal_origen_id
       JOIN sucursales sd ON sd.id = p.sucursal_destino_id
      ORDER BY p.fecha_creacion DESC, p.id DESC`
  );

  if (pedidos.length === 0) return [];

  const ids = pedidos.map((p) => p.id);
  const { rows: detalles } = await query(
    `SELECT dp.id,
            dp.pedido_id,
            dp.producto_id,
            dp.cantidad,
            pr.nombre        AS producto_nombre,
            pr.unidad_medida AS producto_unidad
       FROM detalles_pedido dp
       JOIN productos pr ON pr.id = dp.producto_id
      WHERE dp.pedido_id = ANY($1::int[])
      ORDER BY dp.id ASC`,
    [ids]
  );

  const detallesPorPedido = new Map();
  for (const d of detalles) {
    if (!detallesPorPedido.has(d.pedido_id)) detallesPorPedido.set(d.pedido_id, []);
    detallesPorPedido.get(d.pedido_id).push(d);
  }

  return pedidos.map((p) => ({
    ...p,
    detalles: detallesPorPedido.get(p.id) ?? [],
  }));
};

/**
 * Crea un pedido junto con sus detalles dentro de una transacción.
 * @param {{
 *   sucursal_origen_id: number,
 *   sucursal_destino_id: number,
 *   estado?: string,
 *   detalles: Array<{ producto_id: number, cantidad: number }>
 * }} data
 */
export const crearPedido = async (data) => {
  const origenId = Number(data.sucursal_origen_id);
  const destinoId = Number(data.sucursal_destino_id);
  const estado = data.estado ? String(data.estado).toUpperCase() : 'PENDIENTE';
  const detalles = Array.isArray(data.detalles) ? data.detalles : [];

  if (!Number.isInteger(origenId) || !Number.isInteger(destinoId)) {
    const err = new Error('sucursal_origen_id y sucursal_destino_id son obligatorios y numéricos');
    err.status = 400;
    throw err;
  }
  if (origenId === destinoId) {
    const err = new Error('La sucursal de origen y destino no pueden ser la misma');
    err.status = 400;
    throw err;
  }
  if (!ESTADOS_VALIDOS.includes(estado)) {
    const err = new Error(`Estado inválido. Válidos: ${ESTADOS_VALIDOS.join(', ')}`);
    err.status = 400;
    throw err;
  }
  if (detalles.length === 0) {
    const err = new Error('El pedido debe incluir al menos un detalle (producto_id + cantidad)');
    err.status = 400;
    throw err;
  }
  for (const d of detalles) {
    if (!Number.isInteger(Number(d.producto_id)) || Number(d.cantidad) <= 0) {
      const err = new Error('Cada detalle requiere producto_id válido y cantidad mayor a 0');
      err.status = 400;
      throw err;
    }
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: sucursalesRows } = await client.query(
      'SELECT id FROM sucursales WHERE id = ANY($1::int[])',
      [[origenId, destinoId]]
    );
    if (sucursalesRows.length !== 2) {
      const err = new Error('Alguna de las sucursales indicadas no existe');
      err.status = 400;
      throw err;
    }

    const { rows: pedidoRows } = await client.query(
      `INSERT INTO pedidos (sucursal_origen_id, sucursal_destino_id, estado)
       VALUES ($1, $2, $3)
       RETURNING id, estado, fecha_creacion, sucursal_origen_id, sucursal_destino_id`,
      [origenId, destinoId, estado]
    );
    const pedido = pedidoRows[0];

    for (const d of detalles) {
      await client.query(
        `INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad)
         VALUES ($1, $2, $3)`,
        [pedido.id, Number(d.producto_id), Number(d.cantidad)]
      );
    }

    await client.query('COMMIT');

    const [creado] = (await listarPedidosPorIds([pedido.id]));
    return creado;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Helper interno: recupera pedidos completos por un conjunto de ids.
 * @param {number[]} ids
 */
const listarPedidosPorIds = async (ids) => {
  const { rows: pedidos } = await query(
    `SELECT p.id,
            p.estado,
            p.fecha_creacion,
            p.sucursal_origen_id,
            p.sucursal_destino_id,
            so.nombre AS sucursal_origen_nombre,
            sd.nombre AS sucursal_destino_nombre
       FROM pedidos p
       JOIN sucursales so ON so.id = p.sucursal_origen_id
       JOIN sucursales sd ON sd.id = p.sucursal_destino_id
      WHERE p.id = ANY($1::int[])
      ORDER BY p.id DESC`,
    [ids]
  );

  const { rows: detalles } = await query(
    `SELECT dp.id,
            dp.pedido_id,
            dp.producto_id,
            dp.cantidad,
            pr.nombre        AS producto_nombre,
            pr.unidad_medida AS producto_unidad
       FROM detalles_pedido dp
       JOIN productos pr ON pr.id = dp.producto_id
      WHERE dp.pedido_id = ANY($1::int[])
      ORDER BY dp.id ASC`,
    [ids]
  );

  const detallesPorPedido = new Map();
  for (const d of detalles) {
    if (!detallesPorPedido.has(d.pedido_id)) detallesPorPedido.set(d.pedido_id, []);
    detallesPorPedido.get(d.pedido_id).push(d);
  }

  return pedidos.map((p) => ({
    ...p,
    detalles: detallesPorPedido.get(p.id) ?? [],
  }));
};
