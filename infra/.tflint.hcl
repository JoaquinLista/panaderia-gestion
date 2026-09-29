# Reglas de tflint: las recomendadas de Terraform y las de Azure (por ejemplo,
# tamaños de máquina o versiones que no existen).
plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "azurerm" {
  enabled = true
  version = "0.32.0"
  source  = "github.com/terraform-linters/tflint-ruleset-azurerm"
}
