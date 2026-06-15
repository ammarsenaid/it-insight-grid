#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
route="$root/src/routes/admin.teams.tsx"
service="$root/src/lib/teams/teams.ts"
queries="$root/src/lib/teams/queries.ts"
types="$root/src/lib/teams/types.ts"
errors="$root/src/lib/teams/errors.ts"
sql="$root/supabase/migrations/20260617000000_teams_admin_management.sql"
qa="$root/supabase/pending/20260617000000_teams_admin_management.qa.sql"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

# ---- /admin/teams must no longer use the local prototype store ----
! rg -q 'from "@/lib/data/teams"|from "@/lib/data/store"|from "@/lib/data/users"|from "@/lib/data/types"|useData\(\)' "$route"

# ---- New typed service layer + React Query integration ----
rg -Fq 'from "@/lib/teams/queries"' "$route"
rg -Fq 'from "@/lib/teams/teams"' "$route"
rg -Fq 'from "@/lib/teams/types"' "$route"
rg -Fq 'export const teamsKeys' "$queries"
rg -Fq 'export const teamsQuery' "$queries"
rg -Fq 'export const teamMembersQuery' "$queries"
rg -Fq 'export const teamRolesQuery' "$queries"
rg -Fq 'export const profilesQuery' "$queries"
rg -Fq 'export function normalizeTeamsError' "$errors"
rg -Fq 'export function formatTeamsError' "$errors"
rg -Fq 'formatTeamsError(e, "Failed to delete team")' "$route"
rg -Fq 'label="Could not load team members"' "$route"
rg -Fq 'label="Could not load team roles"' "$route"
rg -Fq 'label="Could not load profiles"' "$route"
! rg -q 'e instanceof Error \? e\.message : "Failed to (create|update|delete|add|remove)' "$route"
rg -Fq 'useQuery({ ...teamsQuery(), enabled })' "$route"
rg -Fq 'invalidateQueries({ queryKey: teamsKeys.list() })' "$route"
test "$(rg -c 'useMutation' "$route")" -ge 6

# ---- Mutating operations must go through RPC, never direct table writes ----
for rpc in update_team delete_team add_team_member remove_team_member set_team_member_role; do
  rg -Fq "rpc(\"$rpc\"" "$service"
done
! rg -q '\.from\("teams"\)\.(insert|update|delete)|\.from\("team_members"\)\.(insert|update|delete)|\.from\("team_member_roles"\)\.(insert|update|delete)' "$service" "$route"

# ---- Types match the Supabase-backed shape, not the prototype Team type ----
rg -Fq 'export interface TeamSummary' "$types"
rg -Fq 'memberCount: number' "$types"
rg -Fq 'export interface TeamMember' "$types"

# ---- Backend contract: permission-gated RPCs with safe search_path ----
for fn in update_team delete_team add_team_member remove_team_member set_team_member_role; do
  rg -Fq "create or replace function public.$fn(" "$sql"
done
test "$(rg -c "set search_path = ''" "$sql")" -eq 5
rg -Fq "public.has_permission('team.manage', p_team_id)" "$sql"
rg -Fq "public.has_permission('team.manage_members', p_team_id)" "$sql"
rg -Fq "public.has_permission('team.manage_roles', p_team_id)" "$sql"
rg -Fq "public.has_team_role(p_team_id, array['team_owner'])" "$sql"
rg -Fq 'Cannot remove the only remaining team owner' "$sql"
rg -Fq 'Cannot demote the only remaining team owner' "$sql"

for fn_sig in 'update_team(uuid, text, text, text)' 'delete_team(uuid)' \
  'add_team_member(uuid, uuid, text)' 'remove_team_member(uuid, uuid)' \
  'set_team_member_role(uuid, uuid, text)'; do
  rg -Fq "revoke all on function public.$fn_sig from public;" "$sql"
  rg -Fq "grant execute on function public.$fn_sig" "$sql"
done

# ---- QA coverage spot-checks ----
test -f "$qa"
rg -Fq 'create_team must trim name/description and lower the slug' "$qa"
rg -Fq 're-adding a member with the same role must not duplicate the role row' "$qa"
rg -Fq 'add_team_member must default to team_viewer' "$qa"
rg -Fq 'removing the only remaining team owner unexpectedly succeeded' "$qa"
rg -Fq 'demoting the only remaining team owner unexpectedly succeeded' "$qa"
rg -Fq 'team_admin unexpectedly deleted the team' "$qa"
rg -Fq 'owner of team B unexpectedly updated team A' "$qa"
rg -Fq 'platform admin must be able to delete team B' "$qa"
rg -Fq 'sole remaining team_owner must be able to delete the team' "$qa"
rg -Fq 'direct team insert unexpectedly succeeded' "$qa"
rg -Fq 'display_name = excluded.display_name' "$qa"

rg -Fq '## Milestone 77' "$status"

printf 'Teams admin management integration assertions passed.\n'
