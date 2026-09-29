import { expect, request } from '@playwright/test';

// El admin inicial que crea el backend al arrancar (ADMIN_USUARIO / ADMIN_PASSWORD).
export const ADMIN = {
  usuario: process.env.ADMIN_USUARIO ?? 'admin',
  password: process.env.ADMIN_PASSWORD ?? '',
};

/** Nombre único por corrida, para no chocar con datos de otra prueba. */
export const unico = (prefijo) => `${prefijo}-${Date.now().toString(36)}`;

/**
 * Crea un usuario por la API con la sesión del admin, como lo haría la dueña
 * desde la pantalla de usuarios (esa pantalla ya tiene sus propios tests).
 * @param {{ usuario: string, nombre: string, password: string, rol: string, puedeCerrarCaja?: boolean }} datos
 */
export const crearUsuario = async (baseURL, datos) => {
  const api = await request.newContext({ baseURL });
  const entrada = await api.post('/api/auth/login', { data: ADMIN });
  expect(entrada.ok(), 'el admin inicial tiene que poder entrar').toBeTruthy();
  const alta = await api.post('/api/usuarios', { data: datos });
  expect(alta.status()).toBe(201);
  await api.dispose();
};

/**
 * Entra por la pantalla de login.
 * @param {import('@playwright/test').Page} page
 * @param {{ usuario: string, password: string, sucursal?: string }} datos
 */
export const entrar = async (page, { usuario, password, sucursal }) => {
  await page.goto('/');
  await page.getByLabel('Usuario').fill(usuario);
  await page.getByLabel('Contraseña').fill(password);
  if (sucursal) {
    await page.getByLabel('¿Dónde trabajás hoy?').selectOption({ label: sucursal });
  }
  await page.getByRole('button', { name: 'Entrar' }).click();
};

/**
 * Abre el menú de secciones si está cerrado (en el celular arranca cerrado) y
 * lo devuelve. Cerrado no está en el árbol de accesibilidad: se busca por id.
 * @param {import('@playwright/test').Page} page
 */
export const abrirMenu = async (page) => {
  const menu = page.locator('#menu-secciones');
  await menu.waitFor({ state: 'attached' });
  if (!(await menu.isVisible())) {
    await page.getByRole('button', { name: /^Menú · / }).click();
  }
  return menu;
};

/**
 * Va a una sección del menú.
 * @param {import('@playwright/test').Page} page
 * @param {string} seccion  el nombre tal como aparece en el menú
 */
export const irA = async (page, seccion) => {
  const menu = await abrirMenu(page);
  await menu.getByRole('button', { name: seccion, exact: true }).click();
};
