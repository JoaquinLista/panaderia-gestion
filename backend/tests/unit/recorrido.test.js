import { describe, it, expect } from 'vitest';
import { armarRecorrido } from '../../src/domain/recorrido.js';

const FABRICA = { id: 1, nombre: 'Viedma (Chacra)' };
const GALPON = { id: 5, nombre: 'Galpón Central' };
const ESTRADA = { id: 2, nombre: 'Estrada' };
const CAFE = { id: 3, nombre: 'Café' };

const FACTURAS = { rubro_id: 20, rubro_nombre: 'Facturas', rubro_orden: 20 };
const PAN = { rubro_id: 10, rubro_nombre: 'Pan', rubro_orden: 10 };
const INSUMOS = { rubro_id: 110, rubro_nombre: 'Insumos', rubro_orden: 110 };

let siguienteItem = 1;
const pedido = ({ id, de, para, estado = 'PENDIENTE', urgente = false, hora, items }) => ({
  id,
  estado,
  urgente,
  nota: null,
  fecha_creacion: `2026-09-30T${hora}:00Z`,
  sucursal_origen_id: de.id,
  sucursal_origen_nombre: de.nombre,
  sucursal_destino_id: para.id,
  sucursal_destino_nombre: para.nombre,
  items: items.map(([rubro, detalle]) => ({
    id: siguienteItem++,
    ...rubro,
    detalle,
    estado: 'PENDIENTE',
  })),
});

describe('armarRecorrido', () => {
  it('sin pedidos no hay nada que cargar ni paradas', () => {
    expect(armarRecorrido([])).toEqual({ cargar: [], paradas: [] });
  });

  it('agrupa lo que hay que cargar por lugar y por rubro, en el orden de la lista', () => {
    const { cargar } = armarRecorrido([
      pedido({
        id: 1,
        de: FABRICA,
        para: ESTRADA,
        hora: '08:00',
        items: [
          [FACTURAS, '2 latas de medialunas'],
          [PAN, '3 bolsas'],
        ],
      }),
      pedido({
        id: 2,
        de: FABRICA,
        para: CAFE,
        hora: '08:30',
        items: [[FACTURAS, '1 lata de vigilantes']],
      }),
      pedido({
        id: 3,
        de: GALPON,
        para: ESTRADA,
        hora: '09:00',
        items: [[INSUMOS, '1 bolsa de harina']],
      }),
    ]);

    expect(cargar.map((c) => c.origen.nombre)).toEqual(['Galpón Central', 'Viedma (Chacra)']);
    const fabrica = cargar[1];
    expect(fabrica.rubros.map((r) => r.rubro.nombre)).toEqual(['Pan', 'Facturas']);
    expect(fabrica.rubros[1].renglones).toEqual([
      expect.objectContaining({
        pedido_id: 1,
        sucursal: ESTRADA,
        detalle: '2 latas de medialunas',
      }),
      expect.objectContaining({ pedido_id: 2, sucursal: CAFE, detalle: '1 lata de vigilantes' }),
    ]);
  });

  it('lo que ya está en camino no se vuelve a cargar, pero sigue en su parada', () => {
    const { cargar, paradas } = armarRecorrido([
      pedido({
        id: 1,
        de: FABRICA,
        para: ESTRADA,
        estado: 'EN_CAMINO',
        hora: '08:00',
        items: [[PAN, '3 bolsas']],
      }),
    ]);
    expect(cargar).toEqual([]);
    expect(paradas).toEqual([
      expect.objectContaining({ sucursal: ESTRADA, pedidos: [expect.objectContaining({ id: 1 })] }),
    ]);
  });

  it('pone primero los urgentes, en la carga y en las paradas', () => {
    const { cargar, paradas } = armarRecorrido([
      pedido({ id: 1, de: FABRICA, para: CAFE, hora: '07:00', items: [[PAN, 'para Café']] }),
      pedido({
        id: 2,
        de: FABRICA,
        para: ESTRADA,
        urgente: true,
        hora: '09:00',
        items: [[PAN, 'para Estrada']],
      }),
    ]);
    expect(cargar[0].rubros[0].renglones.map((r) => r.detalle)).toEqual([
      'para Estrada',
      'para Café',
    ]);
    expect(paradas.map((p) => [p.sucursal.nombre, p.urgente])).toEqual([
      ['Estrada', true],
      ['Café', false],
    ]);
  });

  it('junta en una parada todos los pedidos de la misma sucursal, el más viejo primero', () => {
    const { paradas } = armarRecorrido([
      pedido({ id: 7, de: GALPON, para: ESTRADA, hora: '10:00', items: [[INSUMOS, 'harina']] }),
      pedido({ id: 4, de: FABRICA, para: ESTRADA, hora: '08:00', items: [[PAN, 'pan']] }),
    ]);
    expect(paradas).toHaveLength(1);
    expect(paradas[0].pedidos.map((p) => p.id)).toEqual([4, 7]);
  });
});
