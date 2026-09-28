import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

import { getClient } from '../config/db.js';

/** Carpeta con los archivos SQL numerados (0001_..., 0002_...). */
export const DIRECTORIO_MIGRACIONES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations'
);

/**
 * Aplica las migraciones pendientes, en orden. Las ya aplicadas quedan
 * registradas en la tabla `pgmigrations` y no se vuelven a correr.
 *
 * Si hay varios backends arrancando a la vez, node-pg-migrate toma un lock
 * en Postgres y el resto espera (`advisoryLockMode: 'wait'`).
 *
 * @param {{ ejecutar?: typeof runner, log?: (msg: string) => void }} [opciones]
 *   `ejecutar` se puede reemplazar en los tests.
 * @returns {Promise<string[]>} nombres de las migraciones aplicadas en esta corrida
 */
export const aplicarMigraciones = async ({ ejecutar = runner, log = console.log } = {}) => {
  const client = await getClient();
  try {
    const aplicadas = await ejecutar({
      dbClient: client,
      dir: DIRECTORIO_MIGRACIONES,
      direction: 'up',
      migrationsTable: 'pgmigrations',
      checkOrder: true,
      advisoryLockMode: 'wait',
      log: () => {},
    });
    const nombres = aplicadas.map((m) => m.name);
    log(
      nombres.length === 0
        ? '[db] Esquema al día, no hay migraciones pendientes.'
        : `[db] Migraciones aplicadas: ${nombres.join(', ')}`
    );
    return nombres;
  } finally {
    client.release();
  }
};
