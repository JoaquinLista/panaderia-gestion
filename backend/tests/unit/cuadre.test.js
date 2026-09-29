import { describe, it, expect } from 'vitest';
import { aCentavos, aPesos, calcularCuadre } from '../../src/domain/cuadre.js';

describe('aCentavos', () => {
  it.each([
    [1500, 150000],
    ['1500', 150000],
    ['1500.5', 150050],
    [1500.25, 150025],
    [' 0.10 ', 10],
    [0, 0],
    ['99999999.99', 9999999999],
  ])('%j son %i centavos', (valor, centavos) => {
    expect(aCentavos(valor)).toBe(centavos);
  });

  it.each([
    [-1],
    ['-1'],
    ['1.234'],
    ['1,50'],
    ['abc'],
    [''],
    [null],
    [undefined],
    [Number.NaN],
    [1e21],
    ['100000000.00'],
    [{}],
  ])('%j no es un monto válido', (valor) => {
    expect(aCentavos(valor)).toBeNull();
  });
});

describe('aPesos', () => {
  it.each([
    [150050, '1500.50'],
    [5, '0.05'],
    [0, '0.00'],
    [-200000, '-2000.00'],
    [-7, '-0.07'],
  ])('%i centavos son "%s"', (centavos, pesos) => {
    expect(aPesos(centavos)).toBe(pesos);
  });
});

// Los mismos ejemplos que el desglose del Sprint 3: el frontend prueba su copia con estos casos.
describe('calcularCuadre', () => {
  it('Estrada, noche: cuadra', () => {
    const r = calcularCuadre({
      totalControlador: 48530000,
      efectivoContado: 23250000,
      cambioFijo: 2000000,
      debito: 10000000,
      credito: 6890000,
      qr: 9240000,
      gastos: [600000, 550000],
    });
    expect(r).toEqual({
      efectivoVentas: 21250000,
      totalGastos: 1150000,
      totalCargado: 48530000,
      diferencia: 0,
    });
  });

  it('Café, mediodía: faltan $2.000', () => {
    const r = calcularCuadre({
      totalControlador: 20535000,
      efectivoContado: 11300000,
      cambioFijo: 1500000,
      debito: 5000000,
      credito: 2425000,
      qr: 3110000,
      gastos: [],
    });
    expect(r.diferencia).toBe(-200000);
  });

  it('centavos que en punto flotante no darían exacto (0,10 + 0,20 = 0,30)', () => {
    const r = calcularCuadre({
      totalControlador: aCentavos('0.30'),
      efectivoContado: aCentavos('0.10'),
      cambioFijo: 0,
      debito: aCentavos('0.20'),
      credito: 0,
      qr: 0,
      gastos: [],
    });
    expect(r.diferencia).toBe(0);
  });

  it('las transferencias de un cierre viejo también cuentan', () => {
    const r = calcularCuadre({
      totalControlador: 10000,
      efectivoContado: 4000,
      cambioFijo: 0,
      debito: 1000,
      credito: 2000,
      qr: 1000,
      transferencias: 2000,
      gastos: [],
    });
    expect(r.diferencia).toBe(0);
  });

  it('si sobra plata la diferencia es positiva', () => {
    const r = calcularCuadre({
      totalControlador: 10000,
      efectivoContado: 15000,
      cambioFijo: 4000,
      debito: 0,
      credito: 0,
      qr: 0,
      gastos: [],
    });
    expect(r.diferencia).toBe(1000);
  });
});
