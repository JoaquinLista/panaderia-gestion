import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { clienteGitHub, leerDatos } from './reporte.mjs';

/** Una API de GitHub de mentira: responde según el comienzo de la ruta. */
const apiFalsa = (respuestas) => {
  const pedidas = [];
  const pedir = async (url, opciones) => {
    pedidas.push({ url, opciones });
    const ruta = url.replace('https://api.github.com/repos/o/r', '');
    const clave = Object.keys(respuestas).find((k) => ruta.startsWith(k));
    if (!clave) return { ok: false, status: 404 };
    return { ok: true, json: async () => respuestas[clave](ruta) };
  };
  return { api: clienteGitHub('o/r', 'tk', pedir), pedidas };
};

const AHORA = new Date('2026-09-30T00:00:00Z');

const pr = (number, merged_at, extra = {}) => ({
  number,
  merged_at,
  updated_at: merged_at ?? '2026-09-29T00:00:00Z',
  created_at: '2026-09-01T00:00:00Z',
  merge_commit_sha: `m${number}`,
  ...extra,
});

describe('clienteGitHub', () => {
  it('manda el token y pagina hasta que la página no está llena', async () => {
    let pagina = 0;
    const { api, pedidas } = apiFalsa({
      '/pulls': () => {
        pagina += 1;
        return pagina === 1 ? Array.from({ length: 100 }, (_, i) => i) : [100, 101];
      },
    });
    const todos = await api.todas('/pulls?state=closed');
    assert.equal(todos.length, 102);
    assert.equal(pedidas.length, 2);
    assert.match(pedidas[1].url, /\/pulls\?state=closed&per_page=100&page=2$/);
    assert.equal(pedidas[0].opciones.headers.Authorization, 'Bearer tk');
  });

  it('un error de GitHub se informa con la ruta', async () => {
    const { api } = apiFalsa({});
    await assert.rejects(api.get('/nada'), /GitHub respondió 404 en \/nada/);
  });
});

describe('leerDatos', () => {
  const comunes = {
    '/pulls/5/commits': () => [
      { commit: { author: { date: '2026-09-20T12:00:00Z' } } },
      { commit: { author: { date: '2026-09-20T08:00:00Z' } } },
    ],
    '/pulls': () => [
      pr(5, '2026-09-21T08:00:00Z'),
      pr(6, null), // cerrado sin merge
      pr(1, '2026-08-01T00:00:00Z', { updated_at: '2026-09-25T00:00:00Z' }), // fuera de la ventana
    ],
    '/actions/workflows/ci.yml/runs': () => ({
      workflow_runs: [
        { head_sha: 'm5', updated_at: '2026-09-21T08:10:00Z', conclusion: 'failure' },
        { head_sha: 'm5', updated_at: '2026-09-21T09:00:00Z', conclusion: 'cancelled' },
      ],
    }),
    '/actions/workflows/volver-atras.yml/runs': () => ({ workflow_runs: [] }),
  };

  it('sin despliegues a producción usa los merges a main', async () => {
    const { api } = apiFalsa({ ...comunes, '/deployments': () => [] });
    const datos = await leerDatos(api, { dias: 30, ahora: AHORA });
    assert.equal(datos.fuente, 'merges');
    assert.deepEqual(datos.despliegues, [{ sha: 'm5', en: '2026-09-21T08:00:00Z' }]);
    assert.deepEqual(datos.cambios, [
      { primerCommit: '2026-09-20T08:00:00Z', mergeado: '2026-09-21T08:00:00Z' },
    ]);
    // Las canceladas no cuentan ni como verde ni como rojo.
    assert.deepEqual(datos.ciMain, [{ sha: 'm5', en: '2026-09-21T08:10:00Z', ok: false }]);
  });

  it('con despliegues a producción exitosos, cuenta esos', async () => {
    const { api, pedidas } = apiFalsa({
      ...comunes,
      '/deployments/9/statuses': () => [
        { state: 'success', created_at: '2026-09-22T10:00:00Z' },
        { state: 'in_progress', created_at: '2026-09-22T09:50:00Z' },
      ],
      '/deployments/8/statuses': () => [{ state: 'failure', created_at: '2026-09-22T09:00:00Z' }],
      '/deployments': () => [
        { id: 9, sha: 'm5', created_at: '2026-09-22T09:45:00Z' },
        { id: 8, sha: 'm4', created_at: '2026-09-22T08:45:00Z' },
      ],
    });
    const datos = await leerDatos(api, { dias: 30, ahora: AHORA });
    assert.equal(datos.fuente, 'produccion');
    assert.deepEqual(datos.despliegues, [{ sha: 'm5', en: '2026-09-22T10:00:00Z' }]);
    assert.ok(pedidas.some((p) => p.url.includes('/deployments?environment=produccion')));
  });
});
