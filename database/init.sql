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
    tipo                 VARCHAR(20) NOT NULL DEFAULT 'PRODUCTOS'
                         CHECK (tipo IN ('INSUMOS', 'PRODUCTOS')),
    sucursal_origen_id   INTEGER NOT NULL REFERENCES sucursales(id),
    sucursal_destino_id  INTEGER NOT NULL REFERENCES sucursales(id),
    estado               VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                         CHECK (estado IN ('PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'RECIBIDO', 'CANCELADO')),
    fecha_creacion       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Cada línea referencia un producto O un insumo (según pedidos.tipo), nunca ambos.
CREATE TABLE IF NOT EXISTS detalles_pedido (
    id                SERIAL PRIMARY KEY,
    pedido_id         INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id       INTEGER REFERENCES productos(id),
    insumo_id         INTEGER REFERENCES insumos(id),
    cantidad          NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
    cantidad_recibida NUMERIC(12,2) CHECK (cantidad_recibida IS NULL OR cantidad_recibida >= 0),
    CONSTRAINT detalles_pedido_item_xor
        CHECK ((producto_id IS NOT NULL) <> (insumo_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS usuarios (
    id             SERIAL PRIMARY KEY,
    email          VARCHAR(160) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    nombre         VARCHAR(120) NOT NULL,
    rol            VARCHAR(20)  NOT NULL CHECK (rol IN ('DUENIO', 'DEPOSITO', 'FABRICA', 'VENTA', 'CHOFER')),
    sucursal_id    INTEGER REFERENCES sucursales(id),
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- DUENIO y CHOFER no dependen de una sucursal; el resto sí.
    CONSTRAINT usuarios_sucursal_por_rol CHECK (
        (rol IN ('DUENIO', 'CHOFER') AND sucursal_id IS NULL) OR
        (rol IN ('DEPOSITO', 'FABRICA', 'VENTA') AND sucursal_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_detalles_pedido_pedido_id ON detalles_pedido (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado           ON pedidos (estado);
CREATE INDEX IF NOT EXISTS idx_usuarios_email            ON usuarios (email);

-- -------------------------------------------------------------
--  Migraciones idempotentes
--  Ajustes sobre bases creadas con una versión anterior del schema.
--  En instalaciones nuevas ya quedan aplicadas por los CREATE de arriba;
--  este script sólo corre al inicializar el volumen, así que para una base
--  ya existente hay que ejecutarlas a mano (o recrear el volumen).
-- -------------------------------------------------------------

-- Ampliar el CHECK de pedidos.estado para incluir 'RECIBIDO' y 'CANCELADO'.
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE pedidos ADD  CONSTRAINT pedidos_estado_check
    CHECK (estado IN ('PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'RECIBIDO', 'CANCELADO'));

-- La tabla `usuarios` y sus datos semilla se crean más arriba con CREATE TABLE
-- IF NOT EXISTS / INSERT ... ON CONFLICT: sobre una base ya existente basta con
-- volver a correr esas sentencias (o recrear el volumen).

-- Pedidos unificados (INSUMOS | PRODUCTOS) y detalle polimórfico.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'PRODUCTOS';
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_tipo_check;
ALTER TABLE pedidos ADD  CONSTRAINT pedidos_tipo_check CHECK (tipo IN ('INSUMOS', 'PRODUCTOS'));

ALTER TABLE detalles_pedido ALTER COLUMN producto_id DROP NOT NULL;
ALTER TABLE detalles_pedido ADD COLUMN IF NOT EXISTS insumo_id INTEGER REFERENCES insumos(id);
ALTER TABLE detalles_pedido ADD COLUMN IF NOT EXISTS cantidad_recibida NUMERIC(12,2);
ALTER TABLE detalles_pedido DROP CONSTRAINT IF EXISTS detalles_pedido_item_xor;
ALTER TABLE detalles_pedido ADD  CONSTRAINT detalles_pedido_item_xor
    CHECK ((producto_id IS NOT NULL) <> (insumo_id IS NOT NULL));

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

-- Usuarios semilla. Contraseña de todos: "panaderia123" (sólo para desarrollo).
-- El hash es bcrypt; cualquier hash válido de esa contraseña sirve.
INSERT INTO usuarios (email, password_hash, nombre, rol, sucursal_id) VALUES
    ('duenio1@panaderia.test',    '$2a$10$xXl8a8aZKzbrhdstwUHgS.9MJa4.zsmumfb2K5BTM5odSD.lvst2K', 'Dueño 1',              'DUENIO',   NULL),
    ('duenio2@panaderia.test',    '$2a$10$xXl8a8aZKzbrhdstwUHgS.9MJa4.zsmumfb2K5BTM5odSD.lvst2K', 'Dueño 2',              'DUENIO',   NULL),
    ('chofer@panaderia.test',     '$2a$10$xXl8a8aZKzbrhdstwUHgS.9MJa4.zsmumfb2K5BTM5odSD.lvst2K', 'Chofer',               'CHOFER',   NULL),
    ('deposito@panaderia.test',   '$2a$10$xXl8a8aZKzbrhdstwUHgS.9MJa4.zsmumfb2K5BTM5odSD.lvst2K', 'Operador de Depósito', 'DEPOSITO', (SELECT id FROM sucursales WHERE nombre = 'Depósito Central')),
    ('viedma@panaderia.test',     '$2a$10$xXl8a8aZKzbrhdstwUHgS.9MJa4.zsmumfb2K5BTM5odSD.lvst2K', 'Encargado Viedma',     'FABRICA',  (SELECT id FROM sucursales WHERE nombre = 'Panadería Viedma')),
    ('estrada@panaderia.test',    '$2a$10$xXl8a8aZKzbrhdstwUHgS.9MJa4.zsmumfb2K5BTM5odSD.lvst2K', 'Encargado Estrada',    'VENTA',    (SELECT id FROM sucursales WHERE nombre = 'Panadería Estrada')),
    ('patagonico@panaderia.test', '$2a$10$xXl8a8aZKzbrhdstwUHgS.9MJa4.zsmumfb2K5BTM5odSD.lvst2K', 'Encargado Patagónico', 'VENTA',    (SELECT id FROM sucursales WHERE nombre = 'Panadería Patagónico')),
    ('elcafe@panaderia.test',     '$2a$10$xXl8a8aZKzbrhdstwUHgS.9MJa4.zsmumfb2K5BTM5odSD.lvst2K', 'Encargado El Café',    'VENTA',    (SELECT id FROM sucursales WHERE nombre = 'Panadería El Café'))
ON CONFLICT (email) DO NOTHING;
