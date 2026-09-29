-- Up Migration
-- =============================================================
--  Caja central (Sprint 5, historias #12 y #13). Reemplaza la planilla
--  "Retiros": entra el efectivo que se retira de cada sucursal y salen los
--  depósitos al banco, los pagos grandes y los retiros de los dueños.
--  Lo que entra de las sucursales no se guarda acá: sale de cada cierre
--  (efectivo contado − cambio fijo), así una corrección del cierre se ve sola.
-- =============================================================

-- Los que retiran plata para la casa (columnas de la planilla).
CREATE TABLE duenos (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(60) NOT NULL,
    activo  BOOLEAN     NOT NULL DEFAULT true,
    orden   INTEGER     NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX duenos_nombre_unico ON duenos (lower(nombre));

INSERT INTO duenos (nombre, orden) VALUES
    ('Fernanda', 10),
    ('Gabriel', 20),
    ('Mary', 30);

-- CAJA = la caja central (efectivo); BANCO = la cuenta del Banco Patagonia.
--  SALDO_INICIAL: con cuánto arranca la cuenta (uno por cuenta).
--  DEPOSITO:      pasa plata de la caja al banco.
--  PAGO:          sale de la cuenta, con categoría y concepto.
--  RETIRO_DUENO:  un dueño se lleva plata de la cuenta.
--  AJUSTE:        diferencia de un arqueo; puede sumar o restar, con motivo.
CREATE TABLE movimientos_caja (
    id            SERIAL PRIMARY KEY,
    fecha         DATE          NOT NULL,
    tipo          VARCHAR(20)   NOT NULL
                  CHECK (tipo IN ('SALDO_INICIAL', 'DEPOSITO', 'PAGO', 'RETIRO_DUENO', 'AJUSTE')),
    cuenta        VARCHAR(10)   NOT NULL CHECK (cuenta IN ('CAJA', 'BANCO')),
    monto         NUMERIC(12,2) NOT NULL,
    categoria_id  INTEGER       REFERENCES categorias_gasto(id),
    dueno_id      INTEGER       REFERENCES duenos(id),
    concepto      VARCHAR(200),
    cargado_por   INTEGER       NOT NULL REFERENCES usuarios(id),
    creado_en     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    -- Un movimiento mal cargado se anula (no se borra): queda quién y cuándo.
    anulado_en    TIMESTAMPTZ,
    anulado_por   INTEGER       REFERENCES usuarios(id),

    -- Sólo el ajuste puede ser negativo; nada vale cero.
    CHECK ((tipo = 'AJUSTE' AND monto <> 0) OR (tipo <> 'AJUSTE' AND monto > 0)),
    CHECK (tipo <> 'DEPOSITO' OR cuenta = 'CAJA'),
    CHECK ((tipo = 'PAGO') = (categoria_id IS NOT NULL)),
    CHECK ((tipo = 'RETIRO_DUENO') = (dueno_id IS NOT NULL)),
    CHECK (tipo NOT IN ('PAGO', 'AJUSTE') OR concepto IS NOT NULL)
);

CREATE INDEX movimientos_caja_fecha ON movimientos_caja (fecha);
CREATE UNIQUE INDEX movimientos_caja_un_saldo_inicial
    ON movimientos_caja (cuenta) WHERE tipo = 'SALDO_INICIAL' AND anulado_en IS NULL;

-- Down Migration
DROP TABLE IF EXISTS movimientos_caja;
DROP TABLE IF EXISTS duenos;
