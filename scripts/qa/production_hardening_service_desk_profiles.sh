#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SQL="$ROOT/supabase/pending/20260611010000_service_desk_rbac_expand.sql"
DB_QA="$ROOT/supabase/pending/20260611010000_service_desk_rbac_expand.qa.sql"
FRONTEND="$ROOT/src/lib/service-desk/profiles.ts"
STATUS="$ROOT/docs/PRODUCTION_HARDENING_STATUS.md"

python3 - "$SQL" "$DB_QA" "$FRONTEND" "$STATUS" <<'PY'
from pathlib import Path
import re
import sys

sql = Path(sys.argv[1]).read_text(encoding="utf-8")
db_qa = Path(sys.argv[2]).read_text(encoding="utf-8")
frontend = Path(sys.argv[3]).read_text(encoding="utf-8")
status = Path(sys.argv[4]).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"ASSERTION FAILED: {message}")


require(
    sql.count("create or replace function public.list_service_desk_profiles()") == 1,
    "exactly one Service Desk profile-directory RPC must exist",
)

rpc_start = sql.index("create or replace function public.list_service_desk_profiles()")
rpc_end = sql.index("\n$$;", rpc_start) + len("\n$$;")
rpc = sql[rpc_start:rpc_end]

for expected in (
    "returns table (\n  id uuid,\n  display_name text\n)",
    "security definer",
    "set search_path = ''",
    "if auth.uid() is null then",
    "public.has_permission('tickets.directory')",
    "permissions.permission_key = 'tickets.assign'",
):
    require(expected.lower() in rpc.lower(), f"directory RPC must contain: {expected}")

for forbidden in ("email", "avatar_url", "phone", "metadata"):
    require(forbidden not in rpc.lower(), f"directory RPC must not expose {forbidden}")

require(
    "revoke all on function public.list_service_desk_profiles() from public;" in sql,
    "PUBLIC directory execution must be revoked",
)
require(
    "grant execute on function public.list_service_desk_profiles() to authenticated;" in sql,
    "authenticated directory execution must be explicitly granted",
)

for role in ("platform_admin", "it_admin", "sd_lead", "helpdesk", "technician", "network_admin"):
    role_start = sql.index(f"-- {role}:")
    role_end = sql.index("on conflict do nothing;", role_start)
    require(
        "'tickets.directory'" in sql[role_start:role_end],
        f"{role} must receive tickets.directory",
    )

for role in ("doc_editor", "employee", "platform_auditor"):
    role_start = sql.index(f"-- {role}:")
    role_end = sql.index("on conflict do nothing;", role_start)
    require(
        "'tickets.directory'" not in sql[role_start:role_end],
        f"{role} must not receive tickets.directory",
    )

require(
    '.rpc("list_service_desk_profiles")' in frontend,
    "frontend profile lookup must use the scoped directory RPC",
)
require(
    not re.search(r'\.from\("profiles"\)', frontend),
    "frontend profile lookup must not select directly from profiles",
)
require("email" not in frontend.lower(), "frontend directory model must not include email")

for expected in (
    "Directory MUST return only assignment-capable Service Desk profiles",
    "Directory MUST expose only id and display_name",
    "Directory permission MUST NOT broaden direct cross-user profile SELECT",
    "Approved directory caller",
    "Unauthorized directory caller",
):
    require(expected in db_qa, f"database QA must include: {expected}")

require(
    "## Milestone 22 - Scoped Service Desk Profile Directory" in status,
    "P11 milestone must exist in hardening status document",
)

print("Scoped Service Desk profile-directory static assertions passed.")
PY
