#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
index_route="$root/src/routes/protocols.index.tsx"
id_route="$root/src/routes/protocols.\$id.tsx"
service="$root/src/lib/protocols/protocols.ts"
queries="$root/src/lib/protocols/queries.ts"
sql="$root/supabase/migrations/20260616000000_protocols_backend.sql"
qa="$root/supabase/pending/20260616000000_protocols_backend.qa.sql"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"
dashboard="$root/src/routes/index.tsx"
permissions="$root/src/lib/permissions.tsx"

extract_import_block() {
  # Print the import statement ending at the first line matching $2, in file $1.
  local file=$1 end_pattern=$2
  local end_line start_line
  end_line=$(rg -n -F "$end_pattern" "$file" | head -1 | cut -d: -f1)
  start_line=$(awk -v end="$end_line" 'NR<=end && /^import \{$/{s=NR} END{print s}' "$file")
  sed -n "${start_line},${end_line}p" "$file"
}

# ---- Protocols must no longer use the local prototype store as authoritative persistence ----
! rg -q 'from "@/lib/protocols/store"' "$index_route" "$id_route"
! rg -q 'from "@/lib/data/' "$index_route" "$id_route"
test ! -e "$root/src/lib/protocols/store.ts"
test ! -e "$root/src/lib/protocols/seed.ts"
! rg -q 'from "@/lib/protocols/store"' "$root/src"
rg -Fq 'protocolRunsQuery' "$dashboard"
rg -Fq 'enabled: protocolsReadable' "$dashboard"
rg -Fq 'cap: "protocols.manage"' "$dashboard"

# ---- New typed service layer + React Query integration ----
new_index_import=$(extract_import_block "$index_route" 'from "@/lib/protocols/protocols";')
for fn in saveProtocolTemplate setProtocolTemplateArchived duplicateProtocolTemplate \
  softDeleteProtocolTemplate startProtocolRun runProgress publicProtocolError; do
  printf '%s\n' "$new_index_import" | rg -q "\\b$fn\\b"
done

new_id_import=$(extract_import_block "$id_route" 'from "@/lib/protocols/protocols";')
for fn in addProtocolRunApproval addProtocolRunComment publicProtocolError runProgress \
  setProtocolRunStatus updateProtocolRunStep; do
  printf '%s\n' "$new_id_import" | rg -q "\\b$fn\\b"
done

rg -Fq 'from "@/lib/protocols/types"' "$index_route" "$id_route"
rg -Fq 'protocolTemplatesKeys, protocolTemplatesQuery, protocolRunsKeys, protocolRunsQuery' "$index_route"
rg -Fq 'protocolRunsKeys, protocolRunsQuery, protocolTemplatesQuery' "$id_route"
rg -Fq 'export const protocolTemplatesKeys' "$queries"
rg -Fq 'export const protocolTemplatesQuery' "$queries"
rg -Fq 'export const protocolRunsKeys' "$queries"
rg -Fq 'export const protocolRunsQuery' "$queries"
rg -Fq 'useQuery(protocolTemplatesQuery())' "$index_route" "$id_route"
rg -Fq 'useQuery(protocolRunsQuery())' "$index_route" "$id_route"
rg -Fq 'invalidateQueries({ queryKey: protocolTemplatesKeys.all })' "$index_route"
rg -Fq 'invalidateQueries({ queryKey: protocolRunsKeys.all })' "$index_route" "$id_route"
test "$(rg -c 'useMutation' "$index_route")" -ge 7
test "$(rg -c 'useMutation' "$id_route")" -ge 5

# ---- Frontend capabilities must name the permissions enforced by SQL ----
rg -Fq '"protocols.view":' "$permissions"
rg -Fq '"protocols.manage":' "$permissions"
rg -Fq 'can("protocols.manage", role)' "$index_route" "$id_route"
! rg -q 'can\("tasks.write", role\)' "$index_route" "$id_route"
! rg -q 'ProtocolState' "$root/src/lib/protocols"

# ---- Destructive / multi-step operations must go through RPC, never direct table writes ----
for rpc in list_protocol_templates list_protocol_runs save_protocol_template \
  set_protocol_template_archived duplicate_protocol_template soft_delete_protocol_template \
  restore_protocol_template start_protocol_run set_protocol_run_status \
  update_protocol_run_step add_protocol_run_approval add_protocol_run_comment; do
  rg -Fq "rpc(\"$rpc\"" "$service"
done
! rg -q '\.from\("protocol_templates"\)|\.from\("protocol_runs"\)|\.from\("protocol_run_comments"\)' \
  "$service" "$index_route" "$id_route"

# ---- Backend contract: RLS + org/permission scoping ----
for table in protocol_templates protocol_runs protocol_run_comments; do
  rg -Fq "alter table public.$table enable row level security" "$sql"
done
rg -Fq "public.has_permission('protocols.view')" "$sql"
rg -Fq "public.has_permission('protocols.manage')" "$sql"
rg -Fq 'organization_id = public.current_organization_id()' "$sql"
rg -Fq 'create or replace function public.assert_protocols_manage()' "$sql"
rg -Fq "set search_path = ''" "$sql"
rg -Fq "check (jsonb_typeof(steps) = 'array')" "$sql"
rg -Fq "check (jsonb_typeof(links) = 'object')" "$sql"
rg -Fq 'check ((deleted_at is null and deleted_by is null) or deleted_at is not null)' "$sql"
rg -Fq 'revoke all privileges on public.protocol_templates, public.protocol_runs, public.protocol_run_comments' "$sql"
rg -Fq 'revoke all on function public.soft_delete_protocol_template(uuid) from public;' "$sql"
rg -Fq 'revoke all on function public.start_protocol_run(uuid, jsonb) from public;' "$sql"

# ---- RBAC alignment: Service Desk writers receive protocols.manage ----
rg -Fq "permission_key = 'protocols.manage'" "$sql"
rg -Fq "role_key in ('sd_lead', 'helpdesk', 'technician')" "$sql"

# ---- QA coverage spot-checks ----
rg -Fq 'save_protocol_template must persist organization, tags, required ids, and steps' "$qa"
rg -Fq 'duplicate_protocol_template must append (Copy), reset state, and regenerate step ids' "$qa"
rg -Fq 'start_protocol_run must create a PR-1001 run with copied steps, in_progress status, and links' "$qa"
rg -Fq 'start_protocol_run must allocate sequential run numbers within an organization' "$qa"
rg -Fq 'update_protocol_run_step must set completion metadata, notes, and evidence' "$qa"
rg -Fq 'add_protocol_run_approval(approved) must record the approval and resume the run' "$qa"
rg -Fq 'list_protocol_runs must surface comments with author display names' "$qa"
rg -Fq 'sd_lead, helpdesk, and technician must each be granted protocols.manage' "$qa"
rg -Fq 'list_protocol_templates(true) must surface a deleted template for protocols.manage' "$qa"
rg -Fq 'hard-delete of protocol_templates unexpectedly succeeded' "$qa"
rg -Fq 'hard-delete of protocol_runs unexpectedly succeeded' "$qa"
rg -Fq 'direct protocol_templates insert unexpectedly succeeded' "$qa"
rg -Fq 'direct protocol_runs insert unexpectedly succeeded' "$qa"
rg -Fq 'direct protocol_run_comments insert unexpectedly succeeded' "$qa"
rg -Fq 'organization B must not see organization A templates' "$qa"
rg -Fq 'organization B must not see organization A runs' "$qa"
rg -Fq 'display_name = excluded.display_name' "$qa"

rg -Fq '## Milestone 29' "$status"

printf 'Protocols backend integration assertions passed.\n'
