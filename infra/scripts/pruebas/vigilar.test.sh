#!/usr/bin/env bash
# Pruebas de vigilar.sh con un `gh` y un `curl` de mentira (sin GitHub ni Azure).
#   bash infra/scripts/pruebas/vigilar.test.sh
set -euo pipefail
AQUI=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$AQUI/../vigilar.sh"
export PATH="$AQUI/vigilar:$PATH" PAUSA=0 GITHUB_REPOSITORY=JoaquinLista/panaderia-gestion
export ESTADO
ESTADO=$(mktemp -d)
trap 'rm -rf "$ESTADO"' EXIT
URL=https://lafueguina-produccion.azul123.chilecentral.azurecontainerapps.io
fallas=0

prueba() {
  local nombre=$1 obtenido=$2 esperado=$3
  if [[ "$obtenido" == "$esperado" ]]; then
    echo "  ok  $nombre"
  else
    echo "  MAL $nombre"
    echo "      esperado: $esperado"
    echo "      obtenido: $obtenido"
    fallas=$((fallas + 1))
  fi
}

# El último despliegue (30) está esperando aprobación; el anterior (29) salió bien.
desde_cero() {
  rm -f "$ESTADO"/*
  printf '30\n29\n' >"$ESTADO/despliegues"
  echo "$URL/" >"$ESTADO/url-29"
}
cuantas() { grep -c "$1" "$ESTADO/$2" 2>/dev/null || true; }
corre() { if "$SCRIPT" revisar >/dev/null 2>&1; then echo pasó; else echo falló; fi; }

# ---- La dirección ----
desde_cero
prueba "usa el último despliegue que salió bien, sin la barra final" "$("$SCRIPT" url)" "$URL"
rm -f "$ESTADO/url-29"
if "$SCRIPT" url >/dev/null 2>&1; then r=pasó; else r=falló; fi
prueba "sin despliegues que hayan salido bien, falla" "$r" "falló"

# ---- Contesta ----
desde_cero
touch "$ESTADO/contesta"
prueba "si contesta, todo bien" "$(corre)" "pasó"
prueba "pregunta por /api/health" "$(cuantas "$URL/api/health" curl.log)" "1"
prueba "y no abre ningún issue" "$(cuantas "repos/JoaquinLista/panaderia-gestion/issues -f" gh.log)" "0"

# ---- Se cae ----
desde_cero
prueba "si no contesta, el workflow falla" "$(corre)" "falló"
prueba "lo intenta 3 veces antes de avisar" "$(cuantas api/health curl.log)" "3"
prueba "abre un issue con la etiqueta" "$(cuantas "labels\[\]=produccion-caida" gh.log)" "1"

prueba "si sigue caída, no abre otro" "$(corre)" "falló"
prueba "sigue habiendo un solo issue" "$(cuantas "title=Producción no contesta" gh.log)" "1"

# ---- Vuelve ----
touch "$ESTADO/contesta"
prueba "cuando vuelve, pasa" "$(corre)" "pasó"
prueba "comenta que volvió" "$(cuantas "body=Volvió a contestar" gh.log)" "1"
prueba "y cierra el issue" "$(cuantas "state=closed" gh.log)" "1"
prueba "ya no queda abierto" "$([[ -f "$ESTADO/abierto" ]] && echo sí || echo no)" "no"

# ---- Uso ----
if "$SCRIPT" 2>/dev/null; then r=pasó; else r=falló; fi
prueba "sin comando, explica el uso y falla" "$r" "falló"

echo
if [[ $fallas -gt 0 ]]; then
  echo "$fallas prueba(s) fallaron."
  exit 1
fi
echo "Todas las pruebas pasaron."
