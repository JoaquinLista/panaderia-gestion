// Cliente HTTP de la API. Las rutas son relativas: Nginx (o el proxy de Vite) redirige /api al backend.

const API = '/api';

export async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al consultar ${path}`);
  }
  return res.json();
}

export async function apiSend(method, path, payload) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Error ${res.status} al enviar a ${path}`);
  }
  return body;
}

export const apiPost = (path, payload) => apiSend('POST', path, payload);
export const apiPut = (path, payload) => apiSend('PUT', path, payload);
