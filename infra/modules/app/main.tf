# =============================================================
#  Una Container App con los dos contenedores de La Fueguina Stats: Nginx
#  con la pantalla (recibe el tráfico) y el backend al lado. Como van en la
#  misma "revisión", cada versión nueva sube los dos juntos y el blue-green
#  cambia de versión la app entera.
# =============================================================

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "random_password" "admin" {
  length  = 20
  special = false
}

resource "azurerm_container_app" "app" {
  name                         = var.nombre
  container_app_environment_id = var.ambiente_apps_id
  resource_group_name          = var.grupo

  # Varias revisiones activas a la vez: la nueva arranca sin tráfico, se prueba
  # y recién ahí se le pasa todo (ver .github/workflows/desplegar.yml).
  revision_mode = "Multiple"
  # Revisiones viejas que se guardan apagadas, para poder volver a ellas.
  max_inactive_revisions = 10

  tags = var.etiquetas

  # Secretos de la app: se generan acá y no pasan nunca por el repo ni por GitHub.
  # La contraseña del admin se ve en el portal: la app → Secretos.
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

      # Los dos contenedores comparten la red: el backend está en 127.0.0.1.
      env {
        name  = "BACKEND_URL"
        value = "http://127.0.0.1:3000"
      }

      readiness_probe {
        transport = "HTTP"
        port      = 80
        path      = "/"
      }
    }

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
      # Adelante hay dos proxies: la entrada de Container Apps y el Nginx.
      env {
        name  = "TRUST_PROXY"
        value = "2"
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
      template[0].container[1].image,
      template[0].revision_suffix,
      ingress[0].traffic_weight,
    ]
  }
}
