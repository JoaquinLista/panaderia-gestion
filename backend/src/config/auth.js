/**
 * Configuración de la sesión. Se lee del entorno en cada llamada (y no al
 * importar el módulo) para que los tests puedan cambiar las variables.
 */
export const NOMBRE_COOKIE = 'sesion';

// 12 horas: un turno completo.
export const DURACION_SESION_MS = 12 * 60 * 60 * 1000;

const LARGO_MINIMO_SECRETO = 32;

/**
 * Devuelve el secreto para firmar los tokens y si la cookie va con `Secure`.
 * Falla si JWT_SECRET falta o es corto: index.js lo llama al arrancar para que
 * el backend no levante con un secreto débil.
 */
export const configAuth = () => {
  const secreto = process.env.JWT_SECRET ?? '';
  if (secreto.length < LARGO_MINIMO_SECRETO) {
    throw new Error(
      `JWT_SECRET tiene que tener al menos ${LARGO_MINIMO_SECRETO} caracteres (generalo con: openssl rand -hex 32).`
    );
  }
  // `Secure` hace que el navegador sólo mande la cookie por HTTPS. Por defecto
  // se activa en producción; COOKIE_SECURE=false permite probar el compose por HTTP.
  const cookieSegura = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';
  return { secreto, cookieSegura };
};
