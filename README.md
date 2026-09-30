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
| POST | `/api/reportes` | Reportar un problema: `{ que_paso, esperado?, seccion?, version? }`. Cualquier sesión; abre un issue en GitHub si hay `GITHUB_TOKEN_REPORTES` (máx. 10 por hora por persona) |
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
| `BACKEND_URL` | frontend | Dónde está el backend (por defecto `http://backend:3000`; en Azure `https://` + la dirección de la app `<ambiente>-api`). El DNS para resolverla se toma del contenedor. |
| `CLAVE_INTERNA` | frontend y backend | Sólo en Azure (la genera Terraform). Nginx la manda en cada request y el backend contesta 404 a quien no la trae, salvo `/api/health`. Vacía, no se usa. |

## Infraestructura en Azure

La app en la nube se describe con Terraform en [`infra/`](infra/README.md): cómo se crea, cómo se conecta
GitHub con Azure y qué hace el pipeline de infraestructura.

## Despliegue (staging y producción)

Cada merge a `main` con el CI en verde se despliega solo con el workflow **Desplegar**:

1. **Staging:** se actualiza primero el backend y después la pantalla. Azure levanta la versión nueva,
   espera que conteste y recién ahí apaga la vieja, así que no hay cortes. Se espera que `/api/health`
   conteste con el SHA del commit y se corren las pruebas de sesión de Playwright.
2. **Producción:** GitHub pide la aprobación del ambiente `produccion` (*Actions → Desplegar → Review deployments*).
   Se despliegan exactamente las mismas imágenes. Si la versión nueva no contesta bien, vuelve sola a la anterior.

Cada ambiente son dos apps en Azure: `lafueguina-<ambiente>` (la pantalla, pública) y
`lafueguina-<ambiente>-api` (el backend, que sólo le contesta a la pantalla).

**Volver atrás:** *Actions → Volver a la versión anterior → Run workflow* y elegir el ambiente. Vuelve a
desplegar las imágenes de la versión anterior (tarda un par de minutos). Correrlo otra vez deshace la vuelta atrás.

**Desplegar una versión puntual:** *Actions → Desplegar → Run workflow* con el SHA completo del commit.

La lógica está en `infra/scripts/desplegar.sh` y se prueba sin Azure con
`bash infra/scripts/pruebas/desplegar.test.sh`.

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

## Seguridad

El workflow `.github/workflows/seguridad.yml` corre en cada PR, al mergear a main y
todos los lunes:

| Revisión | Qué busca | Frena con |
|----------|-----------|-----------|
| CodeQL | Errores de seguridad en el código JavaScript y en los workflows | Hallazgos de severidad alta (pestaña **Security** del repo) |
| `npm audit` | Dependencias con vulnerabilidades conocidas (backend, frontend, e2e) | Altas o críticas |
| gitleaks | Contraseñas, tokens o claves en los commits nuevos | Cualquier secreto |
| Trivy | Configuraciones inseguras en el Terraform de `infra/` | Altas o críticas (excepciones en `.trivyignore-infra`) |

Además, Trivy revisa las imágenes Docker en `ci.yml`, Dependabot abre los PR con
parches, el login tiene un límite de intentos y Nginx manda cabeceras de seguridad
(`frontend/cabeceras-seguridad.conf`): una Content-Security-Policy que sólo deja
cargar archivos de la propia app, y otras que impiden meter la app en otra página
o que el navegador adivine tipos de archivo. El smoke test del CI verifica que
estén, y la prueba e2e `seguridad.spec.js` recorre las secciones y falla si el
navegador bloquea algo.

Si gitleaks marca algo que no es un secreto (un valor de prueba), se agrega el
comentario `gitleaks:allow` al final de esa línea.

## Observabilidad

**Logs.** El backend escribe una línea JSON por evento (con [pino](https://getpino.io)):
hora, nivel, mensaje y, en cada request, método, ruta, código, duración y el id
del request. Nginx genera ese id y la API lo devuelve en la cabecera `X-Request-Id`:
si alguien reporta un error, con el id se encuentra su línea. La cookie de sesión
y las contraseñas nunca se escriben. El nivel se cambia con `LOG_LEVEL`
(`info` por defecto; `debug`, `warn`, `error` o `silent`).

```bash
docker compose logs backend --no-log-prefix | jq 'select(.level >= 40)'   # sólo avisos y errores
```

**Métricas.** `GET http://localhost:3000/metrics`, en el formato de Prometheus:

| Métrica | Qué mide |
|---------|----------|
| `lafueguina_http_duracion_segundos` | Tiempo de respuesta de la API por método, ruta (`/api/cierres/:id`) y código |
| `lafueguina_http_errores_total` | Respuestas 5xx |
| `lafueguina_cierre_cargado_hoy` | 1 si el cierre de hoy de esa sucursal y turno está cargado, 0 si falta (KPI 1) |
| `lafueguina_process_*`, `lafueguina_nodejs_*` | Memoria, CPU y event loop del backend |

`/metrics` está fuera de `/api` a propósito: Nginx no lo reenvía, así que desde
internet no se ve.

**Tablero y alertas.** Prometheus y Grafana vienen en el compose, apagados por
defecto:

```bash
docker compose --profile monitoreo up -d
```

- **Grafana:** http://localhost:3001 (usuario `admin`, contraseña `GRAFANA_PASSWORD`
  del `.env`, o `admin` la primera vez). Abre directo en el tablero **La Fueguina**:
  los cierres de hoy en verde o rojo, las alertas activas, pedidos por minuto,
  tiempo de respuesta, errores y memoria.
- **Prometheus:** http://localhost:9090 (pestaña *Alerts*).

Las alertas están en `monitoreo/prometheus/alertas.yml`:

| Alerta | Cuándo suena |
|--------|--------------|
| `CierreDeLaNocheSinCargar` | Son más de las 21:30 y una sucursal no cargó el cierre de la noche (hasta las 23:59) |
| `BackendCaido` | Prometheus no puede leer el backend durante 2 minutos |
| `MuchosErrores` | Más del 5 % de las respuestas son 5xx durante 5 minutos |

El CI prueba las alertas con horarios simulados (`promtool test rules
alertas.test.yml`) y levanta Prometheus y Grafana para verificar que leen al
backend y cargan el tablero. Para apagar todo: `docker compose --profile monitoreo down`.

### Métricas DORA

El workflow **Métricas DORA** (`.github/workflows/dora.yml`) corre los lunes y a
mano (*Actions → Métricas DORA → Run workflow*). Calcula, para los últimos 30 días:

| Métrica | Cómo se mide acá |
|---------|------------------|
| Frecuencia de despliegue | Despliegues a producción que terminaron bien, por semana. Mientras no haya producción, los merges a main |
| Lead time | Mediana desde el primer commit de un PR hasta que llegó a producción (o al merge) |
| Tasa de fallas | Despliegues cuyo CI en main dio rojo o que tuvieron que volver atrás |
| Tiempo de recuperación | Mediana desde que main se pone rojo hasta la siguiente corrida verde |

El informe queda en el resumen de la corrida y en el artefacto `dora.json`. En la
compu: `GITHUB_REPOSITORY=JoaquinLista/panaderia-gestion node herramientas/dora/reporte.mjs 30`.

### Reportar un problema

Al pie del menú, cualquier persona puede contar qué no anduvo. El reporte se
guarda en la tabla `reportes_problema` con quién, desde qué sección y qué versión.
Si el backend tiene `GITHUB_TOKEN_REPORTES`, además abre un issue con la plantilla
de bug y las etiquetas `bug` y `reportado-desde-la-app`. El repo es público: el
issue lleva el rol y la sección, nunca el nombre de la persona. Máximo 10 reportes
por hora por persona.

Para crear el token: GitHub → Settings → Developer settings → Fine-grained tokens →
*Generate new token*, sólo el repositorio `panaderia-gestion`, permiso **Issues:
Read and write**. Va en el `.env` (y en Azure, como secreto de la app).

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
- [x] **Sprint 2 — Login y roles:** admin (dueños), empleada (elige sucursal al entrar), chofer (opera el galpón), permiso de cierre de caja. Migraciones versionadas ✅.
- [x] **Sprint 3 — Cierre de caja:** formulario mobile por sucursal (Z, efectivo, posnet, QR, gastos locales).
- [x] **Sprint 4 — Contenedores en el pipeline + e2e:** imágenes en GHCR, escaneo Trivy, Playwright contra el compose.
- [x] **Sprint 5 — Gastos y retiros de socios.**
- [x] **Sprint 6 — IaC + CD:** Terraform, environments staging y producción con aprobación, despliegue sin cortes y vuelta atrás.
- [x] **Sprint 7 — Dashboard ejecutivo.**
- [ ] **Sprint 8 — DevSecOps, observabilidad y feedback continuo.** Release v1.0.
- [ ] **Fase 2 — Galpón, pedidos y chofer:** evoluciona el módulo de pedidos e insumos existente (máquina de estados ya implementada).
