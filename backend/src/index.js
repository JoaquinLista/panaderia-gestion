import dotenv from 'dotenv';

import app from './app.js';
import pool from './config/db.js';
import { configAuth } from './config/auth.js';
import { aplicarMigraciones } from './db/migrar.js';
import { asegurarAdminInicial } from './services/authService.js';
import { logger } from './observabilidad/logger.js';

dotenv.config({ quiet: true });

const PORT = Number(process.env.PORT ?? 3000);

/**
 * Espera a que la base de datos esté disponible antes de aceptar tráfico.
 */
const esperarBaseDeDatos = async (reintentos = 15, esperaMs = 2000) => {
  for (let intento = 1; intento <= reintentos; intento += 1) {
    try {
      await pool.query('SELECT 1');
      logger.info('Conexión con Postgres establecida');
      return;
    } catch (error) {
      logger.warn(
        { intento, reintentos, error: error.message },
        `Postgres no responde, reintentando en ${esperaMs} ms`
      );
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
  throw new Error('No se pudo conectar a la base de datos tras múltiples intentos.');
};

const iniciar = async () => {
  // Sin un JWT_SECRET válido no se puede firmar ninguna sesión: mejor no arrancar.
  configAuth();
  await esperarBaseDeDatos();
  // El esquema se actualiza antes de aceptar tráfico: si una migración falla,
  // el backend no arranca y el healthcheck lo marca como caído.
  await aplicarMigraciones({ log: (mensaje) => logger.info(mensaje) });
  await asegurarAdminInicial({ log: (mensaje) => logger.info(mensaje) });
  app.listen(PORT, () => {
    logger.info({ puerto: PORT }, 'API escuchando');
  });
};

iniciar().catch((error) => {
  logger.fatal({ err: error }, 'Error fatal durante el arranque');
  process.exit(1);
});

// ---- Apagado ordenado ----
const cerrar = async (signal) => {
  logger.info({ signal }, 'Apagando: cierro las conexiones con Postgres');
  try {
    await pool.end();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => cerrar('SIGINT'));
process.on('SIGTERM', () => cerrar('SIGTERM'));
