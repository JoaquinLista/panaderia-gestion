-- Up Migration
-- =============================================================
--  Esquema inicial: las tablas que antes creaba database/init.sql.
--  Es idempotente (IF NOT EXISTS) para que también funcione sobre
--  bases creadas con aquel script, sin borrar el volumen.
-- =============================================================

CREATE TABLE IF NOT EXISTS sucursales (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(120) NOT NULL UNIQUE,
    tipo    VARCHAR(20)  NOT NULL CHECK (tipo IN ('FABRICA', 'VENTA', 'DEPOSITO'))
);

CREATE TABLE IF NOT EXISTS productos (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(120) NOT NULL UNIQUE,
    unidad_medida  VARCHAR(30)  NOT NULL
);

CREATE TABLE IF NOT EXISTS insumos (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(120)  NOT NULL UNIQUE,
    stock_actual   NUMERIC(12,2) NOT NULL DEFAULT 0,
    stock_minimo   NUMERIC(12,2) NOT NULL DEFAULT 0,
    unidad_medida  VARCHAR(30)   NOT NULL
);

CREATE TABLE IF NOT EXISTS pedidos (
    id                   SERIAL PRIMARY KEY,
    sucursal_origen_id   INTEGER NOT NULL REFERENCES sucursales(id),
    sucursal_destino_id  INTEGER NOT NULL REFERENCES sucursales(id),
    estado               VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    fecha_creacion       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalles_pedido (
    id           SERIAL PRIMARY KEY,
    pedido_id    INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id  INTEGER NOT NULL REFERENCES productos(id),
    cantidad     NUMERIC(12,2) NOT NULL CHECK (cantidad > 0)
);

CREATE INDEX IF NOT EXISTS idx_detalles_pedido_pedido_id ON detalles_pedido (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado           ON pedidos (estado);

-- Estados del pedido: se recrea el CHECK para que bases viejas (sin RECIBIDO
-- ni CANCELADO) queden igual que las nuevas.
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE pedidos ADD  CONSTRAINT pedidos_estado_check
    CHECK (estado IN ('PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'RECIBIDO', 'CANCELADO'));

-- Down Migration
DROP TABLE IF EXISTS detalles_pedido;
DROP TABLE IF EXISTS pedidos;
DROP TABLE IF EXISTS insumos;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS sucursales;
