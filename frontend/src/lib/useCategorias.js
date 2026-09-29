import { useEffect, useState } from 'react';

import { apiGet } from './api.js';

/**
 * Categorías de gasto del cierre, en el orden de la planilla "Egresos de caja".
 * Si no se pueden traer, la lista queda vacía y el error se muestra.
 * @param {(mensaje: string) => void} alFallar
 */
export function useCategorias(alFallar) {
  const [categorias, setCategorias] = useState([]);
  useEffect(() => {
    let vigente = true;
    apiGet('/cierres/categorias')
      .then((lista) => vigente && setCategorias(lista))
      .catch((e) => vigente && alFallar(e.message));
    return () => {
      vigente = false;
    };
    // alFallar cambia en cada render; sólo interesa pedirlas una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return categorias;
}
