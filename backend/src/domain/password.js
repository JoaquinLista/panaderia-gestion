import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

// Parámetros de scrypt: N es el costo de CPU y memoria. Se guardan junto con el
// hash para poder subirlos en el futuro sin invalidar las contraseñas viejas.
const N = 16384;
const R = 8;
const P = 1;
const LARGO_HASH = 64;

export const LARGO_MINIMO_PASSWORD = 8;

/**
 * Devuelve el hash que se guarda en la base: `scrypt$N$r$p$salt$hash` (base64).
 * Cada contraseña lleva su propio salt aleatorio, así dos usuarios con la misma
 * contraseña tienen hashes distintos.
 * @param {string} password
 */
export const hashearPassword = async (password) => {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, LARGO_HASH, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
};

/**
 * Compara una contraseña con el hash guardado. La comparación final es de
 * tiempo constante para no dar pistas por cuánto tarda en responder.
 * @param {string} password
 * @param {string} guardado
 */
export const verificarPassword = async (password, guardado) => {
  const partes = String(guardado ?? '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = partes;
  const esperado = Buffer.from(hash, 'base64');
  if (esperado.length === 0) return false;
  try {
    const obtenido = await scrypt(password, Buffer.from(salt, 'base64'), esperado.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(obtenido, esperado);
  } catch (_error) {
    // Parámetros inválidos en el hash guardado: se trata como contraseña incorrecta.
    return false;
  }
};
