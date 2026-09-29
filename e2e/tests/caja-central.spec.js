import { test, expect } from '@playwright/test';
import { ADMIN, entrar } from './helpers.js';

// "$ 1.098.000,50" → 1098000.5
const aNumero = (texto) => Number(texto.replace(/[^\d,]/g, '').replace(',', '.'));

// Sprint 5: el efectivo de un cierre entra solo a la caja central y un pago
// cargado por la dueña baja el saldo.
test('el retiro de un cierre entra a la caja central y un pago baja el saldo', async ({ page }) => {
  await entrar(page, ADMIN);

  // ---- La dueña carga el cierre del mediodía del Café ----
  await page.getByLabel('Sucursal').selectOption({ label: 'Café' });
  const cierre = page.getByRole('form', { name: 'Cierre de caja' });
  await cierre.getByLabel('Mediodía').check();
  await cierre.getByLabel('Total del controlador (Z)').fill('50.000');
  await cierre.getByLabel('Efectivo contado en la caja').fill('60.000');
  await cierre.getByLabel('Cambio fijo que queda').fill('10.000');
  await expect(cierre.getByRole('status')).toContainText('Sin diferencia');
  await cierre.getByRole('button', { name: 'Enviar cierre del mediodía' }).click();
  await expect(page.getByText('Cierre del mediodía enviado.')).toBeVisible();

  // ---- En la caja central aparece lo que se retiró: 60.000 − 10.000 ----
  await page.getByRole('button', { name: 'Caja central' }).click();
  const entradas = page.getByRole('list', { name: 'Entradas de hoy' });
  await expect(entradas.getByRole('listitem').filter({ hasText: 'Café · Mediodía' })).toContainText(
    '50.000,00'
  );

  const saldo = page.getByLabel('Saldo de la caja central');
  const antes = aNumero(await saldo.innerText());

  // ---- Paga algo desde la caja central y el saldo baja ----
  const form = page.getByRole('form', { name: 'Cargar movimiento' });
  await form.getByLabel('Qué pasó').selectOption({ label: 'Pago' });
  await form.getByLabel('Sale de').selectOption({ label: 'Caja central' });
  await form.getByLabel('Categoría').selectOption({ label: 'Proveedores' });
  await form.getByLabel('Monto').fill('12000');
  await form.getByLabel('Concepto').fill('Prueba e2e: harina');
  await form.getByRole('button', { name: 'Guardar movimiento' }).click();
  await expect(page.getByText('Pago guardado.')).toBeVisible();

  await expect.poll(async () => aNumero(await saldo.innerText())).toBe(antes - 12000);
  await expect(page.getByRole('list', { name: 'Movimientos del mes' })).toContainText(
    'Proveedores · Prueba e2e: harina'
  );

  // ---- Y la planilla del mes se descarga ----
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar Excel del mes' }).click(),
  ]);
  expect(descarga.suggestedFilename()).toMatch(/^caja-central-\d{4}-\d{2}\.xlsx$/);
});
