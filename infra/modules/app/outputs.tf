output "nombre" {
  description = "Nombre de la Container App."
  value       = azurerm_container_app.app.name
}

output "url" {
  description = "Dirección pública de la app."
  value       = "https://${azurerm_container_app.app.ingress[0].fqdn}"
}
