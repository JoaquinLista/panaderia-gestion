import { describe, it, expect, vi, beforeEach } from 'vitest';

import { issueDelReporte, nombreDelEntorno, validarReporte } from '../../src/domain/reportes.js';

vi.mock('../../src/config/db.js', () => {
  const query = vi.fn();
  return { default: { query }, query, getClient: vi.fn() };
});
const db = await import('../../src/config/db.js');
const { abrirIssue, crearReporte } = await import('../../src/services/reportesService.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validarReporte', () => {
  it('pide contar qué pasó con al menos 10 letras', () => {
    expect(validarReporte({ que_paso: '  corto  ' }).error).toMatch(/al menos 10/);
    expect(validarReporte({}).error).toMatch(/al menos 10/);
  });

  it('no acepta textos de más de 2000 letras', () => {
    expect(validarReporte({ que_paso: 'x'.repeat(2001) }).error).toMatch(/2000/);
    expect(validarReporte({ que_paso: 'bien largo ok', esperado: 'x'.repeat(2001) }).error).toMatch(
      /2000/
    );
  });

  it('limpia los espacios y deja null lo que no vino', () => {
    expect(validarReporte({ que_paso: '  No carga el resumen  ', seccion: 'Resumen' })).toEqual({
      reporte: {
        que_paso: 'No carga el resumen',
        esperado: null,
        seccion: 'Resumen',
        version: null,
      },
    });
  });
});

describe('issueDelReporte', () => {
  const reporte = {
    id: 7,
    que_paso: 'Al guardar el cierre de la noche aparece un error rojo y no se guarda nada',
    esperado: 'Que se guarde',
    seccion: 'Cierre de caja',
    version: 'abc123',
  };

  it('tiene las secciones de la plantilla de bug y la etiqueta bug', () => {
    const issue = issueDelReporte(reporte, {
      rol: 'EMPLEADA',
      sucursal: 'Café',
      entorno: 'Producción',
    });
    expect(issue.labels).toContain('bug');
    for (const titulo of [
      '### ¿Qué pasó?',
      '### ¿Qué esperabas que pasara?',
      '### Pasos para reproducirlo',
      '### Entorno',
      '### Capturas o logs',
    ]) {
      expect(issue.body).toContain(titulo);
    }
    expect(issue.body).toContain('Entró como empleada de Café');
    expect(issue.body).toContain('"Cierre de caja"');
    expect(issue.body).toContain('Reporte #7');
    expect(issue.body).toContain('`abc123`');
  });

  it('el título es la primera línea, corta y cortada en una palabra', () => {
    const { title } = issueDelReporte(reporte, { rol: 'ADMIN', sucursal: null, entorno: 'x' });
    expect(title.startsWith('[Bug] Al guardar el cierre')).toBe(true);
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(6 + 61);
    const corto = issueDelReporte(
      { ...reporte, que_paso: 'No anda\nmás detalle' },
      {
        rol: 'ADMIN',
        sucursal: null,
        entorno: 'x',
      }
    );
    expect(corto.title).toBe('[Bug] No anda');
  });

  it('sin lo esperado lo aclara', () => {
    const { body } = issueDelReporte(
      { ...reporte, esperado: null, seccion: null, version: null },
      { rol: 'ADMIN', sucursal: null, entorno: 'x' }
    );
    expect(body).toContain('_No lo dijo._');
    expect(body).toContain('Entró como admin\n');
    expect(body).toContain('versión `sin dato`');
  });

  it('entornos de la plantilla', () => {
    expect(nombreDelEntorno('produccion')).toBe('Producción');
    expect(nombreDelEntorno('STAGING')).toBe('Staging');
    expect(nombreDelEntorno(undefined)).toBe('Local (docker compose)');
  });
});

describe('abrirIssue', () => {
  const issue = { title: 't', body: 'b', labels: ['bug'] };

  it('sin token no llama a GitHub', async () => {
    const pedir = vi.fn();
    expect(await abrirIssue(issue, {}, pedir)).toBeNull();
    expect(pedir).not.toHaveBeenCalled();
  });

  it('con token crea el issue en el repo configurado', async () => {
    const pedir = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/o/r/issues/5' }),
    });
    const url = await abrirIssue(
      issue,
      { GITHUB_TOKEN_REPORTES: 'tk', GITHUB_REPO_REPORTES: 'o/r' },
      pedir
    );
    expect(url).toBe('https://github.com/o/r/issues/5');
    const [direccion, opciones] = pedir.mock.calls[0];
    expect(direccion).toBe('https://api.github.com/repos/o/r/issues');
    expect(opciones.method).toBe('POST');
    expect(opciones.headers.Authorization).toBe('Bearer tk');
    expect(JSON.parse(opciones.body)).toEqual(issue);
  });

  it('usa el repo del proyecto si no se configura otro', async () => {
    const pedir = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    expect(await abrirIssue(issue, { GITHUB_TOKEN_REPORTES: 'tk' }, pedir)).toBeNull();
    expect(pedir.mock.calls[0][0]).toContain('/repos/JoaquinLista/panaderia-gestion/issues');
  });

  it('si GitHub rechaza o no contesta, devuelve null sin romper', async () => {
    const env = { GITHUB_TOKEN_REPORTES: 'tk' };
    expect(
      await abrirIssue(issue, env, vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    ).toBeNull();
    expect(await abrirIssue(issue, env, vi.fn().mockRejectedValue(new Error('red')))).toBeNull();
  });
});

describe('crearReporte', () => {
  const sesion = { usuario: { id: 2, rol: 'EMPLEADA' }, sucursal: { id: 3, nombre: 'Estrada' } };
  const guardado = {
    id: 9,
    que_paso: 'No aparece Estrada en la lista',
    esperado: null,
    seccion: 'Pedidos',
    version: 'v1',
  };

  it('guarda el reporte y el link del issue', async () => {
    db.query.mockResolvedValueOnce({ rows: [guardado] }).mockResolvedValueOnce({ rowCount: 1 });
    const pedir = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/x/y/issues/1' }),
    });
    const res = await crearReporte(
      { que_paso: 'No aparece Estrada en la lista', seccion: 'Pedidos', version: 'v1' },
      sesion,
      { env: { GITHUB_TOKEN_REPORTES: 'tk', APP_ENTORNO: 'produccion' }, pedir }
    );
    expect(res).toEqual({ id: 9, issue_url: 'https://github.com/x/y/issues/1' });
    expect(db.query.mock.calls[0][1]).toEqual([
      2,
      3,
      'No aparece Estrada en la lista',
      null,
      'Pedidos',
      'v1',
    ]);
    expect(JSON.parse(pedir.mock.calls[0][1].body).body).toContain('Producción');
    expect(db.query.mock.calls[1][1]).toEqual(['https://github.com/x/y/issues/1', 9]);
  });

  it('sin token queda guardado igual', async () => {
    db.query.mockResolvedValueOnce({ rows: [guardado] });
    const res = await crearReporte({ que_paso: 'No aparece Estrada en la lista' }, sesion, {
      env: {},
    });
    expect(res).toEqual({ id: 9, issue_url: null });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('con datos inválidos responde 400 sin guardar', async () => {
    await expect(crearReporte({ que_paso: 'x' }, sesion)).rejects.toMatchObject({ status: 400 });
    expect(db.query).not.toHaveBeenCalled();
  });
});
