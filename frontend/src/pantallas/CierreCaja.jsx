import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/contexto.js';
import { apiGet, apiPost } from '../lib/api.js';
import { aPesos, calcularCuadre, leerMonto, mostrarPesos } from '../lib/cuadre.js';
import {
  aCampo,
  centavosDe,
  DEL_TURNO,
  diaMes,
  GASTO_VACIO,
  gastoCompleto,
  gastoParaApi,
  TURNOS,
  valorGasto,
} from '../lib/cierres.js';
import { useCategorias } from '../lib/useCategorias.js';
import { BadgeDiferencia, CampoMonto, Diferencia, FilaGasto } from './CamposCierre.jsx';

const VACIO = {
  numeroZ: '',
  totalControlador: '',
  efectivoContado: '',
  cambioFijo: '',
  debito: '',
  credito: '',
  qr: '',
  comentario: '',
};

const OBLIGATORIOS = ['totalControlador', 'efectivoContado', 'cambioFijo'];

/** Un cierre ya enviado, en una línea. */
function CierreCargado({ cierre }) {
  return (
    <li>
      <div className="row-between">
        <strong>{TURNOS[cierre.turno]}</strong>
        <BadgeDiferencia diferencia={cierre.diferencia} />
      </div>
      <p className="muted">
        Controlador {mostrarPesos(centavosDe(cierre.total_controlador))} · cargó{' '}
        {cierre.cargado_por_nombre}
      </p>
    </li>
  );
}

/**
 * Cierre de caja pensado para el celular (#8, #9). La empleada cierra su
 * sucursal del día; la dueña elige la sucursal. La diferencia se ve mientras
 * se carga, con la misma cuenta que hace la API.
 */
export default function CierreCaja({ sucursales }) {
  const { sesion } = useAuth();
  const sucursalFija = sesion.sucursal;
  const conCaja = sucursales.filter((s) => s.tipo !== 'DEPOSITO');
  const [sucursalId, setSucursalId] = useState(sucursalFija ? sucursalFija.id : '');
  const [hoy, setHoy] = useState(null);
  const [turno, setTurno] = useState('');
  const [datos, setDatos] = useState(VACIO);
  const [gastos, setGastos] = useState([]);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const categorias = useCategorias(setError);

  const cargarHoy = useCallback(async () => {
    if (!sucursalId) return;
    try {
      const query = sucursalFija ? '' : `?sucursal_id=${sucursalId}`;
      const r = await apiGet(`/cierres/hoy${query}`);
      setHoy(r);
      setTurno(r.turnos_pendientes[0] ?? '');
      setDatos({
        ...VACIO,
        cambioFijo: r.cambio_sugerido === null ? '' : aCampo(r.cambio_sugerido),
      });
      setGastos([]);
    } catch (e) {
      setError(e.message);
    }
  }, [sucursalId, sucursalFija]);

  useEffect(() => {
    cargarHoy();
  }, [cargarHoy]);

  const campo = (nombre) => (e) => setDatos((prev) => ({ ...prev, [nombre]: e.target.value }));
  const monto = (nombre) => (valor) => setDatos((prev) => ({ ...prev, [nombre]: valor }));
  const cambiarGasto = (i, nombre) => (e) =>
    setGastos((prev) =>
      prev.map((g, j) => (j === i ? { ...g, [nombre]: valorGasto(nombre, e) } : g))
    );

  const centavos = Object.fromEntries(
    ['totalControlador', 'efectivoContado', 'cambioFijo', 'debito', 'credito', 'qr'].map((k) => [
      k,
      leerMonto(datos[k]),
    ])
  );
  const gastosCentavos = gastos.map((g) => leerMonto(g.monto));
  const completo =
    OBLIGATORIOS.every((k) => datos[k].trim() !== '') &&
    Object.values(centavos).every((c) => c !== null) &&
    gastos.every((g, i) => gastoCompleto(g, gastosCentavos[i]));
  const cuadre = completo
    ? calcularCuadre({ ...centavos, transferencias: 0, gastos: gastosCentavos })
    : null;

  const enviar = async (evt) => {
    evt.preventDefault();
    setError('');
    if (!completo) {
      setError(
        'Completá el total del controlador, el efectivo contado y el cambio que queda. Cada gasto necesita categoría, detalle y monto.'
      );
      return;
    }
    setEnviando(true);
    try {
      const cierre = await apiPost('/cierres', {
        ...(sucursalFija ? {} : { sucursal_id: Number(sucursalId) }),
        turno,
        numero_z: datos.numeroZ.trim() || null,
        total_controlador: aPesos(centavos.totalControlador),
        efectivo_contado: aPesos(centavos.efectivoContado),
        cambio_fijo: aPesos(centavos.cambioFijo),
        debito: aPesos(centavos.debito),
        credito: aPesos(centavos.credito),
        qr: aPesos(centavos.qr),
        gastos: gastos.map((g, i) => gastoParaApi(g, gastosCentavos[i])),
        comentario: datos.comentario,
      });
      setEnviado(cierre);
      await cargarHoy();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const nombreSucursal = sucursalFija?.nombre ?? hoy?.sucursal.nombre;

  return (
    <div className="grid-2 cierre-caja">
      <div className="card">
        <h2>Cierre de caja</h2>
        <p className="subtitle">
          {nombreSucursal && hoy ? `${nombreSucursal} · hoy ${diaMes(hoy.fecha)}` : 'Hoy'}
        </p>

        {!sucursalFija && (
          <>
            <label htmlFor="cierre-sucursal">Sucursal</label>
            <select
              id="cierre-sucursal"
              value={sucursalId}
              onChange={(e) => {
                setEnviado(null);
                setHoy(null);
                setSucursalId(e.target.value);
              }}
            >
              <option value="">Elegí la sucursal…</option>
              {conCaja.map((s) => (
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
        {enviado && (
          <div className="alert alert-ok" role="status">
            Cierre {DEL_TURNO[enviado.turno]} enviado.
          </div>
        )}

        {hoy && hoy.turnos_pendientes.length === 0 && (
          <div className="empty">Ya se cerraron los dos turnos de hoy.</div>
        )}

        {hoy && hoy.turnos_pendientes.length > 0 && (
          <form onSubmit={enviar} aria-label="Cierre de caja" noValidate>
            <fieldset className="turnos">
              <legend>Turno</legend>
              {hoy.turnos_pendientes.map((t) => (
                <label key={t} className={`turno ${turno === t ? 'activo' : ''}`}>
                  <input
                    type="radio"
                    name="turno"
                    value={t}
                    checked={turno === t}
                    onChange={() => setTurno(t)}
                  />
                  {TURNOS[t]}
                </label>
              ))}
            </fieldset>

            <div className="montos">
              <CampoMonto
                id="cierre-total"
                label="Total del controlador (Z)"
                valor={datos.totalControlador}
                onChange={monto('totalControlador')}
              />
              <div className="campo-monto">
                <label htmlFor="cierre-numero-z">Número de Z (opcional)</label>
                <input
                  id="cierre-numero-z"
                  inputMode="numeric"
                  autoComplete="off"
                  value={datos.numeroZ}
                  onChange={campo('numeroZ')}
                />
              </div>
              <CampoMonto
                id="cierre-efectivo"
                label="Efectivo contado en la caja"
                valor={datos.efectivoContado}
                onChange={monto('efectivoContado')}
                ayuda="Toda la plata de la caja, cambio incluido."
              />
              <CampoMonto
                id="cierre-cambio"
                label="Cambio fijo que queda"
                valor={datos.cambioFijo}
                onChange={monto('cambioFijo')}
                ayuda={hoy.cambio_sugerido === null ? undefined : 'Sugerido: el del último cierre.'}
              />
              <CampoMonto
                id="cierre-debito"
                label="Débito"
                valor={datos.debito}
                onChange={monto('debito')}
              />
              <CampoMonto
                id="cierre-credito"
                label="Crédito"
                valor={datos.credito}
                onChange={monto('credito')}
              />
              <CampoMonto id="cierre-qr" label="QR" valor={datos.qr} onChange={monto('qr')} />
            </div>

            <fieldset className="gastos">
              <legend>Gastos pagados con la caja</legend>
              {gastos.length === 0 && <p className="muted">Sin gastos.</p>}
              {gastos.map((g, i) => (
                <FilaGasto
                  key={i}
                  numero={i + 1}
                  gasto={g}
                  categorias={categorias}
                  onCambiar={(nombre) => cambiarGasto(i, nombre)}
                  onQuitar={() => setGastos((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
              <button
                type="button"
                className="link"
                onClick={() => setGastos((prev) => [...prev, { ...GASTO_VACIO }])}
              >
                + Agregar gasto
              </button>
            </fieldset>

            {cuadre && (
              <Diferencia
                centavos={cuadre.diferencia}
                aviso="Se guarda igual y la dueña lo revisa. Si sabés por qué, dejalo en el comentario."
              />
            )}

            <label htmlFor="cierre-comentario">Comentario (opcional)</label>
            <textarea
              id="cierre-comentario"
              rows={2}
              maxLength={500}
              value={datos.comentario}
              onChange={campo('comentario')}
            />

            <button type="submit" className="primary boton-enviar" disabled={enviando || !turno}>
              {enviando ? 'Enviando…' : `Enviar cierre ${DEL_TURNO[turno] ?? ''}`.trim()}
            </button>
          </form>
        )}
      </div>

      {hoy && (
        <div className="card">
          <h2>Cierres de hoy</h2>
          {hoy.cierres.length === 0 ? (
            <div className="empty">Todavía no se cargó ningún cierre.</div>
          ) : (
            <ul className="lista-cierres" aria-label="Cierres de hoy">
              {hoy.cierres.map((c) => (
                <CierreCargado key={c.id} cierre={c} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
