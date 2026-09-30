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
# NGINX_ENTRYPOINT_LOCAL_RESOLVERS: la imagen lee el DNS del contenedor y lo
# deja en NGINX_LOCAL_RESOLVERS (Docker en el compose, Azure en la nube).
# CLAVE_INTERNA va vacía: en el compose no hace falta (en Azure la pone Terraform).
ENV BACKEND_URL=http://backend:3000 \
    CLAVE_INTERNA= \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
