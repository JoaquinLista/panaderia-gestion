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
    condition     = azurerm_container_app.app.revision_mode == "Multiple"
    error_message = "Blue-green necesita varias revisiones activas a la vez."
  }

  assert {
    condition     = azurerm_container_app.app.ingress[0].target_port == 80 && azurerm_container_app.app.ingress[0].allow_insecure_connections == false
    error_message = "El tráfico entra por HTTPS al Nginx (puerto 80)."
  }

  assert {
    condition = alltrue([
      for e in azurerm_container_app.app.template[0].container[1].env :
      e.value == null if contains(["POSTGRES_PASSWORD", "JWT_SECRET", "ADMIN_PASSWORD"], e.name)
    ])
    error_message = "Las contraseñas tienen que venir de un secreto, nunca escritas en la variable."
  }

  assert {
    condition = anytrue([
      for e in azurerm_container_app.app.template[0].container[1].env :
      e.name == "POSTGRES_SSL" && e.value == "true"
    ])
    error_message = "Azure exige SSL para conectarse a Postgres."
  }

  assert {
    condition = anytrue([
      for e in azurerm_container_app.app.template[0].container[0].env :
      e.name == "BACKEND_URL" && e.value == "http://127.0.0.1:3000"
    ])
    error_message = "El Nginx tiene que hablar con el backend del mismo contenedor."
  }
}
