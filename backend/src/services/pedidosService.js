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
import {
  usuarioPuedeTransicionar,
  describirAutorizacion,
} from '../domain/autorizacionPedido.js';
import { REGLA_TIPO, esTipoValido, TIPOS_PEDIDO } from '../domain/tipoPedido.js';

const badRequest = (msg) => {
  const err = new Error(msg);
  err.status = 400;
  return err;
};

const PEDIDO_SELECT = `
  SELECT p.id,
         p.tipo,
         p.estado,
         p.fecha_creacion,
         p.sucursal_origen_id,
         p.sucursal_destino_id,
         so.nombre AS sucursal_origen_nombre,
         so.tipo   AS sucursal_origen_tipo,
         sd.nombre AS sucursal_destino_nombre,
         sd.tipo   AS sucursal_destino_tipo
    FROM pedidos p
    JOIN sucursales so ON so.id = p.sucursal_origen_id
    JOIN sucursales sd ON sd.id = p.sucursal_destino_id`;

/**
 * Dado un conjunto de filas de pedido, les adjunta su arreglo `detalles`.
 * Cada detalle referencia un producto o un insumo; se unifica en `item_*`.
 */
const adjuntarDetalles = async (pedidos) => {
  if (pedidos.length === 0) return [];

  const ids = pedidos.map((p) => p.id);
  const { rows: detalles } = await query(
    `SELECT dp.id,
            dp.pedido_id,
            dp.producto_id,
            dp.insumo_id,
            dp.cantidad,
            dp.cantidad_recibida,
            COALESCE(pr.nombre, ins.nombre)               AS item_nombre,
            COALESCE(pr.unidad_medida, ins.unidad_medida) AS item_unidad,
            CASE WHEN dp.insumo_id IS NOT NULL THEN 'insumo' ELSE 'producto' END AS item_tipo
       FROM detalles_pedido dp
       LEFT JOIN productos pr  ON pr.id  = dp.producto_id
       LEFT JOIN insumos   ins ON ins.id = dp.insumo_id
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
 * Lista todos los pedidos con la info de sus sucursales y el detalle.
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
 * Normaliza y valida las líneas del detalle según el tipo de pedido.
 * @returns {Array<{ idCampo: 'producto_id'|'insumo_id', id: number, cantidad: number }>}
 */
const normalizarDetalles = (detalles, tipo) => {
  if (!Array.isArray(detalles) || detalles.length === 0) {
    throw badRequest('El pedido debe incluir al menos una línea en "detalles"');
  }
  const idCampo = tipo === 'INSUMOS' ? 'insumo_id' : 'producto_id';
  return detalles.map((d) => {
    const id = Number(d[idCampo]);
    const cantidad = Number(d.cantidad);
    if (!Number.isInteger(id) || id <= 0) {
      throw badRequest(`Cada línea de un pedido de ${tipo} requiere "${idCampo}" válido`);
    }
    if (!(cantidad > 0)) {
      throw badRequest('Cada línea requiere "cantidad" mayor a 0');
    }
    return { idCampo, id, cantidad };
  });
};

/**
 * Crea un pedido (INSUMOS o PRODUCTOS) junto con su detalle, en una transacción.
 * @param {object} data  { tipo, sucursal_origen_id, sucursal_destino_id, estado?, detalles }
 * @param {{ rol: string, sucursal_id: number|null }} usuario  quien lo crea
 */
export const crearPedido = async (data, usuario) => {
  const tipo = String(data.tipo ?? 'PRODUCTOS').toUpperCase();
  const origenId = Number(data.sucursal_origen_id);
  const destinoId = Number(data.sucursal_destino_id);
  const esDuenio = usuario?.rol === 'DUENIO';
  const estado = esDuenio && data.estado ? String(data.estado).toUpperCase() : 'PENDIENTE';

  if (!esTipoValido(tipo)) {
    throw badRequest(`Tipo de pedido inválido. Válidos: ${TIPOS_PEDIDO.join(', ')}`);
  }
  const regla = REGLA_TIPO[tipo];

  if (!Number.isInteger(origenId) || !Number.isInteger(destinoId)) {
    throw badRequest('sucursal_origen_id y sucursal_destino_id son obligatorios y numéricos');
  }
  if (origenId === destinoId) {
    throw badRequest('La sucursal de origen y destino no pueden ser la misma');
  }
  if (!esEstadoInicialValido(estado)) {
    throw badRequest(`Estado inicial inválido. Válidos: ${ESTADOS_INICIALES.join(', ')}`);
  }

  const lineas = normalizarDetalles(data.detalles, tipo);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // --- Sucursales: existen y tienen el tipo correcto para este tipo de pedido ---
    const { rows: sucs } = await client.query(
      'SELECT id, tipo FROM sucursales WHERE id = ANY($1::int[])',
      [[origenId, destinoId]]
    );
    const origen = sucs.find((s) => s.id === origenId);
    const destino = sucs.find((s) => s.id === destinoId);
    if (!origen || !destino) {
      throw badRequest('Alguna de las sucursales indicadas no existe');
    }
    if (origen.tipo !== regla.tipoOrigen || destino.tipo !== regla.tipoDestino) {
      throw badRequest(
        `Un pedido de ${tipo} va de una sucursal ${regla.tipoOrigen} a una ${regla.tipoDestino}`
      );
    }

    // --- Quién puede crearlo: el dueño, o el rol correspondiente en la sucursal destino ---
    if (!esDuenio) {
      if (usuario?.rol !== regla.rolCrea || Number(usuario.sucursal_id) !== destinoId) {
        const err = new Error(
          `Un pedido de ${tipo} lo crea el rol ${regla.rolCrea} de la sucursal de destino (o el dueño)`
        );
        err.status = 403;
        throw err;
      }
    }

    // --- Los ítems del detalle existen ---
    const idsItem = [...new Set(lineas.map((l) => l.id))];
    const tabla = tipo === 'INSUMOS' ? 'insumos' : 'productos';
    const { rows: itemsRows } = await client.query(
      `SELECT id FROM ${tabla} WHERE id = ANY($1::int[])`,
      [idsItem]
    );
    if (itemsRows.length !== idsItem.length) {
      throw badRequest(`Algún ${regla.item} del detalle no existe`);
    }

    // --- Inserción ---
    const { rows: pedidoRows } = await client.query(
      `INSERT INTO pedidos (tipo, sucursal_origen_id, sucursal_destino_id, estado)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [tipo, origenId, destinoId, estado]
    );
    const pedidoId = pedidoRows[0].id;

    for (const l of lineas) {
      await client.query(
        `INSERT INTO detalles_pedido (pedido_id, ${l.idCampo}, cantidad)
         VALUES ($1, $2, $3)`,
        [pedidoId, l.id, l.cantidad]
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
 * Registra la cantidad recibida por línea al confirmar la recepción.
 * Si no se informa una línea, se asume que llegó completa.
 */
const registrarRecepcion = async (client, pedidoId, recepcion) => {
  const { rows: detalles } = await client.query(
    'SELECT id, cantidad FROM detalles_pedido WHERE pedido_id = $1',
    [pedidoId]
  );

  const informadas = new Map();
  if (Array.isArray(recepcion)) {
    for (const r of recepcion) {
      const detalleId = Number(r.detalle_id);
      const recibida = Number(r.cantidad_recibida);
      if (!detalles.some((d) => d.id === detalleId)) {
        throw badRequest(`El detalle #${detalleId} no pertenece al pedido #${pedidoId}`);
      }
      if (!(recibida >= 0)) {
        throw badRequest('cantidad_recibida no puede ser negativa');
      }
      informadas.set(detalleId, recibida);
    }
  }

  for (const d of detalles) {
    const recibida = informadas.has(d.id) ? informadas.get(d.id) : Number(d.cantidad);
    await client.query('UPDATE detalles_pedido SET cantidad_recibida = $1 WHERE id = $2', [
      recibida,
      d.id,
    ]);
  }
};

/**
 * Cambia el estado de un pedido validando la transición y el permiso del usuario.
 * @param {number|string} id
 * @param {string}        nuevoEstado
 * @param {{ rol: string, sucursal_id: number|null }} usuario
 * @param {{ recepcion?: Array<{ detalle_id: number, cantidad_recibida: number }> }} [opciones]
 * @throws error con `.status` 400 / 403 / 404 / 409
 */
export const cambiarEstadoPedido = async (id, nuevoEstado, usuario, opciones = {}) => {
  const pedidoId = Number(id);
  const estado = String(nuevoEstado ?? '').trim().toUpperCase();

  if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
    throw badRequest('El id de pedido debe ser un entero positivo');
  }
  if (!esEstadoValido(estado)) {
    throw badRequest(`Estado inválido. Válidos: ${ESTADOS.join(', ')}`);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT estado, sucursal_origen_id, sucursal_destino_id
         FROM pedidos WHERE id = $1 FOR UPDATE`,
      [pedidoId]
    );
    if (rows.length === 0) {
      const err = new Error(`No existe el pedido #${pedidoId}`);
      err.status = 404;
      throw err;
    }

    const pedido = rows[0];
    const estadoActual = pedido.estado;

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
    if (!usuarioPuedeTransicionar(usuario, pedido, estado)) {
      const err = new Error(
        `Tu rol (${usuario?.rol ?? 'sin sesión'}) no puede pasar el pedido a ${estado}. ` +
          `Lo hace: ${describirAutorizacion(estado)}`
      );
      err.status = 403;
      throw err;
    }

    await client.query('UPDATE pedidos SET estado = $1 WHERE id = $2', [estado, pedidoId]);

    if (estado === 'RECIBIDO') {
      await registrarRecepcion(client, pedidoId, opciones.recepcion);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return obtenerPedidoPorId(pedidoId);
};
