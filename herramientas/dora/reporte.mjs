/**
 * Lee de la API de GitHub lo que hace falta para las métricas DORA y escribe
 * el informe (lo corre .github/workflows/dora.yml todos los lunes).
 *
 *   GITHUB_REPOSITORY=dueño/repo [GITHUB_TOKEN=...] node herramientas/dora/reporte.mjs [días]
 *
 * Escribe la tabla en $GITHUB_STEP_SUMMARY (o en pantalla) y los números en dora.json.
 */
import { appendFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { calcular, markdown } from './dora.mjs';

/**
 * Cliente mínimo de la API REST de GitHub con paginado.
 * @param {string} repo "dueño/repo"
 * @param {string} token
 * @param {typeof fetch} pedir
 */
export const clienteGitHub = (repo, token, pedir = fetch) => {
  const get = async (ruta) => {
    const res = await pedir(`https://api.github.com/repos/${repo}${ruta}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        // Sin token también anda en un repo público, con menos pedidos por hora.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`GitHub respondió ${res.status} en ${ruta}`);
    return res.json();
  };
  /** Todas las páginas (hasta `max`), cortando cuando `seguir` dice que no. */
  const todas = async (ruta, { clave, seguir = () => true, max = 10 } = {}) => {
    const items = [];
    for (let pagina = 1; pagina <= max; pagina += 1) {
      const separador = ruta.includes('?') ? '&' : '?';
      const cuerpo = await get(`${ruta}${separador}per_page=100&page=${pagina}`);
      const lista = clave ? cuerpo[clave] : cuerpo;
      items.push(...lista);
      if (lista.length < 100 || !lista.every(seguir)) break;
    }
    return items;
  };
  return { get, todas };
};

/**
 * Junta los datos de los últimos `dias`: despliegues a producción (o merges a
 * main si todavía no hay), cambios con su primer commit, corridas del CI en
 * main y vueltas atrás.
 * @param {ReturnType<typeof clienteGitHub>} api
 * @param {{ dias: number, ahora?: Date }} opciones
 */
export const leerDatos = async (api, { dias, ahora = new Date() }) => {
  const desde = new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);
  const enVentana = (fecha) => fecha && new Date(fecha) >= desde;

  // Merges a main de la ventana.
  const prs = await api.todas('/pulls?state=closed&base=main&sort=updated&direction=desc', {
    seguir: (pr) => enVentana(pr.updated_at),
  });
  const mergeados = prs.filter((pr) => enVentana(pr.merged_at));

  // Despliegues a producción que terminaron bien (el ambiente del desplegar.yml).
  const deployments = await api.todas('/deployments?environment=produccion', {
    seguir: (d) => enVentana(d.created_at),
  });
  const produccion = [];
  for (const d of deployments.filter((x) => enVentana(x.created_at))) {
    const estados = await api.get(`/deployments/${d.id}/statuses?per_page=100`);
    const exito = estados.find((e) => e.state === 'success');
    if (exito) produccion.push({ sha: d.sha, en: exito.created_at });
  }

  const fuente = produccion.length > 0 ? 'produccion' : 'merges';
  const despliegues =
    fuente === 'produccion'
      ? produccion
      : mergeados.map((pr) => ({ sha: pr.merge_commit_sha, en: pr.merged_at }));

  // El primer commit de cada PR: desde ahí se cuenta el lead time.
  const cambios = [];
  for (const pr of mergeados) {
    const commits = await api.todas(`/pulls/${pr.number}/commits`, { max: 3 });
    const fechas = commits.map((c) => c.commit.author?.date ?? c.commit.committer?.date);
    const primero = fechas.filter(Boolean).sort()[0] ?? pr.created_at;
    cambios.push({ primerCommit: primero, mergeado: pr.merged_at });
  }

  const corridas = await api.todas(
    `/actions/workflows/ci.yml/runs?branch=main&event=push&status=completed&created=>=${desde.toISOString().slice(0, 10)}`,
    { clave: 'workflow_runs' }
  );
  const ciMain = corridas
    .filter((c) => ['success', 'failure'].includes(c.conclusion))
    .map((c) => ({ sha: c.head_sha, en: c.updated_at, ok: c.conclusion === 'success' }));

  const vueltas = await api.todas(
    `/actions/workflows/volver-atras.yml/runs?status=success&created=>=${desde.toISOString().slice(0, 10)}`,
    { clave: 'workflow_runs' }
  );
  const vueltasAtras = vueltas.map((v) => ({ en: v.updated_at }));

  return { dias, fuente, despliegues, cambios, ciMain, vueltasAtras };
};

const principal = async () => {
  const dias = Number(process.argv[2] ?? process.env.DORA_DIAS ?? 30);
  const {
    GITHUB_TOKEN: token,
    GITHUB_REPOSITORY: repo,
    GITHUB_STEP_SUMMARY: resumen,
  } = process.env;
  if (!repo) throw new Error('Falta GITHUB_REPOSITORY (dueño/repo)');

  const resultado = calcular(await leerDatos(clienteGitHub(repo, token), { dias }));
  const tabla = markdown(resultado);
  if (resumen) await appendFile(resumen, tabla);
  console.log(tabla);
  await writeFile('dora.json', `${JSON.stringify(resultado, null, 2)}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
