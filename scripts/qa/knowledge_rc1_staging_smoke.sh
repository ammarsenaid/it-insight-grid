#!/usr/bin/env bash
# =====================================================================
# IT KNOWLEDGE CENTER — RC1.1 STAGING SMOKE TEST
# =====================================================================
# Builds the app, starts the production preview locally, and checks
# that the critical routes serve the expected HTTP status codes.
#
# This script never touches a production deployment and never
# restarts any remote service. It only runs `bun run build` and
# `bun run preview` locally.
#
# Usage:
#   ./scripts/qa/knowledge_rc1_staging_smoke.sh
# =====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PORT="${PORT:-4173}"
BASE="http://127.0.0.1:${PORT}"

log() { printf '\033[1;34m[smoke]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[smoke] FAIL:\033[0m %s\n' "$*" >&2; exit 1; }

log "Building production bundle…"
bun run build 1>/tmp/kb_rc1_build.log 2>&1 || {
  tail -n 80 /tmp/kb_rc1_build.log >&2
  fail "Production build failed."
}
log "Build OK."

log "Starting preview server on :${PORT}…"
bun run preview --port "$PORT" 1>/tmp/kb_rc1_preview.log 2>&1 &
PREV_PID=$!
trap 'kill "$PREV_PID" 2>/dev/null || true' EXIT

# Wait for readiness (no bare sleep loops)
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "$BASE/"; then break; fi
  sleep 1
done

check() {
  local path="$1" expected="$2"
  local got
  got="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${path}")"
  if [[ "$got" != "$expected" ]]; then
    fail "GET ${path} returned ${got}, expected ${expected}"
  fi
  log "GET ${path} → ${got} ✓"
}

check "/"          200
check "/auth"      200
check "/documents" 200
check "/this-route-does-not-exist-rc11" 404

log "RC1.1 staging smoke OK."
