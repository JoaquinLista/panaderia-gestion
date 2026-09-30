# =============================================================
#  Las dos Container Apps de un ambiente de La Fueguina Stats:
#   - <nombre>-api: el backend. Entrada interna: sólo la ven las apps del
#     mismo ambiente, no internet.
#   - <nombre>: Nginx con la pantalla. Recibe el tráfico y le pasa /api/ al
#     backend.
#  Van separadas porque el ambiente de la cuenta de estudiante es "express":
#  un contenedor por app y una sola versión activa (ver decisiones.md).
# =============================================================

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "random_password" "admin" {
  length  = 20
  special = false
}

resource "azurerm_container_app" "api" {
  name                         = "${var.nombre}-api"
  container_app_environment_id = var.ambiente_apps_id
  resource_group_name          = var.grupo

  # Una versión activa por vez: al cambiar la imagen, Azure levanta la nueva,
  # espera que esté lista (readiness) y recién ahí apaga la vieja.
  revision_mode = "Single"
  # Versiones viejas que se guardan apagadas: "volver atrás" las usa.
  max_inactive_revisions = 10

  tags = var.etiquetas

  # Secretos de la app: se generan acá y no pasan nunca por el repo ni por GitHub.
  # La contraseña del admin se ve en el portal: la app <nombre>-api → Secretos.
  secret {
    name  = "postgres-password"
    value = var.postgres_password
  }
  secret {
    name  = "jwt-secret"
    value = random_password.jwt.result
  }
  secret {
    name  = "admin-password"
    value = random_password.admin.result
  }

  ingress {
    # Sólo dentro del ambiente. Entre apps del ambiente se habla por HTTP; el
    # HTTPS lo pone la entrada pública de la pantalla.
    external_enabled           = false
    target_port                = 3000
    allow_insecure_connections = true

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.replicas_minimas
    max_replicas = 2

    container {
      name   = "backend"
      image  = var.imagen_backend
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "POSTGRES_HOST"
        value = var.postgres_host
      }
      env {
        name  = "POSTGRES_PORT"
        value = "5432"
      }
      env {
        name  = "POSTGRES_DB"
        value = var.postgres_base
      }
      env {
        name  = "POSTGRES_USER"
        value = var.postgres_usuario
      }
      env {
        name        = "POSTGRES_PASSWORD"
        secret_name = "postgres-password"
      }
      env {
        name  = "POSTGRES_SSL"
        value = "true"
      }
      env {
        name        = "JWT_SECRET"
        secret_name = "jwt-secret"
      }
      env {
        name  = "ADMIN_USUARIO"
        value = var.admin_usuario
      }
      env {
        name        = "ADMIN_PASSWORD"
        secret_name = "admin-password"
      }
      # Adelante hay tres proxies: la entrada pública, el Nginx y la entrada
      # interna del backend.
      env {
        name  = "TRUST_PROXY"
        value = "3"
      }

      # Al arrancar aplica las migraciones: se le da hasta 5 minutos.
      startup_probe {
        transport               = "HTTP"
        port                    = 3000
        path                    = "/api/health"
        interval_seconds        = 10
        failure_count_threshold = 30
      }

      # Sin base de datos /api/health da 503 y esta copia deja de recibir tráfico.
      readiness_probe {
        transport = "HTTP"
        port      = 3000
        path      = "/api/health"
      }
    }
  }

  lifecycle {
    # La versión que corre la maneja el workflow de despliegue, no Terraform: si
    # no, cada `terraform apply` volvería a la imagen inicial.
    ignore_changes = [
      template[0].container[0].image,
      template[0].revision_suffix,
    ]
  }
}

resource "azurerm_container_app" "app" {
  name                         = var.nombre
  container_app_environment_id = var.ambiente_apps_id
  resource_group_name          = var.grupo

  revision_mode          = "Single"
  max_inactive_revisions = 10

  tags = var.etiquetas

  ingress {
    # Dirección pública con HTTPS (Azure pone el certificado).
    external_enabled           = true
    target_port                = 80
    allow_insecure_connections = false

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.replicas_minimas
    max_replicas = 2

    container {
      name   = "frontend"
      image  = var.imagen_frontend
      cpu    = 0.25
      memory = "0.5Gi"

      # La dirección interna del backend de este ambiente.
      env {
        name  = "BACKEND_URL"
        value = "http://${azurerm_container_app.api.ingress[0].fqdn}"
      }

      readiness_probe {
        transport = "HTTP"
        port      = 80
        path      = "/"
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].container[0].image,
      template[0].revision_suffix,
    ]
  }
}
