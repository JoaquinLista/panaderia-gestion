import { describe, it, expect } from 'vitest';
import { aCentavos, aPesos, calcularCuadre, leerMonto, mostrarPesos } from './cuadre.js';

// Los mismos casos que backend/tests/unit/cuadre.test.js.
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

  it.each([[-1], ['-1'], ['1.234'], ['1,50'], ['abc'], [''], [null], [1e21], ['100000000.00']])(
    '%j no es un monto válido',
    (valor) => {
      expect(aCentavos(valor)).toBeNull();
    }
  );
});

describe('aPesos', () => {
  it.each([
    [150050, '1500.50'],
    [5, '0.05'],
    [-200000, '-2000.00'],
  ])('%i centavos son "%s"', (centavos, pesos) => {
    expect(aPesos(centavos)).toBe(pesos);
  });
});

describe('leerMonto: como se escribe en Argentina', () => {
  it.each([
    ['', 0],
    ['  ', 0],
    [undefined, 0],
    ['12000', 1200000],
    ['12.000', 1200000],
    ['1.500.000', 150000000],
    ['1.500,50', 150050],
    ['1500,5', 150050],
    ['1500.50', 150050],
    ['$ 12.000', 1200000],
    ['0,10', 10],
  ])('"%s" son %i centavos', (texto, centavos) => {
    expect(leerMonto(texto)).toBe(centavos);
  });

  it.each(['abc', '12,5,0', '-100', '1.5000', '10,123'])('"%s" no se entiende', (texto) => {
    expect(leerMonto(texto)).toBeNull();
  });
});

describe('mostrarPesos', () => {
  it('usa punto de miles y coma decimal', () => {
    // Intl separa "$" del número con un espacio duro.
    expect(mostrarPesos(150050).replace(/\s/g, ' ')).toBe('$ 1.500,50');
  });
});

describe('calcularCuadre', () => {
  it('Estrada, noche: cuadra', () => {
    const r = calcularCuadre({
      totalControlador: 48530000,
      efectivoContado: 23250000,
      cambioFijo: 2000000,
      posnet: 16890000,
      transferencias: 9240000,
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
      posnet: 7425000,
      transferencias: 3110000,
      gastos: [],
    });
    expect(r.diferencia).toBe(-200000);
  });

  it('centavos que en punto flotante no darían exacto (0,10 + 0,20 = 0,30)', () => {
    const r = calcularCuadre({
      totalControlador: 30,
      efectivoContado: 10,
      cambioFijo: 0,
      posnet: 20,
      transferencias: 0,
      gastos: [],
    });
    expect(r.diferencia).toBe(0);
  });
});
