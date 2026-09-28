import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiGet, apiPost, EVENTO_SESION_VENCIDA } from '../lib/api.js';
import { AuthContext } from './contexto.js';

/**
 * Guarda la sesión de quien usa la app. Al abrir, le pregunta al backend si ya
 * hay una sesión (la cookie viaja sola). Si cualquier llamada a la API
 * responde 401, la sesión se borra y la app vuelve al login.
 */
export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    apiGet('/auth/me')
      .then((s) => vigente && setSesion(s))
      .catch(() => vigente && setSesion(null))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    const alVencer = () => setSesion(null);
    window.addEventListener(EVENTO_SESION_VENCIDA, alVencer);
    return () => window.removeEventListener(EVENTO_SESION_VENCIDA, alVencer);
  }, []);

  const entrar = useCallback(async (datos) => {
    setSesion(await apiPost('/auth/login', datos));
  }, []);

  const salir = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } finally {
      setSesion(null);
    }
  }, []);

  const valor = useMemo(
    () => ({ sesion, cargando, entrar, salir }),
    [sesion, cargando, entrar, salir]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
