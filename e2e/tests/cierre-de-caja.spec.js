import { test, expect } from '@playwright/test';
import { ADMIN, crearUsuario, entrar, unico } from './helpers.js';

// El flujo crítico del MVP (#8, #9, #10): la empleada carga el cierre desde el
// celular y la dueña lo ve, lo corrige si hace falta y lo marca revisado.
test('la empleada carga un cierre con diferencia y la dueña lo revisa', async ({
  browser,
  baseURL,
}) => {
  const empleada = {
    usuario: unico('lucia'),
    nombre: 'Lucía E2E',
    password: 'clave-de-prueba-e2e',
    rol: 'EMPLEADA',
    puedeCerrarCaja: true,
  };
  await crearUsuario(baseURL, empleada);

  // ---- La empleada, en su celular ----
  const celularEmpleada = await browser.newContext();
  const pagina = await celularEmpleada.newPage();
  await entrar(pagina, { ...empleada, sucursal: 'Patagonia' });

  await expect(pagina.getByText(/Patagonia · hoy/)).toBeVisible();
  const form = pagina.getByRole('form', { name: 'Cierre de caja' });
  await form.getByText('Noche').click();
  await form.getByLabel('Total del controlador (Z)').fill('205.350');
  await form.getByLabel('Efectivo contado en la caja').fill('113.000');
  await form.getByLabel('Cambio fijo que queda').fill('15.000');
  // Se escribe sin puntos: el campo los pone solo.
  await form.getByLabel('Débito').fill('50000');
  await expect(form.getByLabel('Débito')).toHaveValue('50.000');
  await form.getByLabel('Crédito').fill('30.350');
  await form.getByLabel('QR').fill('20.000');
  // Un gasto chico pagado con la caja, con su categoría de la planilla.
  await form.getByRole('button', { name: '+ Agregar gasto' }).click();
  await form.getByLabel('Categoría del gasto 1').selectOption({ label: 'Proveedores' });
  await form.getByLabel('Detalle del gasto 1').fill('Sodero');
  await form.getByLabel('Monto del gasto 1').fill('5.000');

  // La diferencia se ve mientras carga: faltan $2.000
  await expect(form.getByRole('status')).toContainText('Faltan');
  await expect(form.getByRole('status')).toContainText('2.000,00');
  await form.getByLabel('Comentario (opcional)').fill('Prueba e2e: faltan 2.000');
  await form.getByRole('button', { name: 'Enviar cierre de la noche' }).click();

  await expect(pagina.getByText('Cierre de la noche enviado.')).toBeVisible();
  await expect(pagina.getByRole('list', { name: 'Cierres de hoy' })).toContainText('Noche');
  await celularEmpleada.close();

  // ---- La dueña, en otro celular ----
  const celularDueña = await browser.newContext();
  const dueña = await celularDueña.newPage();
  await entrar(dueña, ADMIN);
  await dueña.getByRole('button', { name: 'Revisión de cierres' }).click();
  await dueña.getByLabel('Sólo los que hay que revisar').check();

  const lista = dueña.getByRole('list', { name: 'Cierres', exact: true });
  const cierre = lista.getByRole('listitem').filter({ hasText: 'Patagonia · Noche' });
  await expect(cierre).toContainText('A REVISAR');
  await expect(cierre).toContainText('Prueba e2e: faltan 2.000');

  await cierre.getByRole('button', { name: /Patagonia · Noche/ }).click();
  await dueña.getByRole('button', { name: 'Marcar revisado' }).click();
  await expect(dueña.getByText('Marcado como revisado.')).toBeVisible();
  await expect(dueña.getByText(/revisado por/)).toBeVisible();

  // Ya no aparece entre los que hay que revisar.
  await dueña.getByRole('button', { name: '← Volver a la lista' }).click();
  await dueña.getByLabel('Sólo los que hay que revisar').check();
  await expect(
    dueña
      .getByRole('list', { name: 'Cierres', exact: true })
      .getByRole('listitem')
      .filter({ hasText: 'Patagonia · Noche' })
  ).toHaveCount(0);
  await celularDueña.close();
});
