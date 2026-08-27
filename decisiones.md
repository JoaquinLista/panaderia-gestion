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
