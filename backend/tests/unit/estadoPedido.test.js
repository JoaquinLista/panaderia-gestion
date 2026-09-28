import { describe, it, expect } from 'vitest';
import {
  ESTADOS,
  esEstadoValido,
  esEstadoInicialValido,
  puedeTransicionar,
  transicionesDesde,
  esEstadoFinal,
} from '../../src/domain/estadoPedido.js';

describe('máquina de estados del pedido', () => {
  it('reconoce todos los estados definidos y rechaza los desconocidos', () => {
    for (const estado of ESTADOS) expect(esEstadoValido(estado)).toBe(true);
    expect(esEstadoValido('PERDIDO')).toBe(false);
    expect(esEstadoValido('pendiente')).toBe(false);
  });

  it('no permite crear un pedido ya RECIBIDO o CANCELADO', () => {
    expect(esEstadoInicialValido('PENDIENTE')).toBe(true);
    expect(esEstadoInicialValido('RECIBIDO')).toBe(false);
    expect(esEstadoInicialValido('CANCELADO')).toBe(false);
  });

  it.each([
    ['PENDIENTE', 'EN_PREPARACION'],
    ['EN_PREPARACION', 'DESPACHADO'],
    ['DESPACHADO', 'ENTREGADO'],
    ['ENTREGADO', 'RECIBIDO'],
    ['PENDIENTE', 'CANCELADO'],
    ['EN_PREPARACION', 'CANCELADO'],
  ])('permite %s → %s', (desde, hacia) => {
    expect(puedeTransicionar(desde, hacia)).toBe(true);
  });

  it.each([
    ['PENDIENTE', 'DESPACHADO'], // saltea un paso
    ['DESPACHADO', 'EN_PREPARACION'], // retrocede
    ['DESPACHADO', 'CANCELADO'], // ya salió del origen
    ['RECIBIDO', 'PENDIENTE'], // estado final
    ['CANCELADO', 'PENDIENTE'], // estado final
  ])('rechaza %s → %s', (desde, hacia) => {
    expect(puedeTransicionar(desde, hacia)).toBe(false);
  });

  it('marca RECIBIDO y CANCELADO como estados finales', () => {
    expect(esEstadoFinal('RECIBIDO')).toBe(true);
    expect(esEstadoFinal('CANCELADO')).toBe(true);
    expect(esEstadoFinal('PENDIENTE')).toBe(false);
  });

  it('devuelve una lista vacía para un estado desconocido', () => {
    expect(transicionesDesde('INEXISTENTE')).toEqual([]);
  });
});
