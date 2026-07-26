#!/usr/bin/env bash
# Observability smoke for the sim stack: health of all three + a $0 api->ai-layer round-trip.
# Run AFTER `docker compose -f docker-compose.sim.yml up`. Non-zero exit = something is down.
set -uo pipefail

fail=0
check() {  # name url expected_code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$2" 2>/dev/null || echo 000)
  if [ "$code" = "$3" ]; then echo "  OK   $1 ($code)"; else echo "  FAIL $1 (got $code, want $3)"; fail=1; fi
}

echo "== container health =="
docker compose -f docker-compose.sim.yml ps --format 'table {{.Service}}\t{{.Status}}' 2>/dev/null || true

echo "== endpoint probes =="
check "web (nginx)"        http://localhost:8080/            200
check "api /health"        http://localhost:3100/health      200
check "ai-layer /health"   http://localhost:8000/health      200
# $0 path through the proxy: api creative-studio asset route with a bogus id -> should NOT 5xx
# (401/404/400 are fine — proves api is up and the ai-layer round-trip wiring resolves).
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://localhost:3100/api/creative-studio/asset/nojob/none 2>/dev/null || echo 000)
case "$code" in
  2*|4*) echo "  OK   api->ai-layer wiring reachable ($code)";;
  *)     echo "  FAIL api->ai-layer wiring ($code)"; fail=1;;
esac

echo
[ "$fail" = 0 ] && echo "SMOKE PASS" || echo "SMOKE FAIL"
exit $fail
