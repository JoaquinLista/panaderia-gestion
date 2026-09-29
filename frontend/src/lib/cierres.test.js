import { describe, it, expect } from 'vitest';
import { aCampo, valorGasto } from './cierres.js';

describe('aCampo', () => {
  it.each([
    [1500.5, '1.500,5'],
    [20000, '20.000'],
    ['205350.00', '205.350,00'],
    [0, '0'],
  ])('%s se muestra como "%s"', (pesos, esperado) => {
    expect(aCampo(pesos)).toBe(esperado);
  });
});

describe('valorGasto', () => {
  it('al monto le pone los puntos de miles y al detalle lo deja igual', () => {
    expect(valorGasto('monto', { target: { value: '6000' } })).toBe('6.000');
    expect(valorGasto('detalle', { target: { value: 'Sodero 1000' } })).toBe('Sodero 1000');
  });
});
