import { query, getClient } from '../config/db.js';
import {
  ESTADOS,
  ESTADOS_INICIALES,
  esEstadoValido,
  esEstadoInicialValido,
  esEstadoFinal,
  puedeTransicionar,
  transicionesDesde,
} from '../domain/estadoPedido.js';

const PEDIDO_SELECT = `
  SELECT p.id,
         p.estado,
         p.fecha_creacion,
         p.sucursal_origen_id,
         p.sucursal_destino_id,
         so.nombre AS sucursal_origen_nombre,
         sd.nombre AS sucursal_destino_nombre
    FROM pedidos p
    JOIN sucursales so ON so.id = p.sucursal_origen_id
    JOIN sucursales sd ON sd.id = p.sucursal_destino_id`;

/**
 * Dado un conjunto de filas de pedido, les adjunta su arreglo `detalles`.
 * @param {Array<object>} pedidos
 */
const adjuntarDetalles = async (pedidos) => {
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
 * Lista todos los pedidos con la info de sus sucursales y el detalle de productos.
 */
export const listarPedidos = async () => {
  const { rows } = await query(`${PEDIDO_SELECT} ORDER BY p.fecha_creacion DESC, p.id DESC`);
  return adjuntarDetalles(rows);
};

/**
 * Recupera un pedido completo por id, o `null` si no existe.
 * @param {number} id
 */
export const obtenerPedidoPorId = async (id) => {
  const { rows } = await query(`${PEDIDO_SELECT} WHERE p.id = $1`, [id]);
  if (rows.length === 0) return null;
  const [pedido] = await adjuntarDetalles(rows);
  return pedido;
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
  if (!esEstadoInicialValido(estado)) {
    const err = new Error(`Estado inicial inválido. Válidos: ${ESTADOS_INICIALES.join(', ')}`);
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
       RETURNING id`,
      [origenId, destinoId, estado]
    );
    const pedidoId = pedidoRows[0].id;

    for (const d of detalles) {
      await client.query(
        `INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad)
         VALUES ($1, $2, $3)`,
        [pedidoId, Number(d.producto_id), Number(d.cantidad)]
      );
    }

    await client.query('COMMIT');

    return obtenerPedidoPorId(pedidoId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Cambia el estado de un pedido validando la transición contra la máquina de estados.
 * @param {number|string} id       id del pedido
 * @param {string}        nuevoEstado
 * @throws error con `.status` 400 (estado inválido), 404 (no existe) o 409 (transición inválida)
 */
export const cambiarEstadoPedido = async (id, nuevoEstado) => {
  const pedidoId = Number(id);
  const estado = String(nuevoEstado ?? '').trim().toUpperCase();

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    const err = new Error('El id de pedido debe ser un entero positivo');
    err.status = 400;
    throw err;
  }
  if (!esEstadoValido(estado)) {
    const err = new Error(`Estado inválido. Válidos: ${ESTADOS.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT estado FROM pedidos WHERE id = $1 FOR UPDATE',
      [pedidoId]
    );
    if (rows.length === 0) {
      const err = new Error(`No existe el pedido #${pedidoId}`);
      err.status = 404;
      throw err;
    }

    const estadoActual = rows[0].estado;

    if (estadoActual === estado) {
      const err = new Error(`El pedido #${pedidoId} ya está en estado ${estado}`);
      err.status = 409;
      throw err;
    }
    if (!puedeTransicionar(estadoActual, estado)) {
      const err = new Error(
        esEstadoFinal(estadoActual)
          ? `El pedido #${pedidoId} está en un estado final (${estadoActual}) y no admite cambios de estado`
          : `Transición inválida ${estadoActual} → ${estado}. ` +
            `Desde ${estadoActual} sólo se puede pasar a: ${transicionesDesde(estadoActual).join(', ')}`
      );
      err.status = 409;
      throw err;
    }

    await client.query('UPDATE pedidos SET estado = $1 WHERE id = $2', [estado, pedidoId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return obtenerPedidoPorId(pedidoId);
};
