#!/usr/bin/env bash
set -euo pipefail

root="${ITKC_QA_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

org_sql="${ITKC_ORG_SQL:-$root/supabase/pending/20260612235900_organization_foundation.sql}"
org_qa="${ITKC_ORG_QA:-$root/supabase/pending/20260612235900_organization_foundation.qa.sql}"
cmdb_sql="${ITKC_CMDB_SQL:-$root/supabase/pending/20260613000000_cmdb_backend.sql}"
cmdb_qa="${ITKC_CMDB_QA:-$root/supabase/pending/20260613000000_cmdb_backend.qa.sql}"

route="$root/src/routes/cmdb.tsx"
drawer="$root/src/components/cmdb/AssetDetailsDrawer.tsx"
service="$root/src/lib/cmdb/assets.ts"
queries="$root/src/lib/cmdb/queries.ts"
permissions="$root/src/lib/permissions.tsx"
dashboard="$root/src/routes/index.tsx"

python3 - \
  "$org_sql" \
  "$org_qa" \
  "$cmdb_sql" \
  "$cmdb_qa" \
  "$route" \
  "$drawer" \
  "$service" \
  "$queries" \
  "$permissions" \
  "$dashboard" <<'PY'
from pathlib import Path
import re
import sys

org_sql = Path(sys.argv[1]).read_text(encoding="utf-8")
org_qa = Path(sys.argv[2]).read_text(encoding="utf-8")
cmdb_sql = Path(sys.argv[3]).read_text(encoding="utf-8")
cmdb_qa = Path(sys.argv[4]).read_text(encoding="utf-8")
route = Path(sys.argv[5]).read_text(encoding="utf-8")
drawer = Path(sys.argv[6]).read_text(encoding="utf-8")
service = Path(sys.argv[7]).read_text(encoding="utf-8")
queries = Path(sys.argv[8]).read_text(encoding="utf-8")
permissions = Path(sys.argv[9]).read_text(encoding="utf-8")
dashboard = Path(sys.argv[10]).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"ASSERTION FAILED: {message}")


for expected in (
    "create table if not exists public.organizations",
    "create table if not exists public.organization_members",
    "create or replace function public.is_active_organization_member",
    "create or replace function public.current_organization_id()",
    "security definer",
    "set search_path = ''",
    "Exactly one active organization context is required",
    "organizations.status = 'active'",
):
    require(
        expected in org_sql,
        f"organization foundation must contain: {expected}",
    )

for expected in (
    "organizations RLS must be enabled",
    "organization_members RLS must be enabled",
    "authenticated must not create organizations directly",
    "authenticated must not create memberships directly",
    "suspended organization unexpectedly resolved context",
    "requested suspended organization unexpectedly resolved context",
):
    require(
        expected in org_qa,
        f"organization foundation QA must contain: {expected}",
    )

for expected in (
    "organization_id uuid not null",
    "references public.organizations(id) on delete restrict",
    "unique (organization_id, id)",
    "foreign key (organization_id, asset_id)",
    "references public.cmdb_assets(organization_id, id)",
    "new.organization_id := active_organization",
    "CMDB asset organization cannot be changed",
    "CMDB owner must belong to the active organization",
    "organization_id = public.current_organization_id()",
    "public.current_organization_id(),",
    "revoke insert, update, delete on public.cmdb_asset_types from authenticated",
):
    require(
        expected in cmdb_sql,
        f"CMDB SQL must contain: {expected}",
    )

require(
    cmdb_sql.count("organization_id = public.current_organization_id()") >= 7,
    "CMDB SQL must repeatedly enforce active-organization scope",
)

require(
    "create policy cmdb_asset_types_insert" not in cmdb_sql,
    "global CMDB asset-type insert policy must be absent",
)

require(
    "create policy cmdb_asset_types_update" not in cmdb_sql,
    "global CMDB asset-type update policy must be absent",
)

for expected in (
    "organization A must not read organization B assets",
    "organization A unexpectedly deleted organization B asset",
    "organization A unexpectedly updated organization B asset",
    "organization A unexpectedly moved an asset",
    "import must derive organization A",
    "cross-organization lifecycle binding unexpectedly succeeded",
    "authenticated caller unexpectedly forged lifecycle row",
    "restore must retain same-organization lifecycle binding",
    "user without organization unexpectedly resolved context",
    "anonymous caller unexpectedly resolved organization",
    "failed CMDB import must be atomic",
    "authenticated must not move CMDB assets across organizations",
):
    require(
        expected in cmdb_qa,
        f"CMDB tenant QA must contain: {expected}",
    )

require(
    not re.search(
        r'@/lib/data/store|setState\(|trashItem\(|uid\(|data\.assets',
        route + drawer,
    ),
    "CMDB UI must not use browser-local authoritative asset writes",
)

require(
    "useQuery({ ...cmdbAssetsQuery" in route,
    "CMDB route must use the shared React Query asset contract",
)

require(
    'can("cmdb.manage", role)' in route,
    "CMDB route must use cmdb.manage",
)

require(
    'can("cmdb.manage", role)' in drawer,
    "CMDB drawer must use cmdb.manage",
)

require(
    '"cmdb.manage":' in permissions,
    "permissions matrix must include cmdb.manage",
)

require(
    "cmdb.write" not in permissions + route + drawer + dashboard,
    "legacy cmdb.write capability must be absent",
)

require(
    'cap: "cmdb.manage"' in dashboard,
    "dashboard CMDB action must use cmdb.manage",
)

for expected in (
    '.from("cmdb_assets")',
    '.rpc("soft_delete_cmdb_asset"',
    '.rpc("restore_cmdb_asset"',
    '.rpc("set_cmdb_asset_statuses"',
    '.rpc("import_cmdb_assets"',
):
    require(
        expected in service,
        f"CMDB service must contain: {expected}",
    )

require(
    "cmdbLifecycleQuery" in queries + drawer,
    "CMDB lifecycle query must remain wired",
)

for name, content in (
    ("organization SQL", org_sql),
    ("organization QA", org_qa),
    ("CMDB SQL", cmdb_sql),
    ("CMDB QA", cmdb_qa),
):
    require("\r" not in content, f"{name} must not contain CRLF")
    require(
        not any(line.endswith((" ", "\t")) for line in content.splitlines()),
        f"{name} must not contain trailing whitespace",
    )

print("Organization-scoped CMDB static assertions passed.")
PY
