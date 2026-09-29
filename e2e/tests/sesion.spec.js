import { test, expect } from '@playwright/test';
import { ADMIN, crearUsuario, entrar, unico } from './helpers.js';

test('con la contraseña equivocada no entra', async ({ page }) => {
  await entrar(page, { usuario: ADMIN.usuario, password: 'no-es-esta' });
  await expect(page.getByRole('alert')).toContainText('Usuario o contraseña incorrectos');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('una empleada sin permiso de caja no ve el cierre', async ({ page, baseURL }) => {
  const empleada = {
    usuario: unico('sofia'),
    nombre: 'Sofía E2E',
    password: 'clave-de-prueba-e2e',
    rol: 'EMPLEADA',
  };
  await crearUsuario(baseURL, empleada);
  await entrar(page, { ...empleada, sucursal: 'Café' });

  const pestañas = page.getByRole('navigation');
  await expect(pestañas.getByRole('button', { name: 'Tablero de Pedidos' })).toBeVisible();
  await expect(pestañas.getByRole('button', { name: 'Cierre de caja' })).toHaveCount(0);
  await expect(pestañas.getByRole('button', { name: 'Revisión de cierres' })).toHaveCount(0);
});

test('cerrar sesión vuelve al login', async ({ page }) => {
  await entrar(page, ADMIN);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
