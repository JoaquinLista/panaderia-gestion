import { defineConfig } from 'vitest/config';

// Tests contra un Postgres real. Necesitan TEST_DATABASE_URL apuntando a una
// base con permiso para crear y borrar bases (en CI, el servicio postgres del job).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integracion/**/*.test.js'],
    // Cada archivo crea sus propias bases; se corren de a uno para no pisarse.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: { LOG_LEVEL: 'silent' },
  },
});
