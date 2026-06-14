#!/usr/bin/env bash
set -euo pipefail

# Milestone 35 preparation-only runner template.
# Source plan: docs/PENDING_MIGRATION_PROMOTION_PLAN_20260614.md
# Release decision: docs/FULL_SYSTEM_PRODUCTION_AUDIT_20260614.md (NO-GO)
#
# Actual database execution requires a later, explicit human-approved milestone.
# This milestone must stop before any database, migration, or QA SQL action.

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
plan="$root/docs/PENDING_MIGRATION_PROMOTION_PLAN_20260614.md"
audit="$root/docs/FULL_SYSTEM_PRODUCTION_AUDIT_20260614.md"

: "${DISPOSABLE_DATABASE_NAME:?Set DISPOSABLE_DATABASE_NAME explicitly.}"
: "${DISPOSABLE_DATABASE_HOST:?Set DISPOSABLE_DATABASE_HOST explicitly.}"
: "${DISPOSABLE_VALIDATION_MODE:?Set DISPOSABLE_VALIDATION_MODE explicitly.}"

if [[ -z "${DISPOSABLE_DATABASE_NAME//[[:space:]]/}" ]]; then
  printf 'Refusing: DISPOSABLE_DATABASE_NAME is empty.\n' >&2
  exit 1
fi

if [[ -z "${DISPOSABLE_DATABASE_HOST//[[:space:]]/}" ]]; then
  printf 'Refusing: DISPOSABLE_DATABASE_HOST is empty.\n' >&2
  exit 1
fi

database_name=${DISPOSABLE_DATABASE_NAME,,}
case "$database_name" in
  postgres|supabase|production|prod|live|it_knowledge_center|itkc)
    printf 'Refusing known live database name: %s\n' "$DISPOSABLE_DATABASE_NAME" >&2
    exit 1
    ;;
esac

if [[ "$database_name" != *disposable* && "$database_name" != *staging* ]]; then
  printf 'Refusing: database name must contain "disposable" or "staging".\n' >&2
  exit 1
fi

if [[ "$DISPOSABLE_VALIDATION_MODE" != "PREPARE_ONLY_MILESTONE_35" ]]; then
  printf 'Refusing: DISPOSABLE_VALIDATION_MODE must be PREPARE_ONLY_MILESTONE_35.\n' >&2
  exit 1
fi

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

test -f "$plan"
test -f "$audit"

printf 'Disposable database: %s\n' "$DISPOSABLE_DATABASE_NAME"
printf 'Disposable host: %s\n' "$DISPOSABLE_DATABASE_HOST"
printf '\nMigration order:\n'
printf '  %s\n' "${migrations[@]}"
printf '\nQA SQL order:\n'
printf '  %s\n' "${qa_sql_files[@]}"

confirmation_phrase="I APPROVE PREPARATION ONLY FOR ${DISPOSABLE_DATABASE_NAME}"
printf '\nType exactly: %s\n> ' "$confirmation_phrase"
IFS= read -r typed_confirmation
if [[ "$typed_confirmation" != "$confirmation_phrase" ]]; then
  printf 'Refusing: typed confirmation did not match.\n' >&2
  exit 1
fi

printf '\nPreparation checks passed. Milestone 35 does not authorize database execution.\n'
printf 'Stopping before every database, migration, and QA SQL command.\n'
exit 0

# FUTURE MIGRATION APPLY PLACEHOLDER:
# A later explicit human-approved milestone may replace this comment with the
# reviewed command that applies each entry in migrations to the verified target.

# FUTURE QA SQL EXECUTION PLACEHOLDER:
# A later explicit human-approved milestone may replace this comment with the
# reviewed command that executes each entry in qa_sql_files on the same target.
