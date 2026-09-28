import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // index.js sólo arranca el servidor; se prueba con el stack levantado (e2e).
      exclude: ['src/index.js'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
    },
  },
});
