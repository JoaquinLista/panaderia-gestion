# Decisiones

Documento acumulativo de la práctica de ISW3. Cada TP agrega su sección.

---

## TP1 — Git colaborativo

*(Completar con lo trabajado en el TP1: protecciones de rama configuradas, flujo de
PRs, convención de commits, etc. Si no se documentó en su momento, reconstruir acá
brevemente a partir del historial del repo.)*

---

## TP2 — Contenedores

### 1. Elección de la app del semestre

**App elegida:** *Red de Panaderías · Gestión Interna* — sistema cliente-servidor
para una red de panaderías (4 sucursales de venta/fábrica + 1 depósito central):
pedidos de productos entre sucursales y control de stock de insumos.

- **Backend:** Node 22 + Express (ES Modules), arquitectura en 3 capas
  (rutas → controladores → servicios → consultas SQL).
- **Frontend:** React 18 + Vite (SPA), servida por Nginx en producción.
- **Base:** PostgreSQL 15.

**Verificación previa (checklist de `elegir-app.md`) — a confirmar en la defensa:**

| # | Criterio | Estado |
|---|----------|--------|
| 1 | Corre localmente hoy | ✅ `docker compose up -d --build` levanta el sistema end-to-end (ver `evidencias.md`). |
| 2 | Comandos de build/arranque conocidos | ✅ backend `npm ci` / `node src/index.js`; frontend `npm ci` / `npm run build` (lo sirve Nginx). |
| 3 | Configuración de la base por variable de entorno | ✅ `backend/src/config/db.js` lee `POSTGRES_HOST/PORT/DB/USER/PASSWORD`; nada hardcodeado. |
| 4 | Lógica para testear (TP5: 8 back + 4 front) | ⚠️ **Pendiente de reforzar.** Reglas actuales: origen ≠ destino en un pedido, cantidad > 0 por ítem, upsert de insumo por nombre, cálculo de `bajo_stock` (`stock_actual < stock_minimo`), validación de estado del pedido contra la lista permitida. Son ~4. **Antes del TP5 hay que agregar** (previsto para TP2/TP3): máquina de estados del pedido (`PENDIENTE → EN_PREPARACION → DESPACHADO → ENTREGADO`, transiciones válidas/ inválidas) y descuento de stock al despachar (incluye el caso "stock insuficiente"). Frontend: el form de pedido no envía con datos inválidos, y el badge de bajo stock. |
| 5 | Se entiende lo suficiente para modificarla | ⚠️ **A cargo del alumno.** Ver sección "Uso de IA". |

**Tamaño:** 3 vistas (Pedidos, Stock/Insumos, Red de Sucursales), 7 endpoints.
Chico a propósito — la guía dice que más grande solo suma fricción.

### 2. Decisiones de contenerización

**Imágenes base**

| Servicio | Base | Por qué |
|----------|------|---------|
| backend build + runtime | `node:22-alpine` | Alpine = imagen chica; Node 22 = LTS actual, el que la app declara en `engines`. |
| frontend build | `node:22-alpine` | Misma toolchain para compilar la SPA. |
| frontend runtime | `nginx:1.27-alpine` | Servir estáticos + proxy `/api`. No hace falta Node en runtime. |
| db | `postgres:15-alpine` | Versión estable; imagen propia encima (ver abajo). |

**Multi-stage**

- **Backend:** etapa `deps` instala dependencias con `npm ci --omit=dev`; la etapa
  `runtime` solo copia `node_modules` + `src`. No viajan ni el cache de npm ni
  herramientas de build.
- **Frontend:** etapa `build` compila con Vite (`npm run build`); la etapa final es
  Nginx con el `dist/` copiado. **Node no llega a producción** — la imagen final es
  Nginx + estáticos, varias veces más chica y sin superficie de ataque de la toolchain.
- Orden de instrucciones: primero `COPY package*.json` + install, después `COPY` del
  código. Así, cambiar una línea de código no reinstala dependencias (cache de capas).

**Qué persiste y qué no**

- **Persiste:** los datos de Postgres, en el volumen nombrado `postgres_data`
  (`/var/lib/postgresql/data`). Sobrevive a `docker compose down`.
- **No persiste:** todo lo demás. Los contenedores son efímeros; se recrean sin pérdida.
- `docker compose down -v` borra también el volumen → la base vuelve a cero y se
  re-ejecuta el seed.

**Base de datos como imagen propia (`database/Dockerfile`)**

El schema + los datos semilla están en `database/init.sql`, que corre vía el
mecanismo `/docker-entrypoint-initdb.d` de la imagen oficial (solo la primera vez que
se inicializa el volumen, y es idempotente igual: `CREATE TABLE IF NOT EXISTS` +
`INSERT ... ON CONFLICT DO NOTHING`).

Se empaqueta en una **imagen propia** (`FROM postgres:15-alpine` + `COPY init.sql`)
en vez de montarlo como bind mount. Motivo: `docker-compose.registry.yml` tiene que
poder levantar el sistema **sin el código del repo**; si el `init.sql` fuera un bind
mount, el repo seguiría siendo necesario.

**Red y descubrimiento de servicios**

- Red bridge propia (`panaderias_net`). Los servicios se resuelven por nombre vía el
  DNS de compose: el backend usa `POSTGRES_HOST=db`, Nginx hace `proxy_pass` a
  `http://backend:3000`.
- **La SPA no puede usar el nombre `backend`**: el JS corre en el navegador, que está
  fuera de la red de compose. Por eso el frontend llama a rutas **relativas**
  (`/api/...`) y **Nginx** traduce ese prefijo hacia el backend. Ventaja extra: para
  el navegador todo es el mismo origen → no hay CORS que configurar.
- En `nginx.conf` el upstream va en una **variable** (`set $backend_api ...`) con
  `resolver 127.0.0.11`: así Nginx resuelve el nombre en cada request y no al
  arrancar. Con el nombre directo, el contenedor del frontend no puede levantar solo
  si el backend todavía no existe (`host not found in upstream`).

**Orden de arranque vs. disponibilidad**

- `depends_on` solo garantiza el **orden de arranque**, no que el servicio esté listo.
- `db` tiene `healthcheck` (`pg_isready`) y el backend depende de él con
  `condition: service_healthy` → espera a que Postgres **acepte conexiones** (y a que
  terminen los scripts de init).
- El backend también tiene `healthcheck` (`fetch` a `/api/health`) y el frontend
  depende de él como `service_healthy`.
- Defensa en profundidad: `backend/src/index.js` además reintenta la conexión al
  arrancar (15 intentos × 2 s) antes de escuchar.

**Secretos**

- `docker-compose.yml` **no** contiene la contraseña. Usa
  `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?...}` → si `.env` no está, compose falla
  con un mensaje claro en vez de arrancar con la variable vacía.
- `POSTGRES_DB` y `POSTGRES_USER` van literales: no son secretos.
- `.env` está en `.gitignore`; se commitea `.env.example` con un valor placeholder.
- En el TP4 estos secretos migran a la plataforma de CI.

**Puerto del backend:** 3000 (no 8080 como el sample .NET de la cátedra). Es el
puerto que escucha Express; el frontend nunca lo sabe (rutas relativas).

**Registry:** GitHub Container Registry (`ghcr.io`), imágenes públicas, tag `v0.1.0`.
Se eligió ghcr sobre Docker Hub porque la cuenta ya existe (la de GitHub del TP1),
las imágenes quedan junto al código, y en el TP7 Actions se autentica contra ghcr
sin secretos (con el `GITHUB_TOKEN` del workflow). Para publicar hizo falta un PAT
**classic** con `write:packages` (los fine-grained no funcionan con ghcr) y hacer
públicas las tres imágenes a mano (nacen privadas).

**Arquitectura:** las imágenes se construyeron en una PC Intel/AMD → sirven para
`linux/amd64`. Una máquina ARM recibiría `no matching manifest`. Se resuelve en el
TP7 con `docker buildx` (build multi-arch).

### 3. Problemas encontrados y cómo se resolvieron

| Problema | Causa | Solución |
|----------|-------|----------|
| `init.sql` no se re-ejecutaba al cambiarlo | Los scripts de `/docker-entrypoint-initdb.d` solo corren cuando el volumen se inicializa por primera vez. | Se asumió y se dejó el script **idempotente**. Para re-aplicar: `docker compose down -v`. |
| El registry compose necesitaba el repo | El `init.sql` estaba como bind mount. | Imagen propia de la base con el script adentro (`database/Dockerfile`). |
| Contraseña por defecto en el compose | `${POSTGRES_PASSWORD:-panaderias}` metía el secreto en el YAML. | Se cambió a `${POSTGRES_PASSWORD:?...}` (falla si falta). |
| `npm install` en el Dockerfile | No respeta el lockfile → builds no reproducibles. | `npm ci` (requiere `package-lock.json`, que se commitea). |
| La SPA no llegaba al backend con nombre de servicio | El JS corre en el navegador, fuera de la red de compose. | Rutas relativas `/api/` + `proxy_pass` de Nginx. |

### 4. Uso de IA

> Declaración exigida por el reglamento (§6) y el enunciado del TP2.

- **Qué se hizo con IA:** la **generación inicial completa** del código de la
  aplicación (backend Express con sus 3 capas, frontend React, `database/init.sql`),
  de los `Dockerfile` (backend, frontend, db), del `docker-compose.yml` /
  `docker-compose.registry.yml`, del `nginx.conf` y de la primera versión de este
  documento se hizo con **Claude (Claude Code)**, a partir de una especificación
  redactada por el alumno.
- **Herramienta:** Claude Code (agente que además ejecuta comandos: corrió
  `docker compose up`, probó los endpoints con `curl` y verificó el frontend).
- **Cómo se verificó:**
  - Build y arranque reales: `docker compose up -d --build` con los 3 servicios en
    `healthy` / `running` (ver `evidencias.md`).
  - Prueba funcional de cada endpoint (`GET`/`POST` de sucursales, productos, insumos,
    pedidos) y de los casos de error (origen = destino, stock negativo).
  - Prueba de persistencia (`down` / `up` / `down -v`).
  - Revisión línea por línea de los Dockerfiles y del compose contra la guía del TP2.
- **Pendiente del alumno antes de la defensa** (la regla es "si no lo podés explicar,
  no se aprueba"):
  - [ ] Poder explicar cada línea de los dos Dockerfiles y del compose.
  - [ ] Rehacer a mano el checklist de `elegir-app.md` (los 5 pasos, 20 min).
  - [ ] Agregar las reglas de negocio del criterio 4 (o dejar por escrito cuáles y en
        qué archivo van) — idealmente en el TP2/TP3.
  - [ ] Repasar las preguntas de ejemplo de la defensa (imagen vs contenedor, `CMD`
        vs `ENTRYPOINT`, `down` vs `down -v`, por qué multi-stage, por qué el
        healthcheck).

---

## La Fueguina Stats — Sprint 0: fundaciones (2026-09-28)

A partir del PRD de La Fueguina Stats el proyecto deja de ser sólo un TP y pasa a ser
un producto. Este sprint no agrega funcionalidades: prepara el terreno para que todo lo
que venga se construya con la misma disciplina.

### Por qué empezar por la plataforma y no por las features

Si primero hacemos el cierre de caja y después agregamos tests y pipeline, esos tests se
escriben "a posteriori" y cuestan el doble. Al revés, cada feature entra desde el día uno
con tests, lint y revisión. Es la idea central de DevOps: automatizar el camino a
producción antes de necesitarlo.

### Decisiones

| Tema | Decisión | Por qué |
|------|----------|---------|
| Framework de tests | **Vitest** en backend y frontend | Una sola herramienta y la misma sintaxis en los dos lados. Es nativa de ES Modules (el backend usa `"type": "module"`, que con Jest requiere configuración extra) y se integra con Vite. |
| Tests de API | **Supertest** sobre `src/app.js` | Se separó la app Express (`app.js`) del arranque del servidor (`index.js`). Así los tests hacen requests HTTP reales a la app sin abrir un puerto ni esperar a Postgres. |
| Base de datos en tests unitarios | Se reemplaza `config/db.js` con `vi.mock` | Los tests unitarios prueban reglas de negocio (validaciones, transiciones, rollback), no Postgres. Son rápidos y no dependen de nada externo. La base real se prueba en los e2e del Sprint 4. |
| Frontend | Helpers extraídos a `src/lib/` (`api.js`, `formato.js`) | Funciones puras fáciles de testear. `App.jsx` sigue grande; se va a partir en componentes al construir el cierre de caja. |
| Cobertura | Se mide (`npm run test:coverage`) pero todavía **sin umbral** | El umbral que bloquea el merge se activa en el Sprint 1, junto con el pipeline que lo hace cumplir. |
| Lint y formato | **ESLint 10** (flat config) + **Prettier** | ESLint encuentra errores; Prettier elimina las discusiones de estilo. `format:check` va a correr en el pipeline. |
| Reglas de hooks | Sólo `rules-of-hooks` y `exhaustive-deps` | El preset nuevo de `eslint-plugin-react-hooks` 7 marca patrones del código existente (`setState` en `useEffect`). Se corrigen al refactorizar `App.jsx`, no en este sprint. |
| Seguridad de dependencias | Vite 5 → 7, Vitest 4, `npm audit fix` en backend | `npm audit` quedó en **0 vulnerabilidades** en los dos paquetes (había avisos en `esbuild`, `qs` y `@vitest/mocker`). |
| Actualizaciones | **Dependabot** semanal para npm, Docker y GitHub Actions | Las versiones menores se agrupan en un solo PR para no saturar el tablero. |
| Planificación | Templates de **historia de usuario** y **bug** + template de PR | La historia pide persona del PRD y criterios de aceptación. El PR pide cómo se probó y enlazar el issue (trazabilidad requisito → código). |
| Forma de trabajo | `CONTRIBUTING.md`: rama corta, Conventional Commits, squash merge, definición de terminado | Historial legible y base para generar notas de release automáticas más adelante. |
| Sucursales | Viedma (Chacra), Estrada, Café, Patagonia y Galpón Central | Nombres reales del negocio. `init.sql` renombra las filas de bases viejas con `UPDATE` idempotentes. Viedma queda como `FABRICA`; su rol de venta se modela con los roles del Sprint 2. |

### Pendiente fuera del código (lo hace el dueño del repo en GitHub)

- Crear el tablero en **GitHub Projects** y asociarle los issues del backlog.
- Activar la **protección de `main`** (requerir PR y checks). Tiene más sentido en el
  Sprint 1, cuando exista el pipeline que genera esos checks.

---

## La Fueguina Stats — Sprint 1: CI y umbral de coverage (2026-09-28)

### El pipeline (`.github/workflows/ci.yml`)

```
PR o push a main
  ├─ test (backend)   npm ci → lint → formato → tests + coverage
  ├─ test (frontend)  npm ci → lint → formato → tests + coverage → build
  └─ docker           (si los dos anteriores pasan)
        docker compose build → up --wait → smoke test → down -v
```

| Decisión | Por qué |
|----------|---------|
| **GitHub Actions** | El pipeline vive en el repo como YAML (Pipelines as Code): se versiona, se revisa en PRs y cualquiera puede ver qué pasos corre. No hay que mantener un servidor de CI. |
| **Matrix** `backend` / `frontend` | Un mismo job definido una vez, dos ejecuciones en paralelo. Menos YAML repetido y feedback más rápido. `fail-fast: false` para ver los errores de los dos lados en la misma corrida. |
| **`npm ci`** con caché de npm | Instala exactamente lo del lockfile (builds reproducibles). La caché evita bajar todo en cada corrida. |
| **Umbral de coverage** en `vitest.config.js` / `vite.config.js` | El umbral vive en la configuración de tests, no en el YAML: el mismo comando falla en tu máquina y en el pipeline. Backend **80%**, frontend **70%** (líneas, sentencias, funciones y ramas). Se comprobó que con un umbral de 99.9% el comando termina con error. |
| Excluidos del coverage: `index.js`, `config/db.js`, `main.jsx` | Son arranque e infraestructura (abrir puerto, crear el pool de Postgres, montar React). Se prueban con el sistema levantado (job `docker` ahora, Playwright en el Sprint 4). Excluir lo que no tiene lógica evita escribir tests vacíos sólo para subir el número. |
| **Job `docker`** con smoke test | Verifica lo que los unit tests no ven: que las imágenes construyen, que los contenedores arrancan sanos (`--wait` usa los healthchecks del compose) y que el frontend llega al backend y el backend a la base. Es la semilla de los e2e del Sprint 4. |
| `permissions: contents: read` | Mínimo privilegio: el token del pipeline sólo puede leer el repo. Si una dependencia maliciosa corriera en CI, no podría pushear ni crear releases. |
| `concurrency` con `cancel-in-progress` | Si pusheás dos veces seguidas, la corrida vieja se cancela. Ahorra minutos y el check refleja siempre el último commit. |
| Resumen de coverage en el job | La tabla de cobertura aparece en la página de la corrida (Job Summary) y el HTML completo queda como artifact 14 días. |

### Tests nuevos

Para superar el umbral se testeó lo que faltaba, no se bajó la vara:

- Backend (52 tests, ~96%): endpoints de sucursales, productos e insumos (incluido el 500 cuando la base falla), validaciones del alta de insumos y el armado del detalle de pedidos.
- Frontend (30 tests, ~95%): tablero de pedidos (validaciones, alta con varios productos, avance y cancelación de estado con confirmación, errores del backend), stock de insumos (alerta de bajo stock, edición, validaciones, guardado) y red de sucursales. Se usa una API falsa en memoria (`src/test/apiFalsa.js`) y `@testing-library/user-event`, que simula clicks y tipeo como una persona.

### Lo que hace que el umbral "frene el merge"

El pipeline en rojo sólo avisa. Para que **bloquee**, `main` necesita una regla de
protección que exija los checks. Eso se configura en GitHub (Settings → Branches) y
queda documentado en `CONTRIBUTING.md`.

---

## La Fueguina Stats — Sprint 2 · PR 1: migraciones versionadas (#7)

Desglose completo del sprint: https://claude.ai/artifact/F3smy2Zoi6h7zNunhqkJFq

### Problema

El esquema vivía en `database/init.sql`, que Postgres ejecuta **sólo la primera vez**
que se crea el volumen. Cualquier cambio (por ejemplo, la tabla de usuarios del login)
obligaba a borrar la base o a correr SQL a mano en cada entorno. Con staging y
producción en el horizonte (Sprint 6), eso no escala.

### Decisiones

| Decisión | Por qué |
|----------|---------|
| **node-pg-migrate** con archivos **SQL** | Es la herramienta estándar para Postgres en Node y acepta migraciones en SQL plano, que se leen y revisan igual que el `init.sql` de antes. No hace falta aprender un ORM. |
| Numeradas `0001_`, `0002_`, … con `checkOrder` | El orden de aplicación es explícito. Si alguien agrega una migración "en el medio" de las ya aplicadas, falla en vez de aplicarse desordenada. |
| El backend migra **al arrancar**, antes de escuchar | Un solo paso de despliegue. Si una migración falla, el backend no arranca y el healthcheck lo marca: nunca corre código nuevo contra un esquema viejo. |
| Lock de Postgres (`advisoryLockMode: 'wait'`) | Si arrancan dos backends a la vez (blue-green, Sprint 6), uno migra y el otro espera. |
| 0001 y 0002 **idempotentes** | Bases creadas con el `init.sql` del TP2 se actualizan sin perder datos: los `CREATE ... IF NOT EXISTS` no pisan nada y los `UPDATE` renombran las sucursales. |
| Datos de referencia como migración (0002) | Las sucursales son datos reales del negocio, no de prueba: tienen que existir en todos los entornos. |
| `usuarios` (0003) sin sucursal | Las empleadas rotan y eligen la sucursal al iniciar sesión (definición del PM). Roles `ADMIN`, `EMPLEADA`, `CHOFER` + `puede_cerrar_caja`. Usuario único sin distinguir mayúsculas. |
| Se elimina `database/` | La base usa la imagen oficial `postgres:15-alpine`. `docker-compose.registry.yml` queda como snapshot de v0.1.0. |
| Una migración mergeada **no se edita** | Ya corrió en alguna base. Para corregirla se agrega otra. |

### Cómo se prueba

- **Unit** (`tests/unit/migrar.test.js`): parámetros del runner, log y que la conexión se libere aunque falle.
- **Integración** (`tests/integracion/migraciones.test.js`, `npm run test:integracion`): contra un Postgres real crea una base vacía y aplica todo, verifica que una segunda corrida no hace nada, y prueba el índice único y el CHECK de roles. Además crea una base con el `init.sql` del TP2 (fixture) con un pedido cargado, migra y comprueba que el pedido sigue ahí y las sucursales se renombraron.
- **CI**: job nuevo `Migraciones · Postgres real` con un servicio Postgres. El smoke test de Docker ahora valida también que el backend crea el esquema solo, porque la base arranca vacía.

## La Fueguina Stats — Sprint 2 · PR 2: login en el backend (#5)

### Contrato de la API

`POST /api/auth/login`, `POST /api/auth/logout` y `GET /api/auth/me`, documentados en
el README. Login y `/me` devuelven lo mismo: usuario, sucursal del día y lista de
permisos. Con eso Dev 2 arma la pantalla de login y la interfaz por rol sin esperar
al PR 3.

### Decisiones

| Decisión | Por qué |
|----------|---------|
| JWT (`jsonwebtoken`, HS256) en cookie `httpOnly`, `SameSite=Strict`, `Path=/api`, 12 h | El JavaScript de la página no puede leer la sesión y el navegador no la manda desde otros sitios. 12 h es un turno. |
| El token sólo guarda el id y la sucursal del día | Rol, permisos y si está activo se leen de la base en cada request: desactivar a alguien corta su sesión al instante, sin esperar a que venza. |
| Contraseñas con `scrypt` de `node:crypto`, salt propio y parámetros guardados en el hash | Sin dependencias nativas en la imagen alpine; los parámetros guardados permiten endurecerlos más adelante. |
| Mismo error y mismo tiempo de respuesta si el usuario no existe, la clave está mal o está desactivado | No se puede averiguar qué usuarios existen. Si el usuario no existe se verifica igual contra un hash ficticio. |
| 5 intentos fallidos por minuto por IP (`express-rate-limit`); los ingresos correctos no cuentan | Frena la fuerza bruta sin molestar a quien entra bien. `trust proxy` sólo acepta la IP que manda Nginx desde la red interna. |
| La empleada elige la sucursal al entrar; el galpón no se puede elegir | Las empleadas rotan y el galpón no tiene personal (definición del PM). Admin y chofer no tienen sucursal del día. |
| Matriz de permisos en `domain/permisos.js` desde este PR | `/me` ya devuelve los permisos. El PR 3 los hace cumplir en cada ruta. |
| Admin inicial con `ADMIN_USUARIO` / `ADMIN_PASSWORD` | Se crea sólo si no hay ningún admin. No hay contraseñas en el código ni en migraciones. |
| `JWT_SECRET` obligatorio (32+ caracteres) | Sin él el backend no arranca y el compose no levanta. En CI se genera uno descartable con `openssl rand -hex 32`. |
| `COOKIE_SECURE` configurable | En producción la cookie es `Secure` (sólo HTTPS). El compose local la apaga porque corre en `http://localhost`. |
| Las rutas de negocio todavía **no** piden sesión | Si se cerraran ahora, la app actual (sin pantalla de login) dejaría de funcionar en `main`. Se cierran en el PR 3, después de que entre la pantalla de login (PR 4). |

### Cómo se prueba

- **Unit**: contraseñas (hash, salt, hashes inválidos), matriz de permisos completa, configuración, y el servicio (tokens vencidos, con otro secreto o sin firma, usuario desactivado, admin inicial).
- **API** (`tests/api/auth.test.js`): login por rol, cookie con sus atributos, 400/401/429, `/me` con y sin cookie, sesión cortada al desactivar, logout.
- **Integración** (`tests/integracion/auth.test.js`): contra Postgres real crea el admin inicial una sola vez, entra sin distinguir mayúsculas y con una sucursal real.
- **CI**: el smoke test de Docker verifica el 401 sin sesión y que el admin inicial entra y `/me` responde con su rol.

## La Fueguina Stats — Sprint 2 · PR 4: pantalla de login (#5)

Se adelanta al PR 3 a propósito: primero tiene que existir la pantalla de login y
recién después se cierran las rutas de la API. Así `main` nunca queda con una app
que no puede entrar.

| Decisión | Por qué |
|----------|---------|
| `AuthProvider` consulta `/api/auth/me` al abrir la app | La cookie viaja sola: si la sesión sigue vigente (12 h), se entra directo sin volver a tipear. |
| Cualquier 401 de la API vuelve al login | `lib/api.js` dispara un evento y el `AuthProvider` borra la sesión. No hace falta revisar el 401 en cada pantalla. |
| La sucursal del día es un desplegable opcional, sin el galpón | El frontend no sabe el rol antes de entrar. "No aplica" para dueños y chofer; si una empleada lo deja así, el backend responde "Elegí la sucursal donde trabajás hoy". |
| Campos de 16 px y botón a lo ancho | Pensado para el celular: con menos de 16 px el navegador del teléfono hace zoom al tocar el campo. |
| La contraseña no se borra si el login falla | Si sólo faltaba la sucursal, la empleada no tiene que volver a escribirla. |
| `tienePermiso(sesion, accion)` en `auth/contexto.js` | Lo usa el PR 5 para mostrar sólo las pestañas y botones de cada rol. |

Tests nuevos: login de dueña y empleada, errores del backend, validación, sesión
abierta al recargar, cerrar sesión y volver al login ante un 401.

## La Fueguina Stats — Sprint 2 · PR 3: roles, permisos y usuarios (#6)

| Decisión | Por qué |
|----------|---------|
| `requerirSesion` por grupo de rutas en `app.js` y `permitir(accion)` en cada ruta | Se ve en un solo lugar qué pide sesión, y cada ruta dice qué permiso necesita. 401 = no entraste; 403 = entraste pero tu rol no puede. |
| `/api/sucursales` queda pública | La pantalla de login la necesita para que la empleada elija dónde trabaja. Los nombres de las sucursales no son un secreto. |
| El filtro por sucursal del día lo aplica la API | La empleada ve los pedidos que salen de su sucursal o llegan a ella, y sólo crea pedidos con origen en ella. Aunque alguien arme el request a mano, la API no le deja ver ni cargar otra cosa. |
| ABM de usuarios sólo para admin, sin borrar | Se desactiva en vez de borrar: los pedidos y cierres de caja quedan ligados a quien los cargó. |
| Un admin no puede cambiarse el rol ni desactivarse | Así el negocio nunca se queda sin nadie que pueda administrar. |
| Migración `0004`: columna `sesiones_desde` | Resetear la contraseña o desactivar a alguien corta sus sesiones abiertas (por ejemplo, si le robaron el celular). La hora sale del reloj del backend, el mismo que firma los tokens. |
| Si la dueña cambia su propia contraseña, recibe una sesión nueva | Se cortan sus otras sesiones, pero no la saca de la app donde está haciendo el cambio. |
| El permiso de cerrar caja sólo se guarda para empleadas | El admin ya puede y el chofer no (matriz aprobada por el PM). |

Tests de seguridad (T9, `tests/api/permisos.test.js`) con el login real:
todas las rutas protegidas dan 401 sin sesión y no tocan la base, cada rol recibe
403 donde corresponde, la empleada sólo ve y crea pedidos de su sucursal, un
usuario desactivado no entra y un token anterior al reseteo ya no vale. El smoke
test de Docker verifica el 401 de las rutas de negocio y que el admin las usa.

## La Fueguina Stats — Sprint 2 · PR 5: interfaz por rol y usuarios (#6)

| Decisión | Por qué |
|----------|---------|
| Cada pestaña declara el permiso que necesita y se muestra sólo si `/me` lo trae | Una sola fuente de verdad: la matriz del backend. Si mañana cambia un permiso, la pantalla se adapta sola. |
| Empleada: origen del pedido fijo en su sucursal del día; sin botones de estado | Es lo mismo que la API ya exige: la pantalla no ofrece lo que después se rechazaría. |
| Chofer: ve y mueve pedidos, sin formulario de alta | Según la matriz aprobada, no crea pedidos. |
| Pantalla de usuarios para la dueña | Alta, rol, permiso de caja (sólo empleadas), activar o desactivar y contraseña nueva. La dueña no puede cambiarse el rol ni desactivarse. |
| `App.jsx` separado en `src/pantallas/` | Tenía casi 700 líneas. Ahora cada pestaña es un archivo y `App.jsx` sólo arma la app. |
| Pestañas deslizables en el celular | Con 4 pestañas la página se ensanchaba en una pantalla de 390 px. |

La API sigue siendo la que decide: esconder un botón es comodidad, no seguridad.

## La Fueguina Stats — Sprint 3 · PR 1: API del cierre de caja (#8, #9)

Reglas del PM (2026-09-29): dos cierres por día (mediodía y noche), los gastos
locales se pagan con la plata de la caja, queda un cambio fijo que se deja
asentado, una diferencia se tolera pero se averigua, y la fecha es siempre hoy
porque cierran a las 21 h.

| Decisión | Por qué |
|----------|---------|
| Migración `0005`: `cierres_caja` y `cierre_gastos`, única por sucursal + fecha + turno | Si dos personas cargan el mismo turno a la vez, la base rechaza el segundo y la API responde 409 con un mensaje claro. |
| Plata en `NUMERIC(12,2)` y cuenta en centavos enteros (`domain/cuadre.js`) | Con decimales de punto flotante 0,10 + 0,20 no da 0,30: una caja que cuadra podría dar diferencia por un redondeo. Montos con más de dos decimales se rechazan. |
| Se carga todo el efectivo contado y el cambio fijo aparte | Es como lo hacen hoy: el cambio queda en la caja. La API lo resta y guarda los dos, así la dueña ve cuánto cambio se dejó. `/hoy` sugiere el cambio del último cierre. |
| La diferencia la calcula y guarda la API | El formulario no puede mandar otra. Guardarla sirve para listar rápido los cierres "a revisar" en el PR 3. |
| Un cierre con diferencia se guarda, con comentario opcional | El PM la tolera pero la quiere averiguar: la dueña la va a ver marcada (PR 3). |
| La fecha la pone el servidor en hora de Argentina (`domain/fecha.js`) | En la nube el servidor suele estar en UTC: a las 21 h de Viedma ya sería el día siguiente. La empleada no elige fecha; una fecha vieja la corrige la dueña. |
| La empleada cierra su sucursal del día; la dueña elige la sucursal; el galpón no tiene caja | Sigue la matriz del Sprint 2 (`caja:cerrar`). |
| La tabla de correcciones va en el PR 3 | Sólo se usa cuando la dueña edita; así este PR no deja tablas sin código. |

Cómo se prueba: `tests/unit/cuadre.test.js` (los ejemplos del desglose y los
centavos), `tests/unit/fecha.test.js` (servidor en UTC a las 21 h de Argentina),
`tests/api/cierres.test.js` (validaciones, sucursal, 409, rollback),
`tests/api/permisos.test.js` (401 sin sesión, 403 para chofer y empleada sin el
permiso) y `tests/integracion/cierres.test.js` contra Postgres real. El smoke
test de Docker carga un cierre y comprueba que un segundo del mismo turno da 409.

## La Fueguina Stats — Sprint 3 · PR 2: formulario de cierre de caja (#8, #9)

| Decisión | Por qué |
|----------|---------|
| Pestaña "Cierre de caja" primera para quien tiene `caja:cerrar` | Es lo que se usa todos los días y es el MVP del PRD. La dueña entra directo ahí. |
| La diferencia se ve en vivo con `src/lib/cuadre.js`, copia de `backend/src/domain/cuadre.js` con los mismos casos de prueba | Lo que ve quien carga es lo mismo que guarda la API, que igual la vuelve a calcular. |
| Los montos se escriben como en Argentina: "12.500,50", "12.000" o "12500" | Nadie tiene que pensar si va punto o coma. Si un monto no se entiende, el campo se marca en rojo con un ejemplo. |
| Teclado numérico (`inputMode="decimal"`) y campos de 16 px | En el celular aparece el teclado de números y el iPhone no hace zoom al tocar un campo. |
| Sólo se ofrecen los turnos de hoy que faltan; con los dos cerrados no hay formulario | Evita el 409 antes de que pase. |
| El cambio fijo viene sugerido del último cierre | Casi siempre es el mismo: un dato menos para escribir. |
| Con diferencia se puede enviar igual; el comentario es opcional | Regla del PM: se tolera pero se averigua. El aviso lo explica. |
| La dueña elige la sucursal; el galpón no aparece | Mismas reglas que la API. |

Tests: `src/lib/cuadre.test.js` (cuenta y lectura de montos) y
`src/pantallas/CierreCaja.test.jsx` (cuadra, faltan, sobran, montos inválidos,
gastos, 409, turnos ya cerrados, la dueña eligiendo sucursal). Los tests de
pedidos abren su pestaña, porque la dueña ahora entra al cierre de caja.

## La Fueguina Stats — Sprint 3 · PR 3: la dueña revisa y corrige cierres (#10)

| Decisión | Por qué |
|----------|---------|
| Permiso nuevo `caja:revisar`, sólo admin | La empleada que carga un cierre no puede editarlo después de enviarlo (#10). Cargar y revisar son permisos distintos. |
| Migración `0006`: `revisado_por` y `revisado_en` en el cierre, tabla `cierre_correcciones` | "A revisar" = tiene diferencia y nadie lo marcó revisado. Cada corrección guarda quién, cuándo, el valor anterior y el nuevo. |
| Corregir recalcula la diferencia en el servidor | Si la dueña agrega un gasto que faltaba, el cierre puede pasar a cuadrar solo. |
| Sólo se registran los campos que cambiaron; sin cambios responde 400 | El historial muestra lo que pasó de verdad, sin ruido. |
| La corrección se hace en una transacción con `SELECT … FOR UPDATE` | Si dos socios corrigen a la vez, el segundo espera y compara contra el valor ya corregido. |
| Mover un cierre a una fecha y turno que ya existen da 409 | La restricción única de la base sigue valiendo para las correcciones. |
| `GET /api/cierres/pendientes` por turno | La dueña ve de un vistazo qué sucursal no cerró el mediodía o la noche. El galpón no aparece. |
| Los filtros de la lista van como parámetros de SQL, nunca pegados al texto | Evita inyección SQL. Máximo 200 filas por consulta. |
| Pantalla "Revisión de cierres" con lista, filtros, detalle, historial y "Marcar revisado" | Pensada para el celular, con los mismos campos y la misma diferencia en vivo que el formulario de carga. |

Tests: `tests/api/revisionCierres.test.js` (validaciones y errores),
`tests/api/permisos.test.js` (403 para empleada y chofer en todas las rutas de
revisión), `tests/integracion/cierres.test.js` (lista, pendientes, corrección con
historial, 409 y revisado contra Postgres real) y
`frontend/src/pantallas/RevisionCierres.test.jsx`.

## La Fueguina Stats — Sprint 4 · PR 1: pruebas end-to-end (#11)

| Decisión | Por qué |
|----------|---------|
| Playwright en una carpeta propia, `e2e/` | Prueba el sistema entero desde afuera, como un usuario, no un paquete en particular. Tiene sus propias dependencias y Dependabot las revisa. |
| Chromium con la pantalla de un Pixel 7, en español y hora de Argentina | La app se usa desde el celular. La zona horaria del navegador coincide con la de las sucursales. |
| Corren en el mismo job que el smoke test, sobre el `docker compose` ya levantado | Construir y levantar todo de nuevo en otro job sumaría varios minutos. El nombre del check no cambia, así la protección de `main` sigue funcionando sin tocar la configuración. |
| Cada prueba crea sus usuarios por la API con el admin inicial | La base arranca vacía (`docker compose down -v`) y no hay datos de prueba metidos en las migraciones. |
| Los elementos se buscan por su texto, su etiqueta y su rol | Es como los encuentra una persona (y un lector de pantalla). Si un botón cambia de nombre, la prueba avisa. |
| Sin reintentos (`retries: 0`) | Una prueba que falla a veces es un bug, no mala suerte. Un reintento lo escondería. |
| Si falla, se guardan capturas y la grabación (trace) por 7 días | Se ve qué vio el navegador en el momento del error, sin reproducirlo. |

Flujos probados: la empleada carga un cierre que no cuadra y la dueña lo encuentra
entre los "a revisar" y lo marca revisado; contraseña equivocada; empleada sin
permiso de caja; cerrar sesión.

## La Fueguina Stats — Sprint 4 · PR 2: imágenes multi-arch, Trivy y GHCR (#11)

| Decisión | Por qué |
|----------|---------|
| Dos imágenes propias (backend y frontend) se construyen y publican; la de Postgres sólo se escanea | La historia habla de 3 imágenes, pero Postgres es la imagen oficial: publicar una copia sólo sumaría algo más que mantener. Escanearla sí sirve, porque es parte del sistema. |
| amd64 + arm64 con Docker Buildx y QEMU | amd64 es la PC o el servidor común; arm64 son los servidores ARM (más baratos en la nube) y las Mac con chip M. |
| Las etapas de compilación corren en la plataforma del CI (`--platform=$BUILDPLATFORM`) | Emular ARM es entre 5 y 10 veces más lento. El frontend compila a HTML/JS/CSS y el backend no tiene librerías con código nativo (verificado: ninguna trae `binding.gyp`, `.node` ni scripts de instalación), así que el resultado sirve igual para las dos plataformas. |
| La imagen del backend ya no trae npm, npx, yarn ni corepack | En producción sólo se corre `node`. Son herramientas con sus propias librerías que no se usan y que Trivy igual revisaría: menos superficie de ataque. |
| Trivy frena el pipeline sólo ante una vulnerabilidad **crítica con arreglo disponible**; las altas se muestran en el log | Si frenara por algo sin arreglo, el pipeline quedaría en rojo sin que podamos hacer nada. Decisión comunicada al PM. |
| Se escanea la imagen amd64 | Docker sólo puede cargar una plataforma para escanear, y la arm64 tiene los mismos paquetes. |
| En los PR se construye y escanea; sólo el push a `main` publica en GHCR | En el registro quedan sólo versiones que pasaron todo, y un PR (por ejemplo de Dependabot) no puede publicar nada. |
| Etiquetas: el SHA del commit y `main` | El SHA identifica exactamente qué código tiene la imagen (lo que va a usar el despliegue del Sprint 6); `main` apunta siempre a la última. |
| Permiso `packages: write` sólo en el job de imágenes | Mínimo privilegio: el resto del pipeline sigue sólo con lectura. |
| Caché de capas de Docker en GitHub Actions (`type=gha`) | La segunda construcción (multi-arch) reusa lo que ya construyó la de escaneo. |
| Excepción de Trivy para Postgres: CVE-2025-68121 (`.trivyignore-postgres`) | El primer escaneo encontró esa crítica en `gosu`, un programita de la imagen oficial compilado con una versión vieja de Go. La falla es en TLS y `gosu` sólo cambia de usuario al arrancar, no usa la red. No la podemos arreglar nosotros; la excepción vale sólo para Postgres, lleva el motivo escrito y se saca cuando salga una imagen oficial nueva. |

## La Fueguina Stats — Ajustes del cierre de caja después de la prueba del PM

| Decisión | Por qué |
|----------|---------|
| Los montos se muestran con puntos de miles y coma decimal mientras se escriben (`15.456,59`) | Pedido del PM: con `15000` es fácil poner un cero de más o de menos. Los puntos los pone el campo; los decimales van con coma y son dos como máximo. |
| Un solo campo "Posnet (débito, crédito y QR)" y ya no se piden transferencias | En las sucursales el mismo posnet cobra débito, crédito y QR, y no se reciben transferencias. La API sigue aceptando `transferencias` como opcional (vale 0) y un cierre viejo que las tenga las conserva al corregirlo. |
| "Sin diferencia" en lugar de "Cuadra" | En la panadería "la cuadra" es donde se produce: la palabra se prestaba a confusión. |

## La Fueguina Stats — Sprint 5 · PR 1: cierre con débito, crédito, QR y gastos con categoría

| Decisión | Por qué |
|----------|---------|
| Débito, crédito y QR vuelven a ser tres campos | La planilla "Egresos de caja" los anota por separado y el Excel que vamos a exportar tiene que salir igual. Aunque los cobre el mismo posnet, el ticket de cierre del posnet los separa. Confirmado por el PM. |
| La columna `posnet` pasa a llamarse `debito`, y se suman `credito` y `qr` | Lo cargado hasta ahora son datos de prueba; queda como débito. Si se vuelve atrás la migración, crédito y QR se suman al débito para no perder plata. |
| Cada gasto del cierre lleva una categoría (tabla `categorias_gasto`) | Son las columnas de la planilla: Personal, Supermercado, Carne, Gasoil, Bebidas, Proveedores, Servicios, Mantenimiento, Obra y Varios. Así el Excel sale por columna y la dueña ve en qué se gasta. Los gastos viejos quedan en "Varios". |
| Las categorías se desactivan, no se borran | Un gasto viejo conserva su categoría aunque ya no se ofrezca para gastos nuevos; al corregirlo, se sigue viendo. |
| El detalle del gasto sigue siendo obligatorio | La categoría dice el tipo; el detalle dice qué fue ("sodero", "bolsas"). |

## La Fueguina Stats — Sprint 5 · PR 2: API de la caja central (#12, #13)

| Decisión | Por qué |
|----------|---------|
| Lo que entra de cada sucursal no se guarda: se calcula de cada cierre (efectivo contado − cambio fijo) | Es la columna "Retiro" de la planilla. Si la dueña corrige un cierre, la caja central se actualiza sola y nunca hay dos números distintos para la misma plata. |
| Dos cuentas: `CAJA` (caja central, efectivo) y `BANCO` (Banco Patagonia) | Son las dos que aparecen en "Retiros". El depósito saca de la caja y pone en el banco en un solo movimiento. |
| Cinco tipos de movimiento: saldo inicial, depósito, pago, retiro de un dueño y ajuste | Cubren las columnas de la planilla. La obra es un pago con la categoría "Obra": así se suma igual que el resto de los gastos. |
| Saldo inicial, uno por cuenta; lo anterior no cuenta | El sistema no sabe cuánta plata había antes. La dueña carga una vez con cuánto arranca cada cuenta y los cierres anteriores a esa fecha no se suman (ya están en ese saldo). No se pueden cargar movimientos con fecha anterior. |
| El ajuste es el único monto que puede ser negativo, y pide motivo | Es para anotar la diferencia de un arqueo sin tocar lo ya cargado. |
| Un movimiento mal cargado se anula, no se borra | Deja de contar en los saldos pero queda quién y cuándo lo anuló. Son movimientos de plata: no se pierde nada. |
| Dueños en una tabla (Fernanda, Gabriel, Mary) | Comparten la cuenta de admin, así que no alcanza con saber quién está logueado: cada retiro elige quién se llevó la plata. Un dueño se puede desactivar y sus retiros viejos se siguen viendo. |
| El resumen del mes suma los gastos por categoría de las sucursales y de la caja central por separado | La planilla "Egresos de caja" tiene los de las sucursales y "Retiros", los grandes. Así se ven juntos y separados. |
| Permiso nuevo `caja-central:administrar`, sólo admin | Son los números del negocio y los retiros de la familia. |
| Los saldos se calculan en el servidor en centavos enteros, igual que el cuadre | Sin errores de redondeo. Con el volumen de una panadería (unos pocos movimientos por día) recalcular todo es instantáneo y más simple que guardar saldos. |

## La Fueguina Stats — Sprint 5 · PR 3: pantalla de la caja central

| Decisión | Por qué |
|----------|---------|
| Pestaña "Caja central" sólo para los dueños, en cuatro bloques: saldo de hoy, cargar un movimiento, movimientos del mes y resumen del mes | Es el orden en que se usa: mirar cuánto hay, anotar lo que salió y, cada tanto, revisar el mes. Todo en una columna para el celular. |
| El ajuste se carga con "Faltaba plata" o "Sobraba plata" y un monto positivo | Escribir un monto negativo en el celular es incómodo y fácil de errar. La pantalla le pone el signo. |
| El saldo inicial se ofrece sólo mientras falte cargar alguno, y si falta el de la caja el formulario arranca ahí | Se carga una sola vez. Después ya no molesta en la lista de opciones. |
| Anular pide confirmación en la misma fila | Evita anular con un toque sin querer. Las entradas de las sucursales no se anulan acá: se corrigen en el cierre. |
| Los montos llevan signo y color (verde entra, rojo sale) y cada fila muestra el saldo de la caja después | Es la columna del saldo de la planilla "Retiros", que es lo que la dueña ya sabe leer. |

## La Fueguina Stats — Sprint 5 · PR 4: descargar en Excel

| Decisión | Por qué |
|----------|---------|
| Dos planillas con las columnas que ya usan: "Retiros" (caja central del mes, con una hoja de resumen) y "Egresos de caja" (un renglón por cierre, una columna por categoría) | La familia sigue teniendo su Excel, pero armado solo, sin copiar a mano y sin `#REF!`. |
| El archivo lo arma la API con la librería `exceljs` | Es la librería más usada en Node para escribir `.xlsx` de verdad (fechas, formato de pesos, encabezado fijo). Un CSV perdería el formato y las hojas. |
| `uuid` forzado a la 11.1.1 con `overrides` | `exceljs` trae una versión de `uuid` con un aviso de seguridad moderado. La 11 es compatible y deja `npm audit` en cero. |
| Los montos van como números con formato `#,##0.00`, no como texto | Así se pueden sumar, filtrar y hacer gráficos en Excel o Google Sheets. |
| Los totales se calculan en centavos y se escriben como valor, no como fórmula | Se ven igual en Excel, LibreOffice y Google Sheets, y el test puede comprobarlos abriendo el archivo. |
| El Excel de cierres usa los filtros de la revisión (sucursal y fechas), pero no "a revisar" | El Excel es el registro completo del período. "A revisar" es sólo para trabajar la lista. |
| Sin límite de filas en el Excel de cierres | La lista en pantalla muestra hasta 200 cierres; un mes de cuatro sucursales pasa de 240. |


## La Fueguina Stats — Sprint 6 · PR 1: la app lista para la nube (#14)

| Decisión | Por qué |
|----------|---------|
| `POSTGRES_SSL=true` conecta con SSL y verifica el certificado | Azure Database for PostgreSQL no acepta conexiones sin cifrar. Se verifica el certificado (`rejectUnauthorized`) para no hablar con un servidor falso; el de Azure está firmado por autoridades que Node ya conoce. En el compose no hace falta: la base está en la red interna. |
| `TRUST_PROXY` configurable; en Azure vale `2` | En Azure hay dos proxies adelante del backend: la entrada de Container Apps y el Nginx del frontend. La entrada usa IPs que no son de red privada, así que con la regla de siempre todos los celulares parecerían la misma IP y el límite de intentos de login bloquearía a todos juntos. |
| La imagen lleva el SHA del commit (`APP_VERSION`) y se ve en `/api/health` y al pie de la pantalla | Con blue-green conviven dos versiones: hay que poder preguntar cuál contesta. También sirve para saber qué versión tiene cada ambiente sin entrar a Azure. |
| La configuración de Nginx es una plantilla (`nginx.conf.template`) con `BACKEND_URL` y `NGINX_RESOLVER` | La imagen oficial de Nginx completa las variables al arrancar. En el compose siguen siendo `http://backend:3000` y el DNS de Docker (valores por defecto del Dockerfile); en Azure los dos contenedores van juntos y el backend es `http://127.0.0.1:3000`. La misma imagen sirve para los dos lugares. |

## La Fueguina Stats — Sprint 6 · PR 2: infraestructura con Terraform (#14)

| Decisión | Por qué |
|----------|---------|
| Azure, con Azure for Students | Se activa con el mail de la facultad, sin tarjeta, y trae US$100 de crédito. AWS y Google Cloud piden tarjeta. |
| Azure Container Apps, una app por ambiente con los dos contenedores juntos | Corre las mismas imágenes de GHCR, da HTTPS sin configurar nada y trae "revisiones" con reparto de tráfico, que es lo que necesita el blue-green. Frontend y backend en la misma revisión cambian de versión juntos: nunca queda una pantalla nueva hablando con un backend viejo. |
| PostgreSQL Flexible Server B1ms, un servidor con dos bases (staging y produccion) | Es el tamaño más chico y Azure hace los backups. Dos servidores costarían el doble para cuatro sucursales. Las dos bases usan el usuario administrador; separar usuarios por ambiente queda para el Sprint 8 (seguridad). |
| La base acepta sólo servicios de Azure y siempre con SSL | Una red privada (VNet) es lo ideal pero cuesta más y complica el primer despliegue. Queda anotado para el Sprint 8. |
| `prevent_destroy` en el servidor y las bases | Un `terraform destroy` o un cambio que obligue a recrear el servidor borraría los datos de producción. Así Terraform se niega. |
| Las contraseñas las genera Terraform (`random_password`) y van como secretos de Container Apps | Nadie las elige ni las copia. Quedan también en el estado de Terraform, que está en una cuenta de almacenamiento privada con versiones. |
| GitHub entra a Azure con OIDC y una identidad administrada (no una "app registration") | No hay clave guardada que se pueda filtrar. La identidad administrada es un recurso más del grupo, así que funciona aunque la cuenta de la facultad no deje registrar aplicaciones. Sólo tiene permiso sobre `rg-lafueguina` y el estado. |
| Script de preparación en Cloud Shell, fuera de Terraform | Terraform necesita el lugar donde guardar su estado y el permiso para entrar antes de poder correr: eso lo crea el script, una sola vez, con los permisos del dueño de la cuenta. |
| Terraform no maneja la imagen ni el tráfico de las apps (`ignore_changes`) | Eso lo hace el workflow de despliegue en cada merge. Si no, cada `terraform apply` volvería a la versión inicial. |
| `terraform test` con proveedores de mentira | Se prueba que el plan tenga lo importante (SSL, secretos, dos ambientes, blue-green) en cada PR, sin cuenta de Azure. |
| Plan comentado en el PR; apply sólo al mergear y con aprobación del ambiente `infra` | Criterio de la historia #14: se ve qué cambia antes de aprobarlo y nada se aplica sin un humano. |

## La Fueguina Stats — Sprint 6 · PR 3: despliegue continuo blue-green (#14)

| Decisión | Por qué |
|----------|---------|
| Blue-green con las revisiones de Container Apps y tres etiquetas: `actual`, `anterior` y `verde` | La versión nueva (verde) arranca con 0 % del tráfico y su propia dirección. Se prueba ahí y el cambio es de golpe: nunca hay un rato con las dos mezcladas. La anterior queda prendida para volver en segundos. |
| El despliegue arranca cuando termina el CI en verde sobre `main` (`workflow_run`) | Las imágenes con el SHA las publica el CI: antes no hay nada para desplegar. Los PRs no despliegan. |
| La versión nueva tiene que contestar `/api/health` con su SHA antes de recibir tráfico | Así se sabe que arrancó, que aplicó las migraciones y que se conecta a la base, y que es de verdad la versión nueva y no la vieja. |
| En staging se corren sólo las pruebas e2e de sesión | La base de staging no se borra entre despliegues y las pruebas de cierre y caja central esperan una base vacía; esas ya corren en el CI con un Postgres nuevo. |
| En producción no se corren e2e: sólo health y que cargue la pantalla | Las pruebas crean usuarios y cierres: no se ensucian los datos reales. |
| Producción despliega el mismo SHA que pasó staging | Lo que se aprueba es exactamente lo que se probó. |
| Volver atrás es un workflow manual que intercambia `actual` y `anterior` | Es el caso de "algo anda mal y hay que salir ya": un botón, sin tocar la base ni reconstruir nada. En producción también pide aprobación. |
| Las migraciones sólo agregan (columnas, tablas), nunca borran ni renombran en el mismo despliegue | La versión nueva migra la base antes de recibir tráfico, y la vieja sigue usándola. Si hay que volver atrás, la vieja tiene que poder andar con la base nueva. Un borrado se hace en dos despliegues: primero se deja de usar, después se borra. |
| Todo va por la API de Azure con JSON Merge Patch (`az rest`) | Se cambian sólo las imágenes o el tráfico: los secretos y la configuración que puso Terraform no se tocan. |
| `blue-green.sh` se prueba en el CI con un `az` de mentira | Las reglas del tráfico (qué etiqueta va dónde, qué pasa si se reintenta, volver atrás dos veces) se prueban en cada PR sin cuenta de Azure. |
| Se apagan las revisiones más viejas que la anterior | No cobran y siguen guardadas: se pueden volver a prender desde el portal. |

## La Fueguina Stats — Sprint 7 · PR 1: API del resumen de los dueños (#15, #16)

| Decisión | Por qué |
|----------|---------|
| "Vendido" es el total del controlador fiscal (Z), sumando los dos turnos | Es el número oficial del día y ya está en cada cierre. |
| El efectivo vendido suma los gastos chicos pagados con la plata de la caja | Esa plata entró por ventas; que después se haya gastado no cambia lo que se vendió. Así efectivo + débito + crédito + QR da el Z (más o menos la diferencia del cierre). |
| Resultado = ventas − gastos (sucursales + caja central + obra) − retiros de los dueños | Criterio de la historia #16. Los depósitos no cuentan: pasan plata de la caja al banco, no la gastan. Los movimientos anulados tampoco. |
| La comparación es contra los mismos días del mes anterior | Comparar el 1 al 18 contra el mes anterior entero haría parecer malo cualquier mes a medio camino. Si el mes anterior es más corto, se corta en su último día. Un mes terminado se compara entero. |
| La variación es `null` si el mes anterior era cero | No hay porcentaje contra cero; la pantalla muestra "sin datos del mes anterior". |
| Un turno sin cierre cuenta como "falta cargar", no como venta cero | Para que un cierre olvidado no se lea como un día malo. |
| Todo se calcula al pedirlo, desde los cierres y la caja central | No hay tablas nuevas ni datos duplicados que se puedan desincronizar. Con cuatro sucursales, un mes son unos 240 cierres: se suman al instante. |
| Permiso nuevo `dashboard:ver`, sólo admin | Son los números de todo el negocio. |

## La Fueguina Stats — Sprint 7 · PR 2: pantalla "Resumen" (#15, #16)

| Decisión | Por qué |
|----------|---------|
| "Resumen" es la primera pestaña de los dueños | Es lo que abren para ver cómo va el negocio; el cierre de caja queda a un toque. Las empleadas y el chofer no la ven. |
| Arriba el día, abajo el mes, en una sola pantalla | En el celular se lee de corrido sin cambiar de pantalla. Cada parte tiene su propio selector de fecha. |
| Los cierres que faltan se muestran como aviso, con sucursal y turno ("Café: noche") | Un número bajo puede ser un cierre sin cargar, no un mal día. Si es hoy, aclara que el de la noche se carga a las 21. |
| Barras hechas con CSS, sin librería de gráficos | Son barras simples; una librería sumaría peso a la app para nada. El gráfico por día tiene una descripción para lectores de pantalla. |
| La variación se pinta verde o roja según qué es bueno | Que las ventas suban es bueno; que los gastos suban, no. Si no hay mes anterior dice "sin datos para comparar". |
| Prueba e2e: se carga un cierre del mediodía y el resumen lo muestra y marca la noche como pendiente | Es el recorrido completo: de la caja al número que ve la dueña. |

## La Fueguina Stats — Sprint 7 · PR 3: Excel del resumen del mes (#16)

| Decisión | Por qué |
|----------|---------|
| El Excel sale de los mismos cálculos que la pantalla (`resumenDelMes`) | Lo que se ve y lo que se baja dan siempre igual; no hay una segunda cuenta que se pueda desviar. |
| Dos hojas: "Resumen" (este mes, mes anterior y variación) y "Ventas por día" (una columna por sucursal y totales) | La primera es para leer; la segunda, para que el contador o la familia armen sus propios gráficos. |
| La variación va como porcentaje de Excel con signo (+10,0 %) y "sin datos" si el mes anterior era cero | Se puede usar en fórmulas, y no aparece un porcentaje inventado. |
| Google Sheets queda para cuando el negocio tenga su cuenta de Google | Sin esa cuenta no hay dónde sincronizar; el Excel ya se puede subir a Drive a mano. |

## La Fueguina Stats — Menú de secciones en columna

| Decisión | Por qué |
|----------|---------|
| En la compu, las secciones van en una columna fija a la izquierda | Pedido del PM: con las pestañas en fila no se veían todas y había que deslizar. En columna entran todas y el menú acompaña al bajar. |
| En el celular, un botón "☰" con el nombre de la sección abre la lista | Una columna al costado no entra en el ancho del celular. El botón dice dónde estás y la lista se cierra sola al elegir. |
| El menú es una `nav` "Secciones" y la sección activa lleva `aria-current` | Los lectores de pantalla anuncian el menú y la sección en la que estás. |
| Botones del menú grandes (64 px de alto, letra de 18 px en negrita, relleno de 14 × 20 px), separados y con borde; el activo en el marrón del logo con una barra amarilla a la izquierda | Pedido del PM: lo usan personas que no están acostumbradas a la compu. Cada sección se ve como un botón distinto y se reconoce por el dibujo. |
| Logo y colores de La Fueguina (marrón #5a261d y crema) en la cabecera, el login y el ícono de la pestaña | La app pasa a ser de la panadería. Los logos se guardan achicados en `frontend/public` (entre 2 y 44 KB). |
| Íconos de Lucide (SVG) simples, del mismo color que el texto, en vez de emojis o cuadrados de colores | El PM probó los cuadrados de colores y se veían como emojis. Con íconos de un solo color el menú se ve profesional y el ícono acompaña al texto sin competir con él. |
| Estados en colores de semáforo: rojo para lo que falta ("Faltan 4 cierres", "sin cierres"), naranja para lo incompleto, verde para lo completo ("Están todos los cierres cargados") | Los dueños tienen 57 y 64 años: el color y el tamaño dicen si hay que hacer algo antes de leer el detalle. |
| Números principales de 32 a 40 px en negrita; texto secundario más oscuro (contraste 7:1); "Descargar Excel del mes" como botón principal marrón con letra blanca | Pedido del PM siguiendo WCAG 2.1 para adultos mayores: se lee sin forzar la vista. |
| Menú en un panel marrón como la cabecera, agrupado en "Plata" (Resumen, Cierre de caja, Revisión de cierres, Caja central), "Panaderías" (Pedidos, Stock e insumos, Sucursales) y "Equipo" (Usuarios) | Agrupar por tema ayuda a encontrar las cosas: los dueños van casi siempre a "Plata". Un grupo sin secciones permitidas no se muestra. |
| Sección activa en crema con letra marrón y barra amarilla; el resto en crema sobre marrón | Es el mayor contraste posible dentro de los colores de la marca: se ve de lejos dónde estás. |
| Nombres cortos: "Pedidos", "Stock e insumos", "Sucursales" | Menos palabras para leer; el título de cada pantalla sigue diciendo el nombre completo. |

## La Fueguina Stats — Sprint 8 · PR 1: seguridad en el pipeline (#17)

| Decisión | Por qué |
|----------|---------|
| Un workflow aparte, `seguridad.yml`, que también corre los lunes | Una vulnerabilidad nueva se publica aunque nuestro código no cambie; la corrida semanal la encuentra sin esperar un PR. |
| CodeQL con `security-extended` para JavaScript y para los workflows de Actions | Es gratis en repos públicos y es el SAST de GitHub: los hallazgos quedan en la pestaña Security. Los workflows también se revisan porque un permiso de más o un `${{ }}` mal usado es una puerta de entrada. |
| `npm audit --audit-level=high` en los tres paquetes, sin instalar | Lee el `package-lock.json`. Frena con altas y críticas; las moderadas las va subiendo Dependabot sin frenar a nadie. |
| gitleaks con el binario oficial y sólo sobre los commits nuevos | La acción oficial pide licencia para organizaciones; el binario no. Revisar sólo el PR hace que un secreto viejo ya rotado no frene todo, y que uno nuevo frene aunque se haya borrado en un commit posterior (queda en la historia). |
| Trivy en modo `config` sobre `infra/`, con `.trivyignore-infra` para excepciones justificadas | Cumple el criterio de la historia (Trivy sobre el Terraform) con la misma herramienta que ya usamos para las imágenes. |
| Cabeceras de seguridad en Nginx en un archivo aparte que se incluye en cada `location` | En Nginx, un `add_header` dentro de un location anula los del server; con el include no se pierden en `/assets/`. |
| CSP sin `unsafe-inline`, ni para scripts ni para estilos | La app no escribe scripts ni estilos dentro del HTML: los anchos de las barras los pone React desde JavaScript, y eso la CSP lo permite. Probado con las e2e en un servidor con la misma política. |
| HSTS aunque en la compu se use HTTP | Por HTTP los navegadores la ignoran; en Azure, con HTTPS, empieza a valer sola. |
| El backend no manda `X-Powered-By` y Nginx no dice su versión | Menos pistas sobre qué software atacar. |
| La acción de Trivy se fija por el SHA del commit (con la versión en un comentario) | CodeQL lo marcó: una etiqueta de otra organización se puede mover y cambiar el código que corre con nuestros permisos. Dependabot sigue actualizando el SHA. |
| El límite de intentos de login ya existía (Sprint 2) | No se tocó; la historia lo pedía y ya estaba cubierto con tests. |

## La Fueguina Stats — Sprint 8 · PR 2: logs y métricas (#18)

| Decisión | Por qué |
|----------|---------|
| pino + pino-http, una línea JSON por evento | Es el logger más usado en Node y el más rápido. JSON se puede filtrar con `jq` hoy, y mañana lo leen Azure Log Analytics o Grafana Loki sin cambiar nada. |
| El id del request lo genera Nginx (`$request_id`) y el backend lo devuelve en `X-Request-Id` | Un solo id del navegador a la base. Si viene uno raro (largo o con caracteres extraños) se descarta y se genera otro, para que nadie pueda ensuciar los logs. |
| No se loguean `/api/health` ni `/metrics` | Los consultan Docker y Prometheus cada pocos segundos: taparían los requests de las personas. |
| Cookie, `Authorization` y contraseñas se reemplazan por `[oculto]` | Un log nunca tiene que servir para entrar al sistema. |
| 5xx se loguea como `error`, 4xx como `warn` | Un 4xx es un error del usuario (contraseña mal, falta un dato); un 5xx es nuestro y hay que mirarlo. |
| prom-client, métricas con prefijo `lafueguina_` | Es la librería oficial de Prometheus para Node. El prefijo evita choques con otras apps en el mismo Prometheus. |
| La ruta de la métrica reemplaza los números por `:id`; lo que no es una ruta va a `sin_ruta` | Cada valor distinto de una etiqueta es una serie nueva en Prometheus: con los ids crudos crecería sin límite. |
| "Cierre cargado hoy" se calcula desde la base cada vez que Prometheus pregunta | Un contador en memoria se pierde al reiniciar y no suma bien con dos copias del backend (Azure puede levantar dos). La consulta toca unas 8 filas. |
| Si la base no responde, la métrica de cierres no aparece (en vez de valer 0) | Un 0 diría "no cargaron el cierre" y dispararía una alerta falsa. |
| El secreto de prueba de `vitest.config.js` va en `.gitleaksignore` y con `gitleaks:allow` | gitleaks lo marcó al tocar esa línea (prueba de que funciona). No es un secreto real: sólo firma sesiones en los tests. |
| `/metrics` sin contraseña pero fuera de `/api` | Nginx sólo reenvía `/api/`: desde internet devuelve la pantalla. Prometheus lo lee por la red interna. El smoke test verifica las dos cosas. |

## La Fueguina Stats — Sprint 8 · PR 3: tablero de Grafana y alertas (#18)

| Decisión | Por qué |
|----------|---------|
| Prometheus y Grafana en el mismo `docker-compose.yml`, bajo el perfil `monitoreo` | Un `docker compose up` normal no cambia (no ocupa memoria ni puertos de más). Hasta que tengamos Azure, el monitoreo corre en la compu con un solo comando. |
| Puertos 9090 y 3001 sólo en `127.0.0.1` | Nadie de la red del local puede entrar a Grafana o Prometheus. |
| Grafana arranca con la fuente de datos y el tablero ya cargados (provisioning), en español y abriendo en "La Fueguina" | Nada que configurar a mano; el tablero vive en el repo como JSON y se versiona como el código. |
| Alerta del cierre de la noche entre las 21:30 y las 23:59 de Argentina, escrita en UTC | Las sucursales cierran a las 21 y se da media hora. Prometheus trabaja en UTC y Argentina está siempre en UTC−3 (no cambia la hora). A medianoche empieza otro día y el cierre vuelve a "pendiente": por eso no sigue sonando. |
| No hay alerta del mediodía todavía | No tenemos una hora pactada para ese cierre; se agrega con una línea cuando el PM la defina. |
| Alertas también de backend caído y de más de 5 % de errores | Son las dos cosas que haría que la dueña no pueda cargar nada. |
| Las alertas se ven en el tablero y en Prometheus; todavía no mandan mensajes | Para mandar un mail o un Telegram hace falta una cuenta de envío del negocio. Se agrega con Alertmanager o con los contactos de Grafana cuando esté. |
| `promtool test rules` en el CI con horarios simulados (21:10, 21:45, 23:30, 00:10) | Una alerta que nunca suena o que suena siempre no se nota hasta que hace falta. Así se prueba como cualquier otro código. |
| El CI levanta Prometheus y Grafana y verifica que leen el cierre del smoke test y cargan el tablero | Prueba de punta a punta: del cierre cargado al dato en Grafana. |

## La Fueguina Stats — Sprint 8 · PR 4: "Reportar un problema" (#18)

| Decisión | Por qué |
|----------|---------|
| El botón va al pie del menú, separado de las secciones, para todos los roles | Es el lugar que ya conocen; no es una sección del negocio. |
| Dos preguntas en palabras simples: "¿Qué pasó?" y "¿Qué esperabas?" (opcional) | Son las dos primeras de la plantilla de bug. Los pasos, el entorno y la versión los completa la app sola. |
| El formulario se abre encima de la sección, que queda montada | Si alguien estaba cargando un cierre y reporta, al volver no perdió lo que escribió. |
| Siempre se guarda en la base; el issue de GitHub es un extra si hay token | Así funciona desde el primer día, y un problema de GitHub nunca pierde un reporte. |
| El issue lleva rol, sucursal y sección, no el nombre de la persona | El repo es público. |
| Token fine-grained sólo con permiso de Issues | Si alguien lo roba, no puede tocar el código. |
| Hasta 10 reportes por hora por persona | Evita que un error de pantalla en bucle (o alguien) llene GitHub de issues. |

## La Fueguina Stats — Sprint 8 · PR 5: métricas DORA (#18)

| Decisión | Por qué |
|----------|---------|
| Un script propio en Node (`herramientas/dora`) que lee la API de GitHub, sin servicios externos | Todos los datos ya están en GitHub (PRs, corridas de Actions, despliegues a los ambientes). Es gratis y se entiende entero. |
| Mientras no haya producción, cada merge a main cuenta como un despliegue, y el informe lo dice | Sin Azure no hay despliegues reales. Cuando `desplegar.yml` empiece a desplegar a `produccion`, el script usa esos solo. |
| Falla = CI de main en rojo para ese commit, o una corrida de "Volver a la versión anterior" antes del despliegue siguiente | Son las dos señales de que algo que llegó a main no andaba. |
| Recuperación = de la primera corrida roja de main a la siguiente verde | Es lo que tardamos en dejar main desplegable otra vez. Las corridas canceladas no cuentan. |
| Niveles Elite / Alto / Medio / Bajo con los cortes del informe State of DevOps | Así el número se lee contra la industria, no en el vacío. |
| Cálculo separado de la lectura, con pruebas de `node --test` en el CI | Las cuentas se prueban con datos de mentira, sin pedirle nada a GitHub. |
| Corre los lunes con el `GITHUB_TOKEN` de sólo lectura | No hace falta ningún secreto nuevo. |

## La Fueguina Stats — Sprint 6 · PR 4: despliegue en la cuenta de estudiante (#14)

Reemplaza el blue-green del PR 3 y la "app con los dos contenedores juntos" del PR 2.

| Decisión | Por qué |
|----------|---------|
| Dos apps por ambiente: `lafueguina-<ambiente>-api` (backend, entrada interna) y `lafueguina-<ambiente>` (Nginx, pública) | Azure for Students crea los ambientes de Container Apps en modo "express" en todas las regiones permitidas: no deja dos contenedores en una app (`ExpressEnvironmentFeatureNotSupported`). Nginx le habla al backend por la dirección de su app. |
| Una sola versión activa por app y cambio "rolling" | Express tampoco deja varias versiones activas, así que no hay blue-green. Con rolling, Azure levanta la versión nueva, espera que conteste (readiness en `/api/health`) y recién ahí apaga la vieja: sigue sin haber cortes. |
| Se actualiza primero el backend y después la pantalla | La pantalla vieja sigue andando con el backend nuevo porque la API y las migraciones sólo agregan. Al revés (pantalla nueva con backend viejo) podría pedir algo que todavía no existe. |
| Volver atrás = volver a desplegar las imágenes del commit anterior | Las versiones viejas quedan guardadas apagadas (hasta 10) y el SHA sale de su imagen. Tarda un par de minutos en vez de segundos, pero no depende de tener dos versiones prendidas. En producción se hace solo si la versión nueva no contesta bien. |
| Nginx usa el DNS del contenedor (`NGINX_ENTRYPOINT_LOCAL_RESOLVERS`) y manda `Host` del backend | Sirve igual en el compose y en Azure sin configurar el resolver a mano. La entrada interna de Azure elige la app por el `Host`, así que tiene que ser el del backend y no el de la pantalla. |
| El backend sólo contesta con la cabecera `X-Clave-Interna` (si no, 404), salvo `/api/health` | Lo probamos: en express la entrada "interna" igual se ve desde internet (`curl` desde afuera dio 200). La clave la genera Terraform, la tienen sólo las dos apps y va siempre por HTTPS. `/api/health` queda libre porque Azure lo consulta directo para saber si la versión arrancó, y sólo dice la versión. Se compara en tiempo constante. |
| `TRUST_PROXY` vale `3` en Azure | Ahora hay tres saltos adelante del backend: la entrada pública, Nginx y la entrada interna. |
| `desplegar.sh` se prueba en el CI con un `az` de mentira | Orden de actualización, reintentos sin versiones duplicadas, esperar al SHA correcto y volver atrás dos veces, en cada PR y sin cuenta de Azure. |
