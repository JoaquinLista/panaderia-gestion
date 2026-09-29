import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';

// La métrica de cierres de hoy (KPI 1) contra un Postgres real: una fila por
// sucursal que vende y turno, sin el galpón.
const URL_ADMIN = process.env.TEST_DATABASE_URL;
if (!URL_ADMIN) {
  throw new Error(
    'Falta TEST_DATABASE_URL (ej: postgres://postgres:postgres@localhost:5432/postgres)'
  );
}

const BASE = 'lf_test_metricas';
const admin = new pg.Client({ connectionString: URL_ADMIN });

const url = new URL(URL_ADMIN);
vi.stubEnv('POSTGRES_HOST', url.hostname);
vi.stubEnv('POSTGRES_PORT', url.port || '5432');
vi.stubEnv('POSTGRES_USER', decodeURIComponent(url.username));
vi.stubEnv('POSTGRES_PASSWORD', decodeURIComponent(url.password));
vi.stubEnv('POSTGRES_DB', BASE);

let pool;
let metricas;
// 29/09/2026 a las 22 h de Argentina (ya es 30/09 en UTC).
const AHORA = new Date('2026-09-30T01:00:00Z');

beforeAll(async () => {
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${BASE}`);

  ({ default: pool } = await import('../../src/config/db.js'));
  const { aplicarMigraciones } = await import('../../src/db/migrar.js');
  const { asegurarAdminInicial } = await import('../../src/services/authService.js');
  await aplicarMigraciones({ log: () => {} });
  await asegurarAdminInicial({ usuario: 'dueña', password: 'clave-de-la-dueña', log: () => {} });
  metricas = await import('../../src/observabilidad/metricas.js');

  await pool.query(
    `INSERT INTO cierres_caja (sucursal_id, fecha, turno, total_controlador, efectivo_contado,
                               cambio_fijo, diferencia, cargado_por)
     SELECT s.id, '2026-09-29', 'NOCHE', 1000, 1000, 0, 0, u.id
       FROM sucursales s, usuarios u
      WHERE s.nombre = 'Café' AND u.usuario = 'dueña'`
  );
});

afterAll(async () => {
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE} WITH (FORCE)`);
  await admin.end();
});

describe('cierres de hoy para Prometheus', () => {
  it('una fila por sucursal que vende y turno, con el día de Argentina', async () => {
    const filas = await metricas.cierresDeHoy(AHORA);
    expect(filas).toHaveLength(8);
    expect(filas.some((f) => /galp/i.test(f.sucursal))).toBe(false);
    expect(filas.filter((f) => f.cargado)).toEqual([
      { sucursal: 'Café', turno: 'NOCHE', cargado: true },
    ]);
  });
});
