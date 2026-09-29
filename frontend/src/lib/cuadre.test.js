import { describe, it, expect } from 'vitest';
import {
  aCentavos,
  aPesos,
  calcularCuadre,
  formatearMonto,
  leerMonto,
  mostrarPesos,
} from './cuadre.js';

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
    ['1.500,', 150000],
  ])('"%s" son %i centavos', (texto, centavos) => {
    expect(leerMonto(texto)).toBe(centavos);
  });

  it.each(['abc', '12,5,0', '-100', '1.5000', '10,123'])('"%s" no se entiende', (texto) => {
    expect(leerMonto(texto)).toBeNull();
  });
});

describe('formatearMonto: puntos de miles mientras se escribe', () => {
  it.each([
    ['', ''],
    ['0', '0'],
    ['15000', '15.000'],
    ['1545659', '1.545.659'],
    ['15456,59', '15.456,59'],
    ['15456,599', '15.456,59'],
    ['1.5000', '15.000'],
    ['1.50', '150'],
    ['1.500,', '1.500,'],
    [',5', '0,5'],
    ['007', '7'],
    ['$ 12.000', '12.000'],
    ['1,2,3', '1,23'],
    ['abc', ''],
  ])('"%s" queda "%s"', (texto, esperado) => {
    expect(formatearMonto(texto)).toBe(esperado);
  });

  it('lo que devuelve se lee como el mismo monto', () => {
    expect(leerMonto(formatearMonto('15456,59'))).toBe(1545659);
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
      totalControlador: 30,
      efectivoContado: 10,
      cambioFijo: 0,
      debito: 20,
      credito: 0,
      qr: 0,
      gastos: [],
    });
    expect(r.diferencia).toBe(0);
  });
});
