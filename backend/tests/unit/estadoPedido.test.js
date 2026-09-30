import { describe, it, expect } from 'vitest';
import {
  ESTADOS,
  esEstadoValido,
  esEstadoItemValido,
  estaAbierto,
  puedeTransicionar,
  quienTransiciona,
  transicionesDesde,
  esEstadoFinal,
} from '../../src/domain/estadoPedido.js';

describe('máquina de estados del pedido', () => {
  it('reconoce todos los estados definidos y rechaza los desconocidos', () => {
    for (const estado of ESTADOS) expect(esEstadoValido(estado)).toBe(true);
    expect(esEstadoValido('PERDIDO')).toBe(false);
    expect(esEstadoValido('pendiente')).toBe(false);
    // Los estados de la primera versión ya no existen.
    expect(esEstadoValido('EN_PREPARACION')).toBe(false);
    expect(esEstadoValido('DESPACHADO')).toBe(false);
  });

  it.each([
    ['PENDIENTE', 'EN_CAMINO', 'reparto'],
    ['EN_CAMINO', 'ENTREGADO', 'reparto'],
    ['ENTREGADO', 'RECIBIDO', 'sucursal'],
    // Si el chofer no marcó "entregado", la sucursal igual confirma.
    ['EN_CAMINO', 'RECIBIDO', 'sucursal'],
    ['PENDIENTE', 'CANCELADO', 'sucursal'],
  ])('permite %s → %s (lo hace: %s)', (desde, hacia, quien) => {
    expect(puedeTransicionar(desde, hacia)).toBe(true);
    expect(quienTransiciona(desde, hacia)).toBe(quien);
  });

  it.each([
    ['PENDIENTE', 'ENTREGADO'], // saltea la salida
    ['EN_CAMINO', 'PENDIENTE'], // retrocede
    ['EN_CAMINO', 'CANCELADO'], // ya salió
    ['RECIBIDO', 'PENDIENTE'], // estado final
    ['CANCELADO', 'PENDIENTE'], // estado final
  ])('rechaza %s → %s', (desde, hacia) => {
    expect(puedeTransicionar(desde, hacia)).toBe(false);
    expect(quienTransiciona(desde, hacia)).toBeNull();
  });

  it('marca RECIBIDO y CANCELADO como estados finales', () => {
    expect(esEstadoFinal('RECIBIDO')).toBe(true);
    expect(esEstadoFinal('CANCELADO')).toBe(true);
    expect(esEstadoFinal('PENDIENTE')).toBe(false);
  });

  it('sólo PENDIENTE y EN_CAMINO son pedidos abiertos para el chofer', () => {
    expect(ESTADOS.filter(estaAbierto)).toEqual(['PENDIENTE', 'EN_CAMINO']);
  });

  it('los renglones se tildan como llevados o sin stock', () => {
    expect(['PENDIENTE', 'LLEVADO', 'NO_HABIA'].every(esEstadoItemValido)).toBe(true);
    expect(esEstadoItemValido('ROTO')).toBe(false);
  });

  it('devuelve una lista vacía para un estado desconocido', () => {
    expect(transicionesDesde('INEXISTENTE')).toEqual([]);
  });
});
