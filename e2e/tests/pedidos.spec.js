import { test, expect } from '@playwright/test';
import { crearUsuario, entrar, unico } from './helpers.js';

// Sprint 9 (#77): la sucursal pide por rubro, el chofer lo carga desde su
// recorrido y lo lleva, y la sucursal confirma que le llegó. Se usa Patagonia
// para no cruzarse con las otras pruebas.
test('Patagonia pide facturas, el chofer las lleva y Patagonia confirma', async ({
  page,
  baseURL,
}) => {
  const password = 'clave-de-prueba-e2e'; // gitleaks:allow (usuarios de prueba)
  const empleada = unico('e2e-pide');
  const chofer = unico('e2e-chofer');
  await crearUsuario(baseURL, { usuario: empleada, nombre: 'Empleada', password, rol: 'EMPLEADA' });
  await crearUsuario(baseURL, { usuario: chofer, nombre: 'Chofer', password, rol: 'CHOFER' });
  // Texto único: la base de staging guarda los pedidos de corridas anteriores.
  const detalle = `2 latas de medialunas (${unico('e2e')})`;
  const tarjeta = () => page.locator('li.pedido', { hasText: detalle });

  await entrar(page, { usuario: empleada, password, sucursal: 'Patagonia' });
  await expect(page.getByText('Pedido de Patagonia.')).toBeVisible();
  await page.getByRole('button', { name: '+ Facturas' }).click();
  await page.getByRole('textbox', { name: 'Facturas', exact: true }).fill(detalle);
  await page.getByLabel('Es urgente').check();
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(page.getByRole('status')).toHaveText('Pedido enviado. Lo prepara Viedma (Chacra).');
  await expect(tarjeta()).toContainText('Pendiente');
  await expect(tarjeta()).toContainText('Urgente');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();

  // El chofer arranca en su recorrido: lo carga en la fábrica, sale y lo entrega.
  await entrar(page, { usuario: chofer, password });
  const paraCargar = page.locator('li.carga-renglon', { hasText: detalle });
  await expect(paraCargar).toContainText('Patagonia:');
  await expect(paraCargar).toContainText('Urgente');
  await paraCargar.getByRole('button', { name: 'Lo llevo' }).click();
  await expect(paraCargar.locator('.badge', { hasText: 'Lo llevo' })).toBeVisible();
  await page.getByRole('button', { name: 'Salgo de Viedma (Chacra)' }).click();
  await expect(page.getByRole('status')).toContainText('Saliste de Viedma (Chacra)');
  await tarjeta().getByRole('button', { name: 'Entregado' }).click();
  await expect(page.getByRole('status')).toHaveText('Entregado en Patagonia.');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();

  await entrar(page, { usuario: empleada, password, sucursal: 'Patagonia' });
  await tarjeta().getByRole('button', { name: 'Llegó' }).click();
  await expect(tarjeta()).toContainText('Recibido');
});
