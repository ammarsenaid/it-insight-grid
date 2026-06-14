#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
plan="$root/docs/PENDING_MIGRATION_PROMOTION_PLAN_20260614.md"
status_doc="$root/docs/PRODUCTION_HARDENING_STATUS.md"

test -f "$plan"
test -f "$status_doc"

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

for file in "${production_files[@]}"; do
  migration="supabase/migrations/$file"
  legacy_pending="supabase/pending/$file"
  qa="supabase/pending/${file%.sql}.qa.sql"

  test -f "$root/$migration"
  test ! -e "$root/$legacy_pending"
  test -f "$root/$qa"

  rg -Fq "$migration" "$plan"
  rg -Fq "$qa" "$plan"
done

test "$(find "$root/supabase/migrations" -maxdepth 1 -type f -name '*.sql' | wc -l)" -eq 22

if find "$root/supabase/pending" -maxdepth 1 -type f -name '*.sql' ! -name '*.qa.sql' | grep -q .; then
  echo "ERROR: production SQL still exists under supabase/pending"
  exit 1
fi

rg -Fq 'Milestone 74 — Migration Provenance Repair' "$status_doc"
rg -Fq 'Live database was not contacted or modified' "$status_doc"
rg -Fq 'supabase/migrations' "$plan"
rg -Fq 'supabase/pending' "$plan"

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

printf 'Migration promotion plan assertions passed after authoritative promotion.\n'
