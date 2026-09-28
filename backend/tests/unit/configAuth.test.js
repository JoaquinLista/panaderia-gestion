import { describe, it, expect, afterEach, vi } from 'vitest';

import { configAuth } from '../../src/config/auth.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('configAuth', () => {
  it('no deja arrancar sin JWT_SECRET o con uno corto', () => {
    vi.stubEnv('JWT_SECRET', '');
    expect(() => configAuth()).toThrow(/JWT_SECRET/);
    vi.stubEnv('JWT_SECRET', 'corto');
    expect(() => configAuth()).toThrow(/32 caracteres/);
  });

  it('la cookie es Secure en producción y se puede apagar con COOKIE_SECURE=false', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(configAuth().cookieSegura).toBe(true);
    vi.stubEnv('COOKIE_SECURE', 'false');
    expect(configAuth().cookieSegura).toBe(false);
  });

  it('fuera de producción la cookie no es Secure salvo que se pida', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(configAuth().cookieSegura).toBe(false);
    vi.stubEnv('COOKIE_SECURE', 'true');
    expect(configAuth().cookieSegura).toBe(true);
  });
});
