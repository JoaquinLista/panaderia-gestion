import { describe, it, expect } from 'vitest';

import { hashearPassword, verificarPassword } from '../../src/domain/password.js';

describe('contraseñas', () => {
  it('nunca guarda la contraseña en texto plano y usa un salt distinto cada vez', async () => {
    const a = await hashearPassword('medialunas');
    const b = await hashearPassword('medialunas');
    expect(a).not.toContain('medialunas');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toBe(b);
  });

  it('acepta la contraseña correcta y rechaza una incorrecta', async () => {
    const hash = await hashearPassword('medialunas');
    expect(await verificarPassword('medialunas', hash)).toBe(true);
    expect(await verificarPassword('Medialunas', hash)).toBe(false);
  });

  it.each([
    ['vacío', ''],
    ['nulo', null],
    ['otro formato', 'bcrypt$10$abc'],
    ['sin hash', 'scrypt$16384$8$1$c2FsdA==$'],
    ['parámetros inválidos', 'scrypt$abc$8$1$c2FsdA==$aGFzaA=='],
  ])('rechaza un hash guardado %s', async (_caso, guardado) => {
    expect(await verificarPassword('medialunas', guardado)).toBe(false);
  });
});
