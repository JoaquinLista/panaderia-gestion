import { useCallback, useEffect, useMemo, useState } from 'react';

const API = '/api';

/* ------------------------------------------------------------------ */
/*  Helpers de red                                                     */
/* ------------------------------------------------------------------ */

async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al consultar ${path}`);
  }
  return res.json();
}

async function apiPost(path, payload) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Error ${res.status} al enviar a ${path}`);
  }
  return body;
}

const ESTADOS_PEDIDO = ['PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO'];

const ESTADO_BADGE = {
  PENDIENTE: 'badge-warn',
  EN_PREPARACION: 'badge-info',
  DESPACHADO: 'badge-info',
  ENTREGADO: 'badge-ok',
};

function formatFecha(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function nombreSucursal(sucursales, id) {
  const s = sucursales.find((x) => x.id === Number(id));
  return s ? s.nombre : `#${id}`;
}

/* ------------------------------------------------------------------ */
/*  Tablero de Pedidos                                                 */
/* ------------------------------------------------------------------ */

function TableroPedidos({ sucursales, productos }) {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [estado, setEstado] = useState('PENDIENTE');
  const [items, setItems] = useState([{ producto_id: '', cantidad: '' }]);

  const cargarPedidos = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const data = await apiGet('/pedidos');
      setPedidos(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarPedidos();
  }, [cargarPedidos]);

  useEffect(() => {
    if (sucursales.length >= 2) {
      setOrigen((prev) => prev || String(sucursales[0].id));
      setDestino((prev) => prev || String(sucursales[1].id));
    }
  }, [sucursales]);

  const actualizarItem = (idx, campo, valor) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  };

  const agregarItem = () => setItems((prev) => [...prev, { producto_id: '', cantidad: '' }]);

  const quitarItem = (idx) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const resetForm = () => {
    setEstado('PENDIENTE');
    setItems([{ producto_id: '', cantidad: '' }]);
  };

  const enviar = async (evt) => {
    evt.preventDefault();
    setError('');
    setOkMsg('');

    if (!origen || !destino) {
      setError('Seleccioná sucursal de origen y destino.');
      return;
    }
    if (origen === destino) {
      setError('El origen y el destino deben ser distintos.');
      return;
    }
    const detalles = items
      .filter((it) => it.producto_id && Number(it.cantidad) > 0)
      .map((it) => ({ producto_id: Number(it.producto_id), cantidad: Number(it.cantidad) }));

    if (detalles.length === 0) {
      setError('Agregá al menos un producto con cantidad mayor a 0.');
      return;
    }

    setEnviando(true);
    try {
      await apiPost('/pedidos', {
        sucursal_origen_id: Number(origen),
        sucursal_destino_id: Number(destino),
        estado,
        detalles,
      });
      setOkMsg('Pedido registrado correctamente.');
      resetForm();
      await cargarPedidos();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Nuevo pedido</h2>
        <p className="subtitle">Registrá un movimiento de productos entre sucursales.</p>

        {error && <div className="alert alert-error">{error}</div>}
        {okMsg && <div className="alert alert-ok">{okMsg}</div>}

        <form onSubmit={enviar}>
          <label htmlFor="origen">Sucursal de origen</label>
          <select
            id="origen"
            value={origen}
            onChange={(e) => setOrigen(e.target.value)}
            required
          >
            <option value="">Seleccionar…</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} ({s.tipo})
              </option>
            ))}
          </select>

          <label htmlFor="destino">Sucursal de destino</label>
          <select
            id="destino"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            required
          >
            <option value="">Seleccionar…</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} ({s.tipo})
              </option>
            ))}
          </select>

          <label htmlFor="estado">Estado inicial</label>
          <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
            {ESTADOS_PEDIDO.map((es) => (
              <option key={es} value={es}>
                {es.replace('_', ' ')}
              </option>
            ))}
          </select>

          <label>Productos</label>
          {items.map((it, idx) => (
            <div className="detalle-row" key={idx}>
              <select
                value={it.producto_id}
                onChange={(e) => actualizarItem(idx, 'producto_id', e.target.value)}
                aria-label="Producto"
              >
                <option value="">Producto…</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Cant."
                value={it.cantidad}
                onChange={(e) => actualizarItem(idx, 'cantidad', e.target.value)}
                aria-label="Cantidad"
              />
              <button type="button" onClick={() => quitarItem(idx)} aria-label="Quitar ítem">
                ×
              </button>
            </div>
          ))}
          <button type="button" className="link" onClick={agregarItem}>
            + Agregar producto
          </button>

          <div style={{ marginTop: 16 }}>
            <button type="submit" className="primary" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Registrar pedido'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="row-between">
          <div>
            <h2>Pedidos registrados</h2>
            <p className="subtitle">{pedidos.length} pedido(s) en el sistema.</p>
          </div>
          <button className="link" onClick={cargarPedidos}>
            Actualizar
          </button>
        </div>

        {cargando ? (
          <div className="empty">Cargando pedidos…</div>
        ) : pedidos.length === 0 ? (
          <div className="empty">Todavía no hay pedidos cargados.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Detalle</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.sucursal_origen_nombre || nombreSucursal(sucursales, p.sucursal_origen_id)}</td>
                    <td>{p.sucursal_destino_nombre || nombreSucursal(sucursales, p.sucursal_destino_id)}</td>
                    <td>
                      {p.detalles && p.detalles.length > 0 ? (
                        <ul className="detalle-list">
                          {p.detalles.map((d) => (
                            <li key={d.id}>
                              {d.producto_nombre} — {Number(d.cantidad)} {d.producto_unidad}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="muted">Sin detalle</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${ESTADO_BADGE[p.estado] || 'badge-muted'}`}>
                        {String(p.estado).replace('_', ' ')}
                      </span>
                    </td>
                    <td>{formatFecha(p.fecha_creacion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Gestión de Stock e Insumos                                         */
/* ------------------------------------------------------------------ */

function GestionInsumos() {
  const [insumos, setInsumos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [nombre, setNombre] = useState('');
  const [stockActual, setStockActual] = useState('');
  const [stockMinimo, setStockMinimo] = useState('');
  const [unidad, setUnidad] = useState('kg');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const data = await apiGet('/insumos');
      setInsumos(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const bajoStock = useMemo(
    () => insumos.filter((i) => i.bajo_stock ?? Number(i.stock_actual) < Number(i.stock_minimo)),
    [insumos]
  );

  const elegirInsumo = (i) => {
    setNombre(i.nombre);
    setStockActual(String(Number(i.stock_actual)));
    setStockMinimo(String(Number(i.stock_minimo)));
    setUnidad(i.unidad_medida || 'kg');
    setOkMsg('');
    setError('');
  };

  const limpiar = () => {
    setNombre('');
    setStockActual('');
    setStockMinimo('');
    setUnidad('kg');
  };

  const enviar = async (evt) => {
    evt.preventDefault();
    setError('');
    setOkMsg('');

    if (!nombre.trim()) {
      setError('El nombre del insumo es obligatorio.');
      return;
    }
    if (stockActual === '' || Number(stockActual) < 0 || Number.isNaN(Number(stockActual))) {
      setError('Ingresá un stock actual válido (numérico, no negativo).');
      return;
    }

    const payload = {
      nombre: nombre.trim(),
      stock_actual: Number(stockActual),
      unidad_medida: unidad.trim() || 'unidad',
    };
    if (stockMinimo !== '' && !Number.isNaN(Number(stockMinimo))) {
      payload.stock_minimo = Number(stockMinimo);
    }

    setEnviando(true);
    try {
      await apiPost('/insumos', payload);
      setOkMsg('Insumo guardado correctamente.');
      limpiar();
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Cargar / actualizar insumo</h2>
        <p className="subtitle">
          Si el nombre ya existe se actualiza su stock; si no, se crea uno nuevo.
        </p>

        {error && <div className="alert alert-error">{error}</div>}
        {okMsg && <div className="alert alert-ok">{okMsg}</div>}

        <form onSubmit={enviar}>
          <label htmlFor="ins-nombre">Nombre</label>
          <input
            id="ins-nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Harina 000"
            required
          />

          <label htmlFor="ins-stock">Stock actual</label>
          <input
            id="ins-stock"
            type="number"
            min="0"
            step="0.01"
            value={stockActual}
            onChange={(e) => setStockActual(e.target.value)}
            required
          />

          <label htmlFor="ins-min">Stock mínimo</label>
          <input
            id="ins-min"
            type="number"
            min="0"
            step="0.01"
            value={stockMinimo}
            onChange={(e) => setStockMinimo(e.target.value)}
            placeholder="Opcional"
          />

          <label htmlFor="ins-unidad">Unidad de medida</label>
          <input
            id="ins-unidad"
            type="text"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            placeholder="kg, l, unidad…"
          />

          <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
            <button type="submit" className="primary" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar insumo'}
            </button>
            <button type="button" className="link" onClick={limpiar}>
              Limpiar
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="row-between">
          <div>
            <h2>Insumos en stock</h2>
            <p className="subtitle">
              {insumos.length} insumo(s) · {bajoStock.length} bajo el mínimo
            </p>
          </div>
          <button className="link" onClick={cargar}>
            Actualizar
          </button>
        </div>

        {bajoStock.length > 0 && (
          <div className="alert alert-error">
            ⚠ {bajoStock.length} insumo(s) por debajo del stock mínimo:{' '}
            {bajoStock.map((i) => i.nombre).join(', ')}.
          </div>
        )}

        {cargando ? (
          <div className="empty">Cargando insumos…</div>
        ) : insumos.length === 0 ? (
          <div className="empty">No hay insumos cargados.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Stock actual</th>
                  <th>Stock mínimo</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((i) => {
                  const bajo = i.bajo_stock ?? Number(i.stock_actual) < Number(i.stock_minimo);
                  return (
                    <tr key={i.id}>
                      <td>{i.nombre}</td>
                      <td>
                        {Number(i.stock_actual)} {i.unidad_medida}
                      </td>
                      <td>
                        {Number(i.stock_minimo)} {i.unidad_medida}
                      </td>
                      <td>
                        {bajo ? (
                          <span className="badge badge-danger">BAJO STOCK</span>
                        ) : (
                          <span className="badge badge-ok">OK</span>
                        )}
                      </td>
                      <td>
                        <button className="link" onClick={() => elegirInsumo(i)}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Red de Sucursales                                                  */
/* ------------------------------------------------------------------ */

function RedSucursales({ sucursales }) {
  const deposito = sucursales.filter((s) => s.tipo === 'DEPOSITO');
  const fabricas = sucursales.filter((s) => s.tipo === 'FABRICA');
  const ventas = sucursales.filter((s) => s.tipo === 'VENTA');

  return (
    <div className="card">
      <h2>Mapa operacional</h2>
      <p className="subtitle">Vista general de la red: depósito central, fábricas y puntos de venta.</p>

      <div className="stat-grid">
        <div className="stat">
          <div className="value">{sucursales.length}</div>
          <p className="label">Nodos totales</p>
        </div>
        <div className="stat">
          <div className="value">{deposito.length}</div>
          <p className="label">Depósito central</p>
        </div>
        <div className="stat">
          <div className="value">{fabricas.length}</div>
          <p className="label">Fábricas</p>
        </div>
        <div className="stat">
          <div className="value">{ventas.length}</div>
          <p className="label">Puntos de venta</p>
        </div>
      </div>

      <h3 style={{ margin: '8px 0 10px', fontSize: '0.95rem' }}>Depósito</h3>
      <div className="node-grid">
        {deposito.length === 0 && <div className="empty">Sin depósito configurado.</div>}
        {deposito.map((s) => (
          <div className="node deposito" key={s.id}>
            <h3>{s.nombre}</h3>
            <span className="tipo">Depósito central</span>
          </div>
        ))}
      </div>

      <h3 style={{ margin: '18px 0 10px', fontSize: '0.95rem' }}>Fábricas</h3>
      <div className="node-grid">
        {fabricas.length === 0 && <div className="empty">Sin fábricas.</div>}
        {fabricas.map((s) => (
          <div className="node" key={s.id}>
            <h3>{s.nombre}</h3>
            <span className="tipo">Fábrica</span>
          </div>
        ))}
      </div>

      <h3 style={{ margin: '18px 0 10px', fontSize: '0.95rem' }}>Puntos de venta</h3>
      <div className="node-grid">
        {ventas.length === 0 && <div className="empty">Sin puntos de venta.</div>}
        {ventas.map((s) => (
          <div className="node" key={s.id}>
            <h3>{s.nombre}</h3>
            <span className="tipo">Venta</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App raíz                                                           */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: 'pedidos', label: 'Tablero de Pedidos' },
  { id: 'insumos', label: 'Stock e Insumos' },
  { id: 'red', label: 'Red de Sucursales' },
];

export default function App() {
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
