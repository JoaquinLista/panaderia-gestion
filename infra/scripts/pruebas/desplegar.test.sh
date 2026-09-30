#!/usr/bin/env bash
# Pruebas de desplegar.sh con un `az` y un `curl` de mentira (sin Azure).
#   bash infra/scripts/pruebas/desplegar.test.sh
set -euo pipefail
AQUI=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$AQUI/../desplegar.sh"
export PATH="$AQUI:$PATH" PAUSA=0 ESPERA_MAXIMA=2
export ESTADO
ESTADO=$(mktemp -d)
trap 'rm -rf "$ESTADO"' EXIT

SHA1=1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
SHA2=2222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
AMB=lafueguina-staging
BACK=ghcr.io/joaquinlista/panaderia-gestion-backend
FRONT=ghcr.io/joaquinlista/panaderia-gestion-frontend
fallas=0

# Como las deja Terraform: una versión con la imagen :main.
apps_recien_creadas() {
  rm -f "$ESTADO"/*
  cat >"$ESTADO/$AMB-api.json" <<JSON
{
  "name": "$AMB-api",
  "tags": {"ambiente": "staging", "gestion": "terraform"},
  "properties": {
    "provisioningState": "Succeeded",
    "configuration": {
      "secrets": [{"name": "jwt-secret"}],
      "ingress": {"fqdn": "$AMB-api.internal.azul123.chilecentral.azurecontainerapps.io", "targetPort": 3000}
    },
    "template": {
      "containers": [{"name": "backend", "image": "$BACK:main", "env": [{"name": "JWT_SECRET", "secretRef": "jwt-secret"}]}]
    }
  },
  "revisiones": [{"name": "$AMB-api--inicial", "properties": {"active": true, "createdTime": "2025-12-31T00:00:00Z", "template": {"containers": [{"image": "$BACK:main"}]}}}]
}
JSON
  cat >"$ESTADO/$AMB.json" <<JSON
{
  "name": "$AMB",
  "properties": {
    "provisioningState": "Succeeded",
    "configuration": {"ingress": {"fqdn": "$AMB.azul123.chilecentral.azurecontainerapps.io", "targetPort": 80}},
    "template": {
      "containers": [{"name": "frontend", "image": "$FRONT:main", "env": [{"name": "BACKEND_URL", "value": "http://$AMB-api.internal.azul123.chilecentral.azurecontainerapps.io"}]}]
    }
  },
  "revisiones": [{"name": "$AMB--inicial", "properties": {"active": true, "createdTime": "2025-12-31T00:00:00Z", "template": {"containers": [{"image": "$FRONT:main"}]}}}]
}
JSON
}

imagen() { jq -r '.properties.template.containers[0].image' "$ESTADO/$1.json"; }
versiones() { jq '.revisiones | length' "$ESTADO/$1.json"; }

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
apps_recien_creadas
"$SCRIPT" actualizar "$AMB" "$SHA1" 2>/dev/null
prueba "el backend queda con la imagen del commit" "$(imagen "$AMB-api")" "$BACK:$SHA1"
prueba "la pantalla queda con la imagen del commit" "$(imagen "$AMB")" "$FRONT:$SHA1"
prueba "primero se actualiza el backend y después la pantalla" \
  "$(grep -o 'patch --url [^ ]*' "$ESTADO/log" | sed -E 's|.*/containerApps/([^?]+).*|\1|' | paste -sd,)" \
  "$AMB-api,$AMB"
prueba "no elige el nombre de la versión (express no lo permite)" \
  "$(grep -c revisionSuffix "$ESTADO/log" || true)" "0"
prueba "no toca las etiquetas de Terraform" \
  "$(jq -c '.tags | {ambiente, gestion}' "$ESTADO/$AMB-api.json")" '{"ambiente":"staging","gestion":"terraform"}'
prueba "no toca las variables ni los secretos" \
  "$(jq -c '[.properties.template.containers[0].env[0].secretRef, .properties.configuration.secrets[0].name]' "$ESTADO/$AMB-api.json")" \
  '["jwt-secret","jwt-secret"]'
prueba "la pantalla sigue apuntando al backend interno" \
  "$(jq -r '.properties.template.containers[0].env[0].value' "$ESTADO/$AMB.json")" \
  "http://$AMB-api.internal.azul123.chilecentral.azurecontainerapps.io"
prueba "la dirección es la pública de la pantalla" \
  "$("$SCRIPT" url "$AMB")" "https://$AMB.azul123.chilecentral.azurecontainerapps.io"

# Volver a correr (un reintento del workflow) no crea otra versión.
"$SCRIPT" actualizar "$AMB" "$SHA1" 2>/dev/null
prueba "actualizar dos veces no duplica la versión" "$(versiones "$AMB-api"),$(versiones "$AMB")" "2,2"

# Esperar: tiene que contestar con el SHA nuevo.
if VERSION_QUE_CONTESTA=otra "$SCRIPT" esperar "$AMB" "$SHA1" 2>/dev/null; then r=pasó; else r=falló; fi
prueba "esperar falla si contesta otra versión" "$r" "falló"
if VERSION_QUE_CONTESTA=$SHA1 "$SCRIPT" esperar "$AMB" "$SHA1" 2>/dev/null; then r=pasó; else r=falló; fi
prueba "esperar pasa cuando contesta la versión nueva" "$r" "pasó"

# La imagen :main de Terraform no cuenta como versión a la que volver.
if "$SCRIPT" anterior "$AMB" >/dev/null 2>&1; then r=pasó; else r=falló; fi
prueba "sin un despliegue anterior no hay a dónde volver" "$r" "falló"

# ---- Segundo despliegue y volver atrás ----
"$SCRIPT" actualizar "$AMB" "$SHA2" 2>/dev/null
prueba "después del segundo, la anterior es la primera" "$("$SCRIPT" anterior "$AMB" 2>/dev/null)" "$SHA1"
prueba "sólo queda activa la versión nueva" \
  "$(jq -c '[.revisiones[] | select(.properties.active) | .properties.template.containers[0].image]' "$ESTADO/$AMB-api.json")" "[\"$BACK:$SHA2\"]"

# Volver atrás = actualizar a la anterior.
"$SCRIPT" actualizar "$AMB" "$("$SCRIPT" anterior "$AMB" 2>/dev/null)" 2>/dev/null
prueba "volver atrás deja las dos apps en la primera" "$(imagen "$AMB-api") $(imagen "$AMB")" "$BACK:$SHA1 $FRONT:$SHA1"
prueba "y volver otra vez deshace el volver" "$("$SCRIPT" anterior "$AMB" 2>/dev/null)" "$SHA2"

# ---- Errores ----
if "$SCRIPT" actualizar "$AMB" main 2>/dev/null; then r=pasó; else r=falló; fi
prueba "actualizar exige el SHA completo" "$r" "falló"

apps_recien_creadas
if FALLA_PATCH=1 "$SCRIPT" actualizar "$AMB" "$SHA1" 2>/dev/null; then r=pasó; else r=falló; fi
prueba "si Azure rechaza el cambio, el script falla" "$r" "falló"
prueba "y la pantalla no se toca si falló el backend" "$(imagen "$AMB")" "$FRONT:main"

echo
if [[ $fallas -gt 0 ]]; then
  echo "$fallas prueba(s) fallaron."
  exit 1
fi
echo "Todas las pruebas pasaron."
