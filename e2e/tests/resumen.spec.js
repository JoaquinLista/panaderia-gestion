import { test, expect } from '@playwright/test';
import { ADMIN, entrar } from './helpers.js';

// Sprint 7: lo que se carga en un cierre aparece en el resumen de la dueña, y
// el turno que todavía no se cargó figura como pendiente.
test('el cierre del mediodía se ve en el resumen y falta el de la noche', async ({ page }) => {
  await entrar(page, ADMIN);

  // La dueña entra y lo primero que ve es el resumen del día.
  await expect(page.getByRole('heading', { name: /^Hoy / })).toBeVisible();

  // ---- Carga el cierre del mediodía de Viedma (ninguna otra prueba la usa) ----
  await page.getByRole('button', { name: 'Cierre de caja' }).click();
  await page.getByLabel('Sucursal').selectOption({ label: 'Viedma (Chacra)' });
  const cierre = page.getByRole('form', { name: 'Cierre de caja' });
  await cierre.getByLabel('Mediodía').check();
  await cierre.getByLabel('Total del controlador (Z)').fill('80.000');
  await cierre.getByLabel('Efectivo contado en la caja').fill('60.000');
  await cierre.getByLabel('Cambio fijo que queda').fill('10.000');
  await cierre.getByLabel('Débito').fill('30.000');
  await expect(cierre.getByRole('status')).toContainText('Sin diferencia');
  await cierre.getByRole('button', { name: 'Enviar cierre del mediodía' }).click();
  await expect(page.getByText('Cierre del mediodía enviado.')).toBeVisible();

  // ---- En el resumen: lo vendido en Viedma y que falta su noche ----
  await page.getByRole('button', { name: 'Resumen' }).click();
  const porSucursal = page.getByRole('list', { name: 'Vendido por sucursal' });
  const viedma = porSucursal.getByRole('listitem').filter({ hasText: 'Viedma' });
  await expect(viedma).toContainText('80.000,00');
  await expect(viedma).not.toContainText('sin cierres');
  await expect(page.getByRole('status').filter({ hasText: /Falta/ })).toContainText(
    'Viedma (Chacra): noche'
  );
});
