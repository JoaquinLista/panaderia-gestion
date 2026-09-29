// Cliente HTTP de la API. Las rutas son relativas: Nginx (o el proxy de Vite) redirige /api al backend.

const API = '/api';

// Se dispara cuando la API responde 401: la sesión venció o la cerraron.
// AuthProvider lo escucha y vuelve a mostrar la pantalla de login.
export const EVENTO_SESION_VENCIDA = 'lafueguina:sesion-vencida';

const avisarSiVencio = (res) => {
  if (res.status === 401) window.dispatchEvent(new Event(EVENTO_SESION_VENCIDA));
};

export async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  avisarSiVencio(res);
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
  avisarSiVencio(res);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Error ${res.status} al enviar a ${path}`);
  }
  return body;
}

export const apiPost = (path, payload) => apiSend('POST', path, payload);
export const apiPut = (path, payload) => apiSend('PUT', path, payload);

/**
 * Descarga un archivo de la API (por ejemplo un Excel) y lo guarda con el
 * nombre que manda el servidor, o con `nombre` si no manda ninguno.
 */
export async function apiDescargar(path, nombre) {
  const res = await fetch(`${API}${path}`);
  avisarSiVencio(res);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al descargar ${path}`);
  }
  const disposicion = res.headers?.get('Content-Disposition') ?? '';
  const archivo = /filename="([^"]+)"/.exec(disposicion)?.[1] ?? nombre;
  const url = URL.createObjectURL(await res.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = archivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
