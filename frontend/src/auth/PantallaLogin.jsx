import { useEffect, useState } from 'react';

import { apiGet } from '../lib/api.js';
import { useAuth } from './contexto.js';

/**
 * Login pensado para el celular: usuario, contraseña y, para las empleadas,
 * la sucursal donde trabajan hoy (rotan entre sucursales). El galpón no se
 * ofrece porque no es un lugar de trabajo.
 */
export default function PantallaLogin() {
  const { entrar } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [sucursalId, setSucursalId] = useState('');
  const [sucursales, setSucursales] = useState([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    apiGet('/sucursales')
      .then((lista) => setSucursales(lista.filter((s) => s.tipo !== 'DEPOSITO')))
      .catch(() => setSucursales([]));
  }, []);

  const enviar = async (evt) => {
    evt.preventDefault();
    setError('');
    if (!usuario.trim() || !password) {
      setError('Ingresá tu usuario y contraseña');
      return;
    }
    setEnviando(true);
    try {
      await entrar({
        usuario: usuario.trim(),
        password,
        ...(sucursalId && { sucursalId: Number(sucursalId) }),
      });
    } catch (e) {
      // La contraseña queda escrita: si sólo faltaba elegir la sucursal, no hay
      // que tipearla de nuevo en el celular.
      setError(e.message);
      setEnviando(false);
    }
  };

  return (
    <main className="login">
      <form className="card login-card" onSubmit={enviar} noValidate>
        <div className="login-marca">
          <div className="logo">🥐</div>
          <h1>La Fueguina</h1>
          <p className="subtitle">Ingresá para empezar el turno</p>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        <label htmlFor="login-usuario">Usuario</label>
        <input
          id="login-usuario"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />

        <label htmlFor="login-password">Contraseña</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <label htmlFor="login-sucursal">¿Dónde trabajás hoy?</label>
        <select
          id="login-sucursal"
          value={sucursalId}
          onChange={(e) => setSucursalId(e.target.value)}
        >
          <option value="">No aplica (dueños y chofer)</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <p className="ayuda">Si sos empleada, elegí la sucursal donde estás hoy.</p>

        <button type="submit" className="primary login-boton" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
