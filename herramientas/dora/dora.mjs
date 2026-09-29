/**
 * Métricas DORA (Sprint 8, #18): las cuatro que usa la industria para medir
 * qué tan seguido y qué tan bien llega código a producción.
 *
 *  - Frecuencia de despliegue: cuántas veces por semana sale algo.
 *  - Lead time: desde el primer commit de un cambio hasta que está en producción.
 *  - Tasa de fallas: qué parte de los despliegues rompió algo.
 *  - Tiempo de recuperación: cuánto tarda main en volver a verde.
 *
 * Funciones puras: reciben los datos ya leídos de GitHub (ver reporte.mjs) y
 * se prueban con `node --test herramientas/dora`.
 */

const HORA = 60 * 60 * 1000;

/** @param {number[]} valores */
export const mediana = (valores) => {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
};

const horasEntre = (desde, hasta) => (new Date(hasta) - new Date(desde)) / HORA;

/**
 * Nivel según los cortes del informe State of DevOps (DORA).
 * @param {'frecuencia'|'leadTime'|'tasaFallas'|'recuperacion'} metrica
 * @param {number | null} valor frecuencia por semana, horas, o fracción (0 a 1)
 */
export const nivel = (metrica, valor) => {
  if (valor === null || Number.isNaN(valor)) return 'Sin datos';
  const cortes = {
    // Más es mejor: al menos N despliegues por semana.
    frecuencia: [
      [7, 'Elite'],
      [1, 'Alto'],
      [0.25, 'Medio'],
    ],
    // Menos es mejor: hasta N horas.
    leadTime: [
      [24, 'Elite'],
      [24 * 7, 'Alto'],
      [24 * 30, 'Medio'],
    ],
    tasaFallas: [
      [0.05, 'Elite'],
      [0.1, 'Alto'],
      [0.15, 'Medio'],
    ],
    recuperacion: [
      [1, 'Elite'],
      [24, 'Alto'],
      [24 * 7, 'Medio'],
    ],
  }[metrica];
  const masEsMejor = metrica === 'frecuencia';
  for (const [corte, nombre] of cortes) {
    if (masEsMejor ? valor >= corte : valor <= corte) return nombre;
  }
  return 'Bajo';
};

/**
 * @param {{
 *   dias: number,
 *   fuente: 'produccion' | 'merges',
 *   despliegues: { sha: string, en: string }[],
 *   cambios: { primerCommit: string, mergeado: string }[],
 *   ciMain: { sha: string, en: string, ok: boolean }[],
 *   vueltasAtras: { en: string }[],
 * }} datos
 */
export const calcular = ({ dias, fuente, despliegues, cambios, ciMain, vueltasAtras }) => {
  const orden = (lista) => [...lista].sort((a, b) => new Date(a.en) - new Date(b.en));
  const deps = orden(despliegues);
  const ci = orden(ciMain);

  // Lead time: hasta el primer despliegue posterior al merge. Si se cuentan
  // los merges como despliegues, termina en el merge.
  const leadTimes = cambios
    .map(({ primerCommit, mergeado }) => {
      const llegada =
        fuente === 'merges' ? mergeado : deps.find((d) => new Date(d.en) >= new Date(mergeado))?.en;
      return llegada ? horasEntre(primerCommit, llegada) : null;
    })
    .filter((h) => h !== null && h >= 0);

  // Falla: el CI de main de ese commit dio rojo, o alguien volvió atrás antes
  // del despliegue siguiente.
  const fallidos = deps.filter((d, i) => {
    const ciRojo = ci.some((c) => c.sha === d.sha && !c.ok);
    const hasta = deps[i + 1]?.en ?? '9999-12-31';
    const volvio = vueltasAtras.some(
      (v) => new Date(v.en) >= new Date(d.en) && new Date(v.en) < new Date(hasta)
    );
    return ciRojo || volvio;
  });

  // Recuperación: desde que main se pone rojo hasta la siguiente corrida verde.
  const recuperaciones = [];
  let rojoDesde = null;
  for (const corrida of ci) {
    if (!corrida.ok && rojoDesde === null) rojoDesde = corrida.en;
    if (corrida.ok && rojoDesde !== null) {
      recuperaciones.push(horasEntre(rojoDesde, corrida.en));
      rojoDesde = null;
    }
  }

  const frecuencia = deps.length / (dias / 7);
  const leadTime = mediana(leadTimes);
  const tasaFallas = deps.length ? fallidos.length / deps.length : null;
  const recuperacion = mediana(recuperaciones);

  return {
    dias,
    fuente,
    despliegues: deps.length,
    fallidos: fallidos.length,
    frecuencia: { valor: frecuencia, nivel: nivel('frecuencia', frecuencia) },
    leadTime: { valor: leadTime, nivel: nivel('leadTime', leadTime), cambios: leadTimes.length },
    tasaFallas: { valor: tasaFallas, nivel: nivel('tasaFallas', tasaFallas) },
    recuperacion: {
      valor: recuperacion,
      nivel: nivel('recuperacion', recuperacion),
      incidentes: recuperaciones.length,
      sigueRojo: rojoDesde !== null,
    },
  };
};

const decimal = (n, digitos = 1) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: digitos });

/** Horas en palabras: "35 min", "5,5 h", "2,3 días". */
export const duracion = (horas) => {
  if (horas === null) return 'sin datos';
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${decimal(horas)} h`;
  return `${decimal(horas / 24)} días`;
};

/** Tabla en Markdown para el resumen de la corrida de GitHub Actions. */
export const markdown = (r) => {
  const fuente =
    r.fuente === 'produccion'
      ? 'despliegues a **producción**'
      : '**merges a main** (todavía no hay despliegues a producción)';
  const pct = r.tasaFallas.valor === null ? 'sin datos' : `${decimal(r.tasaFallas.valor * 100)} %`;
  return [
    `## Métricas DORA · últimos ${r.dias} días`,
    '',
    `Se cuentan ${fuente}: ${r.despliegues} en total, ${r.fallidos} con falla.`,
    '',
    '| Métrica | Valor | Nivel |',
    '|---|---|---|',
    `| Frecuencia de despliegue | ${decimal(r.frecuencia.valor)} por semana | ${r.frecuencia.nivel} |`,
    `| Lead time (mediana, ${r.leadTime.cambios} cambios) | ${duracion(r.leadTime.valor)} | ${r.leadTime.nivel} |`,
    `| Tasa de fallas | ${pct} | ${r.tasaFallas.nivel} |`,
    `| Tiempo de recuperación (mediana, ${r.recuperacion.incidentes} veces) | ${duracion(r.recuperacion.valor)} | ${r.recuperacion.nivel} |`,
    '',
    r.recuperacion.sigueRojo ? '> ⚠️ main está en rojo ahora mismo.\n' : '',
    'Niveles según el informe *State of DevOps* de DORA: Elite, Alto, Medio, Bajo.',
    '',
  ].join('\n');
};
