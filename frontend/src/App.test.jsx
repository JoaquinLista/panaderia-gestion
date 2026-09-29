import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';

const datos = {
  '/api/auth/me': {
    usuario: { id: 1, usuario: 'dueña', nombre: 'Marta', rol: 'ADMIN' },
    sucursal: null,
    permisos: ['pedidos:ver', 'insumos:ver', 'sucursales:ver'],
  },
  '/api/sucursales': [
    { id: 1, nombre: 'Viedma (Chacra)', tipo: 'FABRICA' },
    { id: 5, nombre: 'Galpón Central', tipo: 'DEPOSITO' },
  ],
  '/api/productos': [{ id: 1, nombre: 'Medialunas', unidad_medida: 'docena' }],
  '/api/pedidos': [],
};

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(datos[url] ?? []) })
  );
});

describe('App', () => {
  it('muestra las pestañas principales', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Tablero de Pedidos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stock e Insumos' })).toBeInTheDocument();
  });

  it('muestra al pie qué versión está corriendo', async () => {
    render(<App />);
    expect(await screen.findByText('Versión local')).toBeInTheDocument();
  });

  it('muestra el error si la API no responde', async () => {
    globalThis.fetch.mockImplementation((url) =>
      url === '/api/auth/me'
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(datos[url]) })
        : Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) })
    );
    render(<App />);
    expect(await screen.findByText(/Error 502 al consultar \/sucursales/)).toBeInTheDocument();
  });
});
