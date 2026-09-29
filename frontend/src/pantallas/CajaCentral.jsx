import { useEffect, useState } from 'react';

import { apiDescargar, apiGet, apiSend } from '../lib/api.js';
import {
  CUENTAS,
  describir,
  movimientoDe,
  nombreMes,
  rangoDelMes,
  TIPOS,
} from '../lib/cajaCentral.js';
import { centavosDe, diaMes } from '../lib/cierres.js';
import { aPesos, leerMonto, mostrarPesos } from '../lib/cuadre.js';
import { useCategorias } from '../lib/useCategorias.js';
import { CampoMonto } from './CamposCierre.jsx';

/** Monto con su signo y color: verde si entra, rojo si sale. */
function Monto({ centavos }) {
  if (centavos === 0) return null;
  return (
    <span className={centavos > 0 ? 'monto-entra' : 'monto-sale'}>
      {centavos > 0 ? '+' : '−'} {mostrarPesos(Math.abs(centavos))}
    </span>
  );
}

/** Saldo de cada cuenta y lo que entró hoy de cada sucursal. */
function SaldosDeHoy({ resumen }) {
  return (
    <div className="card">
      <h2>Hoy {diaMes(resumen.fecha)}</h2>
      <div className="saldos">
        <div>
          <span className="muted">{CUENTAS.CAJA}</span>
          <strong aria-label="Saldo de la caja central">
            {mostrarPesos(centavosDe(resumen.saldo_caja))}
          </strong>
        </div>
        <div>
          <span className="muted">{CUENTAS.BANCO}</span>
          <strong aria-label="Saldo del banco">
            {mostrarPesos(centavosDe(resumen.saldo_banco))}
          </strong>
        </div>
      </div>
      {!resumen.saldo_inicial.caja && (
        <p className="alert alert-info">
          Todavía no cargaste con cuánto arranca la caja central. Cargalo abajo como “Saldo
          inicial”.
        </p>
      )}

      <h3>Entró de las sucursales</h3>
      {resumen.entradas.length === 0 ? (
        <p className="muted">Todavía no entró nada hoy.</p>
      ) : (
        <ul className="lista-cierres" aria-label="Entradas de hoy">
          {resumen.entradas.map((e) => (
            <li key={e.cierre_id} className="row-between">
              <span>{describir(e)}</span>
              <Monto centavos={centavosDe(e.monto)} />
            </li>
          ))}
          <li className="row-between">
            <strong>Total</strong>
            <strong>{mostrarPesos(centavosDe(resumen.total_entradas))}</strong>
          </li>
        </ul>
      )}
    </div>
  );
}

const FORMULARIO_VACIO = {
  cuenta: 'CAJA',
  monto: '',
  sentido: 'FALTA',
  categoria_id: '',
  dueno_id: '',
  concepto: '',
  fecha: '',
};

/** Formulario para anotar lo que sale (o un saldo inicial o un ajuste). */
function CargarMovimiento({ hoy, saldoInicial, categorias, duenos, alGuardar }) {
  const faltaInicial = !saldoInicial.caja || !saldoInicial.banco;
  const tipos = TIPOS.filter(([t]) => t !== 'SALDO_INICIAL' || faltaInicial);
  const [tipo, setTipo] = useState(saldoInicial.caja ? 'DEPOSITO' : 'SALDO_INICIAL');
  const [form, setForm] = useState(FORMULARIO_VACIO);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  const campo = (nombre) => (e) => setForm((prev) => ({ ...prev, [nombre]: e.target.value }));
  const centavos = leerMonto(form.monto);
  const pideConcepto = tipo === 'PAGO' || tipo === 'AJUSTE';

  const faltante = () => {
    if (!centavos) return 'Escribí el monto.';
    if (tipo === 'PAGO' && !form.categoria_id) return 'Elegí la categoría del pago.';
    if (tipo === 'RETIRO_DUENO' && !form.dueno_id) return 'Elegí quién se lleva la plata.';
    if (pideConcepto && !form.concepto.trim()) {
      return tipo === 'PAGO' ? 'Escribí en qué se pagó.' : 'Escribí el motivo del ajuste.';
    }
    return null;
  };

  const guardar = async (evt) => {
    evt.preventDefault();
    setOkMsg('');
    const problema = faltante();
    if (problema) {
      setError(problema);
      return;
    }
    setError('');
    setEnviando(true);
    try {
      const firmado = tipo === 'AJUSTE' && form.sentido === 'FALTA' ? -centavos : centavos;
      await apiSend('POST', '/caja-central/movimientos', {
        tipo,
        ...(tipo === 'DEPOSITO' ? {} : { cuenta: form.cuenta }),
        fecha: form.fecha || hoy,
        monto: aPesos(firmado),
        ...(tipo === 'PAGO' ? { categoria_id: Number(form.categoria_id) } : {}),
        ...(tipo === 'RETIRO_DUENO' ? { dueno_id: Number(form.dueno_id) } : {}),
        concepto: form.concepto.trim() || null,
      });
      setOkMsg(`${tipos.find(([t]) => t === tipo)[1]} guardado.`);
      setForm(FORMULARIO_VACIO);
      if (tipo === 'SALDO_INICIAL') setTipo('DEPOSITO');
      alGuardar();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="card cierre-caja">
      <h2>Cargar un movimiento</h2>
      <p className="subtitle">Lo que entra de las sucursales se suma solo con cada cierre.</p>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {okMsg && <div className="alert alert-ok">{okMsg}</div>}

      <form onSubmit={guardar} aria-label="Cargar movimiento" noValidate>
        <label htmlFor="mov-tipo">Qué pasó</label>
        <select
          id="mov-tipo"
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value);
            setError('');
          }}
        >
          {tipos.map(([t, nombre]) => (
            <option key={t} value={t}>
              {nombre}
            </option>
          ))}
        </select>

        {tipo === 'DEPOSITO' ? (
          <p className="ayuda">Sale de la caja central y entra al Banco Patagonia.</p>
        ) : (
          <>
            <label htmlFor="mov-cuenta">
              {tipo === 'SALDO_INICIAL' || tipo === 'AJUSTE' ? 'Cuenta' : 'Sale de'}
            </label>
            <select id="mov-cuenta" value={form.cuenta} onChange={campo('cuenta')}>
              {Object.entries(CUENTAS).map(([c, nombre]) => (
                <option key={c} value={c}>
                  {nombre}
                </option>
              ))}
            </select>
          </>
        )}

        {tipo === 'PAGO' && (
          <>
            <label htmlFor="mov-categoria">Categoría</label>
            <select id="mov-categoria" value={form.categoria_id} onChange={campo('categoria_id')}>
              <option value="">Elegí…</option>
              {categorias.map((k) => (
                <option key={k.id} value={String(k.id)}>
                  {k.nombre}
                </option>
              ))}
            </select>
          </>
        )}

        {tipo === 'RETIRO_DUENO' && (
          <>
            <label htmlFor="mov-dueno">Quién se la lleva</label>
            <select id="mov-dueno" value={form.dueno_id} onChange={campo('dueno_id')}>
              <option value="">Elegí…</option>
              {duenos.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </>
        )}

        {tipo === 'AJUSTE' && (
          <>
            <label htmlFor="mov-sentido">En el arqueo</label>
            <select id="mov-sentido" value={form.sentido} onChange={campo('sentido')}>
              <option value="FALTA">Faltaba plata</option>
              <option value="SOBRA">Sobraba plata</option>
            </select>
          </>
        )}

        <div className="montos">
          <CampoMonto
            id="mov-monto"
            label="Monto"
            valor={form.monto}
            onChange={(valor) => setForm((prev) => ({ ...prev, monto: valor }))}
          />
          <div className="campo-monto">
            <label htmlFor="mov-fecha">Fecha</label>
            <input
              id="mov-fecha"
              type="date"
              max={hoy}
              value={form.fecha || hoy}
              onChange={campo('fecha')}
            />
          </div>
        </div>

        <label htmlFor="mov-concepto">
          {tipo === 'AJUSTE' ? 'Motivo' : pideConcepto ? 'Concepto' : 'Concepto (opcional)'}
        </label>
        <input
          id="mov-concepto"
          maxLength={200}
          placeholder={tipo === 'PAGO' ? 'Ej: Molino, harina' : ''}
          value={form.concepto}
          onChange={campo('concepto')}
        />

        <button type="submit" className="primary boton-enviar" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar movimiento'}
        </button>
      </form>
    </div>
  );
}

/** Lista del mes, la más nueva arriba, con filtros y la opción de anular. */
function MovimientosDelMes({ mes, hoy, setMes, categorias, duenos, version, alCambiar }) {
  const [filtros, setFiltros] = useState({ categoria_id: '', dueno_id: '' });
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [porAnular, setPorAnular] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams({
      ...rangoDelMes(mes),
      ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== '')),
    });
    let vigente = true;
    apiGet(`/caja-central/movimientos?${params}`)
      .then((r) => {
        if (!vigente) return;
        setLista([...r.movimientos].reverse());
        setError('');
      })
      .catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [mes, filtros, version]);

  const anular = async (id) => {
    try {
      await apiSend('DELETE', `/caja-central/movimientos/${id}`);
      setPorAnular(null);
      alCambiar();
    } catch (e) {
      setError(e.message);
    }
  };

  const filtro = (nombre) => (e) => setFiltros((prev) => ({ ...prev, [nombre]: e.target.value }));

  return (
    <div className="card">
      <h2>Movimientos</h2>
      <form
        className="filtros"
        aria-label="Filtros de movimientos"
        onSubmit={(e) => e.preventDefault()}
      >
        <label htmlFor="mov-mes">Mes</label>
        <input
          id="mov-mes"
          type="month"
          value={mes}
          max={hoy.slice(0, 7)}
          onChange={(e) => e.target.value && setMes(e.target.value)}
        />
        <div className="montos">
          <div>
            <label htmlFor="filtro-categoria">Categoría</label>
            <select
              id="filtro-categoria"
              value={filtros.categoria_id}
              onChange={filtro('categoria_id')}
            >
              <option value="">Todas</option>
              {categorias.map((k) => (
                <option key={k.id} value={String(k.id)}>
                  {k.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filtro-dueno">Dueño</label>
            <select id="filtro-dueno" value={filtros.dueno_id} onChange={filtro('dueno_id')}>
              <option value="">Todos</option>
              {duenos.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {lista === null ? (
        <div className="empty">Cargando movimientos…</div>
      ) : lista.length === 0 ? (
        <div className="empty">No hay movimientos en {nombreMes(mes)}.</div>
      ) : (
        <ul className="lista-cierres" aria-label="Movimientos del mes">
          {lista.map((m) => {
            const { centavos, cuenta } = movimientoDe(m);
            const clave = m.id ?? `cierre-${m.cierre_id}`;
            return (
              <li key={clave}>
                <div className="row-between">
                  <strong>{describir(m)}</strong>
                  {m.tipo === 'DEPOSITO' ? (
                    <span>{mostrarPesos(centavosDe(m.monto))}</span>
                  ) : (
                    <Monto centavos={centavos} />
                  )}
                </div>
                <p className="muted">
                  {diaMes(m.fecha)} · {cuenta} · caja {mostrarPesos(centavosDe(m.saldo_caja))}
                </p>
                {m.id !== null &&
                  (porAnular === m.id ? (
                    <p className="confirmar">
                      ¿Anular este movimiento?{' '}
                      <button type="button" className="link" onClick={() => anular(m.id)}>
                        Sí, anular
                      </button>{' '}
                      <button type="button" className="link" onClick={() => setPorAnular(null)}>
                        No
                      </button>
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="link"
                      aria-label={`Anular ${describir(m)}`}
                      onClick={() => setPorAnular(m.id)}
                    >
                      Anular
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Totales del mes: como la hoja del mes y el "Resumen SOCIOS" de la planilla. */
function ResumenDelMes({ mes, version }) {
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    apiGet(`/caja-central/mensual?mes=${mes}`)
      .then((r) => vigente && setResumen(r))
      .catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [mes, version]);

  const descargar = async () => {
    try {
      await apiDescargar(`/caja-central/excel?mes=${mes}`, `caja-central-${mes}.xlsx`);
    } catch (e) {
      setError(e.message);
    }
  };

  if (!resumen) {
    return error ? (
      <div className="card">
        <div className="alert alert-error">{error}</div>
      </div>
    ) : null;
  }
  const pesos = (monto) => mostrarPesos(centavosDe(monto));

  return (
    <div className="card">
      <h2>Resumen de {nombreMes(mes)}</h2>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <button type="button" className="boton-excel" onClick={descargar}>
        Descargar Excel del mes
      </button>

      <h3>Entró de las sucursales</h3>
      <ul className="lista-cierres" aria-label="Entradas del mes por sucursal">
        {resumen.entradas_por_sucursal.map((s) => (
          <li key={s.sucursal_id} className="row-between">
            <span>{s.sucursal}</span>
            <span>{pesos(s.total)}</span>
          </li>
        ))}
        <li className="row-between">
          <strong>Total</strong>
          <strong>{pesos(resumen.total_entradas)}</strong>
        </li>
      </ul>

      <h3>Retiros de los dueños</h3>
      <ul className="lista-cierres" aria-label="Retiros del mes por dueño">
        {resumen.retiros_por_dueno.map((d) => (
          <li key={d.dueno_id} className="row-between">
            <span>{d.dueno}</span>
            <span>{pesos(d.total)}</span>
          </li>
        ))}
      </ul>

      <p className="row-between">
        <span>Depositado en el banco</span>
        <strong>{pesos(resumen.depositos)}</strong>
      </p>

      <h3>Gastos por categoría</h3>
      {resumen.gastos_por_categoria.length === 0 ? (
        <p className="muted">Sin gastos este mes.</p>
      ) : (
        <div className="tabla-scroll">
          <table aria-label="Gastos del mes por categoría">
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Sucursales</th>
                <th>Caja central</th>
              </tr>
            </thead>
            <tbody>
              {resumen.gastos_por_categoria.map((k) => (
                <tr key={k.categoria_id}>
                  <td>{k.categoria}</td>
                  <td>{pesos(k.en_sucursales)}</td>
                  <td>{pesos(k.en_caja_central)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Pantalla de los dueños (Sprint 5): reemplaza la planilla "Retiros".
 * Saldo de hoy, lo que entró de cada sucursal, la carga de salidas y la
 * lista y el resumen del mes.
 */
export default function CajaCentral() {
  const [resumen, setResumen] = useState(null);
  const [duenos, setDuenos] = useState([]);
  const [mes, setMes] = useState('');
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const categorias = useCategorias(setError);

  useEffect(() => {
    apiGet('/caja-central/duenos')
      .then(setDuenos)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    apiGet('/caja-central/resumen')
      .then((r) => {
        setResumen(r);
        setMes((actual) => actual || r.fecha.slice(0, 7));
      })
      .catch((e) => setError(e.message));
  }, [version]);

  const recargar = () => setVersion((v) => v + 1);

  if (!resumen) {
    return (
      <div className="card">
        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : (
          <p>Cargando caja central…</p>
        )}
      </div>
    );
  }

  return (
    <div className="grid-2 caja-central">
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <SaldosDeHoy resumen={resumen} />
      <CargarMovimiento
        hoy={resumen.fecha}
        saldoInicial={resumen.saldo_inicial}
        categorias={categorias}
        duenos={duenos}
        alGuardar={recargar}
      />
      <MovimientosDelMes
        mes={mes}
        hoy={resumen.fecha}
        setMes={setMes}
        categorias={categorias}
        duenos={duenos}
        version={version}
        alCambiar={recargar}
      />
      <ResumenDelMes mes={mes} version={version} />
    </div>
  );
}
