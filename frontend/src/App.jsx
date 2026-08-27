import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPut } from './api.js';
import { useAuth, etiquetaRol, Login } from './auth.jsx';

const ESTADOS_PEDIDO = ['PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO'];

const ROLES_CREAN_PEDIDOS = new Set(['FABRICA', 'VENTA', 'DUENIO']);
const ROLES_GESTIONAN_INSUMOS = new Set(['DEPOSITO', 'DUENIO']);
const ROLES_HOJA_RUTA = new Set(['CHOFER', 'DUENIO']);

// Espejo de backend/src/domain/tipoPedido.js
const REGLA_TIPO = {
  INSUMOS: { tipoOrigen: 'DEPOSITO', tipoDestino: 'FABRICA', catalogo: 'insumos', idCampo: 'insumo_id' },
  PRODUCTOS: { tipoOrigen: 'FABRICA', tipoDestino: 'VENTA', catalogo: 'productos', idCampo: 'producto_id' },
};

const TIPOS_POR_ROL = {
  FABRICA: ['INSUMOS'],
  VENTA: ['PRODUCTOS'],
  DUENIO: ['INSUMOS', 'PRODUCTOS'],
};

// Espejo de backend/src/domain/autorizacionPedido.js: quién puede cada transición.
const REGLAS_TRANSICION = {
  EN_PREPARACION: { posicion: 'origen', roles: ['FABRICA', 'DEPOSITO'] },
  DESPACHADO: { posicion: 'global', roles: ['CHOFER'] },
  ENTREGADO: { posicion: 'global', roles: ['CHOFER'] },
  RECIBIDO: { posicion: 'destino', roles: ['FABRICA', 'VENTA'] },
  CANCELADO: { posicion: 'destino', roles: ['FABRICA', 'VENTA'] },
};

function puedeTransicionarUI(usuario, pedido, hacia) {
  if (!usuario) return false;
  if (usuario.rol === 'DUENIO') return true;
  const regla = REGLAS_TRANSICION[hacia];
  if (!regla || !regla.roles.includes(usuario.rol)) return false;
  if (regla.posicion === 'global') return true;
  const objetivo =
    regla.posicion === 'origen' ? pedido.sucursal_origen_id : pedido.sucursal_destino_id;
  return Number(usuario.sucursal_id) === Number(objetivo);
}

const ESTADO_BADGE = {
  PENDIENTE: 'badge-warn',
  EN_PREPARACION: 'badge-info',
  DESPACHADO: 'badge-info',
  ENTREGADO: 'badge-info',
  RECIBIDO: 'badge-ok',
  CANCELADO: 'badge-danger',
};

const TIPO_BADGE = { INSUMOS: 'badge-warn', PRODUCTOS: 'badge-info' };

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

function detalleTexto(d) {
  const base = `${d.item_nombre} — ${Number(d.cantidad)} ${d.item_unidad}`;
  if (d.cantidad_recibida != null && Number(d.cantidad_recibida) !== Number(d.cantidad)) {
    return `${base} · recibido ${Number(d.cantidad_recibida)}`;
  }
  return base;
}

/* ------------------------------------------------------------------ */
/*  Hook compartido de pedidos                                         */
/* ------------------------------------------------------------------ */

function usePedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [estadoEnCurso, setEstadoEnCurso] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setPedidos(await apiGet('/pedidos'));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiarEstado = useCallback(
    async (pedidoId, nuevoEstado, opciones) => {
      if (
        nuevoEstado === 'CANCELADO' &&
        !window.confirm(`¿Cancelar el pedido #${pedidoId}? Esta acción no se puede deshacer.`)
      ) {
        return false;
      }
      setError('');
      setOkMsg('');
      setEstadoEnCurso(pedidoId);
      try {
        await apiPut(`/pedidos/${pedidoId}/estado`, { estado: nuevoEstado, ...opciones });
        setOkMsg(`Pedido #${pedidoId}: estado actualizado a ${nuevoEstado.replace('_', ' ')}.`);
        await cargar();
        return true;
      } catch (e) {
        setError(e.message);
        return false;
      } finally {
        setEstadoEnCurso(null);
      }
    },
    [cargar]
  );

  return { pedidos, cargando, error, okMsg, estadoEnCurso, cargar, cambiarEstado };
}

/* ------------------------------------------------------------------ */
/*  Formulario de nuevo pedido (rol-aware)                             */
/* ------------------------------------------------------------------ */

function FormularioNuevoPedido({ usuario, sucursales, productos, insumos, onCreado }) {
  const esDuenio = usuario.rol === 'DUENIO';
  const tiposDisponibles = TIPOS_POR_ROL[usuario.rol] ?? [];

  const [tipo, setTipo] = useState(tiposDisponibles[0] ?? 'PRODUCTOS');
  const [origenDuenio, setOrigenDuenio] = useState('');
  const [destinoDuenio, setDestinoDuenio] = useState('');
  const [estado, setEstado] = useState('PENDIENTE');
  const [items, setItems] = useState([{ item_id: '', cantidad: '' }]);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  const regla = REGLA_TIPO[tipo];
  const catalogo = tipo === 'INSUMOS' ? insumos : productos;

  const sucsOrigen = useMemo(
    () => sucursales.filter((s) => s.tipo === regla.tipoOrigen),
    [sucursales, regla.tipoOrigen]
  );
  const sucsDestino = useMemo(
    () => sucursales.filter((s) => s.tipo === regla.tipoDestino),
    [sucursales, regla.tipoDestino]
  );

  // Origen/destino efectivos: fijos por rol, o elegidos por el dueño.
  const origenId = esDuenio ? Number(origenDuenio) : sucsOrigen[0]?.id;
  const destinoId = esDuenio ? Number(destinoDuenio) : usuario.sucursal_id;

  useEffect(() => {
    // al cambiar de tipo se resetea el detalle y la selección del dueño
    setItems([{ item_id: '', cantidad: '' }]);
    setOrigenDuenio('');
    setDestinoDuenio('');
  }, [tipo]);

  const actualizarItem = (idx, campo, valor) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  const agregarItem = () => setItems((prev) => [...prev, { item_id: '', cantidad: '' }]);
  const quitarItem = (idx) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const enviar = async (evt) => {
    evt.preventDefault();
    setError('');
    setOkMsg('');

    if (!origenId || !destinoId) {
      setError('Falta la sucursal de origen o de destino.');
      return;
    }
    if (origenId === Number(destinoId)) {
      setError('El origen y el destino deben ser distintos.');
      return;
    }
    const detalles = items
      .filter((it) => it.item_id && Number(it.cantidad) > 0)
      .map((it) => ({ [regla.idCampo]: Number(it.item_id), cantidad: Number(it.cantidad) }));
    if (detalles.length === 0) {
      setError(`Agregá al menos un ${regla.catalogo === 'insumos' ? 'insumo' : 'producto'} con cantidad.`);
      return;
    }

    const payload = {
      tipo,
      sucursal_origen_id: origenId,
      sucursal_destino_id: Number(destinoId),
      detalles,
    };
    if (esDuenio) payload.estado = estado;

    setEnviando(true);
    try {
      await apiPost('/pedidos', payload);
      setOkMsg('Pedido registrado correctamente.');
      setItems([{ item_id: '', cantidad: '' }]);
      setEstado('PENDIENTE');
      onCreado?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const nombreCatalogo = tipo === 'INSUMOS' ? 'Insumos' : 'Productos';

  return (
    <>
      <p className="subtitle">
        {tipo === 'INSUMOS'
          ? 'Pedido de insumos al Depósito Central.'
          : 'Pedido de productos a la fábrica.'}
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {okMsg && <div className="alert alert-ok">{okMsg}</div>}

      <form onSubmit={enviar}>
        {tiposDisponibles.length > 1 && (
          <>
            <label htmlFor="np-tipo">Tipo de pedido</label>
            <select id="np-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {tiposDisponibles.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </>
        )}

        {esDuenio ? (
          <>
            <label htmlFor="np-origen">Sucursal de origen ({regla.tipoOrigen})</label>
            <select
              id="np-origen"
              value={origenDuenio}
              onChange={(e) => setOrigenDuenio(e.target.value)}
              required
            >
              <option value="">Seleccionar…</option>
              {sucsOrigen.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>

            <label htmlFor="np-destino">Sucursal de destino ({regla.tipoDestino})</label>
            <select
              id="np-destino"
              value={destinoDuenio}
              onChange={(e) => setDestinoDuenio(e.target.value)}
              required
            >
              <option value="">Seleccionar…</option>
              {sucsDestino.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>

            <label htmlFor="np-estado">Estado inicial</label>
            <select id="np-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
              {ESTADOS_PEDIDO.map((es) => (
                <option key={es} value={es}>
                  {es.replace('_', ' ')}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="ruta-linea">
            {nombreSucursal(sucursales, origenId)} → {nombreSucursal(sucursales, destinoId)}
          </p>
        )}

        <label>{nombreCatalogo}</label>
        {items.map((it, idx) => (
          <div className="detalle-row" key={idx}>
            <select
              value={it.item_id}
              onChange={(e) => actualizarItem(idx, 'item_id', e.target.value)}
              aria-label={nombreCatalogo}
            >
              <option value="">{tipo === 'INSUMOS' ? 'Insumo…' : 'Producto…'}</option>
              {catalogo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
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
          + Agregar {tipo === 'INSUMOS' ? 'insumo' : 'producto'}
        </button>

        <div style={{ marginTop: 16 }}>
          <button type="submit" className="primary" disabled={enviando}>
            {enviando ? 'Registrando…' : 'Registrar pedido'}
          </button>
        </div>
      </form>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Editor de recepción                                                */
/* ------------------------------------------------------------------ */

function FilaRecepcion({ pedido, colSpan, onConfirmar, onCancelar, ocupado }) {
  const [cantidades, setCantidades] = useState(() =>
    Object.fromEntries(pedido.detalles.map((d) => [d.id, String(Number(d.cantidad))]))
  );

  const confirmar = () => {
    const recepcion = pedido.detalles.map((d) => ({
      detalle_id: d.id,
      cantidad_recibida: Number(cantidades[d.id]),
    }));
    onConfirmar(recepcion);
  };

  return (
    <tr className="recepcion-row">
      <td colSpan={colSpan}>
        <div className="recepcion-panel">
          <strong>Recepción del pedido #{pedido.id}</strong>
          <p className="muted">Ajustá lo que llegó realmente; por defecto es lo pedido.</p>
          {pedido.detalles.map((d) => (
            <div className="recepcion-linea" key={d.id}>
              <span>
                {d.item_nombre} (pedido {Number(d.cantidad)} {d.item_unidad})
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cantidades[d.id]}
                onChange={(e) =>
                  setCantidades((prev) => ({ ...prev, [d.id]: e.target.value }))
                }
                aria-label={`Cantidad recibida de ${d.item_nombre}`}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button type="button" className="primary" disabled={ocupado} onClick={confirmar}>
              Confirmar recepción
            </button>
            <button type="button" className="link" onClick={onCancelar}>
              Cancelar
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Tablero de Pedidos                                                 */
/* ------------------------------------------------------------------ */

function TableroPedidos({ sucursales, productos, insumos, usuario }) {
  const puedeCrear = ROLES_CREAN_PEDIDOS.has(usuario.rol);
  const { pedidos, cargando, error, okMsg, estadoEnCurso, cargar, cambiarEstado } = usePedidos();
  const [recibiendo, setRecibiendo] = useState(null);

  const COLS = 8;

  const confirmarRecepcion = async (pedidoId, recepcion) => {
    const ok = await cambiarEstado(pedidoId, 'RECIBIDO', { recepcion });
    if (ok) setRecibiendo(null);
  };

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {okMsg && <div className="alert alert-ok">{okMsg}</div>}

      <div className="grid-2">
        <div className="card">
          <h2>Nuevo pedido</h2>
          {puedeCrear ? (
            <FormularioNuevoPedido
              usuario={usuario}
              sucursales={sucursales}
              productos={productos}
              insumos={insumos}
              onCreado={cargar}
            />
          ) : (
            <p className="subtitle">
              Tu rol ({etiquetaRol(usuario.rol)}) no crea pedidos. Podés ver el listado y
              actuar sobre los estados que te correspondan.
            </p>
          )}
        </div>

        <div className="card">
          <div className="row-between">
            <div>
              <h2>Pedidos registrados</h2>
              <p className="subtitle">{pedidos.length} pedido(s) en el sistema.</p>
            </div>
            <button className="link" onClick={cargar}>
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
                    <th>Tipo</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Detalle</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => {
                    const avance = SIGUIENTE_ESTADO[p.estado];
                    const puedeAvanzar = avance && puedeTransicionarUI(usuario, p, avance);
                    const puedeCancelar =
                      PUEDE_CANCELARSE.has(p.estado) &&
                      puedeTransicionarUI(usuario, p, 'CANCELADO');
                    const avanzarEsRecepcion = avance === 'RECIBIDO';
                    return (
                      <React.Fragment key={p.id}>
                        <tr>
                          <td>{p.id}</td>
                          <td>
                            <span className={`badge ${TIPO_BADGE[p.tipo] || 'badge-muted'}`}>
                              {p.tipo}
                            </span>
                          </td>
                          <td>
                            {p.sucursal_origen_nombre ||
                              nombreSucursal(sucursales, p.sucursal_origen_id)}
                          </td>
                          <td>
                            {p.sucursal_destino_nombre ||
                              nombreSucursal(sucursales, p.sucursal_destino_id)}
                          </td>
                          <td>
                            {p.detalles && p.detalles.length > 0 ? (
                              <ul className="detalle-list">
                                {p.detalles.map((d) => (
                                  <li key={d.id}>{detalleTexto(d)}</li>
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
                          <td>
                            <div className="acciones-pedido">
                              {puedeAvanzar && !avanzarEsRecepcion && (
                                <button
                                  type="button"
                                  className="link"
                                  disabled={estadoEnCurso === p.id}
                                  onClick={() => cambiarEstado(p.id, avance)}
                                >
                                  {ETIQUETA_AVANCE[avance]}
                                </button>
                              )}
                              {puedeAvanzar && avanzarEsRecepcion && (
                                <button
                                  type="button"
                                  className="link"
                                  disabled={estadoEnCurso === p.id}
                                  onClick={() =>
                                    setRecibiendo((cur) => (cur === p.id ? null : p.id))
                                  }
                                >
                                  {recibiendo === p.id ? 'Cerrar' : 'Confirmar recepción'}
                                </button>
                              )}
                              {puedeCancelar && (
                                <button
                                  type="button"
                                  className="link link-danger"
                                  disabled={estadoEnCurso === p.id}
                                  onClick={() => cambiarEstado(p.id, 'CANCELADO')}
                                >
                                  Cancelar
                                </button>
                              )}
                              {!puedeAvanzar && !puedeCancelar && (
                                <span className="muted">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {recibiendo === p.id && (
                          <FilaRecepcion
                            pedido={p}
                            colSpan={COLS}
                            ocupado={estadoEnCurso === p.id}
                            onConfirmar={(recepcion) => confirmarRecepcion(p.id, recepcion)}
                            onCancelar={() => setRecibiendo(null)}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Hoja de ruta del chofer                                            */
/* ------------------------------------------------------------------ */

function HojaDeRuta({ usuario }) {
  const { pedidos, cargando, error, okMsg, estadoEnCurso, cargar, cambiarEstado } = usePedidos();

  const paraRetirar = pedidos.filter((p) => p.estado === 'EN_PREPARACION');
  const enCamino = pedidos.filter((p) => p.estado === 'DESPACHADO');

  const Tarjeta = ({ p, accion, etiqueta }) => (
    <div className="ruta-card">
      <div className="ruta-card-head">
        <span className={`badge ${TIPO_BADGE[p.tipo] || 'badge-muted'}`}>{p.tipo}</span>
        <span className="muted">#{p.id}</span>
      </div>
      <p className="ruta-linea">
        {p.sucursal_origen_nombre} → {p.sucursal_destino_nombre}
      </p>
      <ul className="detalle-list">
        {p.detalles.map((d) => (
          <li key={d.id}>{detalleTexto(d)}</li>
        ))}
      </ul>
      <button
        type="button"
        className="primary"
        disabled={estadoEnCurso === p.id || !puedeTransicionarUI(usuario, p, accion)}
        onClick={() => cambiarEstado(p.id, accion)}
      >
        {etiqueta}
      </button>
    </div>
  );

  return (
    <div className="card">
      <div className="row-between">
        <div>
          <h2>Hoja de ruta</h2>
          <p className="subtitle">Pedidos listos para retirar y entregas en curso.</p>
        </div>
        <button className="link" onClick={cargar}>
          Actualizar
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {okMsg && <div className="alert alert-ok">{okMsg}</div>}

      {cargando ? (
        <div className="empty">Cargando…</div>
      ) : (
        <>
          <h3 className="ruta-titulo">Para retirar ({paraRetirar.length})</h3>
          {paraRetirar.length === 0 ? (
            <div className="empty">Nada listo para retirar.</div>
          ) : (
            <div className="ruta-grid">
              {paraRetirar.map((p) => (
                <Tarjeta key={p.id} p={p} accion="DESPACHADO" etiqueta="Despachar" />
              ))}
            </div>
          )}

          <h3 className="ruta-titulo">En camino ({enCamino.length})</h3>
          {enCamino.length === 0 ? (
            <div className="empty">No hay entregas en curso.</div>
          ) : (
            <div className="ruta-grid">
              {enCamino.map((p) => (
                <Tarjeta key={p.id} p={p} accion="ENTREGADO" etiqueta="Marcar entregado" />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Gestión de Stock e Insumos                                         */
/* ------------------------------------------------------------------ */

function GestionInsumos({ usuario }) {
  const puedeGestionar = ROLES_GESTIONAN_INSUMOS.has(usuario.rol);
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
        {!puedeGestionar ? (
          <p className="subtitle">
            Tu rol ({etiquetaRol(usuario.rol)}) no gestiona el stock de insumos. Podés
            consultar el listado.
          </p>
        ) : (
          <>
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
          </>
        )}
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
                        {puedeGestionar && (
                          <button className="link" onClick={() => elegirInsumo(i)}>
                            Editar
                          </button>
                        )}
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

const TAB_PEDIDOS = { id: 'pedidos', label: 'Tablero de Pedidos' };
const TAB_RUTA = { id: 'ruta', label: 'Hoja de Ruta' };
const TAB_INSUMOS = { id: 'insumos', label: 'Stock e Insumos' };
const TAB_RED = { id: 'red', label: 'Red de Sucursales' };

export default function App() {
  const { usuario, cargando, logout } = useAuth();
  const [tab, setTab] = useState('pedidos');
  const [sucursales, setSucursales] = useState([]);
  const [productos, setProductos] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [errorGlobal, setErrorGlobal] = useState('');

  useEffect(() => {
    if (!usuario) return;
    (async () => {
      try {
        const [s, p, i] = await Promise.all([
          apiGet('/sucursales'),
          apiGet('/productos'),
          apiGet('/insumos'),
        ]);
        setSucursales(s);
        setProductos(p);
        setInsumos(i);
      } catch (e) {
        setErrorGlobal(e.message);
      }
    })();
  }, [usuario]);

  useEffect(() => {
    if (usuario?.rol === 'CHOFER') setTab('ruta');
  }, [usuario]);

  if (cargando) {
    return (
      <div className="app">
        <div className="empty">Cargando…</div>
      </div>
    );
  }

  if (!usuario) {
    return <Login />;
  }

  const tabs = [
    TAB_PEDIDOS,
    ...(ROLES_HOJA_RUTA.has(usuario.rol) ? [TAB_RUTA] : []),
    TAB_INSUMOS,
    TAB_RED,
  ];

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">🥐</div>
        <div className="app-header-titles">
          <h1>Red de Panaderías · Gestión Interna</h1>
          <p>Pedidos entre sucursales · Control de insumos · Mapa operacional</p>
        </div>
        <div className="app-user">
          <div className="app-user-info">
            <strong>{usuario.nombre}</strong>
            <span>
              {etiquetaRol(usuario.rol)}
              {usuario.sucursal_nombre ? ` · ${usuario.sucursal_nombre}` : ''}
            </span>
          </div>
          <button type="button" className="link" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      {errorGlobal && <div className="alert alert-error">{errorGlobal}</div>}

      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'pedidos' && (
        <TableroPedidos
          sucursales={sucursales}
          productos={productos}
          insumos={insumos}
          usuario={usuario}
        />
      )}
      {tab === 'ruta' && ROLES_HOJA_RUTA.has(usuario.rol) && <HojaDeRuta usuario={usuario} />}
      {tab === 'insumos' && <GestionInsumos usuario={usuario} />}
      {tab === 'red' && <RedSucursales sucursales={sucursales} />}
    </div>
  );
}
