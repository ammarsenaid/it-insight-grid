#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SQL="$ROOT/supabase/migrations/20260611000000_service_desk_foundation.sql"
DBQA="$ROOT/supabase/pending/20260611000000_service_desk_foundation.qa.sql"
STATUS="$ROOT/docs/PRODUCTION_HARDENING_STATUS.md"

python3 - "$SQL" "$DBQA" "$STATUS" <<'PY'
from pathlib import Path
import sys

sql = Path(sys.argv[1]).read_text(encoding="utf-8")
qa = Path(sys.argv[2]).read_text(encoding="utf-8")
status = Path(sys.argv[3]).read_text(encoding="utf-8")

def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"ASSERTION FAILED: {message}")

require(
    sql.count("('catalog.request',          'Submit Catalog Requests'") == 1,
    "foundation SQL must define catalog.request exactly once",
)

rpc_start = sql.index(
    "create or replace function public.submit_catalog_request("
)

rpc_end = sql.index("\n$$;", rpc_start) + len("\n$$;")
rpc = sql[rpc_start:rpc_end]

require(
    "if not public.has_permission('catalog.request') then" in rpc,
    "submit_catalog_request must enforce catalog.request",
)

require(
    "Catalog request permission required" in rpc,
    "submit_catalog_request must raise a permission error",
)

require(
    rpc.index("if caller is null then")
    < rpc.index("public.has_permission('catalog.request')"),
    "submit_catalog_request must reject anonymous callers before permission lookup",
)

require(
    rpc.index("public.has_permission('catalog.request')")
    < rpc.index("select * into item"),
    "catalog.request must be checked before catalog lookup",
)

require(
    "security definer\nset search_path = ''" in rpc,
    "submit_catalog_request must keep an empty search_path",
)

require(
    "item.visibility = 'restricted'" in rpc
    and "public.has_permission('catalog.manage')" in rpc,
    "submit_catalog_request must preserve restricted-item authorization",
)

require(
    "Missing required field:" in rpc and "errcode = '22023'" in rpc,
    "submit_catalog_request must preserve required-field validation",
)

for role_key in (
    "platform_admin",
    "it_admin",
    "sd_lead",
    "helpdesk",
    "employee",
):
    require(
        f"where r.role_key = '{role_key}'" in sql,
        f"foundation SQL must map a role block for {role_key}",
    )

auditor_block_start = sql.index("-- platform_auditor: read-only access")
auditor_block_end = sql.index("-- ------------------------------------------------------------", auditor_block_start)
auditor_block = sql[auditor_block_start:auditor_block_end]

require(
    "'catalog.request'" not in auditor_block,
    "platform_auditor must not receive catalog.request",
)

require(
    "Caller without catalog.request MUST NOT submit catalog requests" in qa,
    "foundation QA must verify permission denial",
)

require(
    "Anonymous callers MUST NOT submit catalog requests" in qa,
    "foundation QA must verify anonymous denial",
)

require(
    "submit_catalog_request MUST reject restricted items for normal employees" in qa,
    "foundation QA must verify restricted-item denial",
)

require(
    "when invalid_parameter_value then" in qa
    and "submit_catalog_request MUST reject missing required fields" in qa,
    "foundation QA must verify required-field validation",
)

require(
    "Happy path: employee submits a request and gets a ticket" in qa
    and "RPC must return a ticket row" in qa,
    "foundation QA must verify an allowed requester",
)

require(
    "where r.role_key = 'employee'" in qa,
    "foundation QA must assign the employee requester fixture role",
)

require(
    "## Milestone 15 - Catalog Request Permission Enforcement" in status,
    "hardening status must document P04",
)

print("Catalog request permission assertions passed.")
PY
