import { vi } from 'vitest';

/**
 * Reemplaza `fetch` por una API en memoria.
 * `rutas` mapea "MÉTODO /api/ruta" a una función (body) => [status, respuesta].
 * Devuelve el mock para poder inspeccionar las llamadas.
 */
export function apiFalsa(rutas) {
  // Por defecto hay una sesión de admin abierta; un test puede pisar la ruta.
  const todas = { 'GET /api/auth/me': () => [200, sesionAdmin], ...rutas };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opciones = {}) => {
    const metodo = opciones.method ?? 'GET';
    const handler = todas[`${metodo} ${url}`];
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

// Mismos permisos que devuelve el backend (domain/permisos.js) para cada rol.
export const PERMISOS_ADMIN = [
  'sucursales:ver',
  'productos:ver',
  'insumos:ver',
  'insumos:cargar',
  'pedidos:ver',
  'pedidos:crear',
  'pedidos:cambiar-estado',
  'caja:cerrar',
  'caja:revisar',
  'usuarios:administrar',
];

export const sesionAdmin = {
  usuario: { id: 1, usuario: 'dueña', nombre: 'Marta', rol: 'ADMIN', puedeCerrarCaja: false },
  sucursal: null,
  permisos: PERMISOS_ADMIN,
};

export const sesionEmpleada = {
  usuario: { id: 2, usuario: 'lucia', nombre: 'Lucía', rol: 'EMPLEADA', puedeCerrarCaja: false },
  sucursal: { id: 2, nombre: 'Estrada', tipo: 'VENTA' },
  permisos: ['sucursales:ver', 'productos:ver', 'pedidos:ver', 'pedidos:crear'],
};

export const sesionChofer = {
  usuario: { id: 3, usuario: 'marcos', nombre: 'Marcos', rol: 'CHOFER', puedeCerrarCaja: false },
  sucursal: null,
  permisos: [
    'sucursales:ver',
    'productos:ver',
    'insumos:ver',
    'insumos:cargar',
    'pedidos:ver',
    'pedidos:cambiar-estado',
  ],
};
