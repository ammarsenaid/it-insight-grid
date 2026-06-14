#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
plan="$root/docs/PENDING_MIGRATION_PROMOTION_PLAN_20260614.md"

test -f "$plan"

production_files=(
  20260611000000_service_desk_foundation.sql
  20260611010000_service_desk_rbac_expand.sql
  20260611020000_ticket_attachments.sql
  20260611030000_ticket_configuration.sql
  20260611040000_ticket_assignments.sql
  20260611050000_notifications.sql
  20260612235900_organization_foundation.sql
  20260613000000_cmdb_backend.sql
  20260613010000_ipam_backend.sql
  20260614000000_tasks_backend.sql
  20260615000000_notes_backend.sql
  20260616000000_protocols_backend.sql
)

headings=(
  "### 1. Service Desk foundation"
  "### 2. Service Desk RBAC/profile helpers"
  "### 3. Ticket attachments"
  "### 4. Ticket configuration"
  "### 5. Ticket assignments"
  "### 6. Notifications"
  "### 7. Organization foundation"
  "### 8. CMDB"
  "### 9. IPAM"
  "### 10. Tasks"
  "### 11. Notes"
  "### 12. Protocols"
)

previous_line=0
for index in "${!production_files[@]}"; do
  production="supabase/pending/${production_files[$index]}"
  qa="${production%.sql}.qa.sql"

  test -f "$root/$production"
  test -f "$root/$qa"
  rg -Fq "$production" "$plan"
  rg -Fq "$qa" "$plan"

  line=$(rg -n -F "${headings[$index]}" "$plan" | cut -d: -f1)
  test -n "$line"
  test "$line" -gt "$previous_line"
  previous_line=$line
done

rg -Fq 'NO-GO for production deployment as of 2026-06-14' "$plan"
rg -Fq 'docs/FULL_SYSTEM_PRODUCTION_AUDIT_20260614.md' "$plan"
rg -Fq 'NEVER run any file under `supabase/pending/` against the live database' "$plan"
rg -Fq 'live database remains untouched' "$plan"
rg -Fq 'Disposable database only' "$plan"
rg -Fq 'requires a separate' "$plan"
rg -Fq 'explicit human approval' "$plan"
rg -Fq 'No migration was executed' "$plan"
rg -Fq 'Do not copy or' "$plan"
rg -Fq 'move these files into `supabase/migrations/`' "$plan"

for module in Tickets Catalog Notifications Organization CMDB IPAM Tasks Notes Protocols 'Recycle Bin' Audit; do
  rg -Fq "$module" "$plan"
done

for qa_script in \
  production_hardening_ticket_creation.sh \
  production_hardening_ticket_updates.sh \
  production_hardening_catalog_request.sh \
  production_hardening_service_desk_profiles.sh \
  production_hardening_ticket_attachments.sh \
  production_hardening_ticket_configuration.sh \
  production_hardening_notifications.sh \
  production_hardening_cmdb.sh \
  production_hardening_ipam.sh \
  production_hardening_ipam_concurrency.sh \
  production_hardening_tasks.sh \
  production_hardening_notes.sh \
  production_hardening_protocols.sh \
  production_hardening_recycle_bin.sh \
  production_hardening_audit.sh \
  disposable_protocols_qa.sh; do
  rg -Fq "scripts/qa/$qa_script" "$plan"
done

printf 'Pending migration promotion plan assertions passed.\n'
