import { vi } from 'vitest';

/**
 * Reemplaza `fetch` por una API en memoria.
 * `rutas` mapea "MÉTODO /api/ruta" a una función (body) => [status, respuesta].
 * Devuelve el mock para poder inspeccionar las llamadas.
 */
export function apiFalsa(rutas) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opciones = {}) => {
    const metodo = opciones.method ?? 'GET';
    const handler = rutas[`${metodo} ${url}`];
    const body = opciones.body ? JSON.parse(opciones.body) : undefined;
    const [status, respuesta] = handler
      ? handler(body)
      : [404, { error: `Sin ruta ${metodo} ${url}` }];
    return { ok: status < 400, status, json: async () => respuesta };
  });
}

export const sucursales = [
  { id: 5, nombre: 'Galpón Central', tipo: 'DEPOSITO' },
  { id: 1, nombre: 'Viedma (Chacra)', tipo: 'FABRICA' },
  { id: 2, nombre: 'Estrada', tipo: 'VENTA' },
  { id: 3, nombre: 'Café', tipo: 'VENTA' },
];

export const productos = [
  { id: 1, nombre: 'Medialunas', unidad_medida: 'docena' },
  { id: 2, nombre: 'Pan Baguette', unidad_medida: 'unidad' },
];
