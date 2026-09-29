import { describe, it, expect } from 'vitest';
import { esFecha, hoyEnArgentina, rangoDelMes } from '../../src/domain/fecha.js';

// Un servidor en UTC: a las 21 h de Argentina (UTC-3) en UTC ya es medianoche.
describe('hoyEnArgentina', () => {
  it('a las 21 h de Viedma sigue siendo el mismo día aunque en UTC ya sea el siguiente', () => {
    expect(hoyEnArgentina(new Date('2026-09-30T00:30:00Z'))).toBe('2026-09-29');
  });

  it('a las 12 h de Viedma', () => {
    expect(hoyEnArgentina(new Date('2026-09-29T15:00:00Z'))).toBe('2026-09-29');
  });

  it('el día cambia a la medianoche de Argentina, no a la de UTC', () => {
    expect(hoyEnArgentina(new Date('2026-09-30T02:59:59Z'))).toBe('2026-09-29');
    expect(hoyEnArgentina(new Date('2026-09-30T03:00:00Z'))).toBe('2026-09-30');
  });

  it('sin argumento usa la hora actual', () => {
    expect(hoyEnArgentina()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('esFecha', () => {
  it.each(['2026-09-29', '2028-02-29', '2026-12-31'])('%s es una fecha', (f) => {
    expect(esFecha(f)).toBe(true);
  });

  it.each([
    '2026-02-30',
    '2026-13-01',
    '2027-02-29',
    '29/09/2026',
    '2026-9-29',
    '',
    null,
    20260929,
  ])('%j no es una fecha', (f) => {
    expect(esFecha(f)).toBe(false);
  });
});

describe('rangoDelMes', () => {
  it.each([
    ['2026-09', '2026-09-01', '2026-09-30'],
    ['2026-02', '2026-02-01', '2026-02-28'],
    ['2028-02', '2028-02-01', '2028-02-29'],
    ['2026-12', '2026-12-01', '2026-12-31'],
  ])('%s va de %s a %s', (mes, desde, hasta) => {
    expect(rangoDelMes(mes)).toEqual({ desde, hasta });
  });

  it.each(['2026-13', '2026-9', 'septiembre', undefined])('%j no es un mes', (mes) => {
    expect(rangoDelMes(mes)).toBeNull();
  });
});
