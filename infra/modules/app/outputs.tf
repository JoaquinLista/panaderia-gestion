output "nombre" {
  description = "Nombre de la Container App de la pantalla (la del backend es <nombre>-api)."
  value       = azurerm_container_app.app.name
}

output "nombre_api" {
  description = "Nombre de la Container App del backend."
  value       = azurerm_container_app.api.name
}

output "url" {
  description = "Dirección pública de la app."
  value       = "https://${azurerm_container_app.app.ingress[0].fqdn}"
}
