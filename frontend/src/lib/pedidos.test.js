import { describe, it, expect } from 'vitest';

import { accionesPedido, lugaresDeOrigen, reordenar, rubrosParaPedir } from './pedidos.js';
import { sesionAdmin, sesionChofer, sesionEmpleada } from '../test/apiFalsa.js';

// Pedido de Estrada (2) a la fábrica (1).
const pedido = (estado, destino = 2) => ({ id: 1, estado, sucursal_destino_id: destino });
const etiquetas = (p, sesion) => accionesPedido(p, sesion).map((a) => a.etiqueta);

describe('accionesPedido', () => {
  it.each([
    ['PENDIENTE', ['Salió']],
    ['EN_CAMINO', ['Entregado']],
    ['ENTREGADO', []],
    ['RECIBIDO', []],
  ])('el chofer con un pedido %s ve %j', (estado, esperado) => {
    expect(etiquetas(pedido(estado), sesionChofer)).toEqual(esperado);
  });

  it.each([
    ['PENDIENTE', ['Cancelar']],
    ['EN_CAMINO', ['Llegó']],
    ['ENTREGADO', ['Llegó']],
    ['CANCELADO', []],
  ])('la empleada con un pedido %s de su sucursal ve %j', (estado, esperado) => {
    expect(etiquetas(pedido(estado), sesionEmpleada)).toEqual(esperado);
  });

  it('la empleada no toca los pedidos de otra sucursal', () => {
    expect(etiquetas(pedido('ENTREGADO', 3), sesionEmpleada)).toEqual([]);
  });

  it('la dueña puede hacer los pasos del chofer y de la sucursal', () => {
    expect(etiquetas(pedido('PENDIENTE', 3), sesionAdmin)).toEqual(['Salió', 'Cancelar']);
    expect(etiquetas(pedido('EN_CAMINO', 3), sesionAdmin)).toEqual(['Entregado', 'Llegó']);
  });
});

describe('rubrosParaPedir', () => {
  const rubros = [
    { id: 1, nombre: 'Facturas', sucursal_origen_id: 1 },
    { id: 2, nombre: 'Insumos', sucursal_origen_id: 5 },
  ];
  it('la fábrica no se pide lo que ella misma hace', () => {
    expect(rubrosParaPedir(rubros, '1').map((r) => r.nombre)).toEqual(['Insumos']);
    expect(rubrosParaPedir(rubros, 2)).toHaveLength(2);
  });
});

describe('lugaresDeOrigen', () => {
  it.each([
    [[], ''],
    [[{ sucursal_origen_nombre: 'Viedma (Chacra)' }], 'Viedma (Chacra)'],
    [
      [{ sucursal_origen_nombre: 'Viedma (Chacra)' }, { sucursal_origen_nombre: 'Galpón Central' }],
      'Viedma (Chacra) y Galpón Central',
    ],
  ])('%j → %s', (pedidos, texto) => {
    expect(lugaresDeOrigen(pedidos)).toBe(texto);
  });
});

describe('reordenar', () => {
  const lista = [
    { id: 1, orden: 10 },
    { id: 2, orden: 20 },
    { id: 3, orden: 30 },
  ];

  it('bajar uno cambia sólo los dos que se cruzan', () => {
    expect(reordenar(lista, 0, 1)).toEqual([
      { id: 2, orden: 10 },
      { id: 1, orden: 20 },
    ]);
  });

  it('renumbera de a 10 si la lista venía con órdenes raros', () => {
    const raros = [
      { id: 1, orden: 5 },
      { id: 2, orden: 5 },
      { id: 3, orden: 120 },
    ];
    expect(reordenar(raros, 2, 1)).toEqual([
      { id: 1, orden: 10 },
      { id: 3, orden: 20 },
      { id: 2, orden: 30 },
    ]);
  });
});
