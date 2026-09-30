/**
 * Recorrido del chofer (Sprint 9, #77): arma, a partir de los pedidos
 * abiertos, lo que hay que cargar en cada lugar y una parada por sucursal.
 * Es una función pura: la consulta a la base está en pedidosService.
 */

const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');

/** Urgentes primero y, entre iguales, el más viejo primero. */
const porUrgencia = (a, b) =>
  Number(b.urgente) - Number(a.urgente) ||
  new Date(a.fecha_creacion) - new Date(b.fecha_creacion) ||
  a.id - b.id;

/**
 * @param {Array<{
 *   id: number, estado: string, urgente: boolean, nota: string | null,
 *   fecha_creacion: string | Date,
 *   sucursal_origen_id: number, sucursal_origen_nombre: string,
 *   sucursal_destino_id: number, sucursal_destino_nombre: string,
 *   items: Array<{ id: number, rubro_id: number, rubro_nombre: string,
 *                  rubro_orden: number, detalle: string, estado: string }>
 * }>} pedidos  pedidos PENDIENTE o EN_CAMINO
 * @returns {{
 *   cargar: Array<{ origen: { id: number, nombre: string },
 *                   rubros: Array<{ rubro: { id: number, nombre: string }, renglones: object[] }> }>,
 *   paradas: Array<{ sucursal: { id: number, nombre: string }, urgente: boolean, pedidos: object[] }>
 * }}
 */
export const armarRecorrido = (pedidos) => {
  const ordenados = [...pedidos].sort(porUrgencia);

  // Qué cargar: sólo lo que todavía no salió, agrupado por lugar y por rubro.
  const origenes = new Map();
  for (const p of ordenados.filter((x) => x.estado === 'PENDIENTE')) {
    if (!origenes.has(p.sucursal_origen_id)) {
      origenes.set(p.sucursal_origen_id, {
        origen: { id: p.sucursal_origen_id, nombre: p.sucursal_origen_nombre },
        rubros: new Map(),
      });
    }
    const { rubros } = origenes.get(p.sucursal_origen_id);
    for (const item of p.items) {
      if (!rubros.has(item.rubro_id)) {
        rubros.set(item.rubro_id, {
          rubro: { id: item.rubro_id, nombre: item.rubro_nombre },
          orden: item.rubro_orden,
          renglones: [],
        });
      }
      rubros.get(item.rubro_id).renglones.push({
        pedido_id: p.id,
        item_id: item.id,
        sucursal: { id: p.sucursal_destino_id, nombre: p.sucursal_destino_nombre },
        detalle: item.detalle,
        urgente: p.urgente,
        estado: item.estado,
      });
    }
  }
  const cargar = [...origenes.values()]
    .sort((a, b) => porNombre(a.origen, b.origen))
    .map(({ origen, rubros }) => ({
      origen,
      rubros: [...rubros.values()]
        .sort((a, b) => a.orden - b.orden || porNombre(a.rubro, b.rubro))
        .map(({ rubro, renglones }) => ({ rubro, renglones })),
    }));

  // Paradas: una por sucursal que pidió, con urgentes arriba.
  const paradas = new Map();
  for (const p of ordenados) {
    if (!paradas.has(p.sucursal_destino_id)) {
      paradas.set(p.sucursal_destino_id, {
        sucursal: { id: p.sucursal_destino_id, nombre: p.sucursal_destino_nombre },
        urgente: false,
        pedidos: [],
      });
    }
    const parada = paradas.get(p.sucursal_destino_id);
    parada.urgente ||= p.urgente;
    parada.pedidos.push(p);
  }

  return {
    cargar,
    paradas: [...paradas.values()].sort(
      (a, b) => Number(b.urgente) - Number(a.urgente) || porNombre(a.sucursal, b.sucursal)
    ),
  };
};
