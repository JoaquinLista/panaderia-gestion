-- =============================================================
--  TP2 - Ingeniería de Software 3
--  Sistema de gestión interna para red de panaderías
--  Script de inicialización idempotente para PostgreSQL
-- =============================================================

-- -------------------------------------------------------------
--  Esquema
-- -------------------------------------------------------------

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
    estado               VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                         CHECK (estado IN ('PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO')),
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

-- -------------------------------------------------------------
--  Datos iniciales (DML idempotente)
-- -------------------------------------------------------------

INSERT INTO sucursales (nombre, tipo) VALUES
    ('Panadería Viedma',      'FABRICA'),
    ('Panadería Estrada',     'VENTA'),
    ('Panadería Patagónico',  'VENTA'),
    ('Panadería El Café',     'VENTA'),
    ('Depósito Central',      'DEPOSITO')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO insumos (nombre, stock_actual, stock_minimo, unidad_medida) VALUES
    ('Harina 000',   150.00, 200.00, 'kg'),
    ('Manteca',       80.00,  40.00, 'kg'),
    ('Levadura',      12.00,  15.00, 'kg')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO productos (nombre, unidad_medida) VALUES
    ('Medialunas',   'docena'),
    ('Pan Baguette', 'unidad')
ON CONFLICT (nombre) DO NOTHING;
