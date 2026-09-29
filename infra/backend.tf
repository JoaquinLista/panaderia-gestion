# El estado de Terraform (qué recursos existen) se guarda en una cuenta de
# almacenamiento de Azure que crea el script bootstrap/preparar-azure.sh. El
# nombre de la cuenta se pasa al hacer `terraform init` con -backend-config
# (ver .github/workflows/infra.yml), porque es único para cada suscripción.
terraform {
  backend "azurerm" {
    resource_group_name = "rg-lafueguina-estado"
    container_name      = "tfstate"
    key                 = "lafueguina.tfstate"
    use_oidc            = true
    use_azuread_auth    = true
  }
}
