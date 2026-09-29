-- Up Migration
-- =============================================================
--  Cierre de caja como en la planilla "Egresos de caja" (Sprint 5).
--  PM (2026-09-29):
--  - Débito, crédito y QR se anotan por separado, aunque los cobre el
--    mismo posnet. No hay transferencias (la columna queda por si vuelven).
--  - Cada gasto chico de la caja lleva una categoría, como las columnas de
--    la planilla, para que el Excel salga igual.
-- =============================================================

-- Lo cargado como "posnet" hasta ahora (sólo datos de prueba) queda como débito.
ALTER TABLE cierres_caja RENAME COLUMN posnet TO debito;
ALTER TABLE cierres_caja
    ADD COLUMN credito NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (credito >= 0),
    ADD COLUMN qr      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qr >= 0);

CREATE TABLE categorias_gasto (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(60) NOT NULL,
    -- Una categoría que ya no se usa se desactiva: los gastos viejos la conservan.
    activa  BOOLEAN     NOT NULL DEFAULT true,
    orden   INTEGER     NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX categorias_gasto_nombre_unico ON categorias_gasto (lower(nombre));

-- Las columnas de la planilla, en el mismo orden.
INSERT INTO categorias_gasto (nombre, orden) VALUES
    ('Personal', 10),
    ('Supermercado (La Anónima, Tía)', 20),
    ('Carne', 30),
    ('Gasoil', 40),
    ('Bebidas (Coca, Cohiue)', 50),
    ('Proveedores', 60),
    ('Servicios', 70),
    ('Mantenimiento', 80),
    ('Obra', 90),
    ('Varios', 100);

ALTER TABLE cierre_gastos ADD COLUMN categoria_id INTEGER REFERENCES categorias_gasto(id);
UPDATE cierre_gastos
   SET categoria_id = (SELECT id FROM categorias_gasto WHERE nombre = 'Varios');
ALTER TABLE cierre_gastos ALTER COLUMN categoria_id SET NOT NULL;

-- Down Migration
ALTER TABLE cierre_gastos DROP COLUMN IF EXISTS categoria_id;
DROP TABLE IF EXISTS categorias_gasto;
-- Lo cobrado con crédito y QR se suma al débito para no perderlo al volver atrás.
UPDATE cierres_caja SET debito = debito + credito + qr;
ALTER TABLE cierres_caja DROP COLUMN IF EXISTS qr, DROP COLUMN IF EXISTS credito;
ALTER TABLE cierres_caja RENAME COLUMN debito TO posnet;
