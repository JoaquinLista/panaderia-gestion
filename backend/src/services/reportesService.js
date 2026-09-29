import { query } from '../config/db.js';
import { issueDelReporte, nombreDelEntorno, validarReporte } from '../domain/reportes.js';
import { logger } from '../observabilidad/logger.js';

const errorHttp = (status, mensaje) => Object.assign(new Error(mensaje), { status });

/**
 * Abre el issue en GitHub. Devuelve su dirección, o null si no hay token o
 * GitHub no contesta bien: el reporte ya quedó guardado igual.
 * @param {object} issue
 * @param {NodeJS.ProcessEnv} env
 * @param {typeof fetch} pedir
 */
export const abrirIssue = async (issue, env = process.env, pedir = fetch) => {
  const token = env.GITHUB_TOKEN_REPORTES?.trim();
  if (!token) return null;
  const repo = env.GITHUB_REPO_REPORTES?.trim() || 'JoaquinLista/panaderia-gestion';
  try {
    const respuesta = await pedir(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(issue),
      signal: AbortSignal.timeout(10_000),
    });
    if (!respuesta.ok) {
      logger.warn({ status: respuesta.status }, 'GitHub no aceptó el issue del reporte');
      return null;
    }
    return (await respuesta.json()).html_url ?? null;
  } catch (error) {
    logger.warn({ err: error }, 'No se pudo abrir el issue del reporte');
    return null;
  }
};

/**
 * Guarda el reporte y, si se puede, abre el issue.
 * @param {object} datos lo que manda la pantalla
 * @param {{ usuario: { id: number, rol: string }, sucursal: { id: number, nombre: string } | null }} sesion
 */
export const crearReporte = async (datos, sesion, { env = process.env, pedir = fetch } = {}) => {
  const validado = validarReporte(datos);
  if (validado.error) throw errorHttp(400, validado.error);
  const { reporte } = validado;

  const {
    rows: [guardado],
  } = await query(
    `INSERT INTO reportes_problema (usuario_id, sucursal_id, que_paso, esperado, seccion, version)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, que_paso, esperado, seccion, version, creado_en`,
    [
      sesion.usuario.id,
      sesion.sucursal?.id ?? null,
      reporte.que_paso,
      reporte.esperado,
      reporte.seccion,
      reporte.version,
    ]
  );
  logger.info({ reporte: guardado.id, seccion: guardado.seccion }, 'Nuevo reporte de problema');

  const issue = issueDelReporte(guardado, {
    rol: sesion.usuario.rol,
    sucursal: sesion.sucursal?.nombre ?? null,
    entorno: nombreDelEntorno(env.APP_ENTORNO),
  });
  const issueUrl = await abrirIssue(issue, env, pedir);
  if (issueUrl) {
    await query('UPDATE reportes_problema SET issue_url = $1 WHERE id = $2', [
      issueUrl,
      guardado.id,
    ]);
  }
  return { id: guardado.id, issue_url: issueUrl };
};
