import pg from 'pg';
import dotenv from 'dotenv';

import { opcionesPostgres } from './servidor.js';

dotenv.config({ quiet: true });

const pool = new pg.Pool({
  ...opcionesPostgres(process.env),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] Error inesperado en cliente inactivo del pool:', err);
});

/**
 * Ejecuta una query parametrizada contra el pool.
 * @param {string} text
 * @param {Array<unknown>} [params]
 */
export const query = (text, params) => pool.query(text, params);

/**
 * Obtiene un cliente dedicado del pool (para transacciones).
 * Recordar siempre liberar el cliente con client.release().
 */
export const getClient = () => pool.connect();

export default pool;
