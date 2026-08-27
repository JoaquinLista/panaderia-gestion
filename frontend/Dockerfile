# =============================================================
#  Frontend - build multi-stage (Node 22 -> Nginx alpine)
# =============================================================

# ---- Etapa 1: build de la SPA ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Etapa 2: servidor de producción ----
FROM nginx:1.27-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/JoaquinLista/panaderia-gestion"
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
