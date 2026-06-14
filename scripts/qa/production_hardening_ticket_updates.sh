#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SQL="$ROOT/supabase/migrations/20260611000000_service_desk_foundation.sql"
FOUNDATION_QA="$ROOT/supabase/pending/20260611000000_service_desk_foundation.qa.sql"
NOTIFY_QA="$ROOT/supabase/pending/20260611050000_notifications.qa.sql"
FRONTEND="$ROOT/src/lib/service-desk/tickets.ts"
STATUS="$ROOT/docs/PRODUCTION_HARDENING_STATUS.md"

python3 - \
  "$SQL" \
  "$FOUNDATION_QA" \
  "$NOTIFY_QA" \
  "$FRONTEND" \
  "$STATUS" <<'PY'
from pathlib import Path
import re
import sys

sql = Path(sys.argv[1]).read_text(encoding="utf-8")
foundation_qa = Path(sys.argv[2]).read_text(encoding="utf-8")
notify_qa = Path(sys.argv[3]).read_text(encoding="utf-8")
frontend = Path(sys.argv[4]).read_text(encoding="utf-8")
status = Path(sys.argv[5]).read_text(encoding="utf-8")

def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"ASSERTION FAILED: {message}")

require(
    sql.count("create or replace function public.update_ticket(") == 1,
    "exactly one update_ticket RPC must exist",
)

rpc_start = sql.index("create or replace function public.update_ticket(")
rpc_end = sql.index("\n$$;", rpc_start) + len("\n$$;")
rpc = sql[rpc_start:rpc_end]

for expected in (
    "security definer",
    "set search_path = ''",
    "caller uuid := auth.uid();",
    "jsonb_object_keys(p_patch)",
    "public.has_permission('tickets.assign')",
    "public.has_permission('tickets.resolve')",
    "current_ticket.requester_id = caller",
    "requested_status = 'reopened'",
    "current_ticket.status in ('resolved', 'closed')",
    "Invalid ticket status transition",
    "resolved_at = case",
    "closed_at = case",
):
    require(expected.lower() in rpc.lower(), f"RPC must contain: {expected}")

allowlist_start = rpc.index("jsonb_object_keys(p_patch)")
allowlist_end = rpc.index("select *", allowlist_start)
allowlist = rpc[allowlist_start:allowlist_end]

for field in (
    "'status'",
    "'priority'",
    "'assignee_id'",
    "'assigned_team'",
    "'category'",
    "'subcategory'",
    "'tags'",
    "'subject'",
    "'description'",
):
    require(field in allowlist, f"RPC allowlist must include {field}")

for field in (
    "'requester_id'",
    "'catalog_item_id'",
    "'source'",
    "'source_email'",
    "'opened_at'",
    "'resolved_at'",
    "'closed_at'",
    "'created_at'",
    "'updated_at'",
):
    require(field not in allowlist, f"RPC allowlist must reject {field}")

require(
    "create policy tickets_update_agents" not in sql,
    "broad authenticated direct UPDATE policy must be absent",
)

require(
    "drop policy if exists tickets_update_agents on public.tickets;" in sql,
    "legacy ticket UPDATE policy must be explicitly dropped",
)

require(
    "grant select                         on table public.tickets              to authenticated;"
    in sql,
    "authenticated ticket table access must be SELECT-only",
)

require(
    "grant select, update                 on table public.tickets              to authenticated;"
    not in sql,
    "legacy authenticated ticket UPDATE grant must be absent",
)

require(
    "revoke all on function public.update_ticket(uuid, jsonb)          from public;"
    in sql,
    "PUBLIC update_ticket execution must be revoked",
)

require(
    "grant execute on function public.update_ticket(uuid, jsonb)          to authenticated;"
    in sql,
    "authenticated update_ticket execution must be granted",
)

require(
    "create or replace function public.create_ticket(" in sql,
    "P01 create_ticket RPC must remain present",
)

require(
    "grant select, insert" not in "\n".join(
        line for line in sql.splitlines()
        if "on table public.tickets" in line and "to authenticated" in line
    ),
    "P01 direct authenticated ticket INSERT must remain absent",
)

require(
    '.rpc("update_ticket",' in frontend,
    "frontend must use update_ticket RPC",
)

require(
    not re.search(
        r'\.from\("tickets"\)\s*\.update\(',
        frontend,
        flags=re.DOTALL,
    ),
    "frontend direct ticket UPDATE must be absent",
)

for expected in (
    "-- CHECK 9: constrained update_ticket RPC",
    "authenticated MUST NOT have direct UPDATE privilege on public.tickets",
    "Authenticated callers MUST NOT UPDATE public.tickets directly",
    "Employee requester MUST NOT modify ticket metadata",
    "Requester MUST be able to reopen their own resolved ticket",
    "update_ticket MUST reject immutable privileged fields",
    "update_ticket MUST reject illegal lifecycle transitions",
):
    require(expected in foundation_qa, f"foundation QA must include: {expected}")

require(
    "from public.update_ticket(" in foundation_qa,
    "transaction-backed QA must exercise update_ticket RPC",
)

require(
    "Browser-side authenticated INSERT is revoked." in notify_qa,
    "notification fixture must document constrained INSERT compatibility",
)

require(
    notify_qa.count(
        "Privileged fixture mutation: browser-side direct UPDATE is revoked."
    ) == 2,
    "notification fixture must document both privileged fixture updates",
)

require(
    "## Milestone 13 - Constrained Ticket Update Contract" in status,
    "P02 milestone must exist in hardening status document",
)

print("Constrained ticket-update static assertions passed.")
PY
