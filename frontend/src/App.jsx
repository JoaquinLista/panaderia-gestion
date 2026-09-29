import { useEffect, useState } from 'react';
import {
  Boxes,
  ClipboardCheck,
  Landmark,
  LayoutDashboard,
  Menu,
  Store,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';

import { AuthProvider } from './auth/AuthProvider.jsx';
import { tienePermiso, useAuth } from './auth/contexto.js';
import PantallaLogin from './auth/PantallaLogin.jsx';
import { apiGet } from './lib/api.js';
import { VERSION } from './lib/version.js';
import AdminUsuarios from './pantallas/AdminUsuarios.jsx';
import CajaCentral from './pantallas/CajaCentral.jsx';
import CierreCaja from './pantallas/CierreCaja.jsx';
import RevisionCierres from './pantallas/RevisionCierres.jsx';
import GestionInsumos from './pantallas/GestionInsumos.jsx';
import RedSucursales from './pantallas/RedSucursales.jsx';
import Resumen from './pantallas/Resumen.jsx';
import TableroPedidos from './pantallas/TableroPedidos.jsx';

// El menú se ordena por lo que hace cada persona, en tres grupos. Cada sección
// aparece sólo si la sesión tiene el permiso (matriz del backend). Los dueños
// arrancan en el resumen; el resto, en lo primero que puede usar.
const GRUPOS = [
  { id: 'plata', titulo: 'Plata' },
  { id: 'panaderias', titulo: 'Panaderías' },
  { id: 'admin', titulo: 'Equipo' },
];

const TABS = [
  {
    id: 'resumen',
    grupo: 'plata',
    Icono: LayoutDashboard,
    label: 'Resumen',
    permiso: 'dashboard:ver',
  },
  { id: 'cierre', grupo: 'plata', Icono: Wallet, label: 'Cierre de caja', permiso: 'caja:cerrar' },
  {
    id: 'revision',
    grupo: 'plata',
    Icono: ClipboardCheck,
    label: 'Revisión de cierres',
    permiso: 'caja:revisar',
  },
  {
    id: 'caja-central',
    grupo: 'plata',
    Icono: Landmark,
    label: 'Caja central',
    permiso: 'caja-central:administrar',
  },
  { id: 'pedidos', grupo: 'panaderias', Icono: Truck, label: 'Pedidos', permiso: 'pedidos:ver' },
  {
    id: 'insumos',
    grupo: 'panaderias',
    Icono: Boxes,
    label: 'Stock e insumos',
    permiso: 'insumos:ver',
  },
  { id: 'red', grupo: 'panaderias', Icono: Store, label: 'Sucursales', permiso: 'sucursales:ver' },
  {
    id: 'usuarios',
    grupo: 'admin',
    Icono: Users,
    label: 'Usuarios',
    permiso: 'usuarios:administrar',
  },
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
  const { sesion } = useAuth();
  const tabs = TABS.filter((t) => tienePermiso(sesion, t.permiso));
  const [tab, setTab] = useState(tabs[0]?.id);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const actual = tabs.find((t) => t.id === tab);
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
        <img className="logo" src="/logo-la-fueguina-ancho.png" alt="" width="120" height="77" />
        <div className="app-titulo">
          <h1>La Fueguina</h1>
          <p>Gestión de las panaderías</p>
        </div>
        <UsuarioConectado />
      </header>

      {errorGlobal && <div className="alert alert-error">{errorGlobal}</div>}

      <div className="panel">
        <aside className="menu">
          {/* En el celular el menú se abre con este botón; en la compu está siempre a la vista. */}
          <button
            type="button"
            className="menu-abrir"
            aria-expanded={menuAbierto}
            aria-controls="menu-secciones"
            aria-label={`Menú · ${actual?.label ?? 'Secciones'}`}
            onClick={() => setMenuAbierto((a) => !a)}
          >
            <Menu className="menu-hamburguesa" size={30} strokeWidth={2.5} aria-hidden="true" />
            <span>
              <small>Menú</small>
              {actual?.label ?? 'Secciones'}
            </span>
          </button>
          <nav
            id="menu-secciones"
            aria-label="Secciones"
            className={`menu-lista ${menuAbierto ? 'abierto' : ''}`}
          >
            {GRUPOS.map((g) => {
              const delGrupo = tabs.filter((t) => t.grupo === g.id);
              if (delGrupo.length === 0) return null;
              return (
                <div
                  key={g.id}
                  className="menu-grupo"
                  role="group"
                  aria-labelledby={`grupo-${g.id}`}
                >
                  <p id={`grupo-${g.id}`} className="menu-grupo-titulo">
                    {g.titulo}
                  </p>
                  {delGrupo.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`menu-btn ${tab === t.id ? 'active' : ''}`}
                      aria-current={tab === t.id ? 'page' : undefined}
                      onClick={() => {
                        setTab(t.id);
                        setMenuAbierto(false);
                      }}
                    >
                      <t.Icono
                        className="menu-icono"
                        size={24}
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                      {t.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="contenido">
          {tab === 'resumen' && <Resumen />}
          {tab === 'cierre' && <CierreCaja sucursales={sucursales} />}
          {tab === 'revision' && <RevisionCierres sucursales={sucursales} />}
          {tab === 'caja-central' && <CajaCentral />}
          {tab === 'pedidos' && <TableroPedidos sucursales={sucursales} productos={productos} />}
          {tab === 'insumos' && <GestionInsumos />}
          {tab === 'red' && <RedSucursales sucursales={sucursales} />}
          {tab === 'usuarios' && <AdminUsuarios />}
        </main>
      </div>

      <footer className="app-pie">Versión {VERSION}</footer>
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
