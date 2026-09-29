import { describe, it, expect } from 'vitest';
import { describir, movimientoDe, nombreMes, rangoDelMes } from './cajaCentral.js';

const mov = (extra) => ({ monto: 1500.5, cuenta: 'CAJA', concepto: null, ...extra });

describe('describir', () => {
  it.each([
    [mov({ tipo: 'RETIRO_SUCURSAL', sucursal: 'Estrada', turno: 'NOCHE' }), 'Estrada · Noche'],
    [mov({ tipo: 'PAGO', categoria: 'Proveedores', concepto: 'Harina' }), 'Proveedores · Harina'],
    [mov({ tipo: 'RETIRO_DUENO', dueno: 'Fernanda' }), 'Retiro de Fernanda'],
    [
      mov({ tipo: 'RETIRO_DUENO', dueno: 'Gabriel', concepto: 'Sueldo' }),
      'Retiro de Gabriel · Sueldo',
    ],
    [mov({ tipo: 'AJUSTE', concepto: 'Arqueo' }), 'Ajuste · Arqueo'],
    [mov({ tipo: 'DEPOSITO' }), 'Depósito al banco'],
    [mov({ tipo: 'SALDO_INICIAL', concepto: 'Lo que había' }), 'Saldo inicial · Lo que había'],
  ])('%j → "%s"', (m, texto) => {
    expect(describir(m)).toBe(texto);
  });
});

describe('movimientoDe', () => {
  it.each([
    [mov({ tipo: 'RETIRO_SUCURSAL' }), 150050, 'Caja central'],
    [mov({ tipo: 'DEPOSITO' }), 0, 'Caja central → Banco Patagonia'],
    [mov({ tipo: 'PAGO', cuenta: 'BANCO' }), -150050, 'Banco Patagonia'],
    [mov({ tipo: 'RETIRO_DUENO' }), -150050, 'Caja central'],
    [mov({ tipo: 'AJUSTE', monto: -200 }), -20000, 'Caja central'],
    [mov({ tipo: 'SALDO_INICIAL', cuenta: 'BANCO' }), 150050, 'Banco Patagonia'],
  ])('%j', (m, centavos, cuenta) => {
    expect(movimientoDe(m)).toEqual({ centavos, cuenta });
  });
});

describe('meses', () => {
  it('nombra el mes en castellano', () => {
    expect(nombreMes('2026-09')).toBe('septiembre de 2026');
  });

  it.each([
    ['2026-09', '2026-09-30'],
    ['2028-02', '2028-02-29'],
  ])('%s termina el %s', (mes, hasta) => {
    expect(rangoDelMes(mes)).toEqual({ desde: `${mes}-01`, hasta });
  });
});
