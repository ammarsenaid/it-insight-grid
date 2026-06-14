#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
runner="$root/scripts/qa/run_disposable_full_chain_validation.sh"

test -f "$runner"

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
  shift
  for entry in "$@"; do
    line=$(rg -n -F "  $entry" "$runner" | cut -d: -f1)
    test -n "$line"
    test "$line" -gt "$previous_line"
    previous_line=$line
  done
}

assert_ordered_manifest migrations "${migrations[@]}"
assert_ordered_manifest qa_sql_files "${qa_sql_files[@]}"

test "$(rg -c '^  supabase/pending/.*\.sql$' "$runner")" -eq 24
rg -Fq 'postgres|supabase|production|prod|live|it_knowledge_center|itkc' "$runner"
rg -Fq 'Refusing known live database name' "$runner"
rg -Fq '*disposable*' "$runner"
rg -Fq '*staging*' "$runner"
rg -Fq 'database name must contain "disposable" or "staging"' "$runner"
rg -Fq 'confirmation_phrase="I APPROVE PREPARATION ONLY FOR ${DISPOSABLE_DATABASE_NAME}"' "$runner"
rg -Fq 'IFS= read -r typed_confirmation' "$runner"
rg -Fq 'exit 0' "$runner"
rg -Fq '# FUTURE MIGRATION APPLY PLACEHOLDER:' "$runner"
rg -Fq '# FUTURE QA SQL EXECUTION PLACEHOLDER:' "$runner"

exit_line=$(rg -n -F 'exit 0' "$runner" | cut -d: -f1)
migration_placeholder_line=$(rg -n -F '# FUTURE MIGRATION APPLY PLACEHOLDER:' "$runner" | cut -d: -f1)
qa_placeholder_line=$(rg -n -F '# FUTURE QA SQL EXECUTION PLACEHOLDER:' "$runner" | cut -d: -f1)
test "$exit_line" -lt "$migration_placeholder_line"
test "$exit_line" -lt "$qa_placeholder_line"

! sed '/^[[:space:]]*#/d' "$runner" | rg -q '(^|[[:space:]])(psql|docker|sudo)([[:space:]]|$)'
rg -Fq 'docs/PENDING_MIGRATION_PROMOTION_PLAN_20260614.md' "$runner"
rg -Fq 'docs/FULL_SYSTEM_PRODUCTION_AUDIT_20260614.md (NO-GO)' "$runner"
rg -Fq 'Actual database execution requires a later, explicit human-approved milestone.' "$runner"
rg -Fq 'Milestone 35 does not authorize database execution.' "$runner"

printf 'Disposable full-chain runner assertions passed.\n'
