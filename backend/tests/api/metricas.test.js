import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/config/db.js', () => {
  const query = vi.fn();
  return { default: { query }, query, getClient: vi.fn() };
});

const db = await import('../../src/config/db.js');
const { default: app } = await import('../../src/app.js');

beforeEach(() => {
  vi.clearAllMocks();
});

const cierresDeHoy = [
  { sucursal: 'Café', turno: 'MEDIODIA', cargado: true },
  { sucursal: 'Café', turno: 'NOCHE', cargado: false },
];

describe('GET /metrics', () => {
  it('responde en el formato de Prometheus, sin pedir sesión', async () => {
    db.query.mockResolvedValue({ rows: cierresDeHoy });
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).toContain('# TYPE lafueguina_http_duracion_segundos histogram');
    expect(res.text).toContain('lafueguina_process_cpu_seconds_total');
  });

  it('dice qué cierres de hoy están cargados (KPI 1)', async () => {
    db.query.mockResolvedValue({ rows: cierresDeHoy });
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('lafueguina_cierre_cargado_hoy{sucursal="Café",turno="MEDIODIA"} 1');
    expect(res.text).toContain('lafueguina_cierre_cargado_hoy{sucursal="Café",turno="NOCHE"} 0');
    // Pregunta por hoy, sin el galpón.
    const [sql, [fecha, turnos]] = db.query.mock.calls[0];
    expect(sql).toMatch(/tipo <> 'DEPOSITO'/);
    expect(fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(turnos).toEqual(['MEDIODIA', 'NOCHE']);
  });

  it('sin base no inventa ceros: la serie no aparece', async () => {
    db.query.mockRejectedValue(new Error('sin conexión'));
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/lafueguina_cierre_cargado_hoy\{/);
  });

  it('mide los requests por ruta declarada y cuenta los 5xx', async () => {
    db.query.mockRejectedValueOnce(new Error('base caída'));
    await request(app).get('/api/health');
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(
      /lafueguina_http_duracion_segundos_count\{metodo="GET",ruta="\/api\/health",codigo="503"\} \d+/
    );
    expect(res.text).toMatch(
      /lafueguina_http_errores_total\{metodo="GET",ruta="\/api\/health",codigo="503"\} \d+/
    );
  });
});

describe('X-Request-Id', () => {
  it('devuelve el id que manda Nginx', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/health').set('X-Request-Id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('si no viene, genera uno', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
