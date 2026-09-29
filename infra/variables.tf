variable "grupo_de_recursos" {
  description = "Grupo de recursos donde vive todo. Lo crea bootstrap/preparar-azure.sh y el pipeline sólo tiene permiso ahí."
  type        = string
  default     = "rg-lafueguina"
}

variable "prefijo" {
  description = "Prefijo de los nombres de los recursos."
  type        = string
  default     = "lafueguina"
}

variable "imagen_backend" {
  description = "Imagen del backend con la que se crean las apps. Después el workflow de despliegue la cambia por la del commit."
  type        = string
  default     = "ghcr.io/joaquinlista/panaderia-gestion-backend:main"
}

variable "imagen_frontend" {
  description = "Imagen del frontend con la que se crean las apps."
  type        = string
  default     = "ghcr.io/joaquinlista/panaderia-gestion-frontend:main"
}

variable "admin_usuario" {
  description = "Usuario del primer administrador de la app en cada ambiente."
  type        = string
  default     = "admin"
}

variable "postgres_version" {
  description = "Versión de Postgres del servidor administrado."
  type        = string
  default     = "16"
}
