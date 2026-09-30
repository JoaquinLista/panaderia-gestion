-- Up Migration
-- =============================================================
--  Pedidos de las sucursales por rubro (Sprint 9, #77).
--  PM (2026-09-30): la sucursal pide un rubro ("FACTURAS") y escribe el
--  detalle en la observación ("2 latas de medialunas, 2 de vigilantes").
--  El chofer ve qué cargar en la fábrica y en el galpón, y una parada por
--  sucursal.
--
--  En un pedido:
--    sucursal_destino_id = la sucursal que pide (a donde se lleva).
--    sucursal_origen_id  = de donde sale: la fábrica, el galpón u otra sucursal.
-- =============================================================

-- Lo que se puede pedir, con el lugar de donde sale habitualmente.
CREATE TABLE rubros (
    id                  SERIAL PRIMARY KEY,
    nombre              VARCHAR(60) NOT NULL,
    sucursal_origen_id  INTEGER     NOT NULL REFERENCES sucursales (id),
    -- Un rubro que ya no se usa se desactiva: los pedidos viejos lo conservan.
    activo              BOOLEAN     NOT NULL DEFAULT true,
    orden               INTEGER     NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX rubros_nombre_unico ON rubros (lower(nombre));

-- La lista que pasó el PM. Lo de la cuadra sale de la fábrica y los insumos del galpón.
INSERT INTO rubros (nombre, sucursal_origen_id, orden)
SELECT r.nombre, s.id, r.orden
  FROM (VALUES
          ('Pan',                'FABRICA',  10),
          ('Facturas',           'FABRICA',  20),
          ('Sándwiches de miga', 'FABRICA',  30),
          ('Tortas',             'FABRICA',  40),
          ('Bizcochos',          'FABRICA',  50),
          ('Masas finas',        'FABRICA',  60),
          ('Pan lactal',         'FABRICA',  70),
          ('Chipá',              'FABRICA',  80),
          ('Pan de salvado',     'FABRICA',  90),
          ('Saladitos',          'FABRICA', 100),
          ('Insumos',            'DEPOSITO', 110),
          ('Otros',              'FABRICA', 120)
       ) AS r (nombre, tipo, orden)
  JOIN LATERAL (SELECT id FROM sucursales WHERE tipo = r.tipo ORDER BY id LIMIT 1) s ON true;

ALTER TABLE pedidos
    ADD COLUMN nota          VARCHAR(300),
    ADD COLUMN urgente       BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN creado_por    INTEGER     REFERENCES usuarios (id),
    ADD COLUMN en_camino_en  TIMESTAMPTZ,
    ADD COLUMN entregado_en  TIMESTAMPTZ,
    ADD COLUMN recibido_en   TIMESTAMPTZ,
    ADD COLUMN cancelado_en  TIMESTAMPTZ;

-- Estados más simples: el pedido está pendiente, en camino o entregado.
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
UPDATE pedidos SET estado = 'PENDIENTE' WHERE estado = 'EN_PREPARACION';
UPDATE pedidos SET estado = 'EN_CAMINO' WHERE estado = 'DESPACHADO';
ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check
    CHECK (estado IN ('PENDIENTE', 'EN_CAMINO', 'ENTREGADO', 'RECIBIDO', 'CANCELADO'));

-- Cada renglón es un rubro con lo que se pide escrito a mano.
CREATE TABLE pedido_items (
    id         SERIAL PRIMARY KEY,
    pedido_id  INTEGER      NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
    rubro_id   INTEGER      NOT NULL REFERENCES rubros (id),
    detalle    VARCHAR(500) NOT NULL CHECK (length(btrim(detalle)) > 0),
    -- El chofer tilda lo que carga o marca que no había.
    estado     VARCHAR(10)  NOT NULL DEFAULT 'PENDIENTE'
               CHECK (estado IN ('PENDIENTE', 'LLEVADO', 'NO_HABIA'))
);
CREATE INDEX idx_pedido_items_pedido_id ON pedido_items (pedido_id);

-- Los detalles con producto y cantidad de la primera versión pasan a "Otros".
INSERT INTO pedido_items (pedido_id, rubro_id, detalle)
SELECT dp.pedido_id,
       (SELECT id FROM rubros WHERE nombre = 'Otros'),
       rtrim(rtrim(dp.cantidad::text, '0'), '.') || ' ' || pr.unidad_medida || ' de ' || pr.nombre
  FROM detalles_pedido dp
  JOIN productos pr ON pr.id = dp.producto_id
 ORDER BY dp.id;
DROP TABLE detalles_pedido;

-- Down Migration
CREATE TABLE detalles_pedido (
    id           SERIAL PRIMARY KEY,
    pedido_id    INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id  INTEGER NOT NULL REFERENCES productos(id),
    cantidad     NUMERIC(12,2) NOT NULL CHECK (cantidad > 0)
);
CREATE INDEX IF NOT EXISTS idx_detalles_pedido_pedido_id ON detalles_pedido (pedido_id);
DROP TABLE IF EXISTS pedido_items;
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
UPDATE pedidos SET estado = 'DESPACHADO' WHERE estado = 'EN_CAMINO';
ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check
    CHECK (estado IN ('PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'RECIBIDO', 'CANCELADO'));
ALTER TABLE pedidos
    DROP COLUMN IF EXISTS nota,
    DROP COLUMN IF EXISTS urgente,
    DROP COLUMN IF EXISTS creado_por,
    DROP COLUMN IF EXISTS en_camino_en,
    DROP COLUMN IF EXISTS entregado_en,
    DROP COLUMN IF EXISTS recibido_en,
    DROP COLUMN IF EXISTS cancelado_en;
DROP TABLE IF EXISTS rubros;
