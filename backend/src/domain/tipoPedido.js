/**
 * Tipos de pedido y sus reglas de origen / destino.
 *
 * - INSUMOS   : una sucursal que fabrica pide insumos al depósito central.
 *               Depósito (origen) → Fábrica (destino). Cada línea es un insumo.
 * - PRODUCTOS : un punto de venta pide productos terminados a la fábrica.
 *               Fábrica (origen) → Venta (destino). Cada línea es un producto.
 *
 * Las reglas se expresan contra `sucursales.tipo` (provisorio hasta tener
 * roles múltiples por sucursal) y contra el rol del usuario que crea el pedido,
 * que debe pertenecer a la sucursal de destino (es quien pide).
 */
export const TIPOS_PEDIDO = ['INSUMOS', 'PRODUCTOS'];

export const REGLA_TIPO = {
  INSUMOS: {
    tipoOrigen: 'DEPOSITO',
    tipoDestino: 'FABRICA',
    rolCrea: 'FABRICA',
    item: 'insumo', // columna: insumo_id
  },
  PRODUCTOS: {
    tipoOrigen: 'FABRICA',
    tipoDestino: 'VENTA',
    rolCrea: 'VENTA',
    item: 'producto', // columna: producto_id
  },
};

export const esTipoValido = (tipo) => TIPOS_PEDIDO.includes(tipo);
