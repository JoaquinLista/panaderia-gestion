-- Up Migration
-- =============================================================
--  Datos de referencia: las sucursales reales de La Fueguina y un
--  catálogo mínimo de ejemplo. ON CONFLICT DO NOTHING: si ya existen
--  (bases creadas con database/init.sql) no se duplican.
-- =============================================================

-- Nombres reales (PRD La Fueguina Stats). Renombra las filas de bases
-- creadas con el seed del TP; si no las encuentra, no hace nada.
UPDATE sucursales SET nombre = 'Viedma (Chacra)' WHERE nombre = 'Panadería Viedma';
UPDATE sucursales SET nombre = 'Estrada'         WHERE nombre = 'Panadería Estrada';
UPDATE sucursales SET nombre = 'Café'            WHERE nombre = 'Panadería El Café';
UPDATE sucursales SET nombre = 'Patagonia'       WHERE nombre = 'Panadería Patagónico';
UPDATE sucursales SET nombre = 'Galpón Central'  WHERE nombre = 'Depósito Central';

-- Viedma (en la zona de Chacra) es la cuadra de producción y también vende al público.
INSERT INTO sucursales (nombre, tipo) VALUES
    ('Viedma (Chacra)',  'FABRICA'),
    ('Estrada',          'VENTA'),
    ('Café',             'VENTA'),
    ('Patagonia',        'VENTA'),
    ('Galpón Central',   'DEPOSITO')
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

-- Down Migration
-- Los datos de referencia no se borran al revertir: pueden tener pedidos asociados.
SELECT 1;
