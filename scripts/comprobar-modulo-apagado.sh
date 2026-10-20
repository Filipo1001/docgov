#!/usr/bin/env bash
# ============================================================================
# Comprueba, con una compilación REAL de cada entorno, que el módulo de Plan de Desarrollo existe donde debe
# existir y NO existe donde no debe.
#
#   produccion-apagado   VERCEL_ENV=production, sin PDM_PRODUCCION   → el módulo no existe: 404 de verdad, sin maqueta
#   vista-previa         VERCEL_ENV=preview                          → el módulo existe (no es un 404)
#   produccion-abierto   VERCEL_ENV=production, PDM_PRODUCCION=si    → el módulo existe (no es un 404)
#
# Por qué compilando: la bandera que decide esto se hornea al compilar (`next.config.ts`), y el código de estado de
# una página en streaming no se puede comprobar leyendo el código. Un 404 «de mentira» (HTTP 200 con la marca de
# «no encontrado» dentro) pasa todas las pruebas unitarias y es lo que había antes del 14-oct-2026.
#
# Uso:    npm run test:modulo-apagado
#         CODIGO_VERIFICACION=CD-XXXX-XXXX npm run test:modulo-apagado     (añade la comprobación de /verificar)
#         ESCENARIOS="produccion-apagado" npm run test:modulo-apagado      (solo uno)
#
# Tarda unos minutos (una compilación por escenario). Usa el puerto 3100 (variable PUERTO) y lo libera al terminar.
# Lee la base real a través de .env.local, igual que `next dev`; no escribe nada.
# ============================================================================
set -u
cd "$(dirname "$0")/.."

PUERTO="${PUERTO:-3100}"
ESCENARIOS="${ESCENARIOS:-produccion-apagado vista-previa produccion-abierto}"
FALLAS=0
TOTAL=0
SERVIDOR_PID=""

ok()    { TOTAL=$((TOTAL+1)); echo "    ok     $1"; }
falla() { TOTAL=$((TOTAL+1)); FALLAS=$((FALLAS+1)); echo "    FALLA  $1"; }
codigo() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$@" || echo "000"; }
esperar_estado() {   # descripción, esperado, obtenido
  if [ "$3" = "$2" ]; then ok "$1 → $3"; else falla "$1 → $3 (se esperaba $2)"; fi
}
esperar_no_404() {   # descripción, obtenido
  if [ "$2" != "404" ] && [ "$2" != "000" ]; then ok "$1 → $2 (no es 404: existe)"; else falla "$1 → $2 (debería existir)"; fi
}
parar_servidor() {
  [ -n "$SERVIDOR_PID" ] && kill "$SERVIDOR_PID" 2>/dev/null
  pkill -f "next start -p $PUERTO" 2>/dev/null
  SERVIDOR_PID=""
  sleep 1
}
trap parar_servidor EXIT

correr() {   # nombre, VERCEL_ENV, PDM_PRODUCCION, esperado: cerrado|abierto
  local nombre="$1" vercel_env="$2" interruptor="$3" esperado="$4"
  local B="http://localhost:$PUERTO"
  echo
  echo "── $nombre  (VERCEL_ENV=$vercel_env, PDM_PRODUCCION='${interruptor}')  → el módulo debe estar $(echo "$esperado" | tr a-z A-Z)"
  echo "   compilando…"
  if ! VERCEL_ENV="$vercel_env" PDM_PRODUCCION="$interruptor" npm run build > "/tmp/modulo-build-$nombre.log" 2>&1; then
    falla "la compilación falló (ver /tmp/modulo-build-$nombre.log)"; return
  fi
  VERCEL_ENV="$vercel_env" PDM_PRODUCCION="$interruptor" npx next start -p "$PUERTO" > "/tmp/modulo-start-$nombre.log" 2>&1 &
  SERVIDOR_PID=$!
  for _ in $(seq 1 60); do curl -s -o /dev/null --max-time 2 "$B/login" && break; sleep 1; done

  esperar_estado "/login (Contratista Digital)" "200" "$(codigo "$B/login")"
  if [ -n "${CODIGO_VERIFICACION:-}" ]; then
    esperar_estado "/verificar/$CODIGO_VERIFICACION" "200" "$(codigo "$B/verificar/$CODIGO_VERIFICACION")"
    if curl -s --max-time 30 "$B/verificar/$CODIGO_VERIFICACION" | grep -q "Documento aut"; then ok "la verificación dice «Documento auténtico»"; else falla "la verificación no dice «Documento auténtico»"; fi
  fi

  local rutas="/dashboard/plan-desarrollo /dashboard/plan-desarrollo/indicadores /dashboard/plan-desarrollo/reportes /dashboard/plan-desarrollo/evidencias /dashboard/plan-desarrollo/responsables /dashboard/plan-desarrollo/historial"
  for ruta in $rutas; do
    if [ "$esperado" = "cerrado" ]; then esperar_estado "GET $ruta" "404" "$(codigo "$B$ruta")"
    else esperar_no_404 "GET $ruta" "$(codigo "$B$ruta")"; fi
  done
  local api; api="$(codigo -X POST -H 'content-type: application/json' -d '{"paso":"x"}' "$B/api/pdm-diagnostico")"
  if [ "$esperado" = "cerrado" ]; then esperar_estado "POST /api/pdm-diagnostico" "404" "$api"; else esperar_no_404 "POST /api/pdm-diagnostico" "$api"; fi
  # El informe en PDF del tablero: sin el módulo no existe; con él, sin sesión responde 401 (no 404).
  local pdf; pdf="$(codigo "$B/api/pdm-tablero/pdf")"
  if [ "$esperado" = "cerrado" ]; then esperar_estado "GET /api/pdm-tablero/pdf" "404" "$pdf"; else esperar_no_404 "GET /api/pdm-tablero/pdf" "$pdf"; fi
  # La constancia en PDF de un reporte: sin el módulo no existe; con él, sin sesión responde 401 (no 404).
  local cons; cons="$(codigo "$B/api/pdm-constancia/00000000-0000-4000-8000-000000000000")"
  if [ "$esperado" = "cerrado" ]; then esperar_estado "GET /api/pdm-constancia/{reporte}" "404" "$cons"; else esperar_no_404 "GET /api/pdm-constancia/{reporte}" "$cons"; fi
  # El paquete ZIP de ese reporte: mismas reglas (sin el módulo no existe; con él, sin sesión responde 401).
  local paq; paq="$(codigo "$B/api/pdm-constancia/00000000-0000-4000-8000-000000000000/paquete")"
  if [ "$esperado" = "cerrado" ]; then esperar_estado "GET /api/pdm-constancia/{reporte}/paquete" "404" "$paq"; else esperar_no_404 "GET /api/pdm-constancia/{reporte}/paquete" "$paq"; fi
  # La verificación PÚBLICA de una constancia NO depende del interruptor del módulo: un QR impreso tiene que seguir valiendo
  # (regla 1 de CLAUDE.md). Un código que no existe responde 200 («Código no encontrado»), esté el módulo abierto o cerrado.
  esperar_estado "GET /verificar/PDM-… (no depende del módulo)" "200" "$(codigo "$B/verificar/PDM-ZZZZ-ZZZZ")"

  if [ "$esperado" = "cerrado" ]; then
    # Nada del módulo en el cuerpo de la respuesta: ni su maqueta de carga ni sus pestañas.
    local cuerpo; cuerpo="$(curl -s --max-time 30 "$B/dashboard/plan-desarrollo")"
    if echo "$cuerpo" | grep -qE "pdm-esq|Responsables"; then falla "la respuesta del módulo apagado lleva su maqueta de carga"; else ok "la respuesta del módulo apagado no lleva nada suyo"; fi
    # Y se comporta exactamente como una dirección que no existe.
    esperar_estado "dirección inexistente cualquiera (referencia)" "404" "$(codigo "$B/dashboard/no-existe-zzz")"
  fi
  parar_servidor
}

echo "Comprobación del módulo de Plan de Desarrollo por entorno ($ESCENARIOS)"
for e in $ESCENARIOS; do
  case "$e" in
    produccion-apagado) correr "$e" production ""   cerrado ;;
    vista-previa)       correr "$e" preview    ""   abierto ;;
    produccion-abierto) correr "$e" production "si" abierto ;;
    *) echo "escenario desconocido: $e"; FALLAS=$((FALLAS+1)) ;;
  esac
done

echo
echo "MODULO-APAGADO: $TOTAL comprobaciones, $FALLAS fallas"
# Un resultado sin comprobaciones NO es un éxito: significa que algo impidió ejecutarlas.
if [ "$TOTAL" -eq 0 ]; then echo "MODULO-APAGADO: no se ejecutó ninguna comprobación"; exit 2; fi
[ "$FALLAS" -eq 0 ]
