import { describe, it, expect } from 'vitest';
import {
  compararMovimientos,
  conSaldos,
  cuentasQueToca,
  efecto,
  retiroDeCierre,
} from '../../src/domain/cajaCentral.js';

describe('retiroDeCierre', () => {
  it('es el efectivo contado menos el cambio que queda', () => {
    expect(retiroDeCierre({ efectivoContado: 23250000, cambioFijo: 2000000 })).toBe(21250000);
  });
});

describe('efecto', () => {
  it.each([
    [
      { tipo: 'RETIRO_SUCURSAL', cuenta: 'CAJA', centavos: 500 },
      { CAJA: 500, BANCO: 0 },
    ],
    [
      { tipo: 'DEPOSITO', cuenta: 'CAJA', centavos: 500 },
      { CAJA: -500, BANCO: 500 },
    ],
    [
      { tipo: 'PAGO', cuenta: 'BANCO', centavos: 500 },
      { CAJA: 0, BANCO: -500 },
    ],
    [
      { tipo: 'RETIRO_DUENO', cuenta: 'CAJA', centavos: 500 },
      { CAJA: -500, BANCO: 0 },
    ],
    [
      { tipo: 'SALDO_INICIAL', cuenta: 'BANCO', centavos: 500 },
      { CAJA: 0, BANCO: 500 },
    ],
    [
      { tipo: 'AJUSTE', cuenta: 'CAJA', centavos: -300 },
      { CAJA: -300, BANCO: 0 },
    ],
  ])('%j', (mov, esperado) => {
    expect(efecto(mov)).toEqual(esperado);
  });

  it('un tipo desconocido es un error de programación', () => {
    expect(() => efecto({ tipo: 'OTRO', cuenta: 'CAJA', centavos: 1 })).toThrow('desconocido');
  });
});

describe('cuentasQueToca', () => {
  it('el depósito toca las dos cuentas; un pago, sólo la suya', () => {
    expect(cuentasQueToca({ tipo: 'DEPOSITO', cuenta: 'CAJA' })).toEqual(['CAJA', 'BANCO']);
    expect(cuentasQueToca({ tipo: 'PAGO', cuenta: 'BANCO' })).toEqual(['BANCO']);
    expect(cuentasQueToca({ tipo: 'RETIRO_SUCURSAL', cuenta: 'CAJA' })).toEqual(['CAJA']);
  });
});

describe('compararMovimientos', () => {
  const mov = (fecha, tipo, momento, orden = 0) => ({ fecha, tipo, momento, orden });

  it('ordena por fecha, con el saldo inicial primero y después por hora de carga', () => {
    const lista = [
      mov('2026-09-29', 'PAGO', '2026-09-29T20:00:00Z'),
      mov('2026-09-28', 'PAGO', '2026-09-29T21:00:00Z'),
      mov('2026-09-29', 'SALDO_INICIAL', '2026-09-29T22:00:00Z'),
      mov('2026-09-29', 'RETIRO_SUCURSAL', '2026-09-29T15:00:00Z', 2),
      mov('2026-09-29', 'RETIRO_SUCURSAL', '2026-09-29T15:00:00Z', 1),
    ];
    expect(lista.sort(compararMovimientos).map((m) => `${m.fecha} ${m.tipo} ${m.orden}`)).toEqual([
      '2026-09-28 PAGO 0',
      '2026-09-29 SALDO_INICIAL 0',
      '2026-09-29 RETIRO_SUCURSAL 1',
      '2026-09-29 RETIRO_SUCURSAL 2',
      '2026-09-29 PAGO 0',
    ]);
  });

  it('sin orden explícito, dos iguales quedan empatados', () => {
    const a = { fecha: '2026-09-29', tipo: 'PAGO', momento: '2026-09-29T20:00:00Z' };
    expect(compararMovimientos(a, { ...a })).toBe(0);
  });
});

// Un día como los de la planilla "Retiros".
describe('conSaldos', () => {
  it('lleva el saldo de la caja y del banco después de cada movimiento', () => {
    const r = conSaldos([
      { tipo: 'SALDO_INICIAL', cuenta: 'CAJA', centavos: 100000000 },
      { tipo: 'SALDO_INICIAL', cuenta: 'BANCO', centavos: 50000000 },
      { tipo: 'RETIRO_SUCURSAL', cuenta: 'CAJA', centavos: 21250000 },
      { tipo: 'DEPOSITO', cuenta: 'CAJA', centavos: 80000000 },
      { tipo: 'PAGO', cuenta: 'BANCO', centavos: 30000000 },
      { tipo: 'RETIRO_DUENO', cuenta: 'CAJA', centavos: 10000000 },
      { tipo: 'AJUSTE', cuenta: 'CAJA', centavos: -50000 },
    ]);
    expect(r.map((m) => [m.saldoCaja, m.saldoBanco])).toEqual([
      [100000000, 0],
      [100000000, 50000000],
      [121250000, 50000000],
      [41250000, 130000000],
      [41250000, 100000000],
      [31250000, 100000000],
      [31200000, 100000000],
    ]);
  });

  it('sin movimientos no hay nada', () => {
    expect(conSaldos([])).toEqual([]);
  });
});
