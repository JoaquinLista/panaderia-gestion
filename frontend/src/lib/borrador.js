// Borrador del cierre de caja guardado en el celular (localStorage).
// Si se corta internet o se cierra la pestaña a mitad de la carga, lo que se
// escribió no se pierde. Es un borrador por persona, sucursal y día: el de un
// día viejo se borra solo. Si el navegador no deja guardar (modo incógnito,
// almacenamiento lleno) la pantalla funciona igual, sin borrador.

const PREFIJO = 'cierre-borrador:';

export const claveBorrador = (usuarioId, sucursalId, fecha) =>
  `${PREFIJO}${usuarioId}:${sucursalId}:${fecha}`;

export function leerBorrador(clave) {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

export function guardarBorrador(clave, borrador) {
  try {
    localStorage.setItem(clave, JSON.stringify(borrador));
  } catch {
    // Sin lugar o sin permiso: se sigue sin borrador.
  }
}

export function borrarBorrador(clave) {
  try {
    localStorage.removeItem(clave);
  } catch {
    // Nada que hacer.
  }
}

/** Borra los borradores de cierre de otros días (los de hoy quedan). */
export function borrarBorradoresViejos(fecha) {
  try {
    const viejas = [];
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (clave?.startsWith(PREFIJO) && !clave.endsWith(`:${fecha}`)) viejas.push(clave);
    }
    viejas.forEach((clave) => localStorage.removeItem(clave));
  } catch {
    // Nada que hacer.
  }
}

/** ¿Escribió algo? El cambio fijo viene sugerido, así que solo no cuenta. */
export const hayAlgoCargado = (datos, gastos) =>
  gastos.length > 0 ||
  Object.entries(datos).some(([campo, valor]) => campo !== 'cambioFijo' && valor.trim() !== '');

/** fetch tira TypeError cuando no hay conexión (no cuando la API contesta un error). */
export const esFaltaDeConexion = (error) => error instanceof TypeError;
