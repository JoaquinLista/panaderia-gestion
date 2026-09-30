#!/usr/bin/env bash
# =============================================================
#  Despliegue de un ambiente de La Fueguina Stats en Azure Container Apps.
#
#  Cada ambiente son dos apps: <ambiente>-api (el backend, interno) y
#  <ambiente> (la pantalla, pública). El ambiente de la cuenta de estudiante
#  es "express": una sola versión activa por app. Por eso el cambio es
#  "rolling": Azure levanta la versión nueva, espera que conteste (readiness)
#  y recién ahí apaga la vieja, sin cortes. Las versiones viejas quedan
#  guardadas apagadas y "volver atrás" re-despliega la anterior.
#
#  Uso (lo llaman los workflows desplegar.yml y volver-atras.yml):
#    desplegar.sh actualizar <ambiente> <sha>  backend y después pantalla con las imágenes del commit
#    desplegar.sh esperar    <ambiente> <sha>  espera a que /api/health conteste con ese SHA
#    desplegar.sh anterior   <ambiente>        SHA de la versión que corría antes de la actual
#    desplegar.sh url        <ambiente>
#
#  Todo va por la API de Azure (az rest) con JSON Merge Patch: sólo se toca la
#  imagen; los secretos y el resto de la configuración quedan igual.
# =============================================================
set -euo pipefail

GRUPO="${GRUPO:-rg-lafueguina}"
API="api-version=2024-03-01"
IMAGEN_BACKEND="${IMAGEN_BACKEND:-ghcr.io/joaquinlista/panaderia-gestion-backend}"
IMAGEN_FRONTEND="${IMAGEN_FRONTEND:-ghcr.io/joaquinlista/panaderia-gestion-frontend}"
ESPERA_MAXIMA="${ESPERA_MAXIMA:-600}" # segundos
PAUSA="${PAUSA:-10}"

log() { echo "[desplegar] $*" >&2; }
falla() {
  echo "::error::$*" >&2
  exit 1
}

id_app() {
  local suscripcion
  suscripcion=$(az account show --query id -o tsv)
  echo "/subscriptions/$suscripcion/resourceGroups/$GRUPO/providers/Microsoft.App/containerApps/$1"
}

app_json() { az rest --method get --url "https://management.azure.com$(id_app "$1")?$API"; }

# PATCH y esperar a que Azure termine de aplicarlo.
parchar() {
  local app=$1 cuerpo=$2 estado inicio=$SECONDS
  az rest --method patch --url "https://management.azure.com$(id_app "$app")?$API" \
    --body "$cuerpo" --headers Content-Type=application/json >/dev/null
  while :; do
    estado=$(app_json "$app" | jq -r '.properties.provisioningState')
    case "$estado" in
      Succeeded) return 0 ;;
      Failed | Canceled) falla "Azure no pudo aplicar el cambio en $app (estado $estado)." ;;
    esac
    ((SECONDS - inicio < ESPERA_MAXIMA)) || falla "$app sigue en $estado después de ${ESPERA_MAXIMA}s."
    sleep "$PAUSA"
  done
}

# Nombre de la versión: SHA corto y la hora. La hora hace falta porque volver
# atrás crea otra versión con un commit que ya se desplegó, y Azure no acepta
# repetir el nombre.
sufijo() { echo "v${1:0:7}-$(date -u +%m%d%H%M%S)"; }

url() {
  echo "https://$(app_json "$1" | jq -r '.properties.configuration.ingress.fqdn')"
}

# Cambia la imagen del único contenedor de la app. Si ya tiene esa, no hace nada
# (un reintento del workflow no crea otra versión).
cambiar_imagen() {
  local app=$1 imagen=$2 sha=$3 json plantilla
  json=$(app_json "$app")
  if jq -e --arg i "$imagen" '.properties.template.containers[0].image == $i' <<<"$json" >/dev/null; then
    log "$app ya tiene $imagen."
    return 0
  fi
  plantilla=$(jq -c --arg suf "$(sufijo "$sha")" --arg i "$imagen" '
    .properties.template | .revisionSuffix = $suf | .containers[0].image = $i' <<<"$json")
  log "$app → $imagen"
  parchar "$app" "{\"properties\":{\"template\":$plantilla}}"
}

actualizar() {
  local ambiente=$1 sha=$2
  # Primero el backend: aplica las migraciones (sólo agregan) y la pantalla
  # vieja sigue andando con él. Después la pantalla.
  cambiar_imagen "$ambiente-api" "$IMAGEN_BACKEND:$sha" "$sha"
  cambiar_imagen "$ambiente" "$IMAGEN_FRONTEND:$sha" "$sha"
}

esperar() {
  local ambiente=$1 sha=$2 direccion respuesta version inicio=$SECONDS
  direccion="$(url "$ambiente")/api/health"
  log "Esperando que $direccion conteste con la versión ${sha:0:7}…"
  while :; do
    respuesta=$(curl -fsS --max-time 20 "$direccion" 2>/dev/null || true)
    version=$(jq -r '.version // empty' <<<"$respuesta" 2>/dev/null || true)
    if [[ "$version" == "$sha" ]]; then
      log "Lista: $respuesta"
      return 0
    fi
    ((SECONDS - inicio < ESPERA_MAXIMA)) ||
      falla "La versión nueva no contestó bien en ${ESPERA_MAXIMA}s (última respuesta: ${respuesta:-ninguna})."
    sleep "$PAUSA"
  done
}

# SHA de la versión anterior del backend: la más nueva de las guardadas cuya
# imagen es de otro commit que la actual.
anterior() {
  local api="$1-api" actual sha
  actual=$(app_json "$api" | jq -r '.properties.template.containers[0].image')
  sha=$(az rest --method get --url "https://management.azure.com$(id_app "$api")/revisions?$API" |
    jq -r --arg actual "$actual" '
      [.value[] | {creada: .properties.createdTime, imagen: .properties.template.containers[0].image}]
      | sort_by(.creada) | reverse
      | map(select(.imagen != $actual) | .imagen | split(":") | last)
      | map(select(test("^[0-9a-f]{40}$"))) | .[0] // empty')
  [[ -n "$sha" ]] || falla "$1 no tiene una versión anterior a la que volver."
  echo "$sha"
}

[[ $# -ge 2 ]] || falla "Uso: desplegar.sh actualizar|esperar|anterior|url <ambiente> [sha]"
comando=$1
shift
case "$comando" in
  actualizar | esperar)
    [[ $# -eq 2 && "$2" =~ ^[0-9a-f]{40}$ ]] || falla "$comando necesita el ambiente y el SHA completo del commit."
    "$comando" "$@"
    ;;
  anterior | url) "$comando" "$1" ;;
  *) falla "Comando desconocido: $comando" ;;
esac
