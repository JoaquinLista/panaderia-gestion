// `npm run migrate`: aplica las migraciones pendientes y termina.
// Útil para correrlas a mano o desde un job de despliegue.
import pool from '../config/db.js';
import { aplicarMigraciones } from './migrar.js';

try {
  await aplicarMigraciones();
} catch (error) {
  console.error('[db] Falló la migración:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
