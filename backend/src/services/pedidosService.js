import { query, getClient } from '../config/db.js';
import {
  COLUMNA_HORA,
  ESTADOS,
  ESTADOS_ABIERTOS,
  ESTADOS_ITEM,
  esEstadoFinal,
  esEstadoItemValido,
  esEstadoValido,
  estaAbierto,
  quienTransiciona,
  transicionesDesde,
} from '../domain/estadoPedido.js';
import { ACCIONES, sucursalRestringida } from '../domain/permisos.js';
import { armarRecorrido } from '../domain/recorrido.js';

const errorHttp = (status, mensaje) => Object.assign(new Error(mensaje), { status });

/** Tope de renglones por pedido: una lista del día, no un catálogo entero. */
export const MAX_ITEMS = 30;
/** Historial que devuelve el listado sin filtro, del más nuevo al más viejo. */
export const LIMITE_HISTORIAL = 200;

const PEDIDO_SELECT = `
  SELECT p.id,
         p.estado,
         p.urgente,
         p.nota,
         p.fecha_creacion,
         p.en_camino_en,
         p.entregado_en,
         p.recibido_en,
         p.cancelado_en,
         p.sucursal_origen_id,
         p.sucursal_destino_id,
         so.nombre AS sucursal_origen_nombre,
         sd.nombre AS sucursal_destino_nombre,
         u.nombre  AS creado_por_nombre
    FROM pedidos p
    JOIN sucursales so ON so.id = p.sucursal_origen_id
    JOIN sucursales sd ON sd.id = p.sucursal_destino_id
    LEFT JOIN usuarios u ON u.id = p.creado_por`;

/**
 * Dado un conjunto de filas de pedido, les adjunta su arreglo `items`.
 * @param {Array<object>} pedidos
 */
const adjuntarItems = async (pedidos) => {
  if (pedidos.length === 0) return [];

  const { rows: items } = await query(
    `SELECT i.id,
            i.pedido_id,
            i.rubro_id,
            i.detalle,
            i.estado,
            r.nombre AS rubro_nombre,
            r.orden  AS rubro_orden
       FROM pedido_items i
       JOIN rubros r ON r.id = i.rubro_id
      WHERE i.pedido_id = ANY($1::int[])
      ORDER BY i.id ASC`,
    [pedidos.map((p) => p.id)]
  );

  const porPedido = new Map();
  for (const item of items) {
    if (!porPedido.has(item.pedido_id)) porPedido.set(item.pedido_id, []);
    porPedido.get(item.pedido_id).push(item);
  }
  return pedidos.map((p) => ({ ...p, items: porPedido.get(p.id) ?? [] }));
};

/**
 * Rubros que se pueden pedir, en el orden de la lista, con el lugar de donde salen.
 * @param {{ incluirInactivos?: boolean }} [opciones]
 */
export const listarRubros = async ({ incluirInactivos = false } = {}) => {
  const { rows } = await query(
    `SELECT r.id, r.nombre, r.activo, r.orden,
            r.sucursal_origen_id, s.nombre AS sucursal_origen_nombre
       FROM rubros r
       JOIN sucursales s ON s.id = r.sucursal_origen_id
      ${incluirInactivos ? '' : 'WHERE r.activo'}
      ORDER BY r.orden, r.nombre`
  );
  return rows;
};

/**
 * Lista los pedidos con sus sucursales y renglones.
 * Con `sucursalId`, sólo los que salen de esa sucursal o llegan a ella.
 * Con `abiertos`, sólo los pendientes y en camino (todos); si no, el historial
 * reciente.
 * @param {{ sucursalId?: number | null, abiertos?: boolean }} [filtro]
 */
export const listarPedidos = async ({ sucursalId = null, abiertos = false } = {}) => {
  const condiciones = [];
  const params = [];
  if (sucursalId) {
    params.push(sucursalId);
    condiciones.push(
      `(p.sucursal_origen_id = $${params.length} OR p.sucursal_destino_id = $${params.length})`
    );
  }
  if (abiertos) {
    params.push(ESTADOS_ABIERTOS);
    condiciones.push(`p.estado = ANY($${params.length}::text[])`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const limite = abiertos ? '' : `LIMIT ${LIMITE_HISTORIAL}`;
  const { rows } = await query(
    `${PEDIDO_SELECT} ${where} ORDER BY p.fecha_creacion DESC, p.id DESC ${limite}`,
    params
  );
  return adjuntarItems(rows);
};

/**
 * Recupera un pedido completo por id, o `null` si no existe.
 * @param {number} id
 */
export const obtenerPedidoPorId = async (id) => {
  const { rows } = await query(`${PEDIDO_SELECT} WHERE p.id = $1`, [id]);
  if (rows.length === 0) return null;
  const [pedido] = await adjuntarItems(rows);
  return pedido;
};

/** Valida y normaliza el cuerpo de un pedido nuevo. */
const validarPedido = (datos, sesion) => {
  const propia = sucursalRestringida(sesion);
  const pedida = datos.sucursal_id ?? propia;
  const sucursalId = Number(pedida);
  if (pedida === null || pedida === undefined || !Number.isInteger(sucursalId) || sucursalId <= 0) {
    throw errorHttp(400, 'Falta la sucursal que pide ("sucursal_id")');
  }
  if (propia && sucursalId !== propia) {
    throw errorHttp(403, `Sólo podés pedir para tu sucursal del día (${sesion.sucursal.nombre})`);
  }

  const items = datos.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw errorHttp(400, 'El pedido tiene que tener al menos un renglón');
  }
  if (items.length > MAX_ITEMS) {
    throw errorHttp(400, `Un pedido puede tener hasta ${MAX_ITEMS} renglones`);
  }
  const renglones = items.map((item) => {
    const rubroId = Number(item?.rubro_id);
    const detalle = typeof item?.detalle === 'string' ? item.detalle.trim() : '';
    if (!Number.isInteger(rubroId) || rubroId <= 0) {
      throw errorHttp(400, 'Cada renglón necesita un rubro');
    }
    if (detalle === '') {
      throw errorHttp(400, 'Cada renglón necesita la observación de qué se pide');
    }
    if (detalle.length > 500) {
      throw errorHttp(400, 'La observación de un renglón puede tener hasta 500 letras');
    }
    return { rubroId, detalle };
  });

  const nota = typeof datos.nota === 'string' ? datos.nota.trim() : '';
  if (nota.length > 300) throw errorHttp(400, 'La nota puede tener hasta 300 letras');

  return { sucursalId, renglones, nota: nota || null, urgente: datos.urgente === true };
};

/**
 * Crea los pedidos de una sucursal. Los renglones se separan según de dónde
 * sale cada rubro: facturas y pan de la fábrica, insumos del galpón. Así el
 * chofer ve en cada lugar sólo lo que tiene que cargar ahí.
 * @param {{ sucursal_id?: number, nota?: string, urgente?: boolean,
 *           items: Array<{ rubro_id: number, detalle: string }> }} datos
 * @param {object} sesion  la sesión de quien pide (req.sesion)
 * @returns {Promise<object[]>} los pedidos creados
 */
export const crearPedidos = async (datos = {}, sesion) => {
  const { sucursalId, renglones, nota, urgente } = validarPedido(datos, sesion);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: sucursales } = await client.query(
      'SELECT id, nombre FROM sucursales WHERE id = $1',
      [sucursalId]
    );
    if (sucursales.length === 0) throw errorHttp(400, 'La sucursal que pide no existe');

    const { rows: rubros } = await client.query(
      `SELECT r.id, r.nombre, r.sucursal_origen_id, s.nombre AS sucursal_origen_nombre
         FROM rubros r
         JOIN sucursales s ON s.id = r.sucursal_origen_id
        WHERE r.id = ANY($1::int[]) AND r.activo`,
      [[...new Set(renglones.map((r) => r.rubroId))]]
    );
    const rubroPorId = new Map(rubros.map((r) => [r.id, r]));

    // Un pedido por lugar de origen, en el orden en que aparecen los renglones.
    const porOrigen = new Map();
    for (const renglon of renglones) {
      const rubro = rubroPorId.get(renglon.rubroId);
      if (!rubro) throw errorHttp(400, 'Algún rubro no existe o está desactivado');
      if (rubro.sucursal_origen_id === sucursalId) {
        throw errorHttp(
          400,
          `${rubro.nombre} sale de ${rubro.sucursal_origen_nombre}: no hace falta pedirlo desde ahí`
        );
      }
      if (!porOrigen.has(rubro.sucursal_origen_id)) porOrigen.set(rubro.sucursal_origen_id, []);
      porOrigen.get(rubro.sucursal_origen_id).push(renglon);
    }

    const ids = [];
    for (const [origenId, delOrigen] of porOrigen) {
      const {
        rows: [{ id }],
      } = await client.query(
        `INSERT INTO pedidos (sucursal_origen_id, sucursal_destino_id, estado, nota, urgente, creado_por)
         VALUES ($1, $2, 'PENDIENTE', $3, $4, $5)
         RETURNING id`,
        [origenId, sucursalId, nota, urgente, sesion.usuario.id]
      );
      for (const r of delOrigen) {
        await client.query(
          'INSERT INTO pedido_items (pedido_id, rubro_id, detalle) VALUES ($1, $2, $3)',
          [id, r.rubroId, r.detalle]
        );
      }
      ids.push(id);
    }

    await client.query('COMMIT');
    return Promise.all(ids.map((id) => obtenerPedidoPorId(id)));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const idValido = (valor, que) => {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0)
    throw errorHttp(400, `El id de ${que} debe ser un entero positivo`);
  return id;
};

/**
 * ¿Puede esta sesión hacer ese paso? El reparto lo hacen quienes cambian
 * estados (chofer y dueña); la sucursal que pidió cancela y confirma.
 */
const puedeHacerPaso = (sesion, quien, pedido) => {
  if (quien === 'reparto') return sesion.permisos.includes(ACCIONES.CAMBIAR_ESTADO_PEDIDO);
  if (!sesion.permisos.includes(ACCIONES.CREAR_PEDIDO)) return false;
  const propia = sucursalRestringida(sesion);
  return propia === null || propia === pedido.sucursal_destino_id;
};

/**
 * Cambia el estado de un pedido validando la transición y quién la hace.
 * @param {number|string} id
 * @param {string} nuevoEstado
 * @param {object} sesion
 * @throws error con `.status` 400 (estado inválido), 403 (no le toca),
 *         404 (no existe) o 409 (transición inválida)
 */
export const cambiarEstadoPedido = async (id, nuevoEstado, sesion) => {
  const pedidoId = idValido(id, 'pedido');
  const estado = String(nuevoEstado ?? '')
    .trim()
    .toUpperCase();
  if (!esEstadoValido(estado)) {
    throw errorHttp(400, `Estado inválido. Válidos: ${ESTADOS.join(', ')}`);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT estado, sucursal_destino_id FROM pedidos WHERE id = $1 FOR UPDATE',
      [pedidoId]
    );
    if (rows.length === 0) throw errorHttp(404, `No existe el pedido #${pedidoId}`);
    const actual = rows[0];

    if (actual.estado === estado) {
      throw errorHttp(409, `El pedido #${pedidoId} ya está en estado ${estado}`);
    }
    const quien = quienTransiciona(actual.estado, estado);
    if (!quien) {
      throw errorHttp(
        409,
        esEstadoFinal(actual.estado)
          ? `El pedido #${pedidoId} está ${actual.estado} y ya no cambia`
          : `El pedido #${pedidoId} no puede pasar de ${actual.estado} a ${estado}. ` +
              `Desde ${actual.estado} sólo puede pasar a: ${transicionesDesde(actual.estado).join(', ')}`
      );
    }
    if (!puedeHacerPaso(sesion, quien, actual)) {
      throw errorHttp(
        403,
        quien === 'reparto'
          ? 'Sólo el chofer o la dueña pueden marcar el reparto'
          : 'Sólo la sucursal que pidió puede cancelar o confirmar el pedido'
      );
    }

    await client.query(
      `UPDATE pedidos SET estado = $1, ${COLUMNA_HORA[estado]} = now() WHERE id = $2`,
      [estado, pedidoId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return obtenerPedidoPorId(pedidoId);
};

/**
 * El chofer tilda un renglón como llevado, o marca que no había.
 * Sólo mientras el pedido está abierto.
 * @param {number|string} pedidoIdCrudo
 * @param {number|string} itemIdCrudo
 * @param {string} nuevoEstado  PENDIENTE, LLEVADO o NO_HABIA
 */
export const marcarItem = async (pedidoIdCrudo, itemIdCrudo, nuevoEstado) => {
  const pedidoId = idValido(pedidoIdCrudo, 'pedido');
  const itemId = idValido(itemIdCrudo, 'renglón');
  const estado = String(nuevoEstado ?? '')
    .trim()
    .toUpperCase();
  if (!esEstadoItemValido(estado)) {
    throw errorHttp(400, `Estado de renglón inválido. Válidos: ${ESTADOS_ITEM.join(', ')}`);
  }

  const { rows } = await query('SELECT estado FROM pedidos WHERE id = $1', [pedidoId]);
  if (rows.length === 0) throw errorHttp(404, `No existe el pedido #${pedidoId}`);
  if (!estaAbierto(rows[0].estado)) {
    throw errorHttp(409, `El pedido #${pedidoId} está ${rows[0].estado}: ya no se tilda`);
  }

  const { rowCount } = await query(
    'UPDATE pedido_items SET estado = $1 WHERE id = $2 AND pedido_id = $3',
    [estado, itemId, pedidoId]
  );
  if (rowCount === 0) throw errorHttp(404, `El pedido #${pedidoId} no tiene el renglón #${itemId}`);
  return obtenerPedidoPorId(pedidoId);
};

/** Lo que el chofer tiene que cargar y las paradas, con los pedidos abiertos. */
export const obtenerRecorrido = async () => armarRecorrido(await listarPedidos({ abiertos: true }));
