import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import { tienePermiso, useAuth } from './contexto.js';

describe('contexto de sesión', () => {
  it('useAuth fuera del AuthProvider avisa el error', () => {
    const SinProvider = () => {
      useAuth();
      return null;
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<SinProvider />)).toThrow(/AuthProvider/);
  });

  it('tienePermiso mira la lista de permisos de la sesión', () => {
    const sesion = { permisos: ['pedidos:crear'] };
    expect(tienePermiso(sesion, 'pedidos:crear')).toBe(true);
    expect(tienePermiso(sesion, 'usuarios:administrar')).toBe(false);
    expect(tienePermiso(null, 'pedidos:crear')).toBe(false);
  });
});
