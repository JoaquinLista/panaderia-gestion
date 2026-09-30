output "url_staging" {
  description = "Dirección de staging."
  value       = module.staging.url
}

output "url_produccion" {
  description = "Dirección de producción."
  value       = module.produccion.url
}

output "app_staging" {
  description = "Nombre de la Container App de staging (lo usa el workflow de despliegue)."
  value       = module.staging.nombre
}

output "api_staging" {
  description = "Nombre de la Container App del backend de staging."
  value       = module.staging.nombre_api
}

output "api_produccion" {
  description = "Nombre de la Container App del backend de producción."
  value       = module.produccion.nombre_api
}

output "app_produccion" {
  description = "Nombre de la Container App de producción."
  value       = module.produccion.nombre
}

output "postgres_servidor" {
  description = "Servidor de Postgres."
  value       = azurerm_postgresql_flexible_server.principal.fqdn
}
