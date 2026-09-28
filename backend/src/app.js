/**
 * Aplicación Express (sin arrancar el servidor).
 *
 * Se separa de index.js para que los tests puedan importar la app y hacerle
 * requests con Supertest sin abrir un puerto ni esperar a la base de datos.
 */
import express from 'express';
import cors from 'cors';

import pool from './config/db.js';
import sucursalesRoutes from './routes/sucursalesRoutes.js';
import insumosRoutes from './routes/insumosRoutes.js';
import pedidosRoutes from './routes/pedidosRoutes.js';
import productosRoutes from './routes/productosRoutes.js';

const app = express();

// ---- Middlewares globales ----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Healthcheck ----
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'degraded', db: 'down', error: error.message });
  }
});

// ---- Rutas de negocio ----
app.use('/api/sucursales', sucursalesRoutes);
app.use('/api/insumos', insumosRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/productos', productosRoutes);

// ---- 404 ----
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// ---- Manejo global de errores ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  if (status >= 500) {
    console.error('[error]', err);
  }
  res.status(status).json({
    error: err.message ?? 'Error interno del servidor',
  });
});

export default app;
