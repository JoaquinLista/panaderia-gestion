# `terraform test`: revisa el plan sin conectarse a Azure. Los proveedores son
# de mentira (mock_provider) y el grupo de recursos se inventa acá.

mock_provider "azurerm" {
  mock_data "azurerm_resource_group" {
    defaults = {
      location = "brazilsouth"
    }
  }
}

mock_provider "random" {}

run "staging_y_produccion" {
  command = plan

  # Staging se apaga sola; producción siempre tiene una copia prendida.
  assert {
    condition     = module.staging.nombre == "lafueguina-staging" && module.produccion.nombre == "lafueguina-produccion"
    error_message = "Las apps se tienen que llamar lafueguina-staging y lafueguina-produccion (el workflow de despliegue usa esos nombres)."
  }

  assert {
    condition     = azurerm_postgresql_flexible_server.principal.sku_name == "B_Standard_B1ms"
    error_message = "El servidor de Postgres tiene que ser el más chico (B1ms)."
  }

  assert {
    condition     = length(azurerm_postgresql_flexible_server_database.base) == 2
    error_message = "Tiene que haber una base para staging y otra para producción."
  }

  assert {
    condition     = azurerm_postgresql_flexible_server.principal.location == "brazilsouth"
    error_message = "Todo va en la región del grupo de recursos."
  }
}

run "app_de_un_ambiente" {
  command = plan

  module {
    source = "./modules/app"
  }

  variables {
    nombre            = "prueba"
    grupo             = "rg-prueba"
    ambiente_apps_id  = "/subscriptions/0/resourceGroups/rg-prueba/providers/Microsoft.App/managedEnvironments/prueba"
    imagen_backend    = "ghcr.io/joaquinlista/panaderia-gestion-backend:main"
    imagen_frontend   = "ghcr.io/joaquinlista/panaderia-gestion-frontend:main"
    postgres_host     = "prueba.postgres.database.azure.com"
    postgres_base     = "staging"
    postgres_usuario  = "lafueguina"
    postgres_password = "no-es-real"
    admin_usuario     = "admin"
    replicas_minimas  = 0
    etiquetas         = {}
  }

  assert {
    condition     = azurerm_container_app.app.revision_mode == "Single" && azurerm_container_app.api.revision_mode == "Single"
    error_message = "El ambiente express sólo permite una versión activa por app."
  }

  assert {
    condition     = azurerm_container_app.api.name == "prueba-api"
    error_message = "El backend se llama como la app con -api (el workflow de despliegue usa ese nombre)."
  }

  assert {
    condition     = azurerm_container_app.app.ingress[0].target_port == 80 && azurerm_container_app.app.ingress[0].external_enabled && azurerm_container_app.app.ingress[0].allow_insecure_connections == false
    error_message = "El tráfico entra por HTTPS al Nginx (puerto 80)."
  }

  assert {
    condition     = azurerm_container_app.api.ingress[0].external_enabled == false && azurerm_container_app.api.ingress[0].target_port == 3000
    error_message = "El backend no se publica en internet: sólo lo ve la pantalla."
  }

  assert {
    condition     = length(azurerm_container_app.app.template[0].container) == 1 && length(azurerm_container_app.api.template[0].container) == 1
    error_message = "El ambiente express permite un solo contenedor por app."
  }

  assert {
    condition     = length(azurerm_container_app.app.secret) == 0
    error_message = "La pantalla no necesita secretos: todos van en el backend."
  }

  assert {
    condition = alltrue([
      for e in azurerm_container_app.api.template[0].container[0].env :
      e.value == null if contains(["POSTGRES_PASSWORD", "JWT_SECRET", "ADMIN_PASSWORD"], e.name)
    ])
    error_message = "Las contraseñas tienen que venir de un secreto, nunca escritas en la variable."
  }

  assert {
    condition = anytrue([
      for e in azurerm_container_app.api.template[0].container[0].env :
      e.name == "POSTGRES_SSL" && e.value == "true"
    ])
    error_message = "Azure exige SSL para conectarse a Postgres."
  }
}
