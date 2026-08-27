# Panadería · Gestión Interna

Sistema cliente-servidor para la gestión interna de una red de panaderías
(4 sucursales de venta/fábrica + 1 depósito central): pedidos de productos entre
sucursales y control de stock de insumos.

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

## Desarrollo fuera de Docker

```bash
# Backend (necesita un Postgres en localhost:5432)
cd backend && npm install && cp .env.example .env && npm run dev

# Frontend (proxy de /api a http://localhost:3000)
cd frontend && npm install && npm run dev
```

## Roadmap

- [ ] Máquina de estados del pedido (`PENDIENTE → EN_PREPARACION → DESPACHADO → ENTREGADO`) con validación de transiciones
- [ ] Descontar stock de insumos al despachar un pedido (receta producto → insumos)
- [ ] Stock por sucursal (hoy el stock es global)
- [ ] Autenticación y roles (depósito vs sucursal)
- [ ] Tests (backend + frontend)
