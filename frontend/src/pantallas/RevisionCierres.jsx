import { useCallback, useEffect, useState } from 'react';

import { apiGet, apiSend } from '../lib/api.js';
import {
  aCampo,
  centavosDe,
  diaMes,
  GASTO_VACIO,
  gastoCompleto,
  gastoParaApi,
  TURNOS,
  valorGasto,
} from '../lib/cierres.js';
import { aPesos, calcularCuadre, leerMonto, mostrarPesos } from '../lib/cuadre.js';
import { formatFecha } from '../lib/formato.js';
import { BadgeDiferencia, CampoMonto, Diferencia, FilaGasto } from './CamposCierre.jsx';
import { useCategorias } from '../lib/useCategorias.js';

const MONTOS = [
  ['total_controlador', 'Total del controlador (Z)'],
  ['efectivo_contado', 'Efectivo contado en la caja'],
  ['cambio_fijo', 'Cambio fijo que quedó'],
  ['debito', 'Débito'],
  ['credito', 'Crédito'],
  ['qr', 'QR'],
];

const NOMBRE_CAMPO = {
  fecha: 'Fecha',
  turno: 'Turno',
  numero_z: 'Número de Z',
  comentario: 'Comentario',
  gastos: 'Gastos',
  ...Object.fromEntries(MONTOS),
  // Campos de cierres viejos que pueden aparecer en el historial.
  posnet: 'Posnet',
  transferencias: 'Transferencias',
};

const ES_MONTO = new Set([...MONTOS.map(([k]) => k), 'posnet', 'transferencias']);

/** Valor del historial para mostrar: los montos como plata ("$ 205.350,00"). */
const valorHistorial = (campo, valor) => {
  if (valor === null) return '—';
  return ES_MONTO.has(campo) ? mostrarPesos(leerMonto(valor)) : valor;
};

const aFormulario = (cierre) => ({
  fecha: cierre.fecha,
  turno: cierre.turno,
  numero_z: cierre.numero_z === null ? '' : String(cierre.numero_z),
  comentario: cierre.comentario ?? '',
  ...Object.fromEntries(MONTOS.map(([k]) => [k, aCampo(cierre[k])])),
  // Ya no se cargan (no hay transferencias), pero un cierre viejo puede
  // tenerlas: cuentan en la diferencia y la API las conserva.
  transferencias: centavosDe(cierre.transferencias),
  gastos: cierre.gastos.map((g) => ({
    categoria_id: String(g.categoria_id),
    categoria: g.categoria,
    detalle: g.detalle,
    monto: aCampo(g.monto),
  })),
});

/** Sucursales que todavía no cargaron algún turno de hoy. */
function PendientesDeHoy({ pendientes }) {
  if (!pendientes) return null;
  const faltan = pendientes.sucursales.filter((s) => s.turnos_pendientes.length > 0);
  return (
    <div className="card">
      <h2>Hoy {diaMes(pendientes.fecha)}</h2>
      {faltan.length === 0 ? (
        <div className="alert alert-ok">Todas las sucursales cargaron los dos cierres.</div>
      ) : (
        <ul className="lista-cierres" aria-label="Cierres que faltan hoy">
          {faltan.map((s) => (
            <li key={s.id} className="row-between">
              <strong>{s.nombre}</strong>
              <span className="muted">
                falta {s.turnos_pendientes.map((t) => TURNOS[t].toLowerCase()).join(' y ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Detalle de un cierre: corrección, marcar revisado e historial. */
function DetalleCierre({ id, alVolver, alCambiar }) {
  const [cierre, setCierre] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const categorias = useCategorias(setError);

  const mostrar = (c) => {
    setCierre(c);
    setForm(aFormulario(c));
  };

  useEffect(() => {
    (async () => {
      try {
        mostrar(await apiGet(`/cierres/${id}`));
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [id]);

  const hacer = async (accion, mensaje) => {
    setError('');
    setOkMsg('');
    try {
      mostrar(await accion());
      setOkMsg(mensaje);
      alCambiar();
    } catch (e) {
      setError(e.message);
    }
  };

  const campo = (nombre) => (e) => setForm((prev) => ({ ...prev, [nombre]: e.target.value }));
  const monto = (nombre) => (valor) => setForm((prev) => ({ ...prev, [nombre]: valor }));
  const cambiarGasto = (i, nombre) => (e) =>
    setForm((prev) => ({
      ...prev,
      gastos: prev.gastos.map((g, j) => (j === i ? { ...g, [nombre]: valorGasto(nombre, e) } : g)),
    }));

  if (!form) {
    return (
      <div className="card">
        {error ? <div className="alert alert-error">{error}</div> : <p>Cargando cierre…</p>}
      </div>
    );
  }

  const centavos = Object.fromEntries(MONTOS.map(([k]) => [k, leerMonto(form[k])]));
  const gastosCentavos = form.gastos.map((g) => leerMonto(g.monto));
  const valido =
    MONTOS.every(([k]) => form[k].trim() !== '' && centavos[k] !== null) &&
    form.gastos.every((g, i) => gastoCompleto(g, gastosCentavos[i]));
  const cuadre = valido
    ? calcularCuadre({
        totalControlador: centavos.total_controlador,
        efectivoContado: centavos.efectivo_contado,
        cambioFijo: centavos.cambio_fijo,
        debito: centavos.debito,
        credito: centavos.credito,
        qr: centavos.qr,
        transferencias: form.transferencias,
        gastos: gastosCentavos,
      })
    : null;

  const guardar = (evt) => {
    evt.preventDefault();
    if (!valido) {
      setError(
        'Revisá los montos: todos tienen que ser números y cada gasto necesita categoría, detalle y monto.'
      );
      return;
    }
    hacer(
      () =>
        apiSend('PUT', `/cierres/${id}`, {
          fecha: form.fecha,
          turno: form.turno,
          numero_z: form.numero_z.trim() || null,
          comentario: form.comentario,
          ...Object.fromEntries(MONTOS.map(([k]) => [k, aPesos(centavos[k])])),
          gastos: form.gastos.map((g, i) => gastoParaApi(g, gastosCentavos[i])),
        }),
      'Corrección guardada.'
    );
  };

  const revisar = (revisado) =>
    hacer(
      () => apiSend('PUT', `/cierres/${id}/revisado`, { revisado }),
      revisado ? 'Marcado como revisado.' : 'Vuelve a estar a revisar.'
    );

  return (
    <div className="card cierre-caja">
      <button type="button" className="link" onClick={alVolver}>
        ← Volver a la lista
      </button>
      <h2>
        {cierre.sucursal_nombre} · {diaMes(cierre.fecha)} · {TURNOS[cierre.turno]}
      </h2>
      <p className="subtitle">
        Cargó {cierre.cargado_por_nombre}
        {cierre.revisado_en &&
          ` · revisado por ${cierre.revisado_por_nombre} el ${formatFecha(cierre.revisado_en)}`}
      </p>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {okMsg && <div className="alert alert-ok">{okMsg}</div>}

      {centavosDe(cierre.diferencia) !== 0 &&
        (cierre.revisado_en ? (
          <button type="button" className="link" onClick={() => revisar(false)}>
            Volver a dejar a revisar
          </button>
        ) : (
          <button
            type="button"
            className="primary boton-enviar boton-revisado"
            onClick={() => revisar(true)}
          >
            Marcar revisado
          </button>
        ))}

      <form onSubmit={guardar} aria-label="Corregir cierre" noValidate>
        <div className="montos">
          <div className="campo-monto">
            <label htmlFor="corr-fecha">Fecha</label>
            <input id="corr-fecha" type="date" value={form.fecha} onChange={campo('fecha')} />
          </div>
          <div className="campo-monto">
            <label htmlFor="corr-turno">Turno</label>
            <select id="corr-turno" value={form.turno} onChange={campo('turno')}>
              {Object.entries(TURNOS).map(([t, nombre]) => (
                <option key={t} value={t}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
          {MONTOS.map(([k, label]) => (
            <CampoMonto
              key={k}
              id={`corr-${k}`}
              label={label}
              valor={form[k]}
              onChange={monto(k)}
            />
          ))}
          <div className="campo-monto">
            <label htmlFor="corr-numero-z">Número de Z</label>
            <input
              id="corr-numero-z"
              inputMode="numeric"
              value={form.numero_z}
              onChange={campo('numero_z')}
            />
          </div>
        </div>

        <fieldset className="gastos">
          <legend>Gastos pagados con la caja</legend>
          {form.gastos.length === 0 && <p className="muted">Sin gastos.</p>}
          {form.gastos.map((g, i) => (
            <FilaGasto
              key={i}
              numero={i + 1}
              gasto={g}
              categorias={categorias}
              onCambiar={(nombre) => cambiarGasto(i, nombre)}
              onQuitar={() =>
                setForm((prev) => ({ ...prev, gastos: prev.gastos.filter((_, j) => j !== i) }))
              }
            />
          ))}
          <button
            type="button"
            className="link"
            onClick={() =>
              setForm((prev) => ({ ...prev, gastos: [...prev.gastos, { ...GASTO_VACIO }] }))
            }
          >
            + Agregar gasto
          </button>
        </fieldset>

        {cuadre && <Diferencia centavos={cuadre.diferencia} />}

        <label htmlFor="corr-comentario">Comentario</label>
        <textarea
          id="corr-comentario"
          rows={2}
          maxLength={500}
          value={form.comentario}
          onChange={campo('comentario')}
        />

        <button type="submit" className="primary boton-enviar">
          Guardar corrección
        </button>
      </form>

      <h3>Historial de correcciones</h3>
      {cierre.correcciones.length === 0 ? (
        <p className="muted">Sin correcciones.</p>
      ) : (
        <ul className="lista-cierres" aria-label="Historial de correcciones">
          {cierre.correcciones.map((k) => (
            <li key={k.id}>
              <strong>{NOMBRE_CAMPO[k.campo] ?? k.campo}</strong>:{' '}
              {valorHistorial(k.campo, k.valor_anterior)} → {valorHistorial(k.campo, k.valor_nuevo)}
              <p className="muted">
                {k.usuario_nombre} · {formatFecha(k.creado_en)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Pantalla de la dueña (#10): qué sucursales no cerraron hoy, la lista de
 * cierres filtrable y el detalle para corregir o marcar revisado.
 */
export default function RevisionCierres({ sucursales }) {
  const conCaja = sucursales.filter((s) => s.tipo !== 'DEPOSITO');
  const [filtros, setFiltros] = useState({
    sucursal_id: '',
    desde: '',
    hasta: '',
    a_revisar: false,
  });
  const [cierres, setCierres] = useState([]);
  const [pendientes, setPendientes] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    const query = new URLSearchParams(
      Object.entries(filtros).filter(([, v]) => v !== '' && v !== false)
    ).toString();
    try {
      const [lista, hoy] = await Promise.all([
        apiGet(`/cierres${query ? `?${query}` : ''}`),
        apiGet('/cierres/pendientes'),
      ]);
      setCierres(lista);
      setPendientes(hoy);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtro = (nombre) => (e) =>
    setFiltros((prev) => ({
      ...prev,
      [nombre]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  if (abierto) {
    return <DetalleCierre id={abierto} alVolver={() => setAbierto(null)} alCambiar={cargar} />;
  }

  return (
    <div className="grid-2">
      <PendientesDeHoy pendientes={pendientes} />

      <div className="card">
        <h2>Cierres</h2>
        <form className="filtros" aria-label="Filtros" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="filtro-sucursal">Sucursal</label>
          <select id="filtro-sucursal" value={filtros.sucursal_id} onChange={filtro('sucursal_id')}>
            <option value="">Todas</option>
            {conCaja.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
          <div className="montos">
            <div>
              <label htmlFor="filtro-desde">Desde</label>
              <input
                id="filtro-desde"
                type="date"
                value={filtros.desde}
                onChange={filtro('desde')}
              />
            </div>
            <div>
              <label htmlFor="filtro-hasta">Hasta</label>
              <input
                id="filtro-hasta"
                type="date"
                value={filtros.hasta}
                onChange={filtro('hasta')}
              />
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={filtros.a_revisar} onChange={filtro('a_revisar')} />
            Sólo los que hay que revisar
          </label>
        </form>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        {cargando ? (
          <div className="empty">Cargando cierres…</div>
        ) : cierres.length === 0 ? (
          <div className="empty">No hay cierres con estos filtros.</div>
        ) : (
          <ul className="lista-cierres" aria-label="Cierres">
            {cierres.map((c) => (
              <li key={c.id}>
                <div className="row-between">
                  <button type="button" className="link" onClick={() => setAbierto(c.id)}>
                    {diaMes(c.fecha)} · {c.sucursal_nombre} · {TURNOS[c.turno]}
                  </button>
                  <BadgeDiferencia diferencia={c.diferencia} />
                </div>
                {c.a_revisar && <span className="badge badge-danger">A REVISAR</span>}
                {c.comentario && <p className="muted">“{c.comentario}”</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
