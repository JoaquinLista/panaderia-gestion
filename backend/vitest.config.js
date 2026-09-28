import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Los tests de integración necesitan un Postgres real: corren con `npm run test:integracion`.
    exclude: ['tests/integracion/**'],
    // Secreto descartable sólo para los tests: el real entra por el entorno.
    env: { JWT_SECRET: 'secreto-de-prueba-de-al-menos-32-caracteres' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // index.js arranca el servidor, config/db.js crea el pool de Postgres y migrarCli.js es el comando `npm run migrate`:
      // son infraestructura y se prueban con el sistema levantado (e2e), no con unit tests.
      exclude: ['src/index.js', 'src/config/db.js', 'src/db/migrarCli.js'],
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
