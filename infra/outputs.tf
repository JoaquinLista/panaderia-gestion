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

output "app_produccion" {
  description = "Nombre de la Container App de producción."
  value       = module.produccion.nombre
}

output "postgres_servidor" {
  description = "Servidor de Postgres."
  value       = azurerm_postgresql_flexible_server.principal.fqdn
}
