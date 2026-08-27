import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const {
  POSTGRES_HOST = 'db',
  POSTGRES_PORT = '5432',
  POSTGRES_DB = 'panaderias',
  POSTGRES_USER = 'panaderias',
  POSTGRES_PASSWORD = 'panaderias',
} = process.env;

const pool = new pg.Pool({
  host: POSTGRES_HOST,
  port: Number(POSTGRES_PORT),
  database: POSTGRES_DB,
  user: POSTGRES_USER,
  password: POSTGRES_PASSWORD,
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
