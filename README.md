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
| `db` | PostgreSQL 15-alpine (imagen propia con schema + seed) | interno | Persistencia |
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
```

Los tests del backend no necesitan base de datos: la capa `config/db.js` se reemplaza
por un doble de prueba. La app Express vive en `src/app.js` (sin `listen`) para poder
probarla con Supertest; `src/index.js` sólo la arranca.

## Roadmap

Cada sprint dura una semana y termina con algo demostrable.

- [x] **Sprint 0 — Fundaciones:** templates de issues y PR, `CONTRIBUTING.md`, ESLint + Prettier, Vitest con primeros tests, Dependabot, sucursales reales.
- [ ] **Sprint 1 — CI + tests con umbral:** GitHub Actions (lint, tests, build), coverage mínimo que bloquea el merge.
- [ ] **Sprint 2 — Login y roles:** dueña/socio, empleada de sucursal, galpón, chofer. Migraciones versionadas.
- [ ] **Sprint 3 — Cierre de caja:** formulario mobile por sucursal (Z, efectivo, posnet, QR, gastos locales).
- [ ] **Sprint 4 — Contenedores en el pipeline + e2e:** imágenes en GHCR, escaneo Trivy, Playwright contra el compose.
- [ ] **Sprint 5 — Gastos y retiros de socios.**
- [ ] **Sprint 6 — IaC + CD:** Terraform, environments staging y producción con aprobación, blue-green.
- [ ] **Sprint 7 — Dashboard ejecutivo.**
- [ ] **Sprint 8 — DevSecOps, observabilidad y feedback continuo.** Release v1.0.
- [ ] **Fase 2 — Galpón, pedidos y chofer:** evoluciona el módulo de pedidos e insumos existente (máquina de estados ya implementada).
