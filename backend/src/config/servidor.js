/**
 * Configuración que cambia entre la compu (docker compose) y la nube (Azure).
 * Son funciones puras sobre el entorno para poder probarlas sin levantar nada.
 */

/**
 * Opciones de conexión a Postgres. Con POSTGRES_SSL=true la conexión va
 * cifrada y se verifica el certificado del servidor: Azure no acepta
 * conexiones sin SSL. En el compose la base está en la red interna y no hace falta.
 * @param {NodeJS.ProcessEnv} env
 */
export const opcionesPostgres = (env) => ({
  host: env.POSTGRES_HOST ?? 'db',
  port: Number(env.POSTGRES_PORT ?? 5432),
  database: env.POSTGRES_DB ?? 'panaderias',
  user: env.POSTGRES_USER ?? 'panaderias',
  password: env.POSTGRES_PASSWORD ?? 'panaderias',
  ssl: env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
});

/**
 * En quién confiar cuando un request trae X-Forwarded-For, para que el límite
 * de intentos de login cuente por la IP real del celular.
 * - Por defecto: Nginx en la red interna de Docker (loopback o red privada).
 * - TRUST_PROXY=2 (un número): cuántos proxies hay adelante. En Azure son dos:
 *   la entrada de Container Apps y el Nginx del frontend.
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | number} valor para app.set('trust proxy')
 */
export const confianzaEnProxy = (env) => {
  const valor = env.TRUST_PROXY?.trim();
  if (!valor) return 'loopback, uniquelocal';
  return /^\d+$/.test(valor) ? Number(valor) : valor;
};

/**
 * Versión que está corriendo: el SHA del commit con el que se construyó la
 * imagen (lo pone el pipeline). En la compu dice "local".
 * @param {NodeJS.ProcessEnv} env
 */
export const versionActual = (env) => env.APP_VERSION?.trim() || 'local';
