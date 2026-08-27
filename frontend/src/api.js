const API = '/api';

let onUnauthorized = () => {};

/** Registra un callback que se dispara ante cualquier 401 (sesión caída). */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = typeof fn === 'function' ? fn : () => {};
}

async function handle(res, path) {
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    onUnauthorized();
    throw new Error(body.error || 'Tu sesión expiró. Ingresá de nuevo.');
  }
  if (!res.ok) {
    throw new Error(body.error || `Error ${res.status} en ${path}`);
  }
  return body;
}

export async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { credentials: 'same-origin' });
  return handle(res, path);
}

export async function apiSend(method, path, payload) {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  return handle(res, path);
}

export const apiPost = (path, payload) => apiSend('POST', path, payload);
export const apiPut = (path, payload) => apiSend('PUT', path, payload);
