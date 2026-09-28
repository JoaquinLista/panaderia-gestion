-- Up Migration
-- =============================================================
--  Usuarios del sistema (Sprint 2, historias #5 y #6).
--  Roles: ADMIN (dueños y socios), EMPLEADA y CHOFER. No hay rol de
--  galpón: el chofer es quien opera el galpón.
--  puede_cerrar_caja: permiso que la dueña da a quien designe.
--  La sucursal de una empleada no se guarda acá: la elige al iniciar
--  sesión, porque las empleadas rotan entre sucursales.
-- =============================================================

CREATE TABLE usuarios (
    id                 SERIAL PRIMARY KEY,
    usuario            VARCHAR(60)  NOT NULL,
    nombre             VARCHAR(120) NOT NULL,
    password_hash      TEXT         NOT NULL,
    rol                VARCHAR(20)  NOT NULL CHECK (rol IN ('ADMIN', 'EMPLEADA', 'CHOFER')),
    puede_cerrar_caja  BOOLEAN      NOT NULL DEFAULT FALSE,
    activo             BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actualizado_en     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- El usuario se compara sin distinguir mayúsculas: "Pablo" y "pablo" son el mismo.
CREATE UNIQUE INDEX usuarios_usuario_unico ON usuarios (lower(usuario));

-- Down Migration
DROP TABLE IF EXISTS usuarios;
