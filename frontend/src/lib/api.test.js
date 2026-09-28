import { describe, it, expect, vi } from 'vitest';
import { apiGet, apiPost, EVENTO_SESION_VENCIDA } from './api.js';

const respuesta = (status, body) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

describe('cliente de la API', () => {
  it('GET usa rutas relativas bajo /api', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(respuesta(200, [{ id: 1 }]));
    await expect(apiGet('/sucursales')).resolves.toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledWith('/api/sucursales');
  });

  it('GET propaga el mensaje de error del backend', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(respuesta(503, { error: 'DB caída' }));
    await expect(apiGet('/health')).rejects.toThrow('DB caída');
  });

  it('POST envía JSON y devuelve el cuerpo', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(respuesta(201, { id: 5 }));
    await expect(apiPost('/pedidos', { a: 1 })).resolves.toEqual({ id: 5 });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/pedidos',
      expect.objectContaining({ method: 'POST', body: '{"a":1}' })
    );
  });

  it('POST arma un mensaje genérico si el backend no manda error', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(respuesta(500, {}));
    await expect(apiPost('/pedidos', {})).rejects.toThrow('Error 500 al enviar a /pedidos');
  });
});

describe('sesión vencida', () => {
  it('un 401 avisa a la app para volver al login', async () => {
    const escuchar = vi.fn();
    window.addEventListener(EVENTO_SESION_VENCIDA, escuchar);
    vi.spyOn(globalThis, 'fetch').mockReturnValue(respuesta(401, { error: 'Sesión vencida' }));

    await expect(apiGet('/pedidos')).rejects.toThrow('Sesión vencida');
    await expect(apiPost('/pedidos', {})).rejects.toThrow('Sesión vencida');
    expect(escuchar).toHaveBeenCalledTimes(2);
    window.removeEventListener(EVENTO_SESION_VENCIDA, escuchar);
  });

  it('otros errores no cierran la sesión', async () => {
    const escuchar = vi.fn();
    window.addEventListener(EVENTO_SESION_VENCIDA, escuchar);
    vi.spyOn(globalThis, 'fetch').mockReturnValue(respuesta(500, {}));

    await expect(apiGet('/pedidos')).rejects.toThrow();
    expect(escuchar).not.toHaveBeenCalled();
    window.removeEventListener(EVENTO_SESION_VENCIDA, escuchar);
  });
});
