import { useCallback, useEffect, useState } from 'react';

import { tienePermiso, useAuth } from '../auth/contexto.js';
import { apiGet, apiPost, apiPut } from '../lib/api.js';
import { formatFecha, nombreSucursal } from '../lib/formato.js';

const ESTADOS_PEDIDO = ['PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO'];

const ESTADO_BADGE = {
  PENDIENTE: 'badge-warn',
  EN_PREPARACION: 'badge-info',
  DESPACHADO: 'badge-info',
  ENTREGADO: 'badge-info',
  RECIBIDO: 'badge-ok',
  CANCELADO: 'badge-danger',
};

// Espejo de la máquina de estados del backend (domain/estadoPedido.js).
const SIGUIENTE_ESTADO = {
  PENDIENTE: 'EN_PREPARACION',
  EN_PREPARACION: 'DESPACHADO',
  DESPACHADO: 'ENTREGADO',
  ENTREGADO: 'RECIBIDO',
};

const ETIQUETA_AVANCE = {
  EN_PREPARACION: 'Marcar en preparación',
  DESPACHADO: 'Despachar',
  ENTREGADO: 'Marcar entregado',
  RECIBIDO: 'Confirmar recepción',
};

const PUEDE_CANCELARSE = new Set(['PENDIENTE', 'EN_PREPARACION']);

export default function TableroPedidos({ sucursales, productos }) {
  const { sesion } = useAuth();
  const puedeCrear = tienePermiso(sesion, 'pedidos:crear');
  const puedeCambiarEstado = tienePermiso(sesion, 'pedidos:cambiar-estado');
  // La empleada pide desde la sucursal donde trabaja hoy: el origen queda fijo.
  const sucursalFija = sesion.sucursal;
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [estado, setEstado] = useState('PENDIENTE');
  const [items, setItems] = useState([{ producto_id: '', cantidad: '' }]);
  const [estadoEnCurso, setEstadoEnCurso] = useState(null);

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
      const origenInicial = sucursalFija?.id ?? sucursales[0].id;
      const destinoInicial = sucursales.find((s) => s.id !== origenInicial).id;
      setOrigen((prev) => prev || String(origenInicial));
      setDestino((prev) => prev || String(destinoInicial));
    }
  }, [sucursales, sucursalFija]);

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

  const cambiarEstado = async (pedidoId, nuevoEstado) => {
    if (
      nuevoEstado === 'CANCELADO' &&
      !window.confirm(`¿Cancelar el pedido #${pedidoId}? Esta acción no se puede deshacer.`)
    ) {
      return;
    }
    setError('');
    setOkMsg('');
    setEstadoEnCurso(pedidoId);
    try {
      await apiPut(`/pedidos/${pedidoId}/estado`, { estado: nuevoEstado });
      setOkMsg(`Pedido #${pedidoId}: estado actualizado a ${nuevoEstado.replace('_', ' ')}.`);
      await cargarPedidos();
    } catch (e) {
      setError(e.message);
    } finally {
      setEstadoEnCurso(null);
    }
  };

  const avisos = (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {okMsg && <div className="alert alert-ok">{okMsg}</div>}
    </>
  );

  return (
    <div className={puedeCrear ? 'grid-2' : undefined}>
      {puedeCrear && (
        <div className="card">
          <h2>Nuevo pedido</h2>
          <p className="subtitle">Registrá un movimiento de productos entre sucursales.</p>

          {avisos}

          <form onSubmit={enviar}>
            <label htmlFor="origen">Sucursal de origen</label>
            <select
              id="origen"
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
              disabled={Boolean(sucursalFija)}
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
      )}

      <div className="card">
        <div className="row-between">
          <div>
            <h2>Pedidos registrados</h2>
            <p className="subtitle">
              {pedidos.length} pedido(s)
              {sucursalFija ? ` de ${sucursalFija.nombre}` : ' en el sistema'}.
            </p>
          </div>
          <button className="link" onClick={cargarPedidos}>
            Actualizar
          </button>
        </div>

        {!puedeCrear && avisos}

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
                  {puedeCambiarEstado && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>
                      {p.sucursal_origen_nombre || nombreSucursal(sucursales, p.sucursal_origen_id)}
                    </td>
                    <td>
                      {p.sucursal_destino_nombre ||
                        nombreSucursal(sucursales, p.sucursal_destino_id)}
                    </td>
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
                    {puedeCambiarEstado && (
                      <td>
                        <div className="acciones-pedido">
                          {SIGUIENTE_ESTADO[p.estado] && (
                            <button
                              type="button"
                              className="link"
                              disabled={estadoEnCurso === p.id}
                              onClick={() => cambiarEstado(p.id, SIGUIENTE_ESTADO[p.estado])}
                            >
                              {ETIQUETA_AVANCE[SIGUIENTE_ESTADO[p.estado]]}
                            </button>
                          )}
                          {PUEDE_CANCELARSE.has(p.estado) && (
                            <button
                              type="button"
                              className="link link-danger"
                              disabled={estadoEnCurso === p.id}
                              onClick={() => cambiarEstado(p.id, 'CANCELADO')}
                            >
                              Cancelar
                            </button>
                          )}
                          {!SIGUIENTE_ESTADO[p.estado] && !PUEDE_CANCELARSE.has(p.estado) && (
                            <span className="muted">—</span>
                          )}
                        </div>
                      </td>
                    )}
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
