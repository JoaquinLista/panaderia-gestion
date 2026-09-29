# En el pipeline, GitHub entra a Azure con OIDC (sin claves guardadas): las
# variables ARM_CLIENT_ID, ARM_TENANT_ID, ARM_SUBSCRIPTION_ID y ARM_USE_OIDC las
# pone el workflow. En la compu, con `az login` alcanza.
provider "azurerm" {
  features {}

  # El script de preparación ya registró los servicios que se usan (Container
  # Apps, Postgres, logs). La identidad del pipeline sólo tiene permiso sobre el
  # grupo de recursos, no sobre toda la suscripción, así que no puede registrarlos.
  resource_provider_registrations = "none"

  # El estado se lee con la identidad (OIDC), no con la clave de la cuenta de almacenamiento.
  storage_use_azuread = true
}
