#!/usr/bin/env bash
# Pruebas de blue-green.sh con un `az` y un `curl` de mentira (sin Azure).
#   bash infra/scripts/pruebas/blue-green.test.sh
set -euo pipefail
AQUI=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$AQUI/../blue-green.sh"
export PATH="$AQUI:$PATH" PAUSA=0 ESPERA_MAXIMA=2
export ESTADO
ESTADO=$(mktemp)
trap 'rm -f "$ESTADO" "$ESTADO.log" "$ESTADO.tmp"' EXIT

SHA1=1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
SHA2=2222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
APP=lafueguina-staging
fallas=0

# Como la deja Terraform: una revisión y el tráfico en "la última".
app_recien_creada() {
  cat >"$ESTADO" <<JSON
{
  "name": "$APP",
  "properties": {
    "provisioningState": "Succeeded",
    "latestRevisionName": "$APP--inicial",
    "configuration": {
      "secrets": [{"name": "jwt-secret"}],
      "ingress": {
        "fqdn": "$APP.azul123.brazilsouth.azurecontainerapps.io",
        "targetPort": 80,
        "traffic": [{"latestRevision": true, "weight": 100}]
      }
    },
    "template": {
      "containers": [
        {"name": "frontend", "image": "ghcr.io/x/frontend:main", "env": [{"name": "BACKEND_URL", "value": "http://127.0.0.1:3000"}]},
        {"name": "backend", "image": "ghcr.io/x/backend:main", "env": [{"name": "JWT_SECRET", "secretRef": "jwt-secret"}]}
      ]
    }
  },
  "revisiones": [{"name": "$APP--inicial", "properties": {"active": true}}]
}
JSON
}

trafico() { jq -c '[.properties.configuration.ingress.traffic[] | "\(.revisionName // "ultima")=\(.weight):\(.label // "")"]' "$ESTADO"; }

prueba() {
  local nombre=$1 obtenido=$2 esperado=$3
  if [[ "$obtenido" == "$esperado" ]]; then
    echo "ok   $nombre"
  else
    echo "FALLA $nombre"
    echo "     esperado: $esperado"
    echo "     obtenido: $obtenido"
    fallas=$((fallas + 1))
  fi
}

# ---- Primer despliegue ----
app_recien_creada
"$SCRIPT" preparar "$APP" "$SHA1" 2>/dev/null
prueba "preparar deja la nueva sin tráfico y la actual con todo" \
  "$(trafico)" "[\"$APP--inicial=100:actual\",\"$APP--v1111111=0:verde\"]"
prueba "la revisión nueva usa las imágenes del commit" \
  "$(jq -c '[.properties.template.containers[].image]' "$ESTADO")" \
  "[\"ghcr.io/joaquinlista/panaderia-gestion-frontend:$SHA1\",\"ghcr.io/joaquinlista/panaderia-gestion-backend:$SHA1\"]"
prueba "no toca las variables ni los secretos" \
  "$(jq -c '[.properties.template.containers[1].env[0].secretRef, .properties.configuration.secrets[0].name]' "$ESTADO")" \
  '["jwt-secret","jwt-secret"]'
prueba "la dirección de prueba es la de la etiqueta verde" \
  "$("$SCRIPT" url "$APP" verde)" "https://$APP---verde.azul123.brazilsouth.azurecontainerapps.io"

# Volver a correr (un reintento del workflow) no crea otra revisión.
"$SCRIPT" preparar "$APP" "$SHA1" 2>/dev/null
prueba "preparar dos veces no duplica la revisión" "$(jq '.revisiones | length' "$ESTADO")" "2"

# Si la nueva no contesta con su versión, falla y no se pasa el tráfico.
if VERSION_QUE_CONTESTA=otra "$SCRIPT" esperar "$APP" "$SHA1" 2>/dev/null; then r=pasó; else r=falló; fi
prueba "esperar falla si contesta otra versión" "$r" "falló"
prueba "y el tráfico sigue en la anterior" "$(trafico)" "[\"$APP--inicial=100:actual\",\"$APP--v1111111=0:verde\"]"

VERSION_QUE_CONTESTA=$SHA1 "$SCRIPT" esperar "$APP" "$SHA1" 2>/dev/null
"$SCRIPT" pasar "$APP" "$SHA1" 2>/dev/null
prueba "pasar le da todo a la nueva y deja la vieja como anterior" \
  "$(trafico)" "[\"$APP--v1111111=100:actual\",\"$APP--inicial=0:anterior\"]"

# ---- Segundo despliegue ----
"$SCRIPT" preparar "$APP" "$SHA2" 2>/dev/null
prueba "el segundo despliegue parte de la versión actual" \
  "$(trafico)" "[\"$APP--v1111111=100:actual\",\"$APP--v2222222=0:verde\"]"
"$SCRIPT" pasar "$APP" "$SHA2" 2>/dev/null
prueba "después del segundo, la anterior es la primera" \
  "$(trafico)" "[\"$APP--v2222222=100:actual\",\"$APP--v1111111=0:anterior\"]"
prueba "la revisión inicial se apaga; quedan prendidas la actual y la anterior" \
  "$(jq -c '[.revisiones[] | select(.properties.active) | .name]' "$ESTADO")" \
  "[\"$APP--v1111111\",\"$APP--v2222222\"]"
"$SCRIPT" pasar "$APP" "$SHA2" 2>/dev/null
prueba "pasar dos veces no cambia nada" \
  "$(trafico)" "[\"$APP--v2222222=100:actual\",\"$APP--v1111111=0:anterior\"]"

# ---- Volver atrás ----
"$SCRIPT" volver "$APP" 2>/dev/null
prueba "volver le devuelve el tráfico a la anterior" \
  "$(trafico)" "[\"$APP--v1111111=100:actual\",\"$APP--v2222222=0:anterior\"]"
"$SCRIPT" volver "$APP" 2>/dev/null
prueba "volver otra vez deshace el volver" \
  "$(trafico)" "[\"$APP--v2222222=100:actual\",\"$APP--v1111111=0:anterior\"]"

app_recien_creada
if "$SCRIPT" volver "$APP" 2>/dev/null; then r=pasó; else r=falló; fi
prueba "volver sin versión anterior falla" "$r" "falló"

if "$SCRIPT" preparar "$APP" main 2>/dev/null; then r=pasó; else r=falló; fi
prueba "preparar exige el SHA completo" "$r" "falló"

if FALLA_PATCH=1 "$SCRIPT" preparar "$APP" "$SHA1" 2>/dev/null; then r=pasó; else r=falló; fi
prueba "si Azure rechaza el cambio, el script falla" "$r" "falló"

echo
if [[ $fallas -gt 0 ]]; then
  echo "$fallas prueba(s) fallaron."
  exit 1
fi
echo "Todas las pruebas pasaron."
