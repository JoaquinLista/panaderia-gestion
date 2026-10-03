#!/usr/bin/env bash
# Vigilancia de producción: cada 15 minutos (workflow Vigilancia) pregunta si
# la app contesta. Si no contesta, abre un issue (a la dueña del repo le llega
# un mail de GitHub); cuando vuelve, lo comenta y lo cierra.
#
#   vigilar.sh url       la dirección de producción, del último despliegue que salió bien
#   vigilar.sh revisar   pregunta /api/health y abre o cierra el issue
#
# Usa `gh` (viene en los runners, con el GITHUB_TOKEN del workflow) y `curl`.
set -euo pipefail

REPO=${GITHUB_REPOSITORY:?falta GITHUB_REPOSITORY (dueño/repo)}
AMBIENTE=${AMBIENTE:-produccion}
ETIQUETA=${ETIQUETA:-produccion-caida}
INTENTOS=${INTENTOS:-3}
PAUSA=${PAUSA:-30}

# La dirección la guarda el workflow Desplegar en cada despliegue
# (environment.url): así no hay que escribirla en ningún lado.
url() {
  local id
  for id in $(gh api "repos/$REPO/deployments?environment=$AMBIENTE&per_page=10" --jq '.[].id'); do
    local direccion
    direccion=$(gh api "repos/$REPO/deployments/$id/statuses" \
      --jq '[.[] | select(.state == "success" and .environment_url != "")][0].environment_url // empty')
    if [[ -n "$direccion" ]]; then
      echo "${direccion%/}"
      return 0
    fi
  done
  echo "No encontré un despliegue de $AMBIENTE que haya salido bien." >&2
  return 1
}

# Contesta si /api/health da 200 en alguno de los intentos: un corte de
# segundos (una versión nueva arrancando) no es una caída.
contesta() {
  local direccion=$1 intento
  for intento in $(seq 1 "$INTENTOS"); do
    if curl -fsS --max-time 20 "$direccion/api/health" >/dev/null; then return 0; fi
    echo "  No contestó (intento $intento de $INTENTOS)." >&2
    [[ $intento -lt $INTENTOS ]] && sleep "$PAUSA"
  done
  return 1
}

issue_abierto() {
  gh api "repos/$REPO/issues?state=open&labels=$ETIQUETA" --jq '.[0].number // empty'
}

revisar() {
  local direccion abierto ahora
  direccion=$(url)
  abierto=$(issue_abierto)
  ahora=$(date -u '+%Y-%m-%d %H:%M UTC')

  if contesta "$direccion"; then
    echo "Producción contesta: $direccion"
    if [[ -n "$abierto" ]]; then
      gh api "repos/$REPO/issues/$abierto/comments" -f body="Volvió a contestar ($ahora)." >/dev/null
      gh api -X PATCH "repos/$REPO/issues/$abierto" -f state=closed -f state_reason=completed >/dev/null
      echo "Cerré el issue #$abierto."
    fi
    return 0
  fi

  echo "Producción NO contesta: $direccion" >&2
  if [[ -z "$abierto" ]]; then
    gh api "repos/$REPO/issues" \
      -f title="Producción no contesta" \
      -f "labels[]=$ETIQUETA" \
      -f body="$(
        cat <<TEXTO
La vigilancia preguntó $INTENTOS veces por \`$direccion/api/health\` y no contestó ($ahora).

Qué mirar:
- Si la app abre en el celular.
- El último despliegue en Actions → Desplegar (se puede volver a la versión anterior).
- Los logs en Azure: Container App \`lafueguina-produccion-api\` → Registro.

Este issue se cierra solo cuando producción vuelva a contestar.
TEXTO
      )" >/dev/null
    echo "Abrí un issue con la etiqueta $ETIQUETA." >&2
  else
    echo "Ya hay un issue abierto (#$abierto): no abro otro." >&2
  fi
  return 1
}

case "${1:-}" in
  url) url ;;
  revisar) revisar ;;
  *)
    echo "Uso: $0 url|revisar" >&2
    exit 2
    ;;
esac
