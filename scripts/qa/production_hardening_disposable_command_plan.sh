#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
command_plan="$root/docs/DISPOSABLE_EXECUTION_COMMAND_PLAN_20260614.md"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

test -f "$command_plan"
test -f "$status"

migrations=(
  supabase/pending/20260611000000_service_desk_foundation.sql
  supabase/pending/20260611010000_service_desk_rbac_expand.sql
  supabase/pending/20260611020000_ticket_attachments.sql
  supabase/pending/20260611030000_ticket_configuration.sql
  supabase/pending/20260611040000_ticket_assignments.sql
  supabase/pending/20260611050000_notifications.sql
  supabase/pending/20260612235900_organization_foundation.sql
  supabase/pending/20260613000000_cmdb_backend.sql
  supabase/pending/20260613010000_ipam_backend.sql
  supabase/pending/20260614000000_tasks_backend.sql
  supabase/pending/20260615000000_notes_backend.sql
  supabase/pending/20260616000000_protocols_backend.sql
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
    line=$(rg -n -F "\`$entry\`" "$command_plan" | cut -d: -f1)
    test -n "$line"
    test "$line" -gt "$previous_line"
    previous_line=$line
  done
}

assert_ordered_manifest "${migrations[@]}"
assert_ordered_manifest "${qa_sql_files[@]}"
test "$(rg -c '^[0-9]+\. `supabase/pending/.*\.sql`$' "$command_plan")" -eq 24

rg -Fq 'scripts/qa/run_disposable_full_chain_validation.sh' "$command_plan"
rg -Fq 'docs/DISPOSABLE_FULL_CHAIN_VALIDATION_RUNBOOK_20260614.md' "$command_plan"
rg -Fq 'docs/DISPOSABLE_DATABASE_PREFLIGHT_20260614.md' "$command_plan"

for phase in \
  'Phase A - Verify repo state' \
  'Phase B - Define disposable-only variables' \
  'Phase C - Print and confirm target identity' \
  'Phase D - Create evidence folder' \
  'Phase E - List exact 12 migrations' \
  'Phase F - List exact 12 QA SQL files' \
  'Phase G - Future database creation placeholder' \
  'Phase H - Future migration application placeholder' \
  'Phase I - Future QA execution placeholder' \
  'Phase J - Future result capture placeholder' \
  'Phase K - Future cleanup placeholder'; do
  rg -Fq "### $phase" "$command_plan"
done

rg -Fq 'Commands are inert documentation only.' "$command_plan"
rg -Fq 'No command in this document may be run without a later explicit approval.' "$command_plan"
rg -Fq 'The live DB must not be touched.' "$command_plan"
rg -Fq 'Disposable execution requires a later milestone.' "$command_plan"
rg -Fq 'This milestone does not authorize database creation, migration execution, QA' "$command_plan"
rg -Fq 'execution, cleanup, or live deployment.' "$command_plan"
rg -Fq '## Milestone 38 - Disposable Execution Commands Preparation Only' "$status"

! rg -n '^[[:space:]]*(psql|docker|sudo)([[:space:]]|$)' "$command_plan"

printf 'Disposable execution command plan assertions passed. No commands executed.\n'
