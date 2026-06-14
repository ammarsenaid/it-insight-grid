#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
route="$root/src/routes/admin.ticket-settings.tsx"
templates_route="$root/src/routes/admin.templates.tsx"
permissions="$root/src/lib/permissions.tsx"
configuration_sql="$root/supabase/migrations/20260611030000_ticket_configuration.sql"
configuration_qa="$root/supabase/pending/20260611030000_ticket_configuration.qa.sql"

test "$(rg -c 'QueryResult = useQuery' "$route")" -eq 5
rg -q 'const configError = \[' "$route"
rg -q 'Failed to load ticket configuration' "$route"
test "$(rg -c 'QueryResult\.refetch\(\)' "$route")" -eq 5
! rg -q 'description=\{.*error.*\.message' "$route"

# Browser-facing role contract: config writers retain create/edit, while only
# the platform-admin frontend alias can render or invoke destructive deletion.
rg -q '"tickets\.config":[[:space:]]+\[\.\.\.ADMINS, "sd_lead"\]' "$permissions"
rg -q '"tickets\.cannedResponses\.delete":[[:space:]]+\["super_admin"\]' "$permissions"
rg -q 'const writable = can\("tickets\.config", role\);' "$templates_route"
rg -q 'const canDelete = can\("tickets\.cannedResponses\.delete", role\);' "$templates_route"
test "$(rg -c '\{canDelete && \(' "$templates_route")" -eq 2
test "$(rg -c '\{writable && \(' "$templates_route")" -eq 1
rg -q 'if \(!canDelete\) throw new Error\("You do not have permission to delete templates"\);' "$templates_route"

bun -e '
import { can, rolesForRoleKeys } from "./src/lib/permissions.tsx";
const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
for (const role of ["super_admin", "it_admin", "sd_lead"] as const) {
  assert(can("tickets.config", role), `${role} lost canned-response create/edit`);
}
assert(can("tickets.cannedResponses.delete", "super_admin"), "platform admin lost canned-response delete");
assert(!can("tickets.cannedResponses.delete", "it_admin"), "IT admin gained canned-response delete");
assert(!can("tickets.cannedResponses.delete", "sd_lead"), "Service Desk lead gained canned-response delete");
assert(can("tickets.cannedResponses.delete", rolesForRoleKeys(["platform_admin"])), "platform_admin alias lost delete");
' >/dev/null

# Staged disposable-database QA must exercise the same delete boundary.
rg -q "for delete to authenticated" "$configuration_sql"
rg -q "using \(public\.is_platform_admin\(\)\)" "$configuration_sql"
rg -q "sd_lead deleted canned response" "$configuration_qa"
rg -q "it_admin deleted canned response" "$configuration_qa"
rg -q "sd_lead should update one canned response" "$configuration_qa"
rg -q "it_admin should update one canned response" "$configuration_qa"
rg -q "platform_admin should delete one canned response" "$configuration_qa"

printf 'Ticket configuration authorization assertions passed.\n'
