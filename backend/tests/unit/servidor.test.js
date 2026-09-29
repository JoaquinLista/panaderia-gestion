import { describe, it, expect } from 'vitest';

import { confianzaEnProxy, opcionesPostgres, versionActual } from '../../src/config/servidor.js';

describe('opcionesPostgres', () => {
  it('sin variables usa los valores del docker compose y sin SSL', () => {
    expect(opcionesPostgres({})).toEqual({
      host: 'db',
      port: 5432,
      database: 'panaderias',
      user: 'panaderias',
      password: 'panaderias',
      ssl: undefined,
    });
  });

  it('en Azure la conexión va con SSL y verifica el certificado', () => {
    const opciones = opcionesPostgres({
      POSTGRES_HOST: 'lafueguina.postgres.database.azure.com',
      POSTGRES_PORT: '5432',
      POSTGRES_DB: 'produccion',
      POSTGRES_SSL: 'true',
    });
    expect(opciones).toMatchObject({
      host: 'lafueguina.postgres.database.azure.com',
      database: 'produccion',
      ssl: { rejectUnauthorized: true },
    });
  });

  it('cualquier otro valor de POSTGRES_SSL deja la conexión sin SSL', () => {
    expect(opcionesPostgres({ POSTGRES_SSL: 'false' }).ssl).toBeUndefined();
  });
});

describe('confianzaEnProxy', () => {
  it('por defecto confía sólo en el Nginx de la red interna', () => {
    expect(confianzaEnProxy({})).toBe('loopback, uniquelocal');
    expect(confianzaEnProxy({ TRUST_PROXY: '  ' })).toBe('loopback, uniquelocal');
  });

  it('un número es la cantidad de proxies adelante (en Azure, dos)', () => {
    expect(confianzaEnProxy({ TRUST_PROXY: '2' })).toBe(2);
  });

  it('cualquier otro texto se pasa tal cual a Express', () => {
    expect(confianzaEnProxy({ TRUST_PROXY: 'loopback' })).toBe('loopback');
  });
});

describe('versionActual', () => {
  it('es el SHA que puso el pipeline, o "local" en la compu', () => {
    expect(versionActual({ APP_VERSION: 'abc1234' })).toBe('abc1234');
    expect(versionActual({ APP_VERSION: '' })).toBe('local');
    expect(versionActual({})).toBe('local');
  });
});
