import { useEffect, useState } from 'react';

import { AuthProvider } from './auth/AuthProvider.jsx';
import { useAuth } from './auth/contexto.js';
import PantallaLogin from './auth/PantallaLogin.jsx';
import { apiGet } from './lib/api.js';
import GestionInsumos from './pantallas/GestionInsumos.jsx';
import RedSucursales from './pantallas/RedSucursales.jsx';
import TableroPedidos from './pantallas/TableroPedidos.jsx';

const TABS = [
  { id: 'pedidos', label: 'Tablero de Pedidos' },
  { id: 'insumos', label: 'Stock e Insumos' },
  { id: 'red', label: 'Red de Sucursales' },
];

const ROL_ETIQUETA = { ADMIN: 'Administración', EMPLEADA: 'Empleada', CHOFER: 'Chofer' };

/** Nombre de quien está conectado, dónde trabaja hoy y el botón para salir. */
function UsuarioConectado() {
  const { sesion, salir } = useAuth();
  const { usuario, sucursal } = sesion;
  return (
    <div className="sesion-usuario">
      <p>
        <strong>{usuario.nombre}</strong>
      </p>
      <p className="subtitle">{sucursal ? sucursal.nombre : ROL_ETIQUETA[usuario.rol]}</p>
      <button type="button" className="link" onClick={salir}>
        Cerrar sesión
      </button>
    </div>
  );
}

function Panel() {
  const [tab, setTab] = useState('pedidos');
  const [sucursales, setSucursales] = useState([]);
  const [productos, setProductos] = useState([]);
  const [errorGlobal, setErrorGlobal] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [s, p] = await Promise.all([apiGet('/sucursales'), apiGet('/productos')]);
        setSucursales(s);
        setProductos(p);
      } catch (e) {
        setErrorGlobal(e.message);
      }
    })();
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">🥐</div>
        <div>
          <h1>Red de Panaderías · Gestión Interna</h1>
          <p>Pedidos entre sucursales · Control de insumos · Mapa operacional</p>
        </div>
        <UsuarioConectado />
      </header>

      {errorGlobal && <div className="alert alert-error">{errorGlobal}</div>}

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'pedidos' && <TableroPedidos sucursales={sucursales} productos={productos} />}
      {tab === 'insumos' && <GestionInsumos />}
      {tab === 'red' && <RedSucursales sucursales={sucursales} />}
    </div>
  );
}

/** Sin sesión muestra el login; con sesión, el panel. */
function ConSesion() {
  const { sesion, cargando } = useAuth();
  if (cargando) return <p className="cargando">Cargando…</p>;
  return sesion ? <Panel /> : <PantallaLogin />;
}

export default function App() {
  return (
    <AuthProvider>
      <ConSesion />
    </AuthProvider>
  );
}
