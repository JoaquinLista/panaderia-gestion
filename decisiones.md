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
