#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
route="$root/src/routes/audit.tsx"
client="$root/src/lib/service-desk/audit.ts"
queries="$root/src/lib/service-desk/queries.ts"
sql="$root/supabase/migrations/20260611000000_service_desk_foundation.sql"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

# The audit route must use the shared append-only log, never browser-local activity.
! rg -q '@/lib/data/store|data\.activity|localStorage|sessionStorage' "$route"
rg -Fq 'useQuery(ticketAuditQuery())' "$route"
rg -Fq 'const entries = auditQuery.data ?? [];' "$route"
rg -Fq 'title="Audit log unavailable"' "$route"
rg -Fq 'actionLabel="Retry"' "$route"

# The query contract must remain read-only and bounded.
rg -Fq '.from("ticket_audit_log")' "$client"
rg -Fq '.select("id, ticket_id, actor_id, action, payload, created_at")' "$client"
rg -Fq '.order("created_at", { ascending: false })' "$client"
rg -Fq '.limit(limit)' "$client"
! rg -q '\.(insert|update|delete|upsert)\(' "$client"
rg -Fq 'queryFn: () => listTicketAuditEntries()' "$queries"

# Database authorization remains the data boundary for the manager-only log.
rg -Fq 'create policy ticket_audit_log_select_managers' "$sql"
rg -Fq "using (public.is_platform_admin() or public.has_permission('tickets.view_all'));" "$sql"
rg -Fq 'revoke all privileges on table public.ticket_audit_log     from anon;' "$sql"
rg -Fq 'grant select                         on table public.ticket_audit_log     to authenticated;' "$sql"

rg -Fq '## Milestone 33 - Service Desk Audit Live-Data Integration' "$status"

printf 'Service Desk audit live-data assertions passed.\n'
