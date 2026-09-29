import { test, expect } from '@playwright/test';
import { ADMIN, entrar, irA } from './helpers.js';

// Sprint 8 (#17): Nginx manda una Content-Security-Policy que sólo deja cargar
// archivos de la propia app. Si algo de la pantalla la rompe, el navegador lo
// bloquea y lo avisa en la consola: esta prueba recorre las secciones y falla
// si aparece alguno de esos avisos.
test('las secciones de la dueña funcionan con la política de seguridad', async ({ page }) => {
  const bloqueados = [];
  page.on('console', (mensaje) => {
    if (/Content Security Policy/i.test(mensaje.text())) bloqueados.push(mensaje.text());
  });

  await entrar(page, ADMIN);
  await expect(page.getByRole('heading', { name: /^Hoy / })).toBeVisible();

  for (const seccion of [
    'Cierre de caja',
    'Revisión de cierres',
    'Caja central',
    'Pedidos',
    'Stock e insumos',
    'Sucursales',
    'Usuarios',
  ]) {
    await irA(page, seccion);
  }

  expect(bloqueados).toEqual([]);
});
