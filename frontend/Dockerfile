# =============================================================
#  Frontend - build multi-stage (Node 22 -> Nginx alpine)
# =============================================================

# ---- Etapa 1: build de la SPA ----
# Corre en la plataforma de la máquina que construye ($BUILDPLATFORM): el
# resultado son archivos HTML, JS y CSS, iguales para amd64 y arm64. Así la imagen
# arm64 no compila bajo emulación, que es mucho más lenta.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# La versión (SHA del commit) que se ve al pie de la pantalla. La pasa el pipeline.
ARG APP_VERSION=local
ENV VITE_APP_VERSION=$APP_VERSION
RUN npm run build

# ---- Etapa 2: servidor de producción ----
FROM nginx:1.29-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/JoaquinLista/panaderia-gestion"
RUN rm /etc/nginx/conf.d/default.conf
# Plantilla: al arrancar se completa con estas variables y queda en conf.d.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY cabeceras-seguridad.conf /etc/nginx/cabeceras-seguridad.conf
ENV BACKEND_URL=http://backend:3000 \
    NGINX_RESOLVER=127.0.0.11
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
