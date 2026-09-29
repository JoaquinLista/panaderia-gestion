import { describe, it, expect } from 'vitest';
import { hoyEnArgentina } from '../../src/domain/fecha.js';

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
