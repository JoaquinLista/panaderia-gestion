import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/db.js', () => ({ getClient: vi.fn() }));

const { getClient } = await import('../../src/config/db.js');
const { aplicarMigraciones, DIRECTORIO_MIGRACIONES } = await import('../../src/db/migrar.js');

const cliente = { release: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  getClient.mockResolvedValue(cliente);
});

describe('aplicarMigraciones', () => {
  it('corre las migraciones hacia arriba, en orden y esperando el lock', async () => {
    const ejecutar = vi.fn().mockResolvedValue([{ name: '0003_usuarios' }]);
    const log = vi.fn();

    const nombres = await aplicarMigraciones({ ejecutar, log });

    expect(nombres).toEqual(['0003_usuarios']);
    expect(ejecutar).toHaveBeenCalledWith(
      expect.objectContaining({
        dbClient: cliente,
        dir: DIRECTORIO_MIGRACIONES,
        direction: 'up',
        checkOrder: true,
        advisoryLockMode: 'wait',
      })
    );
    expect(log).toHaveBeenCalledWith('[db] Migraciones aplicadas: 0003_usuarios');
    expect(cliente.release).toHaveBeenCalled();
  });

  it('avisa cuando el esquema ya está al día', async () => {
    const log = vi.fn();
    await aplicarMigraciones({ ejecutar: vi.fn().mockResolvedValue([]), log });
    expect(log).toHaveBeenCalledWith('[db] Esquema al día, no hay migraciones pendientes.');
  });

  it('libera la conexión aunque la migración falle', async () => {
    const ejecutar = vi.fn().mockRejectedValue(new Error('sintaxis inválida'));
    await expect(aplicarMigraciones({ ejecutar, log: vi.fn() })).rejects.toThrow(
      'sintaxis inválida'
    );
    expect(cliente.release).toHaveBeenCalled();
  });

  it('apunta a la carpeta migrations del backend', () => {
    expect(DIRECTORIO_MIGRACIONES).toMatch(/backend[/\\]migrations$/);
  });
});
