/**
 * Versión que está corriendo: los primeros 7 caracteres del SHA del commit,
 * como los muestra GitHub. La pone el pipeline al construir la imagen; en la
 * compu dice "local".
 * @param {string | undefined} sha
 */
export const versionCorta = (sha) => (sha?.trim() ? sha.trim().slice(0, 7) : 'local');

export const VERSION = versionCorta(import.meta.env.VITE_APP_VERSION);
