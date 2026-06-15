#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
route="$root/src/routes/admin.users.tsx"
service="$root/src/lib/admin-users/admin-users.ts"
client_create="$root/src/lib/admin-users/create-user.ts"
api_route="$root/src/routes/api.admin-users.ts"
browser_client="$root/src/integrations/supabase/client.ts"
env_example="$root/.env.example"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

rg -q 'adminUsersQuery' "$route"
rg -q 'from\("profiles"\)' "$service"
rg -q 'from\("user_global_roles"\)' "$service"
rg -q 'from\("team_members"\)' "$service"
rg -Fq 'title="Add user"' "$route"
rg -Fq 'createAdminUser({ ...draft, accessToken: session.access_token })' "$route"
rg -Fq 'User was not created' "$route"
rg -Fq 'Active users receive an invite.' "$route"
rg -Fq 'adminUserFormOptionsQuery' "$route"

# The browser sends the session token to a same-origin server route. Privileged
# environment access and writes exist only in the route's server handler.
rg -Fq 'fetch("/api/admin-users"' "$client_create"
rg -Fq 'Authorization: `Bearer ${accessToken}`' "$client_create"
rg -Fq 'server:' "$api_route"
rg -Fq 'POST: async ({ request })' "$api_route"
rg -Fq 'const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY' "$api_route"
! rg -q 'SUPABASE_SERVICE_ROLE_KEY|serviceRole' "$route" "$service" "$browser_client"
rg -q '^SUPABASE_SERVICE_ROLE_KEY=$' "$env_example"
! rg -q '^VITE_.*SERVICE_ROLE' "$env_example"

# Server authorization and input/resource validation must precede auth writes.
rg -Fq 'admin.auth.getUser(accessToken)' "$api_route"
rg -Fq '.eq("roles.role_key", "platform_admin")' "$api_route"
rg -Fq 'callerProfileResult.data?.is_active !== true' "$api_route"
rg -Fq '.eq("role_scope", "platform")' "$api_route"
rg -Fq 'The selected team is not valid.' "$api_route"

# Real account creation plus all required metadata writes and compensating
# cleanup are present. No browser-local or demo success path is allowed.
rg -Fq 'admin.auth.admin.inviteUserByEmail' "$api_route"
rg -Fq 'admin.auth.admin.createUser' "$api_route"
rg -Fq 'admin.auth.admin.deleteUser(userId)' "$api_route"
rg -Fq 'admin.from("profiles").upsert' "$api_route"
rg -Fq 'admin.from("user_global_roles").insert' "$api_route"
rg -Fq 'admin.from("team_members").insert' "$api_route"
rg -Fq 'membership_status: parsed.isActive ? "active" : "suspended"' "$api_route"

if rg -q 'useData|@/lib/data/users|auth\.users|localStorage|sessionStorage' "$route" "$service" "$client_create" "$api_route"; then
  echo "admin users still references an unsafe or browser-local source" >&2
  exit 1
fi

rg -Fq '## Milestone 77' "$status"

echo "admin users creation assertions passed"
