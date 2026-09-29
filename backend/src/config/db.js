import pg from 'pg';
import dotenv from 'dotenv';

import { opcionesPostgres } from './servidor.js';
import { logger } from '../observabilidad/logger.js';

dotenv.config({ quiet: true });

const pool = new pg.Pool({
  ...opcionesPostgres(process.env),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Error inesperado en una conexión inactiva de Postgres');
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
