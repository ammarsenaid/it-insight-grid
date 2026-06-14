#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
runbook="$root/docs/DISPOSABLE_FULL_CHAIN_VALIDATION_RUNBOOK_20260614.md"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

test -f "$runbook"
test -f "$status"

migrations=(
  supabase/migrations/20260611000000_service_desk_foundation.sql
  supabase/migrations/20260611010000_service_desk_rbac_expand.sql
  supabase/migrations/20260611020000_ticket_attachments.sql
  supabase/migrations/20260611030000_ticket_configuration.sql
  supabase/migrations/20260611040000_ticket_assignments.sql
  supabase/migrations/20260611050000_notifications.sql
  supabase/migrations/20260612235900_organization_foundation.sql
  supabase/migrations/20260613000000_cmdb_backend.sql
  supabase/migrations/20260613010000_ipam_backend.sql
  supabase/migrations/20260614000000_tasks_backend.sql
  supabase/migrations/20260615000000_notes_backend.sql
  supabase/migrations/20260616000000_protocols_backend.sql
)

qa_sql_files=(
  supabase/pending/20260611000000_service_desk_foundation.qa.sql
  supabase/pending/20260611010000_service_desk_rbac_expand.qa.sql
  supabase/pending/20260611020000_ticket_attachments.qa.sql
  supabase/pending/20260611030000_ticket_configuration.qa.sql
  supabase/pending/20260611040000_ticket_assignments.qa.sql
  supabase/pending/20260611050000_notifications.qa.sql
  supabase/pending/20260612235900_organization_foundation.qa.sql
  supabase/pending/20260613000000_cmdb_backend.qa.sql
  supabase/pending/20260613010000_ipam_backend.qa.sql
  supabase/pending/20260614000000_tasks_backend.qa.sql
  supabase/pending/20260615000000_notes_backend.qa.sql
  supabase/pending/20260616000000_protocols_backend.qa.sql
)

assert_ordered_manifest() {
  local previous_line=0
  local entry line
  for entry in "$@"; do
    line=$(rg -n -F "\`$entry\`" "$runbook" | cut -d: -f1)
    test -n "$line"
    test "$line" -gt "$previous_line"
    previous_line=$line
  done
}

assert_ordered_manifest "${migrations[@]}"
assert_ordered_manifest "${qa_sql_files[@]}"

test "$(rg -c '^[0-9]+\. `supabase/migrations/.*\.sql`$' "$runbook")" -eq 12
test "$(rg -c '^[0-9]+\. `supabase/pending/.*\.qa\.sql`$' "$runbook")" -eq 12

if rg '^[0-9]+\. `supabase/pending/.*\.sql`$' "$runbook" | grep -v '\.qa\.sql`$'; then
  echo "ERROR: runbook lists production SQL under supabase/pending" >&2
  exit 1
fi
rg -Fq 'scripts/qa/run_disposable_full_chain_validation.sh' "$runbook"
rg -Fq 'The live DB must not be touched.' "$runbook"
rg -Fq 'disposable-only' "$runbook"
rg -Fq 'This runbook does not authorize live deployment.' "$runbook"
rg -Fq '## Success path' "$runbook"
rg -Fq 'After success' "$runbook"
rg -Fq '## Failure path' "$runbook"
rg -Fq 'After failure' "$runbook"
rg -Fq '## Required database naming rule' "$runbook"
rg -Fq '## Required backup rule' "$runbook"
rg -Fq '## Milestone 36 - Disposable Full-Chain Execution Plan Review' "$status"

printf 'Disposable full-chain runbook assertions passed.\n'
