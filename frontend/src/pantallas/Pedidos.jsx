import { useCallback, useEffect, useRef, useState } from 'react';

import { tienePermiso, useAuth } from '../auth/contexto.js';
import { apiGet, apiPost, apiPut } from '../lib/api.js';
import { formatFecha } from '../lib/formato.js';
import {
  ABIERTOS,
  BADGE_ESTADO,
  ETIQUETA_ESTADO,
  accionesPedido,
  lugaresDeOrigen,
  rubrosParaPedir,
} from '../lib/pedidos.js';

// Cuántos pedidos ya cerrados se muestran debajo de los que están en curso.
const ANTERIORES_VISIBLES = 10;

const MARCA_ITEM = { LLEVADO: 'Llevado', NO_HABIA: 'No había' };

/**
 * Formulario de la sucursal: toca un rubro ("Facturas") y escribe qué necesita
 * ("2 latas de medialunas, 2 latas de vigilantes"). Pensado para el celular.
 */
function NuevoPedido({ sesion, sucursales, rubros, alEnviar }) {
  const fija = sesion.sucursal;
  const [sucursalId, setSucursalId] = useState(fija ? String(fija.id) : '');
  const [renglones, setRenglones] = useState([]);
  const [nota, setNota] = useState('');
  const [urgente, setUrgente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const ultimo = useRef(null);
  const siguienteClave = useRef(1);

  const disponibles = sucursalId ? rubrosParaPedir(rubros, sucursalId) : [];
  // Piden las sucursales que venden y la fábrica; el galpón no pide.
  const quePiden = sucursales.filter((s) => s.tipo !== 'DEPOSITO');

  useEffect(() => {
    ultimo.current?.focus();
  }, [renglones.length]);

  const agregar = (rubro) => {
    setOk('');
    setRenglones((prev) => [...prev, { clave: siguienteClave.current++, rubro, detalle: '' }]);
  };
  const cambiar = (clave, detalle) =>
    setRenglones((prev) => prev.map((r) => (r.clave === clave ? { ...r, detalle } : r)));
  const quitar = (clave) => setRenglones((prev) => prev.filter((r) => r.clave !== clave));

  const enviar = async (evt) => {
    evt.preventDefault();
    setError('');
    setOk('');
    if (!sucursalId) {
      setError('Elegí para qué sucursal es el pedido.');
      return;
    }
    if (renglones.length === 0) {
      setError('Tocá un rubro para agregar lo que necesitás.');
      return;
    }
    if (renglones.some((r) => r.detalle.trim() === '')) {
      setError('Escribí qué necesitás en cada rubro (por ejemplo, "2 latas de medialunas").');
      return;
    }
    setEnviando(true);
    try {
      const creados = await apiPost('/pedidos', {
        ...(fija ? {} : { sucursal_id: Number(sucursalId) }),
        nota: nota.trim() || undefined,
        urgente,
        items: renglones.map((r) => ({ rubro_id: r.rubro.id, detalle: r.detalle.trim() })),
      });
      setOk(`Pedido enviado. Lo prepara ${lugaresDeOrigen(creados)}.`);
      setRenglones([]);
      setNota('');
      setUrgente(false);
      await alEnviar();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="card pedido-nuevo" aria-labelledby="titulo-nuevo-pedido">
      <h2 id="titulo-nuevo-pedido">Pedir mercadería</h2>
      {fija ? (
        <p className="subtitle">Pedido de {fija.nombre}.</p>
      ) : (
        <>
          <label htmlFor="pedido-sucursal">¿Para qué sucursal?</label>
          <select
            id="pedido-sucursal"
            value={sucursalId}
            onChange={(e) => {
              setSucursalId(e.target.value);
              setRenglones([]);
            }}
          >
            <option value="">Elegir…</option>
            {quePiden.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {ok && (
        <div className="alert alert-ok" role="status">
          {ok}
        </div>
      )}

      <form onSubmit={enviar} aria-label="Pedir mercadería">
        {sucursalId && (
          <>
            <p className="pedido-pregunta">¿Qué necesitás?</p>
            <div className="rubros" role="group" aria-label="Rubros">
              {disponibles.map((r) => (
                <button key={r.id} type="button" className="rubro" onClick={() => agregar(r)}>
                  + {r.nombre}
                </button>
              ))}
            </div>
          </>
        )}

        {renglones.map((r, i) => (
          <div className="pedido-renglon" key={r.clave}>
            <div className="row-between">
              <label htmlFor={`renglon-${r.clave}`}>{r.rubro.nombre}</label>
              <button
                type="button"
                className="link link-danger"
                aria-label={`Quitar ${r.rubro.nombre}`}
                onClick={() => quitar(r.clave)}
              >
                Quitar
              </button>
            </div>
            <textarea
              id={`renglon-${r.clave}`}
              ref={i === renglones.length - 1 ? ultimo : undefined}
              rows={2}
              maxLength={500}
              placeholder="Ej: 2 latas de medialunas, 2 latas de vigilantes"
              value={r.detalle}
              onChange={(e) => cambiar(r.clave, e.target.value)}
            />
          </div>
        ))}

        {renglones.length > 0 && (
          <>
            <label htmlFor="pedido-nota">Nota para el chofer (opcional)</label>
            <input
              id="pedido-nota"
              maxLength={300}
              placeholder="Ej: antes de las 7"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
            <label className="pedido-urgente">
              <input
                type="checkbox"
                checked={urgente}
                onChange={(e) => setUrgente(e.target.checked)}
              />
              Es urgente
            </label>
            <button type="submit" className="primary pedido-enviar" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </>
        )}
      </form>
    </section>
  );
}

/** Un pedido con sus renglones y los botones que le tocan a quien lo mira. */
function TarjetaPedido({ pedido, sesion, enCurso, alCambiar }) {
  const acciones = accionesPedido(pedido, sesion);
  const titulo = sesion.sucursal
    ? pedido.sucursal_destino_id === sesion.sucursal.id
      ? `De ${pedido.sucursal_origen_nombre}`
      : `Para ${pedido.sucursal_destino_nombre}`
    : `${pedido.sucursal_destino_nombre} · de ${pedido.sucursal_origen_nombre}`;

  return (
    <li className={`pedido ${pedido.urgente ? 'pedido-urgente-marca' : ''}`}>
      <div className="row-between">
        <h3>{titulo}</h3>
        <span>
          {pedido.urgente && ABIERTOS.includes(pedido.estado) && (
            <span className="badge badge-danger">Urgente</span>
          )}{' '}
          <span className={`badge ${BADGE_ESTADO[pedido.estado] ?? 'badge-muted'}`}>
            {ETIQUETA_ESTADO[pedido.estado] ?? pedido.estado}
          </span>
        </span>
      </div>
      <p className="muted pedido-cuando">
        {formatFecha(pedido.fecha_creacion)}
        {pedido.creado_por_nombre && ` · pidió ${pedido.creado_por_nombre}`}
      </p>
      <ul className="pedido-items">
        {pedido.items.map((item) => (
          <li key={item.id}>
            <strong>{item.rubro_nombre}:</strong> {item.detalle}
            {MARCA_ITEM[item.estado] && (
              <span
                className={`badge ${item.estado === 'LLEVADO' ? 'badge-ok' : 'badge-danger'} pedido-item-marca`}
              >
                {MARCA_ITEM[item.estado]}
              </span>
            )}
          </li>
        ))}
      </ul>
      {pedido.nota && <p className="pedido-nota">Nota: {pedido.nota}</p>}
      {acciones.length > 0 && (
        <div className="pedido-acciones">
          {acciones.map((a) => (
            <button
              key={a.estado}
              type="button"
              className={a.peligro ? 'link link-danger' : 'primary'}
              disabled={enCurso}
              onClick={() => alCambiar(pedido, a)}
            >
              {a.etiqueta}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

export default function Pedidos({ sucursales }) {
  const { sesion } = useAuth();
  const puedePedir = tienePermiso(sesion, 'pedidos:crear');
  const [pedidos, setPedidos] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [enCurso, setEnCurso] = useState(null);

  const cargarPedidos = useCallback(async () => {
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
    cargarPedidos();
    if (puedePedir) apiGet('/pedidos/rubros').then(setRubros, (e) => setError(e.message));
  }, [cargarPedidos, puedePedir]);

  const cambiarEstado = async (pedido, accion) => {
    if (
      accion.estado === 'CANCELADO' &&
      !window.confirm(`¿Cancelar el pedido de ${pedido.sucursal_destino_nombre}?`)
    ) {
      return;
    }
    setError('');
    setEnCurso(pedido.id);
    try {
      await apiPut(`/pedidos/${pedido.id}/estado`, { estado: accion.estado });
      await cargarPedidos();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnCurso(null);
    }
  };

  const abiertos = pedidos.filter((p) => ABIERTOS.includes(p.estado));
  const cerrados = pedidos
    .filter((p) => !ABIERTOS.includes(p.estado))
    .slice(0, ANTERIORES_VISIBLES);
  const tarjetas = (lista) => (
    <ul className="pedidos-lista">
      {lista.map((p) => (
        <TarjetaPedido
          key={p.id}
          pedido={p}
          sesion={sesion}
          enCurso={enCurso === p.id}
          alCambiar={cambiarEstado}
        />
      ))}
    </ul>
  );

  return (
    <div className={`pedidos ${puedePedir ? 'grid-2' : ''}`}>
      {puedePedir && (
        <NuevoPedido
          sesion={sesion}
          sucursales={sucursales}
          rubros={rubros}
          alEnviar={cargarPedidos}
        />
      )}

      <section className="card" aria-labelledby="titulo-pedidos">
        <div className="row-between">
          <h2 id="titulo-pedidos">En curso</h2>
          <button type="button" className="link" onClick={cargarPedidos}>
            Actualizar
          </button>
        </div>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {cargando ? (
          <div className="empty">Cargando pedidos…</div>
        ) : abiertos.length === 0 ? (
          <div className="empty">No hay pedidos en curso.</div>
        ) : (
          tarjetas(abiertos)
        )}

        {cerrados.length > 0 && (
          <>
            <h2 className="pedidos-anteriores">Anteriores</h2>
            {tarjetas(cerrados)}
          </>
        )}
      </section>
    </div>
  );
}
