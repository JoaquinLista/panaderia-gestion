import { useCallback, useEffect, useState } from 'react';

import { apiGet, apiPut } from '../lib/api.js';
import { BADGE_ESTADO, ETIQUETA_ESTADO, pedidosPorSalir } from '../lib/pedidos.js';

const MARCA_ITEM = { LLEVADO: 'Lo llevo', NO_HABIA: 'No había' };

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Un renglón para cargar: a quién va, qué es, y los botones para tildarlo. */
function RenglonCarga({ renglon, ocupado, alMarcar }) {
  const marcado = MARCA_ITEM[renglon.estado];
  return (
    <li className={`carga-renglon ${renglon.urgente ? 'pedido-urgente-marca' : ''}`}>
      <div className="carga-texto">
        <strong>{renglon.sucursal.nombre}:</strong> {renglon.detalle}
        {renglon.urgente && <span className="badge badge-danger pedido-item-marca">Urgente</span>}
      </div>
      <div className="pedido-acciones">
        {marcado ? (
          <>
            <span className={`badge ${renglon.estado === 'LLEVADO' ? 'badge-ok' : 'badge-danger'}`}>
              {marcado}
            </span>
            <button
              type="button"
              className="link"
              disabled={ocupado}
              onClick={() => alMarcar(renglon, 'PENDIENTE')}
            >
              Deshacer
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="primary"
              disabled={ocupado}
              onClick={() => alMarcar(renglon, 'LLEVADO')}
            >
              Lo llevo
            </button>
            <button
              type="button"
              className="link link-danger"
              disabled={ocupado}
              onClick={() => alMarcar(renglon, 'NO_HABIA')}
            >
              No había
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Pantalla del chofer (Sprint 9, #77): qué cargar en la fábrica y en el galpón,
 * rubro por rubro, y después una parada por sucursal para marcar lo entregado.
 */
export default function Recorrido() {
  const [recorrido, setRecorrido] = useState({ cargar: [], paradas: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setError('');
    try {
      setRecorrido(await apiGet('/pedidos/recorrido'));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /**
   * Hace los cambios, recarga y avisa. Recarga aunque falle a mitad de camino
   * (salir de un lugar son varios pedidos), y el error se muestra después de
   * recargar para que la recarga no lo borre.
   */
  const hacer = async (cambios, aviso = '') => {
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
    else setOk(aviso);
    setOcupado(false);
  };

  const marcar = (renglon, estado) =>
    hacer(() => apiPut(`/pedidos/${renglon.pedido_id}/items/${renglon.item_id}`, { estado }));

  const salir = (lugar) => {
    const ids = pedidosPorSalir(lugar);
    return hacer(
      async () => {
        for (const id of ids) {
          await apiPut(`/pedidos/${id}/estado`, { estado: 'EN_CAMINO' });
        }
      },
      `Saliste de ${lugar.origen.nombre} con ${plural(ids.length, 'pedido', 'pedidos')}.`
    );
  };

  const entregar = (pedido) =>
    hacer(
      () => apiPut(`/pedidos/${pedido.id}/estado`, { estado: 'ENTREGADO' }),
      `Entregado en ${pedido.sucursal_destino_nombre}.`
    );

  const { cargar: lugares, paradas } = recorrido;

  return (
    <div className="recorrido">
      <div className="row-between">
        <p className="subtitle">
          {cargando
            ? 'Cargando el recorrido…'
            : `${plural(paradas.length, 'parada', 'paradas')} con pedidos abiertos.`}
        </p>
        <button type="button" className="link" onClick={cargar}>
          Actualizar
        </button>
      </div>

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

      <section className="card" aria-labelledby="titulo-cargar">
        <h2 id="titulo-cargar">Para cargar</h2>
        {!cargando && lugares.length === 0 && <div className="empty">No hay nada para cargar.</div>}
        {lugares.map((lugar) => (
          <section
            key={lugar.origen.id}
            className="carga-lugar"
            aria-label={`Cargar en ${lugar.origen.nombre}`}
          >
            <h3>En {lugar.origen.nombre}</h3>
            {lugar.rubros.map(({ rubro, renglones }) => (
              <div key={rubro.id} className="carga-rubro">
                <h4>{rubro.nombre}</h4>
                <ul className="pedidos-lista">
                  {renglones.map((r) => (
                    <RenglonCarga key={r.item_id} renglon={r} ocupado={ocupado} alMarcar={marcar} />
                  ))}
                </ul>
              </div>
            ))}
            <button
              type="button"
              className="primary carga-salir"
              disabled={ocupado}
              onClick={() => salir(lugar)}
            >
              Salgo de {lugar.origen.nombre}
            </button>
          </section>
        ))}
      </section>

      <section className="card" aria-labelledby="titulo-paradas">
        <h2 id="titulo-paradas">Paradas</h2>
        {!cargando && paradas.length === 0 && <div className="empty">No hay entregas.</div>}
        <ol className="paradas">
          {paradas.map((parada) => (
            <li key={parada.sucursal.id} className="parada">
              <div className="row-between">
                <h3>{parada.sucursal.nombre}</h3>
                {parada.urgente && <span className="badge badge-danger">Urgente</span>}
              </div>
              <ul className="pedidos-lista">
                {parada.pedidos.map((p) => (
                  <li key={p.id} className={`pedido ${p.urgente ? 'pedido-urgente-marca' : ''}`}>
                    <div className="row-between">
                      <strong>De {p.sucursal_origen_nombre}</strong>
                      <span className={`badge ${BADGE_ESTADO[p.estado] ?? 'badge-muted'}`}>
                        {ETIQUETA_ESTADO[p.estado] ?? p.estado}
                      </span>
                    </div>
                    <ul className="pedido-items">
                      {p.items.map((item) => (
                        <li key={item.id}>
                          <strong>{item.rubro_nombre}:</strong> {item.detalle}
                          {item.estado === 'NO_HABIA' && (
                            <span className="badge badge-danger pedido-item-marca">No había</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {p.nota && <p className="pedido-nota">Nota: {p.nota}</p>}
                    {p.estado === 'EN_CAMINO' ? (
                      <div className="pedido-acciones">
                        <button
                          type="button"
                          className="primary"
                          disabled={ocupado}
                          onClick={() => entregar(p)}
                        >
                          Entregado
                        </button>
                      </div>
                    ) : (
                      <p className="muted pedido-nota">
                        Falta cargarlo en {p.sucursal_origen_nombre}.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
