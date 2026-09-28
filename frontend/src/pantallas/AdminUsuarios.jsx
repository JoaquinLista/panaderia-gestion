import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/contexto.js';
import { apiGet, apiPost, apiSend } from '../lib/api.js';

const ROLES = [
  { id: 'EMPLEADA', label: 'Empleada' },
  { id: 'CHOFER', label: 'Chofer' },
  { id: 'ADMIN', label: 'Dueño o socio (admin)' },
];

const NUEVO = { usuario: '', nombre: '', password: '', rol: 'EMPLEADA', puedeCerrarCaja: false };

/** Contraseña nueva para alguien que se olvidó la suya. */
function ResetearPassword({ usuario, alTerminar }) {
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);

  const guardar = async (evt) => {
    evt.preventDefault();
    setEnviando(true);
    await alTerminar(password);
    setEnviando(false);
  };

  return (
    <form className="reset-password" onSubmit={guardar}>
      <label htmlFor={`password-${usuario.id}`}>Contraseña nueva para {usuario.nombre}</label>
      <input
        id={`password-${usuario.id}`}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit" className="primary" disabled={enviando}>
        Guardar contraseña
      </button>
      <button type="button" className="link" onClick={() => alTerminar(null)}>
        Cancelar
      </button>
    </form>
  );
}

/**
 * Pantalla de la dueña: alta de usuarios, rol, permiso de cierre de caja,
 * activar o desactivar y resetear la contraseña. La API vuelve a validar todo.
 */
export default function AdminUsuarios() {
  const { sesion } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState(NUEVO);
  const [reseteando, setReseteando] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const cargar = useCallback(async () => {
    try {
      setUsuarios(await apiGet('/usuarios'));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Ejecuta un cambio, muestra el resultado y recarga la lista. */
  const hacer = async (accion, mensaje) => {
    setError('');
    setOkMsg('');
    try {
      await accion();
      setOkMsg(mensaje);
      await cargar();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };

  const crear = async (evt) => {
    evt.preventDefault();
    const ok = await hacer(() => apiPost('/usuarios', nuevo), `Usuario "${nuevo.usuario}" creado.`);
    if (ok) setNuevo(NUEVO);
  };

  const cambiar = (u, cambios, mensaje) =>
    hacer(() => apiSend('PATCH', `/usuarios/${u.id}`, cambios), mensaje);

  const resetear = async (u, password) => {
    if (password === null) {
      setReseteando(null);
      return;
    }
    const ok = await hacer(
      () => apiSend('PUT', `/usuarios/${u.id}/password`, { password }),
      `Contraseña de ${u.nombre} cambiada. Sus sesiones abiertas se cerraron.`
    );
    if (ok) setReseteando(null);
  };

  const campo = (nombre) => (e) =>
    setNuevo((prev) => ({
      ...prev,
      [nombre]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Nuevo usuario</h2>
        <p className="subtitle">Cada persona entra con su propio usuario.</p>
        <form onSubmit={crear} aria-label="Nuevo usuario">
          <label htmlFor="nuevo-usuario">Usuario</label>
          <input
            id="nuevo-usuario"
            value={nuevo.usuario}
            onChange={campo('usuario')}
            autoCapitalize="none"
            autoComplete="off"
          />
          <label htmlFor="nuevo-nombre">Nombre</label>
          <input id="nuevo-nombre" value={nuevo.nombre} onChange={campo('nombre')} />
          <label htmlFor="nuevo-password">Contraseña inicial</label>
          <input
            id="nuevo-password"
            type="password"
            autoComplete="new-password"
            value={nuevo.password}
            onChange={campo('password')}
          />
          <label htmlFor="nuevo-rol">Rol</label>
          <select id="nuevo-rol" value={nuevo.rol} onChange={campo('rol')}>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          {nuevo.rol === 'EMPLEADA' && (
            <label className="check">
              <input
                type="checkbox"
                checked={nuevo.puedeCerrarCaja}
                onChange={campo('puedeCerrarCaja')}
              />
              Puede cerrar la caja
            </label>
          )}
          <button type="submit" className="primary">
            Crear usuario
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Usuarios</h2>
        <p className="subtitle">{usuarios.length} usuario(s).</p>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {okMsg && <div className="alert alert-ok">{okMsg}</div>}

        {cargando ? (
          <div className="empty">Cargando usuarios…</div>
        ) : (
          <ul className="lista-usuarios" aria-label="Usuarios">
            {usuarios.map((u) => {
              const esYo = u.id === sesion.usuario.id;
              return (
                <li key={u.id} className={u.activo ? '' : 'inactivo'}>
                  <div className="row-between">
                    <div>
                      <strong>{u.nombre}</strong> <span className="muted">({u.usuario})</span>
                      {!u.activo && <span className="badge badge-muted">DESACTIVADO</span>}
                    </div>
                    <select
                      aria-label={`Rol de ${u.nombre}`}
                      value={u.rol}
                      disabled={esYo}
                      onChange={(e) =>
                        cambiar(u, { rol: e.target.value }, `Rol de ${u.nombre} actualizado.`)
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="acciones-usuario">
                    {u.rol === 'EMPLEADA' && (
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={u.puedeCerrarCaja}
                          onChange={(e) =>
                            cambiar(
                              u,
                              { puedeCerrarCaja: e.target.checked },
                              `Permiso de caja de ${u.nombre} actualizado.`
                            )
                          }
                        />
                        Puede cerrar la caja
                      </label>
                    )}
                    <button type="button" className="link" onClick={() => setReseteando(u.id)}>
                      Cambiar contraseña
                    </button>
                    {!esYo && (
                      <button
                        type="button"
                        className={`link ${u.activo ? 'link-danger' : ''}`}
                        onClick={() =>
                          cambiar(
                            u,
                            { activo: !u.activo },
                            u.activo
                              ? `${u.nombre} ya no puede entrar.`
                              : `${u.nombre} puede volver a entrar.`
                          )
                        }
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </div>
                  {reseteando === u.id && (
                    <ResetearPassword usuario={u} alTerminar={(p) => resetear(u, p)} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
