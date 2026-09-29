import { describe, it, expect } from 'vitest';

import { anchoBarra, describirPendientes, dia, leerVariacion, soloMes } from './dashboard.js';

describe('leerVariacion', () => {
  it('ventas que suben están bien; gastos que suben, mal', () => {
    expect(leerVariacion(15, 'sube')).toEqual({ texto: 'Subió 15 %', tono: 'bien', sube: true });
    expect(leerVariacion(12.5, 'baja')).toEqual({ texto: 'Subió 12,5 %', tono: 'mal', sube: true });
    expect(leerVariacion(-8.3, 'baja')).toEqual({ texto: 'Bajó 8,3 %', tono: 'bien', sube: false });
    expect(leerVariacion(-20, 'sube')).toEqual({ texto: 'Bajó 20 %', tono: 'mal', sube: false });
  });

  it('sin cambio o sin mes anterior', () => {
    expect(leerVariacion(0)).toEqual({ texto: 'igual', tono: 'igual' });
    expect(leerVariacion(null)).toEqual({ texto: 'sin datos para comparar', tono: 'sin-datos' });
  });
});

describe('describirPendientes', () => {
  it('nombra la sucursal y los turnos que faltan', () => {
    expect(
      describirPendientes({ sucursal: 'Café', turnos_pendientes: ['MEDIODIA', 'NOCHE'] })
    ).toBe('Café: mediodía y noche');
  });
});

describe('anchoBarra', () => {
  it('es proporcional al mayor, con un mínimo para que se vea', () => {
    expect(anchoBarra(50, 200)).toBe(25);
    expect(anchoBarra(1, 1000)).toBe(2);
    expect(anchoBarra(0, 1000)).toBe(0);
    expect(anchoBarra(10, 0)).toBe(0);
  });
});

describe('fechas', () => {
  it('nombre del mes y número de día', () => {
    expect(soloMes('2026-08')).toBe('agosto');
    expect(dia('2026-09-05')).toBe('5');
  });
});
