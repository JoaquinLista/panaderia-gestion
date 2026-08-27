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

Base `/api` — el frontend usa rutas relativas (proxy de Nginx). Salvo `/api/health`
y `/api/auth/login`, todas las rutas requieren sesión (cookie httpOnly). Algunas
además exigen un rol (ver **Usuarios y roles**).

| Método | Ruta | Descripción | Requiere |
|--------|------|-------------|----------|
| GET | `/api/health` | Estado del servicio y de la base | — |
| POST | `/api/auth/login` | Inicia sesión, setea la cookie | — |
| POST | `/api/auth/logout` | Cierra la sesión | — |
| GET | `/api/auth/me` | Usuario de la sesión actual | sesión |
| GET | `/api/sucursales` | Lista de sucursales | sesión |
| GET | `/api/productos` | Catálogo de productos | sesión |
| GET | `/api/insumos` | Insumos con flag `bajo_stock` | sesión |
| POST | `/api/insumos` | Alta o actualización de stock (upsert por nombre) | `DEPOSITO` |
| GET | `/api/pedidos` | Pedidos con su detalle (unificado `item_*`) | sesión |
| POST | `/api/pedidos` | Alta de pedido `INSUMOS` o `PRODUCTOS` con detalle (transaccional) | `FABRICA` / `VENTA` |
| PUT | `/api/pedidos/:id/estado` | Cambia el estado (valida transición y rol); a `RECIBIDO` acepta `recepcion[]` con lo recibido por línea | según transición |

## Usuarios y roles

La red se opera con cuentas de rol único:

| Rol | Qué hace | Sucursal |
|-----|----------|----------|
| `DUENIO` | Acceso total, puede cualquier acción | — |
| `DEPOSITO` | Stock de insumos, prepara pedidos de insumos | Depósito Central |
| `FABRICA` | Pide insumos, prepara y despacha productos | Viedma |
| `VENTA` | Pide productos, confirma recepciones | un punto de venta |
| `CHOFER` | Marca los pedidos como despachados y entregados | — |

Transiciones de estado según rol: el **origen** prepara (`EN_PREPARACION`), el
**chofer** despacha y entrega (`DESPACHADO`, `ENTREGADO`), el **destino** confirma
(`RECIBIDO`) o cancela. El dueño puede forzar cualquier transición válida.

Usuarios semilla (contraseña `panaderia123`, sólo desarrollo):

`duenio1@panaderia.test` · `duenio2@panaderia.test` · `deposito@panaderia.test` ·
`viedma@panaderia.test` · `estrada@panaderia.test` · `patagonico@panaderia.test` ·
`elcafe@panaderia.test` · `chofer@panaderia.test`

## Desarrollo fuera de Docker

```bash
# Backend (necesita un Postgres en localhost:5432)
cd backend && npm install && cp .env.example .env && npm run dev

# Frontend (proxy de /api a http://localhost:3000)
cd frontend && npm install && npm run dev
```

## Roadmap

El objetivo es que los tres módulos dejen de ser CRUD aislado y modelen el flujo
real de la red: **Depósito Central → Viedma → puntos de venta**, con un chofer que
transporta y actores con permisos distintos (dueños, depósito, fábrica, venta,
chofer). Viedma es a la vez fábrica y punto de venta: pide insumos al depósito,
mantiene su propio stock (que baja al fabricar) y despacha productos a las otras
sucursales, además de vender al público. Una sucursal puede cumplir más de un rol.

### ✅ Fase 1 — Máquina de estados del pedido

- [x] Estados `PENDIENTE → EN_PREPARACION → DESPACHADO → ENTREGADO → RECIBIDO`, con `CANCELADO` desde los estados previos al despacho
- [x] Validación de transiciones y endpoint `PUT /api/pedidos/:id/estado`
- [x] Acciones de avance y cancelación en el frontend

### ✅ Fase 2 — Autenticación y roles

- [x] Login y sesión (JWT en cookie httpOnly, hash bcrypt)
- [x] Roles de usuario: dueño, depósito, fábrica, venta, chofer
- [x] Autorización por endpoint y en la UI
- [x] Cada transición de estado habilitada según el rol: el origen prepara, el chofer despacha y entrega, el destino confirma la recepción
- [ ] Pendiente para más adelante: roles múltiples por sucursal (Viedma como fábrica + venta), invitación de usuarios, recuperación de contraseña

### ✅ Fase 3 — Pedidos unificados y hoja de ruta del chofer

- [x] `pedidos.tipo` (`INSUMOS` | `PRODUCTOS`), con el detalle apuntando a insumo o a producto (`CHECK` XOR)
- [x] Validación de origen/destino y de quién crea (insumos: depósito → fábrica, lo pide la fábrica; productos: fábrica → venta, lo pide la venta)
- [x] Formulario de nuevo pedido rol-aware (fábrica pide insumos, venta pide productos, dueño elige todo)
- [x] Hoja de ruta del chofer: pedidos para retirar y en camino, con las acciones de estado
- [x] Recepción: al confirmar se registra `cantidad_recibida` por línea (diferencias contra lo pedido)

### Fase 4 — Stock de insumos por bolsa

- [ ] Presentación por insumo (kg por bolsa); el stock se cuenta en bolsas cerradas
- [ ] Stock por ubicación, sólo en Depósito Central y Viedma
- [ ] Ingreso de bolsas al depósito (compra a proveedor)
- [ ] La recepción de un pedido de insumos suma stock en Viedma; el despacho lo resta en el depósito
- [ ] Acción "abrir bolsa" en Viedma (descuenta una bolsa) y alerta de pocas bolsas

### Fase 5 — Receta y producción

- [ ] Receta producto → insumos (en kg, como referencia)
- [ ] Registro de tandas de producción

### Fase 6 — Tests

- [ ] Backend: máquina de estados, movimientos de stock, validaciones
- [ ] Frontend: componentes y flujos
- [ ] End-to-end de los flujos críticos
