import jwt from 'jsonwebtoken';

const DEV_SECRET = 'dev-secret-panaderia-cambiar-en-produccion';
const JWT_SECRET = process.env.JWT_SECRET || DEV_SECRET;

if (JWT_SECRET === DEV_SECRET && process.env.NODE_ENV === 'production') {
  console.warn(
    '[auth] JWT_SECRET no está definido: se usa el secreto de desarrollo. Definilo en producción.'
  );
}

export const COOKIE_NAME = 'panaderia_token';

const DURACION = '8h';
const DURACION_MS = 8 * 60 * 60 * 1000;

/**
 * `secure` sólo cuando se sirve por HTTPS. En el compose actual (nginx :80) va en
 * false; detrás de HTTPS, poner COOKIE_SECURE=true.
 */
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === 'true',
  maxAge: DURACION_MS,
  path: '/',
};

export const firmarToken = (usuario) =>
  jwt.sign(
    { sub: usuario.id, rol: usuario.rol, sucursal_id: usuario.sucursal_id ?? null },
    JWT_SECRET,
    { expiresIn: DURACION }
  );

export const verificarToken = (token) => jwt.verify(token, JWT_SECRET);
