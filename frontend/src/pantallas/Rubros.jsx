import { useCallback, useEffect, useState } from 'react';

import { apiGet, apiPost, apiPut } from '../lib/api.js';
import { reordenar } from '../lib/pedidos.js';

// Sólo la fábrica y el galpón preparan pedidos.
const PREPARAN = ['FABRICA', 'DEPOSITO'];

function ElegirOrigen({ id, valor, lugares, alCambiar }) {
  return (
    <select id={id} value={valor} onChange={(e) => alCambiar(e.target.value)}>
      <option value="">Elegir…</option>
      {lugares.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nombre}
        </option>
      ))}
    </select>
  );
}

/** Una fila de la lista, con su propio formulario para editarla. */
function FilaRubro({ rubro, lugares, primero, ultimo, ocupado, alMover, alGuardar }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(rubro.nombre);
  const [origen, setOrigen] = useState(String(rubro.sucursal_origen_id));

  const guardar = async (evt) => {
    evt.preventDefault();
    const ok = await alGuardar(rubro, { nombre, sucursal_origen_id: Number(origen) });
    if (ok) setEditando(false);
  };

  if (editando) {
    return (
      <li className="rubro-fila">
        <form onSubmit={guardar} aria-label={`Editar ${rubro.nombre}`}>
          <label htmlFor={`rubro-nombre-${rubro.id}`}>Nombre</label>
          <input
            id={`rubro-nombre-${rubro.id}`}
            maxLength={60}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <label htmlFor={`rubro-origen-${rubro.id}`}>¿De dónde sale?</label>
          <ElegirOrigen
            id={`rubro-origen-${rubro.id}`}
            valor={origen}
            lugares={lugares}
            alCambiar={setOrigen}
          />
          <div className="pedido-acciones">
            <button type="submit" className="primary" disabled={ocupado}>
              Guardar
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setNombre(rubro.nombre);
                setOrigen(String(rubro.sucursal_origen_id));
                setEditando(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={`rubro-fila ${rubro.activo ? '' : 'rubro-inactivo'}`}>
      <div className="row-between">
        <div>
          <strong>{rubro.nombre}</strong>
          <p className="muted rubro-origen">Sale de {rubro.sucursal_origen_nombre}</p>
        </div>
        {!rubro.activo && <span className="badge badge-muted">Desactivado</span>}
      </div>
      <div className="pedido-acciones">
        <button
          type="button"
          className="link"
          aria-label={`Subir ${rubro.nombre}`}
          disabled={ocupado || primero}
          onClick={() => alMover(-1)}
        >
          ↑ Subir
        </button>
        <button
          type="button"
          className="link"
          aria-label={`Bajar ${rubro.nombre}`}
          disabled={ocupado || ultimo}
          onClick={() => alMover(1)}
        >
          ↓ Bajar
        </button>
        <button
          type="button"
          className="link"
          aria-label={`Editar ${rubro.nombre}`}
          disabled={ocupado}
          onClick={() => setEditando(true)}
        >
          Editar
        </button>
        <button
          type="button"
          className={rubro.activo ? 'link link-danger' : 'link'}
          aria-label={`${rubro.activo ? 'Desactivar' : 'Activar'} ${rubro.nombre}`}
          disabled={ocupado}
          onClick={() => alGuardar(rubro, { activo: !rubro.activo })}
        >
          {rubro.activo ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </li>
  );
}

/**
 * Los dueños arman la lista de rubros que piden las sucursales (Sprint 9, #77):
 * agregar, renombrar, cambiar de dónde sale, ordenar y desactivar.
 */
export default function Rubros({ sucursales }) {
  const lugares = sucursales.filter((s) => PREPARAN.includes(s.tipo));
  const [rubros, setRubros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [nombre, setNombre] = useState('');
  const [origen, setOrigen] = useState('');

  const cargar = useCallback(async () => {
    try {
      setRubros(await apiGet('/pedidos/rubros?todos=1'));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Hace los cambios, recarga y avisa. Devuelve si salió bien. */
  const hacer = async (cambios, aviso) => {
    setError('');
    setOk('');
    setOcupado(true);
    let fallo = '';
    try {
      await cambios();
    } catch (e) {
      fallo = e.message;
    }
    await cargar();
    if (fallo) setError(fallo);
    else if (aviso) setOk(aviso);
    setOcupado(false);
    return !fallo;
  };

  const agregar = async (evt) => {
    evt.preventDefault();
    if (!nombre.trim() || !origen) {
      setOk('');
      setError('Escribí el nombre y elegí de dónde sale.');
      return;
    }
    const salio = await hacer(
      () =>
        apiPost('/pedidos/rubros', { nombre: nombre.trim(), sucursal_origen_id: Number(origen) }),
      `Agregaste ${nombre.trim()}. Ya lo pueden pedir las sucursales.`
    );
    if (salio) {
      setNombre('');
      setOrigen('');
    }
  };

  const guardar = (rubro, cambios) => {
    const aviso =
      cambios.activo === false
        ? `${rubro.nombre} ya no aparece para pedir.`
        : cambios.activo === true
          ? `${rubro.nombre} se puede pedir de nuevo.`
          : 'Cambios guardados.';
    return hacer(() => apiPut(`/pedidos/rubros/${rubro.id}`, cambios), aviso);
  };

  const mover = (indice, paso) =>
    hacer(async () => {
      for (const { id, orden } of reordenar(rubros, indice, indice + paso)) {
        await apiPut(`/pedidos/rubros/${id}`, { orden });
      }
    });

  return (
    <div className="grid-2">
      <section className="card" aria-labelledby="titulo-nuevo-rubro">
        <h2 id="titulo-nuevo-rubro">Agregar rubro</h2>
        <p className="subtitle">Lo que las sucursales pueden pedir, y de dónde sale.</p>
        <form onSubmit={agregar} aria-label="Agregar rubro">
          <label htmlFor="rubro-nombre">Nombre</label>
          <input
            id="rubro-nombre"
            maxLength={60}
            placeholder="Ej: Prepizzas"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <label htmlFor="rubro-origen">¿De dónde sale?</label>
          <ElegirOrigen id="rubro-origen" valor={origen} lugares={lugares} alCambiar={setOrigen} />
          <button type="submit" className="primary pedido-enviar" disabled={ocupado}>
            Agregar
          </button>
        </form>
      </section>

      <section className="card" aria-labelledby="titulo-rubros">
        <h2 id="titulo-rubros">Rubros</h2>
        <p className="subtitle">En este orden los ven las sucursales al pedir.</p>
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
        {cargando ? (
          <div className="empty">Cargando rubros…</div>
        ) : (
          <ol className="pedidos-lista">
            {rubros.map((r, i) => (
              <FilaRubro
                key={`${r.id}-${r.nombre}-${r.sucursal_origen_id}`}
                rubro={r}
                lugares={lugares}
                primero={i === 0}
                ultimo={i === rubros.length - 1}
                ocupado={ocupado}
                alMover={(paso) => mover(i, paso)}
                alGuardar={guardar}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
