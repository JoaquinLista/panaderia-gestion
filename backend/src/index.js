import dotenv from 'dotenv';

import app from './app.js';
import pool from './config/db.js';
import { configAuth } from './config/auth.js';
import { aplicarMigraciones } from './db/migrar.js';
import { asegurarAdminInicial } from './services/authService.js';

dotenv.config({ quiet: true });

const PORT = Number(process.env.PORT ?? 3000);

/**
 * Espera a que la base de datos esté disponible antes de aceptar tráfico.
 */
const esperarBaseDeDatos = async (reintentos = 15, esperaMs = 2000) => {
  for (let intento = 1; intento <= reintentos; intento += 1) {
    try {
      await pool.query('SELECT 1');
      console.log('[db] Conexión establecida.');
      return;
    } catch (error) {
      console.warn(
        `[db] Intento ${intento}/${reintentos} fallido (${error.message}). Reintentando en ${esperaMs} ms...`
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
  await aplicarMigraciones();
  await asegurarAdminInicial();
  app.listen(PORT, () => {
    console.log(`[server] API escuchando en http://0.0.0.0:${PORT}`);
  });
};

iniciar().catch((error) => {
  console.error('[server] Error fatal durante el arranque:', error);
  process.exit(1);
});

// ---- Apagado ordenado ----
const cerrar = async (signal) => {
  console.log(`[server] Señal ${signal} recibida. Cerrando pool de conexiones...`);
  try {
    await pool.end();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => cerrar('SIGINT'));
process.on('SIGTERM', () => cerrar('SIGTERM'));
