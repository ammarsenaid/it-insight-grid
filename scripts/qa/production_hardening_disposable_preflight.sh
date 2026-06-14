#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
preflight="$root/docs/DISPOSABLE_DATABASE_PREFLIGHT_20260614.md"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

test -f "$preflight"
test -f "$status"

rg -Fq 'scripts/qa/run_disposable_full_chain_validation.sh' "$preflight"
rg -Fq 'Milestone 35' "$preflight"
rg -Fq 'docs/DISPOSABLE_FULL_CHAIN_VALIDATION_RUNBOOK_20260614.md' "$preflight"
rg -Fq 'Milestone 36' "$preflight"
rg -Fq 'No database may be contacted in this milestone.' "$preflight"
rg -Fq 'The live DB must not be touched.' "$preflight"
rg -Fq 'Disposable execution requires a later milestone.' "$preflight"
rg -Fq '## Operator/reviewer checklist' "$preflight"
rg -Fq '## Target naming checklist' "$preflight"
rg -Fq '## Live DB refusal checklist' "$preflight"
rg -Fq '## Secret-handling checklist' "$preflight"
rg -Fq '## Backup decision checklist' "$preflight"
rg -Fq '## Evidence folder checklist' "$preflight"
rg -Fq '## Stop conditions' "$preflight"
rg -Fq '## Exact pass/fail criteria' "$preflight"
rg -Fq '## Milestone 37 - Disposable Database Preflight Only' "$status"

for file in "$preflight" "$status" "${BASH_SOURCE[0]}"; do
  ! rg -n '^[[:space:]]*(psql|docker|sudo)([[:space:]]|$)' "$file"
done

printf 'Disposable database preflight assertions passed. No database contacted.\n'
