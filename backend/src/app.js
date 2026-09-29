/**
 * Aplicación Express (sin arrancar el servidor).
 *
 * Se separa de index.js para que los tests puedan importar la app y hacerle
 * requests con Supertest sin abrir un puerto ni esperar a la base de datos.
 */
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import pool from './config/db.js';
import { confianzaEnProxy, versionActual } from './config/servidor.js';
import authRoutes from './routes/authRoutes.js';
import usuariosRoutes from './routes/usuariosRoutes.js';
import cierresRoutes from './routes/cierresRoutes.js';
import cajaCentralRoutes from './routes/cajaCentralRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import { requerirSesion } from './middlewares/autenticacion.js';
import sucursalesRoutes from './routes/sucursalesRoutes.js';
import insumosRoutes from './routes/insumosRoutes.js';
import pedidosRoutes from './routes/pedidosRoutes.js';
import productosRoutes from './routes/productosRoutes.js';

const app = express();

// El backend corre detrás de Nginx (y en Azure, además, detrás de la entrada de
// Container Apps). Se confía en X-Forwarded-For sólo para esos proxies: así el
// límite de intentos de login cuenta por la IP real del celular.
app.set('trust proxy', confianzaEnProxy(process.env));

// ---- Middlewares globales ----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---- Healthcheck ----
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      db: 'up',
      version: versionActual(process.env),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      db: 'down',
      version: versionActual(process.env),
      error: error.message,
    });
  }
});

// ---- Sesión ----
app.use('/api/auth', authRoutes);

// ---- Rutas de negocio ----
// La lista de sucursales es pública: la pantalla de login la necesita para que
// la empleada elija dónde trabaja hoy. Todo lo demás pide sesión (401) y el
// permiso de cada acción (403).
app.use('/api/sucursales', sucursalesRoutes);
app.use('/api/insumos', requerirSesion, insumosRoutes);
app.use('/api/pedidos', requerirSesion, pedidosRoutes);
app.use('/api/productos', requerirSesion, productosRoutes);
app.use('/api/usuarios', requerirSesion, usuariosRoutes);
app.use('/api/cierres', requerirSesion, cierresRoutes);
app.use('/api/caja-central', requerirSesion, cajaCentralRoutes);
app.use('/api/dashboard', requerirSesion, dashboardRoutes);

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
