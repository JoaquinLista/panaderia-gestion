# =============================================================
#  Base de datos - Postgres 15 con el schema + datos semilla
#  El script corre solo la primera vez que se inicializa el volumen
#  (mecanismo /docker-entrypoint-initdb.d de la imagen oficial).
#  Empaquetarlo en la imagen -en vez de montarlo- permite que
#  docker-compose.registry.yml levante el sistema sin el repo.
# =============================================================
FROM postgres:15-alpine
LABEL org.opencontainers.image.source="https://github.com/JoaquinLista/panaderia-gestion"
COPY init.sql /docker-entrypoint-initdb.d/10-init.sql
