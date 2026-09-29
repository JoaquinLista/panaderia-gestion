-- Up Migration
-- =============================================================
--  Cierre de caja (Sprint 3, historias #8 y #9).
--  Reglas del PM (2026-09-29):
--  - Dos cierres por día y por sucursal: al mediodía y a la noche.
--  - Queda un cambio fijo en la caja y se deja asentado.
--  - Los gastos locales se pagan con plata de la caja.
--  - Una diferencia se tolera (se guarda igual) pero la dueña la averigua.
--  Plata en NUMERIC(12,2): pesos con centavos exactos, sin redondeos.
-- =============================================================

CREATE TABLE cierres_caja (
    id                 SERIAL PRIMARY KEY,
    sucursal_id        INTEGER       NOT NULL REFERENCES sucursales(id),
    -- Día del cierre en hora de Argentina: lo pone la API, no el formulario.
    fecha              DATE          NOT NULL,
    turno              VARCHAR(10)   NOT NULL CHECK (turno IN ('MEDIODIA', 'NOCHE')),
    numero_z           INTEGER       CHECK (numero_z > 0),
    total_controlador  NUMERIC(12,2) NOT NULL CHECK (total_controlador >= 0),
    -- Toda la plata que hay en la caja, cambio incluido.
    efectivo_contado   NUMERIC(12,2) NOT NULL CHECK (efectivo_contado >= 0),
    cambio_fijo        NUMERIC(12,2) NOT NULL CHECK (cambio_fijo >= 0),
    posnet             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (posnet >= 0),
    transferencias     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (transferencias >= 0),
    -- Calculada por la API (domain/cuadre.js). Positiva: sobra. Negativa: falta.
    diferencia         NUMERIC(12,2) NOT NULL,
    comentario         VARCHAR(500),
    cargado_por        INTEGER       NOT NULL REFERENCES usuarios(id),
    creado_en          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    -- Si dos personas cargan el mismo turno a la vez, la base rechaza el segundo.
    CONSTRAINT cierres_caja_turno_unico UNIQUE (sucursal_id, fecha, turno)
);

CREATE TABLE cierre_gastos (
    id         SERIAL PRIMARY KEY,
    cierre_id  INTEGER       NOT NULL REFERENCES cierres_caja(id) ON DELETE CASCADE,
    detalle    VARCHAR(120)  NOT NULL,
    monto      NUMERIC(12,2) NOT NULL CHECK (monto > 0)
);

CREATE INDEX idx_cierre_gastos_cierre_id ON cierre_gastos (cierre_id);
CREATE INDEX idx_cierres_caja_fecha      ON cierres_caja (fecha);

-- Down Migration
DROP TABLE IF EXISTS cierre_gastos;
DROP TABLE IF EXISTS cierres_caja;
