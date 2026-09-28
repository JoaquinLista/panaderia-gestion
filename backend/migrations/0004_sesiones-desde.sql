-- Up Migration
-- =============================================================
--  Cortar sesiones abiertas (Sprint 2, historia #6).
--  Una sesión (token) emitida antes de `sesiones_desde` ya no vale.
--  Se actualiza cuando la dueña resetea la contraseña o desactiva a
--  alguien: si le robaron el celular, la sesión vieja deja de andar.
-- =============================================================
ALTER TABLE usuarios
  ADD COLUMN sesiones_desde TIMESTAMPTZ NOT NULL DEFAULT now();

-- Down Migration
ALTER TABLE usuarios DROP COLUMN sesiones_desde;
