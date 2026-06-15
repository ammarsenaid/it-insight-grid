#!/usr/bin/env bash
set -euo pipefail

route="src/routes/admin.users.tsx"
service="src/lib/admin-users/admin-users.ts"

rg -q 'adminUsersQuery' "$route"
rg -q 'from\("profiles"\)' "$service"
rg -q 'from\("user_global_roles"\)' "$service"
rg -q 'from\("team_members"\)' "$service"
rg -q 'Backend action pending' "$route"

if rg -q 'useData|@/lib/data/users|auth\.users|localStorage|sessionStorage' "$route" "$service"; then
  echo "admin users still references an unsafe or browser-local source" >&2
  exit 1
fi

echo "admin users live-data assertions passed"
