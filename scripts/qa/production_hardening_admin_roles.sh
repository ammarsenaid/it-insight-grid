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
page_visibility_helper="$root/src/lib/page-visibility.ts"
types="$root/src/lib/admin-roles/types.ts"
permissions="$root/src/lib/permissions.tsx"
auth_gate="$root/src/components/layout/AuthGate.tsx"
sidebar="$root/src/components/layout/AppSidebar.tsx"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

for file in "$route" "$api_route" "$service" "$queries" "$client_mutation" "$metadata_mutation" "$page_visibility_mutation" "$page_visibility_api" "$page_visibility_helper" "$types" "$permissions" "$auth_gate" "$sidebar"; do
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
rg -Fq '.select("role_id, route_path, can_view, roles!inner(role_key, role_scope)")' "$service"
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
rg -Fq '.update({ can_view: parsed.canView, updated_by: callerId })' "$page_visibility_api"
! rg -q '\.(insert|delete|upsert)\(' "$page_visibility_api"
! rg -q 'role_id: parsed|route_path: parsed' "$page_visibility_api"
! rg -U -q 'from\("role_page_visibility"\)[\s\S]{0,240}\.(insert|update|delete|upsert)\(' \
  "$route" "$service" "$queries" "$client_mutation" "$metadata_mutation" "$page_visibility_mutation"
! rg -q 'SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey' "$page_visibility_mutation"
rg -Fq 'Routing uses the live DB matrix when available and falls back to static safety rules if the matrix cannot be loaded.' "$route"
rg -Fq 'Platform Administrator access to role management is protected.' "$route"
rg -Fq 'Employee access to administration pages is protected.' "$route"
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

# Live enforcement is accepted only through a complete, validated matrix. The
# existing static rules remain the fail-safe for loading, read, and validation failures.
rg -Fq 'PAGE_VISIBILITY' "$route"
rg -Fq 'export const PAGE_VISIBILITY' "$permissions"
rg -Fq 'export function usePageVisibility' "$page_visibility_helper"
rg -Fq 'buildValidatedPageVisibilityMatrix' "$page_visibility_helper"
rg -Fq 'FRONTEND_ROLE_TO_DB_ROLE_KEY' "$page_visibility_helper"
rg -Fq 'super_admin: "platform_admin"' "$page_visibility_helper"
rg -Fq 'auditor: "platform_auditor"' "$page_visibility_helper"
rg -Fq 'return canSeeStaticPage' "$page_visibility_helper"
rg -Fq 'if (!pattern) return false' "$page_visibility_helper"
rg -Fq 'row.roleScope !== "platform"' "$page_visibility_helper"
rg -Fq 'cells.get("/admin/roles")?.get("platform_admin") !== true' "$page_visibility_helper"
rg -Fq 'routePath.startsWith("/admin/")' "$page_visibility_helper"
rg -Fq 'cells.get(routePath)?.get("employee") !== false' "$page_visibility_helper"
rg -Fq 'usePageVisibility' "$auth_gate"
rg -Fq 'pageVisibility.canSeePage(pathname)' "$auth_gate"
rg -Fq 'usePageVisibility' "$sidebar"
rg -Fq 'pageVisibility.canSeePage(it.url)' "$sidebar"
! git -C "$root" diff --name-only -- supabase | rg -q .
! rg -U -q 'from\("role_page_visibility"\)[\s\S]{0,240}\.(insert|update|delete|upsert)\(' \
  "$route" "$service" "$queries" "$client_mutation" "$metadata_mutation" "$page_visibility_mutation" "$page_visibility_helper" "$auth_gate" "$sidebar"

rg -Fq '## Milestone 78 - Live Database Role Permission Matrix' "$status"
rg -Fq '## Milestone 79 - Live Role Display Metadata Editing' "$status"
rg -Fq '## Milestone 81 - Live Page Visibility Read-only Display' "$status"
rg -Fq '## Milestone 82 - Live Page Visibility Editing' "$status"
rg -Fq '## Milestone 83 - DB-backed Page Visibility Enforcement' "$status"

echo "admin roles permission matrix assertions passed"
