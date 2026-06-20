#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
route="$root/src/routes/admin.roles.tsx"
api_route="$root/src/routes/api.admin-roles.ts"
service="$root/src/lib/admin-roles/admin-roles.ts"
queries="$root/src/lib/admin-roles/queries.ts"
client_mutation="$root/src/lib/admin-roles/update-role-permission.ts"
metadata_mutation="$root/src/lib/admin-roles/update-role-metadata.ts"
types="$root/src/lib/admin-roles/types.ts"
permissions="$root/src/lib/permissions.tsx"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

for file in "$route" "$api_route" "$service" "$queries" "$client_mutation" "$metadata_mutation" "$types" "$permissions"; do
  test -f "$file"
done

rg -Fq 'createFileRoute("/admin/roles")' "$route"
rg -Fq 'createFileRoute("/api/admin-roles")' "$api_route"
rg -Fq 'adminRolesQuery()' "$route"
rg -Fq 'from("roles")' "$service"
rg -Fq 'from("permissions")' "$service"
rg -Fq 'from("role_permissions").select("role_id, permission_id")' "$service"
rg -Fq '.order("permission_key", { ascending: true })' "$service"

# Page visibility is display-only in Milestone 3E. It uses a separate
# authenticated SELECT query so failure cannot break the role/permission tabs.
rg -Fq 'export async function listAdminRolePageVisibility' "$service"
rg -Fq '.from("role_page_visibility")' "$service"
rg -Fq '.select("role_id, route_path, can_view, roles!inner(role_key)")' "$service"
rg -Fq 'adminRolePageVisibilityQuery' "$queries"
rg -Fq 'Live DB page visibility - read only' "$route"
rg -Fq 'Routing still uses static fallback until enforcement milestone.' "$route"
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

rg -Fq '## Milestone 78 - Live Database Role Permission Matrix' "$status"
rg -Fq '## Milestone 79 - Live Role Display Metadata Editing' "$status"
rg -Fq '## Milestone 81 - Live Page Visibility Read-only Display' "$status"

echo "admin roles permission matrix assertions passed"
