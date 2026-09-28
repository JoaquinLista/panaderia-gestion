import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // index.js arranca el servidor y config/db.js crea el pool de Postgres:
      // son infraestructura y se prueban con el sistema levantado (e2e), no con unit tests.
      exclude: ['src/index.js', 'src/config/db.js'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      // Umbral mínimo: si la cobertura baja de acá, `npm run test:coverage` falla
      // y el pipeline bloquea el merge. Ver decisiones.md (Sprint 1).
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
