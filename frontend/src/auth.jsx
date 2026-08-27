import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, apiPost, apiSend, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  const revalidar = useCallback(async () => {
    try {
      const u = await apiGet('/auth/me');
      setUsuario(u);
    } catch {
      setUsuario(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUsuario(null));
    revalidar();
  }, [revalidar]);

  const login = useCallback(async (email, password) => {
    const u = await apiPost('/auth/login', { email, password });
    setUsuario(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiSend('POST', '/auth/logout');
    } catch {
      /* aunque falle, limpiamos la sesión local */
    }
    setUsuario(null);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

const ROL_ETIQUETA = {
  DUENIO: 'Dueño',
  DEPOSITO: 'Depósito',
  FABRICA: 'Fábrica',
  VENTA: 'Venta',
  CHOFER: 'Chofer',
};

export function etiquetaRol(rol) {
  return ROL_ETIQUETA[rol] || rol;
}

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evt) => {
    evt.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">🥐</div>
        <h1>Red de Panaderías</h1>
        <p className="subtitle">Ingresá con tu usuario para operar.</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={enviar}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit" className="primary" disabled={enviando} style={{ marginTop: 8 }}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
