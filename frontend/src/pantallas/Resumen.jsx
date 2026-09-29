import { useEffect, useState } from 'react';

import { apiGet } from '../lib/api.js';
import { nombreMes } from '../lib/cajaCentral.js';
import { centavosDe, diaMes } from '../lib/cierres.js';
import { mostrarPesos } from '../lib/cuadre.js';
import {
  MEDIOS,
  anchoBarra,
  describirPendientes,
  dia,
  leerVariacion,
  soloMes,
} from '../lib/dashboard.js';

const pesos = (monto) => mostrarPesos(centavosDe(monto));

/** Carga una ruta de la API y la vuelve a cargar cuando cambia. */
function useApi(ruta) {
  const [estado, setEstado] = useState({ datos: null, error: '' });
  useEffect(() => {
    let vigente = true;
    setEstado({ datos: null, error: '' });
    apiGet(ruta)
      .then((datos) => vigente && setEstado({ datos, error: '' }))
      .catch((e) => vigente && setEstado({ datos: null, error: e.message }));
    return () => {
      vigente = false;
    };
  }, [ruta]);
  return estado;
}

/** Barra horizontal con su etiqueta y monto. */
function Barra({ etiqueta, monto, maximo, nota }) {
  return (
    <li className="barra">
      <div className="row-between">
        <span>
          {etiqueta}
          {nota && <span className="badge badge-warn">{nota}</span>}
        </span>
        <strong>{pesos(monto)}</strong>
      </div>
      <div className="barra-fondo" aria-hidden="true">
        <div className="barra-relleno" style={{ width: `${anchoBarra(monto, maximo)}%` }} />
      </div>
    </li>
  );
}

/** Lo vendido hoy (o el día elegido), por sucursal y medio de pago. */
function Dia({ fecha, setFecha, hoy }) {
  const { datos, error } = useApi(`/dashboard/dia?fecha=${fecha}`);
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!datos) return <p className="cargando">Cargando…</p>;

  const maximo = Math.max(...datos.sucursales.map((s) => s.vendido));
  const pendientes = datos.sucursales.filter((s) => s.turnos_pendientes.length > 0);
  return (
    <section className="card resumen-dia" aria-labelledby="titulo-dia">
      <div className="row-between">
        <h2 id="titulo-dia">
          {datos.es_hoy ? 'Hoy' : 'El'} {diaMes(datos.fecha)}
        </h2>
        <input
          type="date"
          aria-label="Ver otro día"
          value={fecha}
          max={hoy}
          onChange={(e) => e.target.value && setFecha(e.target.value)}
        />
      </div>
      <p className="muted">Vendido en la red</p>
      <p className="numero-grande" aria-label="Vendido en el día">
        {pesos(datos.total.vendido)}
      </p>

      <dl className="medios">
        {MEDIOS.map(([clave, etiqueta]) => (
          <div key={clave}>
            <dt>{etiqueta}</dt>
            <dd>{pesos(datos.total[clave])}</dd>
          </div>
        ))}
      </dl>

      {pendientes.length > 0 && (
        <div className="alert alert-warn" role="status">
          <strong>
            {datos.turnos_pendientes === 1
              ? 'Falta 1 cierre'
              : `Faltan ${datos.turnos_pendientes} cierres`}
          </strong>
          {datos.es_hoy && ' (el de la noche se carga a las 21)'}
          <ul>
            {pendientes.map((s) => (
              <li key={s.sucursal_id}>{describirPendientes(s)}</li>
            ))}
          </ul>
        </div>
      )}

      <h3>Por sucursal</h3>
      <ul className="barras" aria-label="Vendido por sucursal">
        {datos.sucursales.map((s) => (
          <Barra
            key={s.sucursal_id}
            etiqueta={s.sucursal}
            monto={s.vendido}
            maximo={maximo}
            nota={s.turnos_cargados.length === 0 ? 'sin cierres' : null}
          />
        ))}
      </ul>
    </section>
  );
}

/** Un número del mes con su comparación contra el anterior. */
function Indicador({ titulo, monto, variacion, bueno, mesAnterior }) {
  const v = leerVariacion(variacion, bueno);
  return (
    <div className="indicador">
      <span className="muted">{titulo}</span>
      <strong aria-label={titulo}>{pesos(monto)}</strong>
      <span className={`variacion variacion-${v.tono}`}>
        {v.texto}
        {v.tono !== 'sin-datos' && <span className="muted"> vs. {mesAnterior}</span>}
      </span>
    </div>
  );
}

/** El mes: acumulado, resultado y comparación con los mismos días del anterior. */
function Mes({ mes, setMes, mesActual }) {
  const { datos, error } = useApi(`/dashboard/mes?mes=${mes}`);
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!datos) return <p className="cargando">Cargando…</p>;

  const anterior = soloMes(datos.anterior.mes);
  const maxSucursal = Math.max(...datos.ventas_por_sucursal.map((s) => s.vendido));
  const maxDia = Math.max(...datos.ventas_por_dia.map((d) => d.vendido));
  return (
    <section className="card resumen-mes" aria-labelledby="titulo-mes">
      <div className="row-between">
        <h2 id="titulo-mes">{nombreMes(datos.mes)}</h2>
        <input
          type="month"
          aria-label="Ver otro mes"
          value={mes}
          max={mesActual}
          onChange={(e) => e.target.value && setMes(e.target.value)}
        />
      </div>
      <p className="subtitle">
        {datos.en_curso
          ? `Del 1 al ${dia(datos.hasta)}, comparado con los mismos días de ${anterior}.`
          : `Mes completo, comparado con ${anterior} completo.`}
      </p>

      <div className="indicadores">
        <Indicador
          titulo="Ventas"
          monto={datos.ventas}
          variacion={datos.variacion.ventas}
          bueno="sube"
          mesAnterior={anterior}
        />
        <Indicador
          titulo="Gastos"
          monto={datos.gastos.total}
          variacion={datos.variacion.gastos}
          bueno="baja"
          mesAnterior={anterior}
        />
        <Indicador
          titulo="Retiros de los dueños"
          monto={datos.retiros_duenos}
          variacion={datos.variacion.retiros_duenos}
          bueno="baja"
          mesAnterior={anterior}
        />
        <Indicador
          titulo="Resultado"
          monto={datos.resultado}
          variacion={datos.variacion.resultado}
          bueno="sube"
          mesAnterior={anterior}
        />
      </div>
      <p className="muted nota">
        Resultado = ventas − gastos − retiros. Los depósitos al banco no cuentan: la plata sigue
        siendo del negocio.
      </p>

      <h3>Ventas por sucursal</h3>
      <ul className="barras" aria-label="Ventas del mes por sucursal">
        {datos.ventas_por_sucursal.map((s) => (
          <Barra
            key={s.sucursal_id}
            etiqueta={s.sucursal}
            monto={s.vendido}
            maximo={maxSucursal}
            nota={s.turnos_sin_cargar > 0 ? `${s.turnos_sin_cargar} sin cierre` : null}
          />
        ))}
      </ul>

      <h3>Ventas por día</h3>
      <div className="grafico-dias" role="img" aria-label="Ventas de cada día del mes">
        {datos.ventas_por_dia.map((d) => (
          <div
            key={d.fecha}
            className="columna-dia"
            title={`${diaMes(d.fecha)}: ${pesos(d.vendido)}`}
          >
            <div
              className="columna-relleno"
              style={{ height: `${anchoBarra(d.vendido, maxDia)}%` }}
            />
            <span>{Number(dia(d.fecha)) % 5 === 1 ? dia(d.fecha) : ''}</span>
          </div>
        ))}
      </div>

      <h3>Gastos</h3>
      <ul className="lista-cierres" aria-label="Gastos del mes">
        <li className="row-between">
          <span>En las sucursales (cierres)</span>
          <span>{pesos(datos.gastos.sucursales)}</span>
        </li>
        <li className="row-between">
          <span>Pagos de la caja central</span>
          <span>{pesos(datos.gastos.caja_central)}</span>
        </li>
        <li className="row-between">
          <span>Obra</span>
          <span>{pesos(datos.gastos.obra)}</span>
        </li>
      </ul>

      {datos.retiros_por_dueno.length > 0 && (
        <>
          <h3>Retiros de los dueños</h3>
          <ul className="lista-cierres" aria-label="Retiros de los dueños">
            {datos.retiros_por_dueno.map((r) => (
              <li key={r.dueno_id} className="row-between">
                <span>{r.dueno}</span>
                <span>{pesos(r.total)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Hoy en Argentina, AAAA-MM-DD (como lo calcula el backend). */
const hoyEnArgentina = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

/** Pestaña "Resumen": lo primero que ven los dueños. */
export default function Resumen() {
  const hoy = hoyEnArgentina();
  const [fecha, setFecha] = useState(hoy);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  return (
    <div className="resumen">
      <Dia fecha={fecha} setFecha={setFecha} hoy={hoy} />
      <Mes mes={mes} setMes={setMes} mesActual={hoy.slice(0, 7)} />
    </div>
  );
}
