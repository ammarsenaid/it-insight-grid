#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

sql="$root/supabase/pending/20260611000000_service_desk_foundation.sql"
dbqa="$root/supabase/pending/20260611000000_service_desk_foundation.qa.sql"
frontend="$root/src/lib/service-desk/tickets.ts"

python3 - "$sql" "$dbqa" "$frontend" <<'PY'
from pathlib import Path
import re
import sys

sql = Path(sys.argv[1]).read_text(encoding="utf-8")
dbqa = Path(sys.argv[2]).read_text(encoding="utf-8")
frontend = Path(sys.argv[3]).read_text(encoding="utf-8")

def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"ASSERTION FAILED: {message}")

require(
    sql.count("create or replace function public.create_ticket(") == 1,
    "exactly one create_ticket RPC must exist",
)

rpc_start = sql.index("create or replace function public.create_ticket(")
rpc_end = sql.index("\n$$;", rpc_start) + len("\n$$;")
rpc = sql[rpc_start:rpc_end]
signature = rpc[:rpc.index("\nreturns public.tickets")]

require("security definer" in rpc.lower(), "create_ticket must be SECURITY DEFINER")
require("set search_path = ''" in rpc, "create_ticket must use an empty search_path")
require("caller uuid := auth.uid();" in rpc, "requester identity must derive from auth.uid()")
require("'portal'" in rpc, "create_ticket must force portal source")

for forbidden_parameter in (
    "p_requester_id",
    "p_assignee_id",
    "p_assigned_team",
    "p_status",
    "p_source",
    "p_source_email",
    "p_opened_at",
    "p_resolved_at",
    "p_closed_at",
    "p_created_at",
    "p_updated_at",
):
    require(
        forbidden_parameter not in signature,
        f"create_ticket must not accept privileged parameter {forbidden_parameter}",
    )

require(
    "create policy tickets_insert_own" not in sql,
    "direct authenticated ticket INSERT policy must remain absent",
)

require(
    (
        "grant select, update                 on table public.tickets              to authenticated;"
        in sql
        or
        "grant select                         on table public.tickets              to authenticated;"
        in sql
    ),
    "authenticated ticket grant must omit INSERT",
)

require(
    "grant select, insert, update         on table public.tickets              to authenticated;"
    not in sql,
    "legacy authenticated ticket INSERT grant must remain absent",
)

require(
    "grant usage, select on sequence public.ticket_number_seq to service_role;"
    in sql,
    "ticket-number sequence privilege must be service-role-only",
)

require(
    "grant usage, select on sequence public.ticket_number_seq to authenticated, service_role;"
    not in sql,
    "authenticated callers must not receive ticket-number sequence privilege",
)

require(
    "revoke all on function public.create_ticket(text, text, text, text, text, text, text[], text) from public;"
    in sql,
    "create_ticket PUBLIC execute privilege must be revoked",
)

require(
    "grant execute on function public.create_ticket(text, text, text, text, text, text, text[], text) to authenticated;"
    in sql,
    "authenticated callers must receive create_ticket execute privilege",
)

require(
    '.rpc("create_ticket",' in frontend,
    "frontend Service Desk ticket creation must call create_ticket RPC",
)

require(
    not re.search(r'\.from\("tickets"\)\s*\.insert\(', frontend),
    "frontend Service Desk ticket creation must not INSERT directly",
)

require(
    "CHECK 8: constrained manual ticket creation RPC" in dbqa,
    "foundation QA must include constrained RPC coverage",
)

require(
    "authenticated MUST NOT have direct INSERT privilege on public.tickets" in dbqa,
    "foundation QA must check table privilege removal",
)

require(
    "Authenticated callers MUST NOT INSERT directly into public.tickets" in dbqa,
    "foundation QA must check crafted direct INSERT denial",
)

require(
    "create_ticket must derive requester_id from auth.uid()" in dbqa,
    "foundation QA must check server-derived requester identity",
)

print("Constrained manual ticket-creation assertions passed.")
PY
