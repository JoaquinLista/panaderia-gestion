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
cp .env.example .env          # completá POSTGRES_PASSWORD, JWT_SECRET y el admin inicial
docker compose up -d --build
```

Abrir **http://localhost**. El primer usuario es el admin de `ADMIN_USUARIO` /
`ADMIN_PASSWORD`: el backend lo crea al arrancar si todavía no hay ningún admin.

Usa los puertos 80 y 3000: si tenés levantado otro proyecto que los ocupe (por
ejemplo la versión del TP, `insgsoft3-tp01`), bajalo antes con `docker compose down`
en su carpeta.

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
| POST | `/api/auth/login` | Inicia sesión: `{ usuario, password, sucursalId? }` (la empleada elige la sucursal del día). Deja la cookie `sesion` |
| POST | `/api/auth/logout` | Cierra la sesión (borra la cookie) |
| GET | `/api/auth/me` | Usuario, sucursal del día y permisos de la sesión; 401 sin sesión |
| GET | `/api/sucursales` | Lista de sucursales |
| GET | `/api/productos` | Catálogo de productos |
| GET | `/api/insumos` | Insumos con flag `bajo_stock` |
| POST | `/api/insumos` | Alta o actualización de stock (upsert por nombre) |
| GET | `/api/pedidos` | Pedidos con su detalle |
| POST | `/api/pedidos` | Alta de pedido con detalle (transaccional) |
| PUT | `/api/pedidos/:id/estado` | Cambia el estado del pedido validando la transición |
| GET | `/api/usuarios` | Lista de usuarios (sólo admin) |
| POST | `/api/usuarios` | Alta: `{ usuario, nombre, password, rol, puedeCerrarCaja? }` (sólo admin) |
| PATCH | `/api/usuarios/:id` | Cambia `nombre`, `rol`, `puedeCerrarCaja` o `activo` (sólo admin) |
| PUT | `/api/usuarios/:id/password` | La dueña pone una contraseña nueva y se cortan las sesiones abiertas de ese usuario (sólo admin) |
| GET | `/api/cierres/hoy` | Turnos de hoy ya cerrados en la sucursal, los pendientes y el cambio fijo sugerido (la dueña pasa `?sucursal_id=`) |
| GET | `/api/cierres/categorias` | Categorías de gasto activas, en el orden de la planilla "Egresos de caja" |
| POST | `/api/cierres` | Carga el cierre de un turno; `409` si ese turno de hoy ya está cargado |
| GET | `/api/cierres` | Cierres filtrados por `sucursal_id`, `desde`, `hasta` (AAAA-MM-DD) y `a_revisar=true` (sólo admin) |
| GET | `/api/cierres/pendientes` | Qué sucursales todavía no cargaron cada turno de hoy (sólo admin) |
| GET | `/api/cierres/:id` | Un cierre con su historial de correcciones (sólo admin) |
| PUT | `/api/cierres/:id` | La dueña corrige fecha, turno, montos, gastos o comentario; cada cambio queda registrado (sólo admin) |
| GET | `/api/caja-central/resumen` | Saldo de la caja central y del banco al final del día, lo que entró de cada sucursal y lo que se movió (`?fecha=AAAA-MM-DD`, hoy si no viene; sólo admin) |
| GET | `/api/caja-central/movimientos` | Movimientos con el saldo después de cada uno. Filtros: `desde`, `hasta` (por defecto, el mes en curso), `cuenta`, `tipo`, `categoria_id`, `dueno_id` (sólo admin) |
| POST | `/api/caja-central/movimientos` | Carga un depósito, pago, retiro de un dueño, ajuste o saldo inicial (sólo admin) |
| DELETE | `/api/caja-central/movimientos/:id` | Anula un movimiento mal cargado: deja de contar pero queda registrado (sólo admin) |
| GET | `/api/caja-central/mensual` | Totales del mes por sucursal, por dueño y por categoría (`?mes=AAAA-MM`; sólo admin) |
| GET | `/api/caja-central/excel` | Descarga el Excel del mes (`?mes=AAAA-MM`) con las columnas de la planilla "Retiros" y una hoja de resumen (sólo admin) |
| GET | `/api/cierres/excel` | Descarga el Excel de los cierres con las columnas de "Egresos de caja"; mismos filtros que la lista, sin fechas el mes en curso (sólo admin) |
| GET | `/api/caja-central/duenos` | Dueños que pueden retirar plata (sólo admin) |
| GET | `/api/dashboard/dia` | Resumen de los dueños: lo vendido por sucursal y medio de pago y qué cierres faltan (`?fecha=AAAA-MM-DD`, hoy si no viene; sólo admin) |
| GET | `/api/dashboard/mes` | Acumulado del mes (hasta hoy si está en curso): ventas por sucursal y por día, gastos, retiros, resultado y comparación con los mismos días del mes anterior (`?mes=AAAA-MM`; sólo admin) |
| GET | `/api/dashboard/excel` | El resumen del mes en Excel: hoja "Resumen" comparada con el mes anterior y hoja "Ventas por día" con una columna por sucursal (`?mes=AAAA-MM`; sólo admin) |
| PUT | `/api/cierres/:id/revisado` | `{ revisado: true \| false }`: saca o vuelve a poner el cierre en "a revisar" (sólo admin) |

**Sesión y permisos:** salvo `/api/health`, `/api/sucursales` (la usa la pantalla de
login) y el login, todas las rutas responden `401` sin sesión y `403` si el rol no
tiene permiso. La matriz está en `backend/src/domain/permisos.js`. La empleada sólo
ve los pedidos que salen de su sucursal del día o llegan a ella, y sólo crea
pedidos con origen en esa sucursal.

Respuesta de login y de `/me`:

```json
{
  "usuario": { "id": 2, "usuario": "lucia", "nombre": "Lucía", "rol": "EMPLEADA", "puedeCerrarCaja": false },
  "sucursal": { "id": 3, "nombre": "Estrada", "tipo": "VENTA" },
  "permisos": ["sucursales:ver", "productos:ver", "pedidos:ver", "pedidos:crear"]
}
```

Cierre de caja (`POST /api/cierres`, permiso `caja:cerrar`). Montos en pesos, con
hasta dos decimales, como número o texto:

```json
{
  "turno": "NOCHE",
  "numero_z": 1532,
  "total_controlador": 485300,
  "efectivo_contado": 232500,
  "cambio_fijo": 20000,
  "debito": 100000,
  "credito": 68900,
  "qr": 92400,
  "gastos": [{ "categoria_id": 6, "detalle": "Sodero", "monto": 6000 }],
  "comentario": "opcional"
}
```

`turno` es `MEDIODIA` o `NOCHE`. Cada gasto lleva una categoría de
`/api/cierres/categorias`. `transferencias` es opcional (vale 0): ya no se usa,
pero un cierre viejo que la tenga la conserva. La fecha la pone el servidor (hoy, en hora de
Argentina) y la sucursal sale de la sesión: la empleada cierra su sucursal del día
y la dueña manda `sucursal_id`. La API calcula
`diferencia = (efectivo_contado − cambio_fijo) + debito + credito + qr + transferencias + gastos − total_controlador`
(negativa: falta plata). Un cierre con diferencia se guarda igual.

Caja central (`POST /api/caja-central/movimientos`, permiso `caja-central:administrar`):

```json
{ "tipo": "PAGO", "cuenta": "BANCO", "monto": 300000, "categoria_id": 6, "concepto": "Harina", "fecha": "2026-09-29" }
```

| `tipo` | Qué hace | Pide además |
|--------|----------|-------------|
| `SALDO_INICIAL` | Con cuánto arranca la cuenta (uno por cuenta) | `cuenta` |
| `DEPOSITO` | Pasa plata de la caja central al banco | nada: siempre sale de `CAJA` |
| `PAGO` | Sale de la cuenta | `cuenta`, `categoria_id` y `concepto` |
| `RETIRO_DUENO` | Un dueño se lleva plata | `cuenta` y `dueno_id` |
| `AJUSTE` | Diferencia de un arqueo; negativo si falta plata | `cuenta` y `concepto` |

`cuenta` es `CAJA` (caja central, efectivo) o `BANCO` (Banco Patagonia). La fecha es
opcional (hoy), no puede ser futura ni anterior al saldo inicial. Lo que entra de
cada sucursal no se carga: es el efectivo contado menos el cambio fijo de cada
cierre, y aparece en los movimientos como `RETIRO_SUCURSAL`.

Errores del login: `400` si faltan datos o la sucursal no es válida, `401` con el
mensaje genérico "Usuario o contraseña incorrectos" y `429` después de 5 intentos
fallidos en un minuto desde la misma IP.

## Variables para la nube

El `docker compose` de la compu no necesita ninguna de estas. Las usa el despliegue en Azure (Sprint 6).

| Variable | Contenedor | Para qué |
|----------|-----------|----------|
| `POSTGRES_SSL=true` | backend | Conectar a la base con SSL (Azure lo exige). |
| `TRUST_PROXY=2` | backend | Cuántos proxies hay adelante, para ver la IP real en el límite de intentos de login. |
| `APP_VERSION` | los dos | SHA del commit. Lo pone el pipeline al construir la imagen; se ve en `/api/health` y al pie de la pantalla. |
| `BACKEND_URL` | frontend | Dónde está el backend (por defecto `http://backend:3000`; en Azure `http://127.0.0.1:3000`). |
| `NGINX_RESOLVER` | frontend | DNS para resolver `BACKEND_URL` (por defecto el de Docker, `127.0.0.11`). |

## Infraestructura en Azure

La app en la nube se describe con Terraform en [`infra/`](infra/README.md): cómo se crea, cómo se conecta
GitHub con Azure y qué hace el pipeline de infraestructura.

## Despliegue (staging y producción)

Cada merge a `main` con el CI en verde se despliega solo con el workflow **Desplegar**:

1. **Staging:** la versión nueva arranca al lado de la actual, sin tráfico, en su propia dirección
   (`https://lafueguina-staging---verde…`). Se espera que `/api/health` conteste con el SHA del commit,
   se corren las pruebas de sesión de Playwright contra ella y recién ahí recibe todo el tráfico.
2. **Producción:** GitHub pide la aprobación del ambiente `produccion` (*Actions → Desplegar → Review deployments*).
   Se despliegan exactamente las mismas imágenes, con el mismo cambio de versión vieja a nueva.

Si algo falla antes de pasar el tráfico, nadie se entera: sigue andando la versión anterior.

**Volver atrás:** *Actions → Volver a la versión anterior → Run workflow* y elegir el ambiente. La versión
anterior sigue prendida, así que el cambio tarda segundos. Correrlo otra vez deshace la vuelta atrás.

**Desplegar una versión puntual:** *Actions → Desplegar → Run workflow* con el SHA completo del commit.

La lógica está en `infra/scripts/blue-green.sh` y se prueba sin Azure con
`bash infra/scripts/pruebas/blue-green.test.sh`.

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

# Migraciones y login contra un Postgres real (crea y borra bases de prueba)
cd backend && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:integracion
```

`npm run test:coverage` falla si la cobertura baja de **80%** (backend) o **70%**
(frontend). El pipeline de CI (`.github/workflows/ci.yml`) corre lo mismo en cada PR,
construye las imágenes Docker, hace un smoke test del sistema levantado y corre las
pruebas end-to-end.

### Pruebas end-to-end (Playwright)

Un Chromium del tamaño de un celular usa el sistema como una persona: la empleada
carga un cierre y la dueña lo revisa, el login rechaza una contraseña equivocada y
una empleada sin permiso no ve la caja. Necesitan el sistema levantado **con la base
vacía** (cada prueba crea sus usuarios con el admin inicial):

```bash
docker compose down -v && docker compose up -d --wait
cd e2e && npm ci && npx playwright install chromium
ADMIN_USUARIO=... ADMIN_PASSWORD=... npx playwright test   # los mismos del .env
```

Si una prueba falla en el CI, el reporte con capturas y la grabación paso a paso
queda en los artefactos de la corrida (`playwright-report`).

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
