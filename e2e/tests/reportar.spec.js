import { test, expect } from '@playwright/test';
import { ADMIN, abrirMenu, entrar } from './helpers.js';

// Sprint 8 (#18): desde cualquier sección se puede avisar de un problema. Sin
// token de GitHub (como en el CI) el reporte queda guardado igual.
test('la dueña reporta un problema y vuelve a donde estaba', async ({ page }) => {
  await entrar(page, ADMIN);
  await expect(page.getByRole('heading', { name: /^Hoy / })).toBeVisible();

  const menu = await abrirMenu(page);
  await menu.getByRole('button', { name: 'Reportar un problema', exact: true }).click();

  const formulario = page.getByRole('form', { name: 'Reportar un problema' });
  await formulario.getByLabel('¿Qué pasó?').fill('El resumen tarda mucho en cargar a la noche');
  await formulario.getByRole('button', { name: 'Enviar reporte' }).click();

  await expect(page.getByRole('status')).toContainText('¡Gracias! Lo recibimos.');
  await page.getByRole('button', { name: 'Volver a Resumen' }).click();
  await expect(page.getByRole('heading', { name: /^Hoy / })).toBeVisible();
});
