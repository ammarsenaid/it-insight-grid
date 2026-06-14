#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
queries="$root/src/lib/service-desk/queries.ts"
page="$root/src/routes/notifications.tsx"
drawer="$root/src/components/common/NotificationDrawer.tsx"
notifications="$root/src/lib/service-desk/notifications.ts"
sql="$root/supabase/migrations/20260611050000_notifications.sql"
dbqa="$root/supabase/pending/20260611050000_notifications.qa.sql"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

rg -q 'export function markNotificationsReadInCache' "$queries"
rg -q 'setQueriesData<NotificationRow\[\]>' "$queries"
rg -q 'predicate: \(\{ queryKey \}\) =>' "$queries"
rg -q 'typeof queryKey\[2\] === "number"' "$queries"
rg -q 'Array\.isArray\(rows\)' "$queries"
rg -q 'setQueryData\(sdKeys\.notificationsUnread\(\)' "$queries"
rg -q 'const changed = Math\.max\(0, affectedRows\);' "$queries"
rg -q 'if \(changed === 0\) return;' "$queries"
rg -q 'Math\.max\(0, count - changed\)' "$queries"
! rg -q 'count - selected\.size' "$queries"
! rg -q 'setQueriesData<NotificationRow\[\]>\(\{ queryKey: sdKeys\.notifications\(\) \}' "$queries"

for file in "$page" "$drawer"; do
  test "$(rg -c 'markNotificationsReadInCache\(qc' "$file")" -eq 2
  test "$(rg -c 'markNotificationsReadInCache\(qc, (n|count)' "$file")" -eq 2
  test "$(rg -c 'Could not mark.*notification' "$file")" -eq 2
  ! rg -q 'onError: \(e\) => toast\.error\(e instanceof Error \? e\.message' "$file"
done

python3 - "$notifications" "$sql" "$dbqa" "$status" <<'PY'
from pathlib import Path
import sys

notifications = Path(sys.argv[1]).read_text(encoding="utf-8")
sql = Path(sys.argv[2]).read_text(encoding="utf-8")
qa = Path(sys.argv[3]).read_text(encoding="utf-8")
status = Path(sys.argv[4]).read_text(encoding="utf-8")

def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"ASSERTION FAILED: {message}")

require(
    "drop policy if exists notifications_update_own on public.notifications;" in sql,
    "legacy direct notification UPDATE policy must be dropped",
)
require(
    "create policy notifications_update_own" not in sql,
    "direct authenticated notification UPDATE policy must be absent",
)
require(
    "grant select on table public.notifications to authenticated;" in sql,
    "authenticated notification table access must be SELECT-only",
)
require(
    "grant select, update on table public.notifications to authenticated;" not in sql,
    "legacy broad notification UPDATE grant must be absent",
)

rpc_start = sql.index("create or replace function public.mark_notifications_read(")
rpc_end = sql.index("\n$$;", rpc_start) + len("\n$$;")
rpc = sql[rpc_start:rpc_end]
require("security definer" in rpc.lower(), "mark-read RPC must remain SECURITY DEFINER")
require("set search_path = ''" in rpc, "mark-read RPC must keep an empty search_path")
require("if auth.uid() is null then" in rpc, "mark-read RPC must reject anonymous callers")
require(
    rpc.count("where user_id = auth.uid()") == 2,
    "both mark-one and mark-all paths must bind updates to auth.uid()",
)
require(
    rpc.count("and read_at is null") == 2
    and "where user_id = auth.uid() and read_at is null" in rpc,
    "both mark-read RPC branches must update only unread rows",
)
require(
    "grant execute on function public.mark_notifications_read(uuid[]) to authenticated;" in sql,
    "authenticated callers must retain mark-read RPC execution",
)
require(
    '.rpc("mark_notifications_read"' in notifications
    and '.from("notifications").update(' not in notifications,
    "browser notification mutation must use only the mark-read RPC",
)

for expected in (
    "authenticated MUST NOT have direct UPDATE privilege on public.notifications",
    "Authenticated callers MUST NOT UPDATE notification content directly",
    "Denied direct UPDATE MUST preserve notification owner and content",
    "mark_notifications_read MUST mark one owned unread notification",
    "mark_notifications_read MUST return zero for an already-read row",
    "mark_notifications_read MUST NOT update another user''s notification",
    "Cross-user mark attempt MUST leave the foreign notification unread",
    "mark_notifications_read mark-all MUST return every changed owned row",
):
    require(expected in qa, f"notification QA must include: {expected}")

require(
    "## Milestone 16 - Notification Read-State Mutation Boundary" in status,
    "P05 milestone must exist in hardening status document",
)
PY

printf 'Notification mutation consistency assertions passed.\n'
