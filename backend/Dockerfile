# =============================================================
#  Backend - build multi-stage con Node 22 alpine
# =============================================================

# ---- Etapa 1: dependencias ----
# Corre en la plataforma de la máquina que construye ($BUILDPLATFORM), no en la
# de destino: así la imagen arm64 no instala las librerías bajo emulación, que es
# mucho más lenta. Se puede porque ninguna dependencia del backend tiene código
# nativo (todo JavaScript), y node_modules sirve igual en amd64 y en arm64.
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /app
# Los archivos de dependencias primero: capa cacheable, solo se rehace si cambian.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Etapa 2: runtime ----
FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/JoaquinLista/panaderia-gestion"
ENV NODE_ENV=production
WORKDIR /app

# Usuario sin privilegios: menos superficie de ataque en producción.
# En producción sólo se corre `node`: se sacan npm, npx, yarn y corepack, que
# vienen en la imagen base, traen sus propias librerías y no se usan.
RUN addgroup -S app && adduser -S app -G app \
    && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
              /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations

USER app
EXPOSE 3000

CMD ["node", "src/index.js"]
