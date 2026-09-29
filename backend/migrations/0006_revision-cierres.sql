-- Up Migration
-- =============================================================
--  Revisión de cierres por la dueña (Sprint 3, historia #10).
--  - Un cierre con diferencia queda "a revisar" hasta que la dueña lo
--    marca revisado (PM, 2026-09-29: se tolera pero se averigua).
--  - Cada corrección guarda quién, cuándo, el valor anterior y el nuevo.
-- =============================================================

ALTER TABLE cierres_caja
    ADD COLUMN revisado_por INTEGER REFERENCES usuarios(id),
    ADD COLUMN revisado_en  TIMESTAMPTZ;

CREATE TABLE cierre_correcciones (
    id              SERIAL PRIMARY KEY,
    cierre_id       INTEGER      NOT NULL REFERENCES cierres_caja(id) ON DELETE CASCADE,
    usuario_id      INTEGER      NOT NULL REFERENCES usuarios(id),
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    campo           VARCHAR(40)  NOT NULL,
    valor_anterior  TEXT,
    valor_nuevo     TEXT
);

CREATE INDEX idx_cierre_correcciones_cierre_id ON cierre_correcciones (cierre_id);

-- Down Migration
DROP TABLE IF EXISTS cierre_correcciones;
ALTER TABLE cierres_caja DROP COLUMN IF EXISTS revisado_en, DROP COLUMN IF EXISTS revisado_por;
