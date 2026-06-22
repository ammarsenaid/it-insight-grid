#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
route="$root/src/routes/admin.roles.tsx"
api_route="$root/src/routes/api.admin-roles.ts"
service="$root/src/lib/admin-roles/admin-roles.ts"
queries="$root/src/lib/admin-roles/queries.ts"
client_mutation="$root/src/lib/admin-roles/update-role-permission.ts"
metadata_mutation="$root/src/lib/admin-roles/update-role-metadata.ts"
page_visibility_mutation="$root/src/lib/admin-roles/update-role-page-visibility.ts"
page_visibility_api="$root/src/routes/api.admin-role-page-visibility.ts"
page_visibility_recovery_sql="$root/supabase/pending/20260622000000_harden_role_page_visibility_recovery.sql"
page_visibility_recovery_qa="$root/supabase/pending/20260622000000_harden_role_page_visibility_recovery.qa.sql"
types="$root/src/lib/admin-roles/types.ts"
permissions="$root/src/lib/permissions.tsx"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

for file in "$route" "$api_route" "$service" "$queries" "$client_mutation" "$metadata_mutation" "$page_visibility_mutation" "$page_visibility_api" "$page_visibility_recovery_sql" "$page_visibility_recovery_qa" "$types" "$permissions"; do
  test -f "$file"
done

rg -Fq 'createFileRoute("/admin/roles")' "$route"
rg -Fq 'createFileRoute("/api/admin-roles")' "$api_route"
rg -Fq 'adminRolesQuery()' "$route"
rg -Fq 'from("roles")' "$service"
rg -Fq 'from("permissions")' "$service"
rg -Fq 'from("role_permissions").select("role_id, permission_id")' "$service"
rg -Fq '.order("permission_key", { ascending: true })' "$service"

# Page visibility reads use a separate authenticated SELECT query so failure
# cannot break the role/permission tabs. Writes use only the protected API.
rg -Fq 'export async function listAdminRolePageVisibility' "$service"
rg -Fq '.from("role_page_visibility")' "$service"
rg -Fq '.select("role_id, route_path, can_view, roles!inner(role_key)")' "$service"
rg -Fq 'adminRolePageVisibilityQuery' "$queries"
rg -Fq 'export async function updateRolePageVisibility' "$page_visibility_mutation"
rg -Fq 'fetch("/api/admin-role-page-visibility"' "$page_visibility_mutation"
rg -Fq 'method: "PATCH"' "$page_visibility_mutation"
rg -Fq 'Authorization: `Bearer ${accessToken}`' "$page_visibility_mutation"
rg -Fq 'createFileRoute("/api/admin-role-page-visibility")' "$page_visibility_api"
rg -Fq 'roleId: z.string().uuid()' "$page_visibility_api"
rg -Fq 'canView: z.boolean()' "$page_visibility_api"
rg -Fq 'admin.auth.getUser(accessToken)' "$page_visibility_api"
rg -Fq 'callerProfileResult.data?.is_active !== true' "$page_visibility_api"
rg -Fq '.eq("roles.role_key", "platform_admin")' "$page_visibility_api"
rg -Fq '.select("id, role_id, route_path, roles!inner(role_key, role_scope)")' "$page_visibility_api"
rg -Fq 'if (!targetRow) return failure("The selected visibility row does not exist.", 404);' "$page_visibility_api"
rg -Fq 'joinedRole.role_scope !== "platform"' "$page_visibility_api"
rg -Fq 'joinedRole.role_key === "platform_admin"' "$page_visibility_api"
rg -Fq 'targetRow.route_path === "/admin/roles"' "$page_visibility_api"
rg -Fq 'joinedRole.role_key === "employee"' "$page_visibility_api"
rg -Fq 'targetRow.route_path.startsWith("/admin/")' "$page_visibility_api"
rg -Fq 'const nonEmployeeRecoveryRoleKeys = new Set([' "$page_visibility_api"
for role_key in platform_admin it_admin sd_lead helpdesk technician network_admin doc_editor platform_auditor; do
  rg -Fq "\"$role_key\"" "$page_visibility_api"
  rg -Fq "\"$role_key\"" "$route"
done
rg -Fq 'targetRow.route_path === "/"' "$page_visibility_api"
rg -Fq 'nonEmployeeRecoveryRoleKeys.has(joinedRole.role_key)' "$page_visibility_api"
rg -Fq 'targetRow.route_path === "/my-requests" && joinedRole.role_key === "employee"' "$page_visibility_api"
rg -Fq 'parsed.canView === false' "$page_visibility_api"
rg -Fq "non_employee_recovery_role_keys constant text[]" "$page_visibility_recovery_sql"
rg -Fq "Required recovery destination visibility is protected" "$page_visibility_recovery_sql"
rg -Fq "recovery route disable unexpectedly succeeded" "$page_visibility_recovery_qa"
rg -Fq "recovery route move unexpectedly succeeded" "$page_visibility_recovery_qa"
rg -Fq "recovery route delete unexpectedly succeeded" "$page_visibility_recovery_qa"
rg -Fq 'const recoveryRouteCell =' "$route"
rg -Fq 'NON_EMPLOYEE_RECOVERY_ROLE_KEYS.has(dbRole.roleKey)' "$route"
rg -Fq 'routePath === "/my-requests" && dbRole.roleKey === "employee"' "$route"
rg -Fq '(recoveryRouteCell && cell === true);' "$route"
rg -Fq 'Required recovery destination. This route cannot be disabled.' "$route"
rg -Fq '.update({ can_view: parsed.canView, updated_by: callerId })' "$page_visibility_api"
! rg -q '\.(insert|delete|upsert)\(' "$page_visibility_api"
! rg -q 'role_id: parsed|route_path: parsed' "$page_visibility_api"
! rg -U -q 'from\("role_page_visibility"\)[\s\S]{0,240}\.(insert|update|delete|upsert)\(' \
  "$route" "$service" "$queries" "$client_mutation" "$metadata_mutation" "$page_visibility_mutation"
! rg -q 'SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey' "$page_visibility_mutation"
rg -Fq 'This edits the live DB matrix only. Routing still uses static safety rules. DB-backed enforcement is disabled.' "$route"
rg -Fq 'Platform Admin must always keep access to role management.' "$route"
rg -Fq 'Employee access to admin pages is intentionally blocked.' "$route"
! rg -U -q 'from\("role_page_visibility"\)[\s\S]{0,240}\.(insert|update|delete|upsert)\(' \
  "$route" "$service" "$queries" "$client_mutation" "$metadata_mutation" "$api_route"
! rg -q 'role_page_visibility' "$api_route"

# Privileged credentials and writes stay in the server route. Browser modules
# use the authenticated client for reads and the same-origin API for mutations.
rg -Fq 'const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY' "$api_route"
rg -Fq 'admin.auth.getUser(accessToken)' "$api_route"
rg -Fq '.eq("roles.role_key", "platform_admin")' "$api_route"
rg -Fq 'callerProfileResult.data?.is_active !== true' "$api_route"
rg -Fq 'action: z.enum(["grant", "revoke"])' "$api_route"
rg -Fq 'platform_admin permissions cannot be revoked.' "$api_route"
rg -Fq 'Platform Administrator permissions are read-only to prevent lockout.' "$route"
! rg -q 'SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey' "$route" "$service" "$queries" "$client_mutation" "$types"
! rg -q 'from\("role_permissions"\).*(insert|delete|upsert)' "$route" "$service" "$queries" "$client_mutation" "$types"

# Role metadata is a separate PATCH contract. Only display name and description
# may be written; role identity, scope, system status, create, and delete stay out
# of this milestone.
rg -Fq 'export async function updateRoleMetadata' "$metadata_mutation"
rg -Fq 'method: "PATCH"' "$metadata_mutation"
rg -Fq 'const updateRoleMetadataInput = z.object({' "$api_route"
rg -Fq 'name: z.string().trim().min(1).max(120)' "$api_route"
rg -Fq 'description: z.string().trim().max(1000).nullable()' "$api_route"
rg -Fq 'PATCH: async ({ request })' "$api_route"
rg -Fq '.update({ name: parsed.name, description })' "$api_route"
rg -Fq 'Only an active platform administrator can edit role metadata.' "$api_route"
! rg -q 'role_key:\s*parsed|role_scope:\s*parsed|is_system:\s*parsed' "$api_route"
! rg -q 'DELETE:\s*async|PUT:\s*async' "$api_route"
! rg -q 'SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey' "$metadata_mutation"
rg -Fq 'Role key' "$route"
rg -Fq 'System role' "$route"

# Milestone 1 must retain the static page-visibility fallback and must not wire
# AppSidebar/AuthGate to the live permission matrix.
rg -Fq 'PAGE_VISIBILITY' "$route"
rg -Fq 'export const PAGE_VISIBILITY' "$permissions"
! git -C "$root" diff --name-only -- src/lib/permissions.tsx src/components/layout/AppSidebar.tsx src/components/layout/AuthGate.tsx | rg -q .
test ! -e "$root/src/lib/page-visibility.ts"
! git -C "$root" diff --name-only -- supabase/migrations | rg -q .

# Milestone 85 changes only the page-visibility presentation. Role headers are
# readable and unique, the matrix explains every state, and filtering is local.
for role_label in \
  'Doc Editor' \
  'Employee' \
  'Helpdesk' \
  'IT Admin' \
  'Network Admin' \
  'Platform Admin' \
  'Platform Auditor' \
  'SD Lead' \
  'Technician'; do
  rg -Fq "$role_label" "$route"
done
! rg -q '[">]PA[<"]' "$route"
rg -Fq 'PAGE_VISIBILITY_ROLE_LABELS[dbRole.roleKey] ?? dbRole.name' "$route"
rg -Fq 'PAGE_VISIBILITY_ROLE_LABELS[role.id] ?? role.label' "$route"
rg -Fq 'Checked = visible' "$route"
rg -Fq 'Empty = hidden' "$route"
rg -Fq 'Locked = protected safety route' "$route"
rg -Fq 'Saving = update in progress' "$route"
rg -Fq 'Filter routes' "$route"
rg -Fq 'Search route label or path' "$route"
rg -Fq 'routePath.toLowerCase().includes(normalizedFilter)' "$route"
rg -Fq 'routeLabel.toLowerCase().includes(normalizedFilter)' "$route"
! git -C "$root" diff --name-only -- \
  src/components/layout/AuthGate.tsx \
  src/components/layout/AppSidebar.tsx \
  src/lib/permissions.tsx \
  src/lib/page-visibility.ts \
  supabase/migrations | rg -q .

rg -Fq '## Milestone 78 - Live Database Role Permission Matrix' "$status"
rg -Fq '## Milestone 79 - Live Role Display Metadata Editing' "$status"
rg -Fq '## Milestone 81 - Live Page Visibility Read-only Display' "$status"
rg -Fq '## Milestone 82 - Live Page Visibility Editing' "$status"
rg -Fq '## Milestone 84 - Page Visibility Recovery-route Guardrails' "$status"
rg -Fq '## Milestone 85 - Page Visibility Matrix UI Clarity' "$status"
rg -Fq '## Milestone 86 - Page Visibility Recovery Invariants at the Data Boundary' "$status"

echo "admin roles permission matrix assertions passed"
