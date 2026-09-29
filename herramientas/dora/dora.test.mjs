import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calcular, duracion, markdown, mediana, nivel } from './dora.mjs';

describe('mediana', () => {
  it('impar, par y vacía', () => {
    assert.equal(mediana([5, 1, 3]), 3);
    assert.equal(mediana([4, 1, 3, 2]), 2.5);
    assert.equal(mediana([]), null);
  });
});

describe('nivel', () => {
  it('frecuencia: más es mejor', () => {
    assert.equal(nivel('frecuencia', 10), 'Elite');
    assert.equal(nivel('frecuencia', 2), 'Alto');
    assert.equal(nivel('frecuencia', 0.5), 'Medio');
    assert.equal(nivel('frecuencia', 0.1), 'Bajo');
  });

  it('lead time, fallas y recuperación: menos es mejor', () => {
    assert.equal(nivel('leadTime', 3), 'Elite');
    assert.equal(nivel('leadTime', 100), 'Alto');
    assert.equal(nivel('leadTime', 24 * 40), 'Bajo');
    assert.equal(nivel('tasaFallas', 0.04), 'Elite');
    assert.equal(nivel('tasaFallas', 0.12), 'Medio');
    assert.equal(nivel('recuperacion', 0.5), 'Elite');
    assert.equal(nivel('recuperacion', 30), 'Medio');
  });

  it('sin datos', () => {
    assert.equal(nivel('tasaFallas', null), 'Sin datos');
  });
});

describe('calcular', () => {
  const base = {
    dias: 14,
    fuente: 'merges',
    despliegues: [
      { sha: 'a', en: '2026-09-20T10:00:00Z' },
      { sha: 'b', en: '2026-09-22T10:00:00Z' },
      { sha: 'c', en: '2026-09-25T10:00:00Z' },
      { sha: 'd', en: '2026-09-28T10:00:00Z' },
    ],
    cambios: [
      { primerCommit: '2026-09-20T08:00:00Z', mergeado: '2026-09-20T10:00:00Z' },
      { primerCommit: '2026-09-21T10:00:00Z', mergeado: '2026-09-22T10:00:00Z' },
      { primerCommit: '2026-09-25T06:00:00Z', mergeado: '2026-09-25T10:00:00Z' },
    ],
    ciMain: [
      { sha: 'a', en: '2026-09-20T10:10:00Z', ok: true },
      { sha: 'b', en: '2026-09-22T10:10:00Z', ok: false },
      { sha: 'x', en: '2026-09-22T11:40:00Z', ok: true },
      { sha: 'c', en: '2026-09-25T10:10:00Z', ok: true },
      { sha: 'd', en: '2026-09-28T10:10:00Z', ok: true },
    ],
    vueltasAtras: [],
  };

  it('con merges como despliegues', () => {
    const r = calcular(base);
    assert.equal(r.despliegues, 4);
    assert.equal(r.frecuencia.valor, 2); // 4 en 2 semanas
    assert.equal(r.frecuencia.nivel, 'Alto');
    assert.equal(r.leadTime.valor, 4); // 2 h, 24 h y 4 h
    assert.equal(r.leadTime.nivel, 'Elite');
    assert.equal(r.fallidos, 1); // el CI de b dio rojo
    assert.equal(r.tasaFallas.valor, 0.25);
    assert.equal(r.recuperacion.valor, 1.5); // rojo 10:10, verde 11:40
    assert.equal(r.recuperacion.incidentes, 1);
    assert.equal(r.recuperacion.sigueRojo, false);
  });

  it('con producción, el lead time llega hasta el despliegue siguiente al merge', () => {
    const r = calcular({
      ...base,
      fuente: 'produccion',
      despliegues: [{ sha: 'z', en: '2026-09-26T10:00:00Z' }],
      cambios: [
        { primerCommit: '2026-09-25T10:00:00Z', mergeado: '2026-09-25T12:00:00Z' },
        { primerCommit: '2026-09-27T10:00:00Z', mergeado: '2026-09-27T12:00:00Z' },
      ],
      ciMain: [],
    });
    assert.equal(r.leadTime.valor, 24);
    assert.equal(r.leadTime.cambios, 1); // el segundo todavía no llegó
  });

  it('volver atrás cuenta como falla del despliegue anterior', () => {
    const r = calcular({
      ...base,
      ciMain: [],
      vueltasAtras: [{ en: '2026-09-25T12:00:00Z' }],
    });
    assert.equal(r.fallidos, 1);
  });

  it('si main sigue en rojo lo avisa', () => {
    const r = calcular({ ...base, ciMain: [{ sha: 'd', en: '2026-09-28T10:10:00Z', ok: false }] });
    assert.equal(r.recuperacion.sigueRojo, true);
    assert.equal(r.recuperacion.valor, null);
  });

  it('sin despliegues no inventa números', () => {
    const r = calcular({ ...base, despliegues: [], cambios: [], ciMain: [] });
    assert.equal(r.frecuencia.valor, 0);
    assert.equal(r.tasaFallas.valor, null);
    assert.equal(r.tasaFallas.nivel, 'Sin datos');
  });
});

describe('texto', () => {
  it('duraciones legibles', () => {
    assert.equal(duracion(0.5), '30 min');
    assert.equal(duracion(5.5), '5,5 h');
    assert.equal(duracion(72), '3 días');
    assert.equal(duracion(null), 'sin datos');
  });

  it('la tabla dice de dónde salen los datos', () => {
    const tabla = markdown(
      calcular({
        dias: 7,
        fuente: 'merges',
        despliegues: [{ sha: 'a', en: '2026-09-20T10:00:00Z' }],
        cambios: [],
        ciMain: [],
        vueltasAtras: [],
      })
    );
    assert.match(tabla, /últimos 7 días/);
    assert.match(tabla, /merges a main/);
    assert.match(tabla, /\| Frecuencia de despliegue \| 1 por semana \| Alto \|/);
  });
});
