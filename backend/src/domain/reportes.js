/**
 * Reportes de problemas (Sprint 8, #18): validación y el texto del issue,
 * con las mismas secciones que la plantilla .github/ISSUE_TEMPLATE/bug.yml.
 */

export const LARGO_MINIMO = 10;
export const LARGO_MAXIMO = 2000;

const ENTORNOS = {
  local: 'Local (docker compose)',
  staging: 'Staging',
  produccion: 'Producción',
};

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

/**
 * @param {{ que_paso?: unknown, esperado?: unknown, seccion?: unknown, version?: unknown }} datos
 * @returns {{ error: string } | { reporte: { que_paso: string, esperado: string | null, seccion: string | null, version: string | null } }}
 */
export const validarReporte = (datos = {}) => {
  const quePaso = texto(datos.que_paso);
  const esperado = texto(datos.esperado);
  if (quePaso.length < LARGO_MINIMO) {
    return { error: `Contanos qué pasó con al menos ${LARGO_MINIMO} letras` };
  }
  if (quePaso.length > LARGO_MAXIMO || esperado.length > LARGO_MAXIMO) {
    return { error: `El texto puede tener hasta ${LARGO_MAXIMO} letras` };
  }
  return {
    reporte: {
      que_paso: quePaso,
      esperado: esperado || null,
      seccion: texto(datos.seccion).slice(0, 60) || null,
      version: texto(datos.version).slice(0, 60) || null,
    },
  };
};

/** Nombre del entorno como lo lista la plantilla de bug. */
export const nombreDelEntorno = (valor) => ENTORNOS[texto(valor).toLowerCase()] ?? ENTORNOS.local;

// El título del issue: la primera línea, cortada en una palabra.
const titulo = (quePaso) => {
  const linea = quePaso.split('\n')[0];
  if (linea.length <= 60) return linea;
  const corte = linea.slice(0, 60);
  return `${corte.slice(0, corte.lastIndexOf(' ') > 30 ? corte.lastIndexOf(' ') : 60)}…`;
};

/**
 * Issue de GitHub con las secciones de la plantilla de bug. El repo es
 * público: no lleva el nombre de la persona, sólo su rol.
 * @param {{ id: number, que_paso: string, esperado: string | null, seccion: string | null, version: string | null }} reporte
 * @param {{ rol: string, sucursal: string | null, entorno: string }} contexto
 */
export const issueDelReporte = (reporte, { rol, sucursal, entorno }) => ({
  title: `[Bug] ${titulo(reporte.que_paso)}`,
  labels: ['bug', 'reportado-desde-la-app'],
  body: [
    '### ¿Qué pasó?',
    reporte.que_paso,
    '### ¿Qué esperabas que pasara?',
    reporte.esperado ?? '_No lo dijo._',
    '### Pasos para reproducirlo',
    [
      `1. Entró como ${rol.toLowerCase()}${sucursal ? ` de ${sucursal}` : ''}`,
      `2. Estaba en la sección "${reporte.seccion ?? 'sin dato'}"`,
      '3. _Completar al revisar._',
    ].join('\n'),
    '### Entorno',
    entorno,
    '### Capturas o logs',
    `Reporte #${reporte.id} desde la app, versión \`${reporte.version ?? 'sin dato'}\`.`,
  ].join('\n\n'),
});
