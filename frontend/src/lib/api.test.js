import { describe, it, expect, vi } from 'vitest';
import { apiDescargar, apiGet, apiPost, EVENTO_SESION_VENCIDA } from './api.js';

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

describe('descargas', () => {
  const archivo = (status, headers = {}) =>
    Promise.resolve({
      ok: status < 400,
      status,
      headers: new Headers(headers),
      blob: () => Promise.resolve(new Blob(['xlsx'])),
      json: () => Promise.resolve({ error: 'No hay nada' }),
    });

  const espiarEnlace = () => {
    URL.createObjectURL = vi.fn(() => 'blob:planilla');
    URL.revokeObjectURL = vi.fn();
    return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      espiarEnlace.ultimo = { href: this.href, download: this.download };
    });
  };

  it('guarda el archivo con el nombre que manda el servidor', async () => {
    const click = espiarEnlace();
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      archivo(200, { 'Content-Disposition': 'attachment; filename="caja-central-2026-09.xlsx"' })
    );
    await apiDescargar('/caja-central/excel?mes=2026-09', 'otro.xlsx');
    expect(click).toHaveBeenCalledTimes(1);
    expect(espiarEnlace.ultimo).toEqual({
      href: 'blob:planilla',
      download: 'caja-central-2026-09.xlsx',
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:planilla');
  });

  it('sin nombre del servidor usa el propio', async () => {
    espiarEnlace();
    vi.spyOn(globalThis, 'fetch').mockReturnValue(archivo(200));
    await apiDescargar('/cierres/excel', 'egresos.xlsx');
    expect(espiarEnlace.ultimo.download).toBe('egresos.xlsx');
  });

  it('si falla muestra el error del backend', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(archivo(400));
    await expect(apiDescargar('/cierres/excel', 'x.xlsx')).rejects.toThrow('No hay nada');
  });

  it('sin mensaje del backend arma uno genérico', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      Promise.resolve({ ok: false, status: 500, json: () => Promise.reject(new Error('no json')) })
    );
    await expect(apiDescargar('/cierres/excel', 'x.xlsx')).rejects.toThrow(
      'Error 500 al descargar /cierres/excel'
    );
  });
});
