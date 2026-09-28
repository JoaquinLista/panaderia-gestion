# La Fueguina Stats

Sistema de gestión para La Fueguina SRL: 4 sucursales (Viedma/Chacra, que además es
la cuadra de producción, Estrada, Café y Patagonia) y el Galpón Central.

El MVP (v1.0) digitaliza el **cierre de caja diario**, los **gastos y retiros de socios**
y un **dashboard para los dueños** en el celular. El código actual de pedidos entre
sucursales e insumos es la base de la fase 2 (galpón y chofer).

Cómo trabajamos: [`CONTRIBUTING.md`](CONTRIBUTING.md). Decisiones de diseño:
[`decisiones.md`](decisiones.md).

> Proyecto personal. Nació como la app del TP2 de Ingeniería del Software 3
> (repo de la materia: `JoaquinLista/insgsoft3-tp01`) y sigue acá su desarrollo
> propio. `decisiones.md` / `evidencias.md` quedan como registro de ese origen.

| Servicio | Tecnología | Puerto | Rol |
|----------|------------|--------|-----|
| `db` | PostgreSQL 15-alpine (imagen oficial) | interno | Persistencia |
| `backend` | Node 22 + Express (ES Modules), 3 capas | 3000 | API REST |
| `frontend` | React 18 + Vite → Nginx alpine | 80 | SPA + proxy `/api` |

```
navegador ─▶ frontend (Nginx :80) ──/api/──▶ backend (Express :3000) ──▶ db (Postgres :5432)
```

## Arranque

Requisitos: Docker + Docker Compose.

```bash
git clone https://github.com/JoaquinLista/panaderia-gestion.git
cd panaderia-gestion
cp .env.example .env          # editá POSTGRES_PASSWORD
docker compose up -d --build
```

Abrir **http://localhost**.

### Verificar

```bash
docker compose ps                       # db y backend "healthy", frontend "running"
curl -s http://localhost/api/health     # {"status":"ok","db":"up"}
```

## API

Base `/api` — el frontend usa rutas relativas (proxy de Nginx).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servicio y de la base |
| GET | `/api/sucursales` | Lista de sucursales |
| GET | `/api/productos` | Catálogo de productos |
| GET | `/api/insumos` | Insumos con flag `bajo_stock` |
| POST | `/api/insumos` | Alta o actualización de stock (upsert por nombre) |
| GET | `/api/pedidos` | Pedidos con su detalle |
| POST | `/api/pedidos` | Alta de pedido con detalle (transaccional) |
| PUT | `/api/pedidos/:id/estado` | Cambia el estado del pedido validando la transición |

## Desarrollo fuera de Docker

```bash
# Backend (necesita un Postgres en localhost:5432)
cd backend && npm install && cp .env.example .env && npm run dev

# Frontend (proxy de /api a http://localhost:3000)
cd frontend && npm install && npm run dev
```

## Tests

```bash
cd backend && npm test          # o npm run test:coverage
cd frontend && npm test

# Migraciones contra un Postgres real (crea y borra bases de prueba)
cd backend && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:integracion
```

`npm run test:coverage` falla si la cobertura baja de **80%** (backend) o **70%**
(frontend). El pipeline de CI (`.github/workflows/ci.yml`) corre lo mismo en cada PR,
construye las imágenes Docker y hace un smoke test del sistema levantado.

## Base de datos y migraciones

El esquema vive en `backend/migrations/` como archivos SQL numerados
(`0001_esquema-inicial.sql`, `0002_datos-iniciales.sql`, …). El backend aplica las
pendientes **al arrancar**, antes de aceptar requests; las ya aplicadas quedan
registradas en la tabla `pgmigrations` y no se repiten.

```bash
cd backend
npm run migrate:nueva -- nombre-del-cambio   # crea migrations/<timestamp>_nombre-del-cambio.sql
npm run migrate                              # aplica las pendientes a mano
```

Cada archivo tiene una sección `-- Up Migration` y otra `-- Down Migration`. Una
migración que ya llegó a `main` no se edita: si hay que corregirla, se agrega otra.

Los tests del backend no necesitan base de datos: la capa `config/db.js` se reemplaza
por un doble de prueba. La app Express vive en `src/app.js` (sin `listen`) para poder
probarla con Supertest; `src/index.js` sólo la arranca.

## Roadmap

Cada sprint dura una semana y termina con algo demostrable.

- [x] **Sprint 0 — Fundaciones:** templates de issues y PR, `CONTRIBUTING.md`, ESLint + Prettier, Vitest con primeros tests, Dependabot, sucursales reales.
- [x] **Sprint 1 — CI + tests con umbral:** GitHub Actions (lint, formato, tests, build, Docker + smoke test), coverage mínimo (80% backend, 70% frontend) que bloquea el merge.
- [ ] **Sprint 2 — Login y roles:** admin (dueños), empleada (elige sucursal al entrar), chofer (opera el galpón), permiso de cierre de caja. Migraciones versionadas ✅.
- [ ] **Sprint 3 — Cierre de caja:** formulario mobile por sucursal (Z, efectivo, posnet, QR, gastos locales).
- [ ] **Sprint 4 — Contenedores en el pipeline + e2e:** imágenes en GHCR, escaneo Trivy, Playwright contra el compose.
- [ ] **Sprint 5 — Gastos y retiros de socios.**
- [ ] **Sprint 6 — IaC + CD:** Terraform, environments staging y producción con aprobación, blue-green.
- [ ] **Sprint 7 — Dashboard ejecutivo.**
- [ ] **Sprint 8 — DevSecOps, observabilidad y feedback continuo.** Release v1.0.
- [ ] **Fase 2 — Galpón, pedidos y chofer:** evoluciona el módulo de pedidos e insumos existente (máquina de estados ya implementada).
