-- Up Migration
-- =============================================================
--  Reportes de problemas desde la app (Sprint 8, #18). Cada reporte se
--  guarda acá siempre; si hay un token de GitHub configurado, además se
--  abre un issue con la plantilla de bug y se guarda su dirección.
-- =============================================================
CREATE TABLE reportes_problema (
    id           SERIAL PRIMARY KEY,
    usuario_id   INTEGER      NOT NULL REFERENCES usuarios (id),
    sucursal_id  INTEGER      REFERENCES sucursales (id),
    que_paso     TEXT         NOT NULL CHECK (length(que_paso) BETWEEN 10 AND 2000),
    esperado     TEXT         CHECK (length(esperado) <= 2000),
    seccion      VARCHAR(60),
    version      VARCHAR(60),
    issue_url    VARCHAR(300),
    creado_en    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX reportes_problema_creado_en ON reportes_problema (creado_en);

-- Down Migration
DROP TABLE IF EXISTS reportes_problema;
