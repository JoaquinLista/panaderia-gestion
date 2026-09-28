# Cómo trabajamos

Este repo sigue una forma de trabajo DevOps: cambios chicos, revisados y probados
automáticamente antes de llegar a `main`. `main` siempre tiene que poder desplegarse.

## Flujo de un cambio

1. **Issue primero.** Todo trabajo arranca de un issue (historia de usuario o bug) en el
   tablero del proyecto. Si no existe, se crea con el template.
2. **Rama corta desde `main`.** Nombre: `tipo/descripcion-corta`, por ejemplo
   `feat/cierre-caja-formulario` o `fix/total-posnet`. Vive pocos días.
3. **Commits con Conventional Commits.** `tipo(alcance): descripción en presente`.
   Tipos: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `ci`, `build`.
   Ejemplo: `feat(caja): validar que la Z coincida con los medios de pago`.
4. **Pull Request a `main`.** Completá el template y enlazá el issue con `Cierra #N`.
5. **Revisión + checks verdes.** Nadie mergea su propio PR sin revisión, y el pipeline
   (lint, tests, coverage) tiene que pasar.
6. **Squash merge.** Un PR = un commit en `main`, con el título del PR como mensaje.

## Cambios en la base de datos

Nunca se edita una migración que ya está en `main`. Cada cambio de esquema es un
archivo nuevo en `backend/migrations/` (`npm run migrate:nueva -- nombre`) con su
sección `-- Down Migration`, y el job `Migraciones · Postgres real` lo prueba desde
cero y sobre una base con el esquema viejo.

## Definición de terminado

Una historia está terminada cuando:

- cumple sus criterios de aceptación,
- tiene tests que los cubren y el pipeline está verde,
- está documentada si cambia la API o una decisión de diseño (`decisiones.md`),
- está desplegada en staging (a partir del Sprint 6).

## Comandos locales

Backend y frontend tienen los mismos scripts:

```bash
npm test               # tests unitarios
npm run test:coverage  # tests + reporte de cobertura en coverage/
npm run lint           # ESLint
npm run format         # Prettier (formatea)
npm run format:check   # Prettier (sólo verifica, lo usa el pipeline)
```

Levantar todo el sistema:

```bash
cp .env.example .env
docker compose up -d --build
```

## Protección de `main` (configuración en GitHub)

En **Settings → Branches → Add branch ruleset** (o _Add rule_) para `main`:

- Requerir pull request antes de mergear.
- Requerir que pasen los checks: `backend · lint, tests y coverage`,
  `frontend · lint, tests y coverage`, `Migraciones · Postgres real` y
  `Docker · build y smoke test`.
- Requerir que la rama esté actualizada con `main`.
- Bloquear force push y borrado.

Con esto, un PR que baje la cobertura del umbral o rompa el build no se puede mergear.
