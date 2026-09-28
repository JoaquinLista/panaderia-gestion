import { describe, it, expect } from 'vitest';
import { formatFecha, nombreSucursal } from './formato.js';

describe('formatFecha', () => {
  it('muestra un guion si no hay fecha', () => {
    expect(formatFecha(null)).toBe('—');
    expect(formatFecha('')).toBe('—');
  });

  it('devuelve el valor original si no es una fecha válida', () => {
    expect(formatFecha('mañana')).toBe('mañana');
  });

  it('formatea en español de Argentina (día/mes/año)', () => {
    const texto = formatFecha('2026-09-28T15:30:00');
    expect(texto).toMatch(/^28\/09\/2026/);
  });
});

describe('nombreSucursal', () => {
  const sucursales = [
    { id: 1, nombre: 'Viedma (Chacra)' },
    { id: 2, nombre: 'Estrada' },
  ];

  it('encuentra la sucursal aunque el id venga como texto', () => {
    expect(nombreSucursal(sucursales, '2')).toBe('Estrada');
  });

  it('muestra el id si la sucursal no existe', () => {
    expect(nombreSucursal(sucursales, 9)).toBe('#9');
  });
});
