import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/contexto.js';
import { apiGet, apiPost } from '../lib/api.js';
import { aPesos, calcularCuadre, leerMonto, mostrarPesos } from '../lib/cuadre.js';

const TURNOS = { MEDIODIA: 'Mediodía', NOCHE: 'Noche' };
const DEL_TURNO = { MEDIODIA: 'del mediodía', NOCHE: 'de la noche' };

const VACIO = {
  numeroZ: '',
  totalControlador: '',
  efectivoContado: '',
  cambioFijo: '',
  posnet: '',
  transferencias: '',
  comentario: '',
};

const OBLIGATORIOS = ['totalControlador', 'efectivoContado', 'cambioFijo'];

/** "2026-09-28" → "28/09" */
const diaMes = (fecha) => fecha.split('-').reverse().slice(0, 2).join('/');

/** Texto y color de la diferencia, en palabras de la caja. */
function Diferencia({ centavos }) {
  if (centavos === 0) {
    return (
      <div className="cuadre cuadre-ok" role="status">
        <strong>Cuadra</strong>
        <span>Diferencia {mostrarPesos(0)}</span>
      </div>
    );
  }
  const texto = centavos < 0 ? 'Faltan' : 'Sobran';
  return (
    <div className="cuadre cuadre-mal" role="status">
      <strong>
        {texto} {mostrarPesos(Math.abs(centavos))}
      </strong>
      <span>Se guarda igual y la dueña lo revisa. Si sabés por qué, dejalo en el comentario.</span>
    </div>
  );
}

/** Un cierre ya enviado, en una línea. */
function CierreCargado({ cierre }) {
  const centavos = Math.round(cierre.diferencia * 100);
  return (
    <li>
      <div className="row-between">
        <strong>{TURNOS[cierre.turno]}</strong>
        {centavos === 0 ? (
          <span className="badge badge-ok">CUADRA</span>
        ) : (
          <span className="badge badge-warn">
            {centavos < 0 ? 'FALTAN' : 'SOBRAN'} {mostrarPesos(Math.abs(centavos))}
          </span>
        )}
      </div>
      <p className="muted">
        Controlador {mostrarPesos(Math.round(cierre.total_controlador * 100))} · cargó{' '}
        {cierre.cargado_por_nombre}
      </p>
    </li>
  );
}

/** Campo de monto: teclado numérico en el celular y aviso si no se entiende. */
function CampoMonto({ id, label, valor, onChange, ayuda }) {
  const invalido = leerMonto(valor) === null;
  return (
    <div className="campo-monto">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={valor}
        onChange={onChange}
        aria-invalid={invalido}
        aria-describedby={ayuda || invalido ? `${id}-ayuda` : undefined}
      />
      {(invalido || ayuda) && (
        <p id={`${id}-ayuda`} className={invalido ? 'campo-error' : 'ayuda'}>
          {invalido ? 'No se entiende el monto. Ejemplo: 12.500,50' : ayuda}
        </p>
      )}
    </div>
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

  const cargarHoy = useCallback(async () => {
    if (!sucursalId) return;
    try {
      const query = sucursalFija ? '' : `?sucursal_id=${sucursalId}`;
      const r = await apiGet(`/cierres/hoy${query}`);
      setHoy(r);
      setTurno(r.turnos_pendientes[0] ?? '');
      setDatos({
        ...VACIO,
        cambioFijo: r.cambio_sugerido === null ? '' : String(r.cambio_sugerido).replace('.', ','),
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
  const cambiarGasto = (i, nombre) => (e) =>
    setGastos((prev) => prev.map((g, j) => (j === i ? { ...g, [nombre]: e.target.value } : g)));

  const centavos = Object.fromEntries(
    ['totalControlador', 'efectivoContado', 'cambioFijo', 'posnet', 'transferencias'].map((k) => [
      k,
      leerMonto(datos[k]),
    ])
  );
  const gastosCentavos = gastos.map((g) => leerMonto(g.monto));
  const completo =
    OBLIGATORIOS.every((k) => datos[k].trim() !== '') &&
    Object.values(centavos).every((c) => c !== null) &&
    gastosCentavos.every((c) => c !== null && c > 0) &&
    gastos.every((g) => g.detalle.trim() !== '');
  const cuadre = completo ? calcularCuadre({ ...centavos, gastos: gastosCentavos }) : null;

  const enviar = async (evt) => {
    evt.preventDefault();
    setError('');
    if (!completo) {
      setError(
        'Completá el total del controlador, el efectivo contado y el cambio que queda. Cada gasto necesita detalle y monto.'
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
        posnet: aPesos(centavos.posnet),
        transferencias: aPesos(centavos.transferencias),
        gastos: gastos.map((g, i) => ({
          detalle: g.detalle.trim(),
          monto: aPesos(gastosCentavos[i]),
        })),
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
                onChange={campo('totalControlador')}
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
                onChange={campo('efectivoContado')}
                ayuda="Toda la plata de la caja, cambio incluido."
              />
              <CampoMonto
                id="cierre-cambio"
                label="Cambio fijo que queda"
                valor={datos.cambioFijo}
                onChange={campo('cambioFijo')}
                ayuda={hoy.cambio_sugerido === null ? undefined : 'Sugerido: el del último cierre.'}
              />
              <CampoMonto
                id="cierre-posnet"
                label="Posnet (débito y crédito)"
                valor={datos.posnet}
                onChange={campo('posnet')}
              />
              <CampoMonto
                id="cierre-transferencias"
                label="QR y transferencias"
                valor={datos.transferencias}
                onChange={campo('transferencias')}
              />
            </div>

            <fieldset className="gastos">
              <legend>Gastos pagados con la caja</legend>
              {gastos.length === 0 && <p className="muted">Sin gastos.</p>}
              {gastos.map((g, i) => (
                <div key={i} className="gasto-row">
                  <input
                    aria-label={`Detalle del gasto ${i + 1}`}
                    placeholder="Ej: sodero"
                    value={g.detalle}
                    onChange={cambiarGasto(i, 'detalle')}
                  />
                  <input
                    aria-label={`Monto del gasto ${i + 1}`}
                    inputMode="decimal"
                    placeholder="0"
                    value={g.monto}
                    aria-invalid={leerMonto(g.monto) === null}
                    onChange={cambiarGasto(i, 'monto')}
                  />
                  <button
                    type="button"
                    aria-label={`Quitar gasto ${i + 1}`}
                    onClick={() => setGastos((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="link"
                onClick={() => setGastos((prev) => [...prev, { detalle: '', monto: '' }])}
              >
                + Agregar gasto
              </button>
            </fieldset>

            {cuadre && <Diferencia centavos={cuadre.diferencia} />}

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
