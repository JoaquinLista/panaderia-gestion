#!/usr/bin/env bash
# =============================================================
#  Despliegue blue-green de una Container App de La Fueguina Stats.
#
#  La app tiene varias revisiones (versiones) activas a la vez y el tráfico
#  se reparte con etiquetas:
#    actual    → la versión que usan las sucursales (100 % del tráfico)
#    anterior  → la que estaba antes, prendida y sin tráfico, para volver atrás
#    verde     → la versión nueva mientras se prueba (0 % del tráfico)
#  Cada etiqueta tiene su propia dirección: https://<app>---<etiqueta>.<dominio>
#
#  Uso (lo llaman los workflows desplegar.yml y volver-atras.yml):
#    blue-green.sh preparar <app> <sha>   crea la revisión nueva con la etiqueta "verde"
#    blue-green.sh esperar  <app> <sha>   espera a que la verde conteste /api/health con ese SHA
#    blue-green.sh pasar    <app> <sha>   le pasa todo el tráfico a la verde
#    blue-green.sh volver   <app>         devuelve el tráfico a la anterior
#    blue-green.sh url      <app> [etiqueta]
#
#  Todo va por la API de Azure (az rest) con JSON Merge Patch: sólo se toca la
#  plantilla o el tráfico; los secretos y el resto de la configuración quedan igual.
# =============================================================
set -euo pipefail

GRUPO="${GRUPO:-rg-lafueguina}"
API="api-version=2024-03-01"
IMAGEN_BACKEND="${IMAGEN_BACKEND:-ghcr.io/joaquinlista/panaderia-gestion-backend}"
IMAGEN_FRONTEND="${IMAGEN_FRONTEND:-ghcr.io/joaquinlista/panaderia-gestion-frontend}"
ESPERA_MAXIMA="${ESPERA_MAXIMA:-600}" # segundos
PAUSA="${PAUSA:-10}"

log() { echo "[blue-green] $*" >&2; }
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

sufijo() { echo "v${1:0:7}"; }

url() {
  local app=$1 etiqueta=${2:-} fqdn
  fqdn=$(app_json "$app" | jq -r '.properties.configuration.ingress.fqdn')
  if [[ -z "$etiqueta" ]]; then
    echo "https://$fqdn"
  else
    # lafueguina-staging.xyz.brazilsouth.azurecontainerapps.io → lafueguina-staging---verde.xyz...
    echo "https://$app---$etiqueta.${fqdn#*.}"
  fi
}

# Revisión que hoy recibe el tráfico. La primera vez (recién creada por
# Terraform) el tráfico va a "la última revisión" sin nombre: se toma esa.
revision_actual() {
  app_json "$1" | jq -r '
    (.properties.configuration.ingress.traffic // [] | map(select(.weight == 100 and .revisionName != null)) | .[0].revisionName)
    // .properties.latestRevisionName'
}

etiqueta_de() {
  app_json "$1" | jq -r --arg e "$2" \
    '.properties.configuration.ingress.traffic // [] | map(select(.label == $e)) | .[0].revisionName // empty'
}

trafico() {
  # trafico <app> <revisión>=<peso>:<etiqueta> ...
  local app=$1
  shift
  local lista="[]" r
  for r in "$@"; do
    lista=$(jq -c --arg nombre "${r%%=*}" --argjson peso "$(cut -d= -f2 <<<"$r" | cut -d: -f1)" \
      --arg etiqueta "${r##*:}" '. + [{revisionName: $nombre, weight: $peso, label: $etiqueta}]' <<<"$lista")
  done
  parchar "$app" "{\"properties\":{\"configuration\":{\"ingress\":{\"traffic\":$lista}}}}"
}

preparar() {
  local app=$1 sha=$2 nueva actual plantilla
  nueva="$app--$(sufijo "$sha")"
  actual=$(revision_actual "$app")
  log "$app: versión actual $actual, nueva $nueva"

  if [[ "$actual" == "$nueva" ]]; then
    log "Esa versión ya es la actual: no hay nada que preparar."
    return 0
  fi

  if app_json "$app" | jq -e --arg n "$nueva" '.properties.latestRevisionName == $n' >/dev/null; then
    log "La revisión $nueva ya existe (se está reintentando): se reusa."
  else
    # Primero se fija el tráfico en la actual por nombre: si quedara en "la
    # última revisión", la nueva recibiría tráfico apenas se crea.
    trafico "$app" "$actual=100:actual"
    plantilla=$(app_json "$app" | jq -c \
      --arg suf "$(sufijo "$sha")" \
      --arg back "$IMAGEN_BACKEND:$sha" \
      --arg front "$IMAGEN_FRONTEND:$sha" '
        .properties.template
        | .revisionSuffix = $suf
        | .containers |= map(
            if .name == "backend" then .image = $back
            elif .name == "frontend" then .image = $front
            else . end)')
    parchar "$app" "{\"properties\":{\"template\":$plantilla}}"
  fi

  trafico "$app" "$actual=100:actual" "$nueva=0:verde"
  log "Versión nueva sin tráfico en $(url "$app" verde)"
}

esperar() {
  local app=$1 sha=$2 direccion respuesta version inicio=$SECONDS
  direccion="$(url "$app" verde)/api/health"
  log "Esperando que $direccion conteste con la versión ${sha:0:7}…"
  while :; do
    respuesta=$(curl -fsS --max-time 20 "$direccion" 2>/dev/null || true)
    version=$(jq -r '.version // empty' <<<"$respuesta" 2>/dev/null || true)
    if [[ "$version" == "$sha" ]]; then
      log "Lista: $respuesta"
      return 0
    fi
    ((SECONDS - inicio < ESPERA_MAXIMA)) ||
      falla "La versión nueva no contestó bien en ${ESPERA_MAXIMA}s (última respuesta: ${respuesta:-ninguna}). Las sucursales siguen en la versión anterior."
    sleep "$PAUSA"
  done
}

pasar() {
  local app=$1 sha=$2 nueva actual activas r
  nueva="$app--$(sufijo "$sha")"
  actual=$(revision_actual "$app")
  if [[ "$actual" == "$nueva" ]]; then
    log "$nueva ya recibe todo el tráfico."
    return 0
  fi
  trafico "$app" "$nueva=100:actual" "$actual=0:anterior"
  log "Tráfico: $nueva 100 % (actual), $actual 0 % (anterior)."

  # Las revisiones más viejas se apagan: no cobran y se pueden volver a prender.
  activas=$(az rest --method get \
    --url "https://management.azure.com$(id_app "$app")/revisions?$API" |
    jq -r '.value[] | select(.properties.active) | .name')
  for r in $activas; do
    if [[ "$r" != "$nueva" && "$r" != "$actual" ]]; then
      az rest --method post \
        --url "https://management.azure.com$(id_app "$app")/revisions/$r/deactivate?$API" >/dev/null
      log "Apagada la revisión vieja $r."
    fi
  done
}

volver() {
  local app=$1 actual anterior
  actual=$(etiqueta_de "$app" actual)
  anterior=$(etiqueta_de "$app" anterior)
  [[ -n "$anterior" ]] || falla "$app no tiene una versión anterior a la que volver."
  trafico "$app" "$anterior=100:actual" "$actual=0:anterior"
  log "Volvió a $anterior. La que falló ($actual) queda sin tráfico con la etiqueta 'anterior'."
}

[[ $# -ge 2 ]] || falla "Uso: blue-green.sh preparar|esperar|pasar|volver|url <app> [sha|etiqueta]"
comando=$1
shift
case "$comando" in
  preparar | esperar | pasar)
    [[ $# -eq 2 && "$2" =~ ^[0-9a-f]{40}$ ]] || falla "$comando necesita la app y el SHA completo del commit."
    "$comando" "$@"
    ;;
  volver) volver "$1" ;;
  url) url "$@" ;;
  *) falla "Comando desconocido: $comando" ;;
esac
