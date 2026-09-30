# =============================================================
#  Lo que comparten staging y producción: los logs, el ambiente de
#  Container Apps y un servidor de Postgres con una base para cada uno.
#  Las apps de cada ambiente (pantalla y backend) están en modules/app.
# =============================================================

# El grupo lo crea el script de preparación (con los permisos de la dueña de la
# cuenta); acá sólo se lee, y la región de todo sale de él.
data "azurerm_resource_group" "principal" {
  name = var.grupo_de_recursos
}

locals {
  ubicacion = data.azurerm_resource_group.principal.location
  grupo     = data.azurerm_resource_group.principal.name
  etiquetas = {
    proyecto = "la-fueguina-stats"
    repo     = "github.com/JoaquinLista/panaderia-gestion"
    gestion  = "terraform"
  }
}

# Algunos nombres (el del servidor de Postgres) tienen que ser únicos en todo
# Azure: se les agrega un sufijo al azar que queda fijo en el estado.
resource "random_string" "sufijo" {
  length  = 5
  upper   = false
  special = false
}

# ---- Logs de las apps ----
resource "azurerm_log_analytics_workspace" "logs" {
  name                = "${var.prefijo}-logs"
  location            = local.ubicacion
  resource_group_name = local.grupo
  sku                 = "PerGB2018"
  # 30 días es lo que viene incluido sin costo extra.
  retention_in_days = 30
  tags              = local.etiquetas
}

# ---- Ambiente de Container Apps (la "red" donde corren las apps) ----
resource "azurerm_container_app_environment" "principal" {
  name                       = "${var.prefijo}-apps"
  location                   = local.ubicacion
  resource_group_name        = local.grupo
  logs_destination           = "log-analytics"
  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id
  tags                       = local.etiquetas

  # El perfil que Azure le pone igual a este ambiente: pago por uso, sin
  # máquinas dedicadas. En la cuenta de estudiante el ambiente es "express"
  # (una versión y un contenedor por app), por eso hay dos apps por ambiente.
  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}

# ---- Postgres administrado ----
resource "random_password" "postgres" {
  length      = 32
  special     = false
  min_upper   = 2
  min_lower   = 2
  min_numeric = 2
}

resource "azurerm_postgresql_flexible_server" "principal" {
  name                   = "${var.prefijo}-db-${random_string.sufijo.result}"
  location               = local.ubicacion
  resource_group_name    = local.grupo
  version                = var.postgres_version
  administrator_login    = "lafueguina"
  administrator_password = random_password.postgres.result

  # El tamaño más chico (1 vCPU con ráfagas, 2 GB): sobra para cuatro sucursales.
  sku_name     = "B_Standard_B1ms"
  storage_mb   = 32768
  storage_tier = "P4"

  # Azure hace un backup por día y guarda 7 días; se puede volver a cualquier minuto.
  backup_retention_days        = 7
  geo_redundant_backup_enabled = false

  # Acceso por internet, pero sólo desde servicios de Azure (regla de abajo) y
  # siempre con SSL. Una red privada cuesta más y complica el primer despliegue.
  public_network_access_enabled = true

  tags = local.etiquetas

  lifecycle {
    # Azure elige la zona si no se le dice; que Terraform no intente cambiarla.
    ignore_changes = [zone]
    # Borrar el servidor borra los datos de producción.
    prevent_destroy = true
  }
}

# 0.0.0.0 es la forma en que Azure dice "permitir servicios de Azure": las
# Container Apps pueden conectarse, una compu cualquiera de internet no.
resource "azurerm_postgresql_flexible_server_firewall_rule" "servicios_azure" {
  name             = "servicios-de-azure"
  server_id        = azurerm_postgresql_flexible_server.principal.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_postgresql_flexible_server_database" "base" {
  for_each  = toset(["staging", "produccion"])
  name      = each.key
  server_id = azurerm_postgresql_flexible_server.principal.id
  charset   = "UTF8"
  collation = "en_US.utf8"

  lifecycle {
    prevent_destroy = true
  }
}

# ---- Las dos apps ----
module "staging" {
  source = "./modules/app"

  nombre            = "${var.prefijo}-staging"
  grupo             = local.grupo
  ambiente_apps_id  = azurerm_container_app_environment.principal.id
  imagen_backend    = var.imagen_backend
  imagen_frontend   = var.imagen_frontend
  postgres_host     = azurerm_postgresql_flexible_server.principal.fqdn
  postgres_base     = azurerm_postgresql_flexible_server_database.base["staging"].name
  postgres_usuario  = azurerm_postgresql_flexible_server.principal.administrator_login
  postgres_password = random_password.postgres.result
  admin_usuario     = var.admin_usuario
  entorno           = "staging"
  # Mismo token en los dos: el issue dice de qué ambiente vino.
  github_token_reportes = var.github_token_reportes
  # Se apaga cuando nadie la usa: el primer request tarda unos segundos.
  replicas_minimas = 0
  etiquetas        = merge(local.etiquetas, { ambiente = "staging" })
}

module "produccion" {
  source = "./modules/app"

  nombre                = "${var.prefijo}-produccion"
  grupo                 = local.grupo
  ambiente_apps_id      = azurerm_container_app_environment.principal.id
  imagen_backend        = var.imagen_backend
  imagen_frontend       = var.imagen_frontend
  postgres_host         = azurerm_postgresql_flexible_server.principal.fqdn
  postgres_base         = azurerm_postgresql_flexible_server_database.base["produccion"].name
  postgres_usuario      = azurerm_postgresql_flexible_server.principal.administrator_login
  postgres_password     = random_password.postgres.result
  admin_usuario         = var.admin_usuario
  entorno               = "produccion"
  github_token_reportes = var.github_token_reportes
  # Siempre prendida: en las sucursales no pueden esperar a que despierte.
  replicas_minimas = 1
  etiquetas        = merge(local.etiquetas, { ambiente = "produccion" })
}
