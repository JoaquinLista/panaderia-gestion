# =============================================================
#  Backend - build multi-stage con Node 22 alpine
# =============================================================

# ---- Etapa 1: dependencias ----
FROM node:22-alpine AS deps
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
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations

USER app
EXPOSE 3000

CMD ["node", "src/index.js"]
