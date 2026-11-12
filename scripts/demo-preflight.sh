#!/bin/bash
# Preflight for the virtual-event demo on one laptop (docs/ops/demo-kit.md; T28.04; BD-02, BD-133).
#   bash scripts/demo-preflight.sh
# Steps, in order: check-env, validate (the real site bundle), replay twice (equal hashes), health (GET /api/health).
# A step whose input is absent (no site manifest, no scenario file, no Hab Core to ask) prints "SKIP <step>: <reason>"
# and is not a failure; a step that runs and fails prints "FAIL <step>: <reason>" and the script exits 1.
# Environment (for tests and odd setups): DEMO_ROOT (repo root), MAKE (default make), HAB_URL (default
# http://127.0.0.1:8080), HAB_START=0 (never start a Hab Core for the health step).
# No outbound network: the only request is to HAB_URL.
set -uo pipefail

ROOT="${DEMO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
MAKE_CMD="${MAKE:-make}"
HAB_URL="${HAB_URL:-http://127.0.0.1:8080}"
SITE=gale_boxwork
SCENARIO=storm-sol4190
passed=0
skipped=0
failed=0
hab_pid=""

cd "$ROOT" || { echo "FAIL setup: cannot enter $ROOT"; exit 1; }
trap '[ -n "$hab_pid" ] && kill "$hab_pid" 2>/dev/null' EXIT

pass() { echo "PASS $1${2:+: $2}"; passed=$((passed + 1)); }
skip() { echo "SKIP $1: $2"; skipped=$((skipped + 1)); }
fail() { echo "FAIL $1: $2"; failed=$((failed + 1)); }

# 1. the pipeline environment (GDAL, rasterio, pyproj, IAU_2015:49900); without it nothing else is worth running
if out=$("$MAKE_CMD" check-env 2>&1); then pass check-env; else fail check-env "$(echo "$out" | tail -1)"; echo "preflight: $passed passed, $skipped skipped, $failed failed"; exit 1; fi

# 2. the real site bundle
manifest="data/sites/$SITE/site-manifest.json"
if [ ! -f "$manifest" ]; then
  skip validate "$manifest is absent (the real bundle is built by backend package 23)"
elif out=$("$MAKE_CMD" validate SITE=$SITE 2>&1); then pass validate "$SITE"
else fail validate "$(echo "$out" | tail -1)"; fi

# 3. the reference replay, twice: the log hash must be one 64-hex line and the same both times (NFR-06, NFR-14)
scenario="scenarios/$SCENARIO/scenario.json"
if [ ! -f "$scenario" ]; then
  skip replay "$scenario is absent (the scenario is built by backend package 25)"
else
  a=$("$MAKE_CMD" -s replay 2>/dev/null | tail -1)
  b=$("$MAKE_CMD" -s replay 2>/dev/null | tail -1)
  if [[ ! "$a" =~ ^[0-9a-f]{64}$ ]]; then fail replay "the first run printed no log hash"
  elif [ "$a" != "$b" ]; then fail replay "the two runs differ: $a vs $b"
  else pass replay "$a"; fi
fi

# 4. the Hab Core answers with a session; started here on the port of HAB_URL when none is running and the scenario exists
health() { curl -fsS --max-time 3 "$HAB_URL/api/health" 2>/dev/null; }
body=$(health || true)
if [ -z "$body" ] && [ -f "$scenario" ] && [ "${HAB_START:-1}" != 0 ]; then
  port="${HAB_URL##*:}"
  npm run -s hab:start -- --site "$SITE" --scenario "$SCENARIO" --port "$port" >/dev/null 2>&1 &
  hab_pid=$!
  for _ in $(seq 1 60); do body=$(health || true); [ -n "$body" ] && break; sleep 0.5; done
fi
if [ -z "$body" ]; then
  skip health "no Hab Core answers at $HAB_URL and none could be started (start one with make hab)"
elif [[ "$body" =~ \"status\"[[:space:]]*:[[:space:]]*\"ok\" ]]; then pass health "$HAB_URL"
else fail health "$HAB_URL answered $body"; fi

echo "preflight: $passed passed, $skipped skipped, $failed failed"
[ "$failed" -eq 0 ]
