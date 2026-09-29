import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas end-to-end contra el sistema levantado con `docker compose up`.
 * E2E_URL apunta al frontend (Nginx), que pasa /api al backend como en producción.
 */
export default defineConfig({
  testDir: './tests',
  // Cada prueba crea sus propios usuarios, pero comparten la base: de a una.
  workers: 1,
  fullyParallel: false,
  // Sin reintentos: una prueba que falla a veces es un bug, no mala suerte.
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost',
    // Si algo falla, queda la captura y la grabación paso a paso para ver qué pasó.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  },
  projects: [
    {
      // La app se usa desde el celular: Chromium con pantalla y toque de un Pixel 7.
      name: 'celular',
      use: {
        ...devices['Pixel 7'],
        // Para correr fuera del CI con un Chromium ya instalado (opcional).
        launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {},
      },
    },
  ],
});
