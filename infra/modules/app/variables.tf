variable "nombre" {
  description = "Nombre de la Container App (también forma parte de su dirección web)."
  type        = string
}

variable "grupo" {
  description = "Grupo de recursos."
  type        = string
}

variable "ambiente_apps_id" {
  description = "Id del ambiente de Container Apps."
  type        = string
}

variable "imagen_backend" {
  description = "Imagen inicial del backend."
  type        = string
}

variable "imagen_frontend" {
  description = "Imagen inicial del frontend."
  type        = string
}

variable "postgres_host" {
  description = "Servidor de Postgres."
  type        = string
}

variable "postgres_base" {
  description = "Base de datos de este ambiente."
  type        = string
}

variable "postgres_usuario" {
  description = "Usuario de Postgres."
  type        = string
}

variable "postgres_password" {
  description = "Contraseña de Postgres."
  type        = string
  sensitive   = true
}

variable "admin_usuario" {
  description = "Usuario del primer administrador de la app."
  type        = string
}

variable "replicas_minimas" {
  description = "Copias prendidas aunque no haya tráfico (0 = se apaga sola)."
  type        = number
}

variable "etiquetas" {
  description = "Etiquetas de Azure."
  type        = map(string)
}
