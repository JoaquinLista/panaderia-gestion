#!/usr/bin/env bash
# =============================================================
#  Preparación de Azure para La Fueguina Stats. Se corre UNA sola vez, en
#  Azure Cloud Shell (portal.azure.com → el ícono >_ de arriba → Bash):
#
#    curl -fsSL https://raw.githubusercontent.com/JoaquinLista/panaderia-gestion/main/infra/bootstrap/preparar-azure.sh | bash
#
#  Crea lo que Terraform necesita antes de poder arrancar:
#   1. Registra los servicios de Azure que se usan.
#   2. Dos grupos de recursos: rg-lafueguina (la app) y rg-lafueguina-estado
#      (el estado de Terraform).
#   3. La cuenta de almacenamiento donde Terraform guarda su estado.
#   4. Una identidad para GitHub Actions con permiso de confianza (OIDC): GitHub
#      entra a Azure sin ninguna contraseña guardada. Sólo puede tocar
#      rg-lafueguina y el estado de Terraform, nada más de la cuenta.
#
#  Al final imprime cuatro valores para cargar como variables del repo en
#  GitHub. No son secretos: sin el permiso de confianza no sirven de nada.
#  Se puede volver a correr sin romper nada: lo que ya existe queda como está.
# =============================================================
set -euo pipefail

REPO="${REPO:-JoaquinLista/panaderia-gestion}"
# Las cuentas de estudiante sólo permiten algunas regiones; para verlas:
#   az policy assignment list --disable-scope-strict-match --query "[].parameters" -o json
UBICACION="${UBICACION:-chilecentral}"
GRUPO_APP="rg-lafueguina"
GRUPO_ESTADO="rg-lafueguina-estado"
IDENTIDAD="id-github-lafueguina"
# Ambientes de GitHub que pueden entrar a Azure (ver .github/workflows).
AMBIENTES=(infra staging produccion)

paso() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# Azure a veces tarda en "ver" algo recién creado (sobre todo en regiones
# nuevas como Chile): el paso siguiente falla con "not found". Reintenta el
# comando cada 15 segundos, hasta 3 minutos, antes de darse por vencido.
reintentar() {
  local intento
  for intento in $(seq 1 12); do
    if "$@"; then return 0; fi
    echo "  Azure todavía no lo ve, reintento en 15 segundos ($intento/12)..." >&2
    sleep 15
  done
  "$@"
}

SUSCRIPCION=$(az account show --query id -o tsv)
TENANT=$(az account show --query tenantId -o tsv)
echo "Suscripción: $(az account show --query name -o tsv) ($SUSCRIPCION)"
echo "Región: $UBICACION"

paso "1/4 Registrando los servicios de Azure (puede tardar un par de minutos)"
for proveedor in Microsoft.App Microsoft.OperationalInsights Microsoft.DBforPostgreSQL \
  Microsoft.Storage Microsoft.ManagedIdentity; do
  az provider register --namespace "$proveedor" --wait
  echo "  $proveedor listo"
done

paso "2/4 Grupos de recursos"
az group create --name "$GRUPO_APP" --location "$UBICACION" \
  --tags proyecto=la-fueguina-stats -o none
az group create --name "$GRUPO_ESTADO" --location "$UBICACION" \
  --tags proyecto=la-fueguina-stats -o none
echo "  $GRUPO_APP y $GRUPO_ESTADO"

paso "3/4 Cuenta de almacenamiento para el estado de Terraform"
# El nombre tiene que ser único en todo Azure: se arma con la suscripción, así
# siempre da el mismo y volver a correr el script no crea otra.
CUENTA="lafueguinatf$(printf '%s' "$SUSCRIPCION" | sha256sum | cut -c1-8)"
az storage account create --name "$CUENTA" --resource-group "$GRUPO_ESTADO" \
  --location "$UBICACION" --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false -o none
# Con versiones, si el estado se rompe se puede volver al anterior.
reintentar az storage account blob-service-properties update --account-name "$CUENTA" \
  --resource-group "$GRUPO_ESTADO" --enable-versioning true -o none
CLAVE=$(reintentar az storage account keys list --account-name "$CUENTA" \
  --resource-group "$GRUPO_ESTADO" --query '[0].value' -o tsv)
az storage container create --name tfstate --account-name "$CUENTA" \
  --account-key "$CLAVE" -o none
echo "  $CUENTA/tfstate"

paso "4/4 Identidad de GitHub Actions (OIDC)"
az identity create --name "$IDENTIDAD" --resource-group "$GRUPO_ESTADO" \
  --location "$UBICACION" -o none
CLIENT_ID=$(reintentar az identity show --name "$IDENTIDAD" --resource-group "$GRUPO_ESTADO" --query clientId -o tsv)
PRINCIPAL_ID=$(az identity show --name "$IDENTIDAD" --resource-group "$GRUPO_ESTADO" --query principalId -o tsv)

# Qué workflows pueden usar la identidad: los PRs (sólo para el plan de
# Terraform) y los jobs de los ambientes de GitHub. Los PRs que vienen de forks
# no reciben el permiso: GitHub no les da el token.
confiar() {
  local nombre=$1 sujeto=$2
  if az identity federated-credential show --name "$nombre" --identity-name "$IDENTIDAD" \
    --resource-group "$GRUPO_ESTADO" -o none 2>/dev/null; then
    echo "  $sujeto (ya estaba)"
    return
  fi
  reintentar az identity federated-credential create --name "$nombre" --identity-name "$IDENTIDAD" \
    --resource-group "$GRUPO_ESTADO" --issuer https://token.actions.githubusercontent.com \
    --subject "$sujeto" --audiences api://AzureADTokenExchange -o none
  echo "  $sujeto"
}
confiar github-pull-request "repo:$REPO:pull_request"
for ambiente in "${AMBIENTES[@]}"; do
  confiar "github-$ambiente" "repo:$REPO:environment:$ambiente"
done

# Permisos mínimos: administrar los recursos de la app y leer/escribir el estado.
permiso() {
  local rol=$1 alcance=$2
  reintentar az role assignment create --assignee-object-id "$PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal --role "$rol" --scope "$alcance" -o none
  echo "  $rol en ${alcance##*/}"
}
# Recién creada, la identidad tarda unos segundos en verse para los permisos.
sleep 20
permiso Contributor "$(az group show --name "$GRUPO_APP" --query id -o tsv)"
permiso "Storage Blob Data Contributor" \
  "$(az storage account show --name "$CUENTA" --resource-group "$GRUPO_ESTADO" --query id -o tsv)"

cat <<FIN

Listo. Cargá estas cuatro variables en GitHub:
  Settings → Secrets and variables → Actions → pestaña Variables → New repository variable

  AZURE_CLIENT_ID        $CLIENT_ID
  AZURE_TENANT_ID        $TENANT
  AZURE_SUBSCRIPTION_ID  $SUSCRIPCION
  TFSTATE_CUENTA         $CUENTA
FIN
