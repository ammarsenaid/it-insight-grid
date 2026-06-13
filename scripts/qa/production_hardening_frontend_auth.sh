#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

auth_gate="$root/src/components/layout/AuthGate.tsx"
app_sidebar="$root/src/components/layout/AppSidebar.tsx"
auth_route="$root/src/routes/auth.tsx"
permissions="$root/src/lib/permissions.tsx"
ticket_queue="$root/src/routes/tickets.tsx"
ticket_detail="$root/src/routes/tickets.\$id.tsx"
auth_provider="$root/src/lib/auth/AuthProvider.tsx"
top_header="$root/src/components/layout/TopHeader.tsx"

rg -q 'const platformAdminRequired = isAdminRoute && !isKnownPage;' "$auth_gate"
rg -q 'session && platformAdminRequired && !isPlatformAdmin' "$auth_gate"
! rg -q 'session && isAdminRoute && !isPlatformAdmin' "$auth_gate"
rg -q 'const isKnownPage = hasPageVisibilityRule\(pathname\);' "$auth_gate"
rg -q 'const isAdminRoute = pathname === "/admin" || pathname\.startsWith\("/admin/"\);' "$auth_gate"
rg -q 'const roleForbidden = isKnownPage \? !canSeePage\(pathname, role\) : !isAdminRoute;' "$auth_gate"
rg -q 'if \(!hasPageVisibilityRule\(it\.url\)\) return isPlatformAdmin;' "$app_sidebar"

# Every matrix-managed protected URL has an explicit rule. The public auth route
# is handled separately, while diagnostics intentionally exercises the unknown
# admin platform-admin fallback.
for route in \
  / /dashboard /documents /search /tickets /tickets/ '/tickets/:id' \
  /my-requests /service-catalog '/service-catalog/:id' /notifications \
  /cmdb /ipam /tasks /notes /protocols /protocols/ '/protocols/:id' \
  /audit /reports /admin/users /admin/teams /admin/roles \
  /admin/ticket-settings /admin/mailbox /admin/templates /admin/catalog \
  /recycle-bin /trash /settings
do
  rg -q "^[[:space:]]*\"${route}\":" "$permissions"
done
! rg -q '^[[:space:]]*"/auth":' "$permissions"
! rg -q '^[[:space:]]*"/admin/diagnostics":' "$permissions"
rg -q 'segment\.startsWith\(":"\) \? pathSegments\[index\]\.length > 0' "$permissions"
rg -q 'return pageVisibilityFor\(path\) !== undefined;' "$permissions"
rg -q 'return sessionRoles \?\? \[current \?\? currentRole\(\)\];' "$permissions"
rg -q 'authorizationRoles\(current\)\.some\(\(candidate\) => allowedRoles\.includes\(candidate\)\)' "$permissions"
rg -q 'authorizationRoles\(current\)\.some\(\(candidate\) => list\.includes\(candidate\)\)' "$permissions"
rg -q 'if \(!list\) return false;' "$permissions"
rg -q 'const canAssign = can\("tickets\.assign", role\);' "$ticket_queue"
rg -q 'const canResolve = can\("tickets\.resolve", role\);' "$ticket_queue"
rg -q 'selected\.size > 0 && canWrite' "$ticket_queue"
rg -q '\{canAssign && \(' "$ticket_queue"
rg -q '\{canResolve &&' "$ticket_queue"
rg -q '!isRequesterView && canResolve' "$ticket_detail"
rg -q '!isRequesterView && canAssign' "$ticket_detail"

# Every literal capability used by can() must be present in the matrix. This
# catches misspellings that now correctly deny instead of silently granting.
mapfile -t checked_capabilities < <(
  {
    rg -No 'can\("[^"]+"' "$root/src" --glob '*.ts' --glob '*.tsx' --glob '!routeTree.gen.ts' |
      sed -E 's/.*can\("([^"]+)"/\1/'
    rg -No 'cap:[[:space:]]*"[^"]+"' "$root/src" --glob '*.ts' --glob '*.tsx' --glob '!routeTree.gen.ts' |
      sed -E 's/.*cap:[[:space:]]*"([^"]+)"/\1/'
  } |
    sort -u
)
for capability in "${checked_capabilities[@]}"
do
  rg -Fq "\"${capability}\":" "$permissions"
done

bun -e '
import { CAPS, CAPABILITY_GROUPS, can, canSeePage, hasPageVisibilityRule, pickDisplayRole, rolesForRoleKeys, setSessionRoles } from "./src/lib/permissions.tsx";
const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
for (const group of CAPABILITY_GROUPS) {
  for (const capability of group.caps) {
    assert(capability.key in CAPS, `permission matrix UI has unknown capability: ${capability.key}`);
  }
}
assert(can("documents.create", "doc_editor"), "doc editor denied document creation");
assert(!can("documents.create", "employee"), "employee allowed document creation");
assert(can("tickets.create", "employee"), "employee denied ticket creation");
assert(!can("tickets.assign", "employee"), "employee allowed ticket assignment");
assert(can("tickets.viewQueue", "network_admin"), "network admin denied ticket queue visibility");
assert(!can("tickets.assign", "network_admin"), "network admin allowed ticket assignment");
assert(!can("tickets.resolve", "network_admin"), "network admin allowed ticket resolution");
assert(can("audit.view", "auditor"), "auditor denied audit access");
assert(!can("audit.view", "helpdesk"), "helpdesk allowed audit access");
assert(!can("tickets.assgin", "super_admin"), "unknown capability allowed");
const docAuditor = rolesForRoleKeys(["doc_editor", "platform_auditor"]);
assert(pickDisplayRole(docAuditor) === "doc_editor", "doc editor display precedence changed");
assert(can("documents.create", docAuditor), "doc editor + auditor lost document creation");
assert(can("audit.view", docAuditor), "doc editor + auditor lost audit access");
const helpdeskAuditor = rolesForRoleKeys(["helpdesk", "platform_auditor"]);
assert(can("tickets.assign", helpdeskAuditor), "helpdesk + auditor lost ticket assignment");
assert(can("audit.view", helpdeskAuditor), "helpdesk + auditor lost audit access");
const networkAuditor = rolesForRoleKeys(["network_admin", "platform_auditor"]);
assert(can("ipam.write", networkAuditor), "network admin + auditor lost IPAM write");
assert(can("audit.view", networkAuditor), "network admin + auditor lost audit access");
assert(canSeePage("/audit", networkAuditor), "network admin + auditor denied audit page");
assert(!can("tickets.assign", networkAuditor), "network admin + auditor allowed ticket assignment");
assert(!can("tickets.resolve", networkAuditor), "network admin + auditor allowed ticket resolution");
const platformAdmin = rolesForRoleKeys(["platform_admin", "platform_auditor"]);
assert(pickDisplayRole(platformAdmin) === "super_admin", "platform admin display precedence changed");
assert(can("admin.users", platformAdmin), "platform admin lost admin capability");
assert(can("audit.view", platformAdmin), "platform admin + auditor lost audit capability");
for (const path of ["/protocols", "/protocols/", "/protocols/run-123"]) {
  assert(hasPageVisibilityRule(path), `missing protocol rule: ${path}`);
  assert(canSeePage(path, "technician"), `technician denied: ${path}`);
  assert(!canSeePage(path, "employee"), `employee allowed: ${path}`);
}
assert(canSeePage("/dashboard", "auditor"), "auditor denied dashboard");
assert(!canSeePage("/dashboard", "employee"), "employee allowed dashboard");
assert(canSeePage("/tickets/ticket-123", "employee"), "employee denied ticket detail");
assert(canSeePage("/service-catalog/item-123", "employee"), "employee denied catalog detail");
assert(!hasPageVisibilityRule("/protocols/run-123/extra"), "overlong protocol path matched");
assert(!canSeePage("/unknown-protected-page", "super_admin"), "unknown route allowed");
setSessionRoles(docAuditor, "doc_editor");
assert(can("audit.view", "doc_editor"), "authenticated scalar caller ignored additive roles");
assert(canSeePage("/audit", "doc_editor"), "authenticated page check ignored additive roles");
setSessionRoles(null);
' >/dev/null

rg -q 'onAuthStateChange\(\(event, next\)' "$auth_provider"
rg -q 'const effectiveRoles = rolesForRoleKeys\(keys\);' "$auth_provider"
rg -q 'setSessionRoles\(' "$auth_provider"
! rg -q 'pickHighestRole|ROLE_PRECEDENCE|DB_ROLE_ALIASES' "$auth_provider"
rg -q 'const sameUser = nextUserId !== null && nextUserId === activeUserIdRef\.current;' "$auth_provider"
! rg -q 'if \(event === "TOKEN_REFRESHED" && sameUser\) return;' "$auth_provider"
rg -q 'if \(event === "TOKEN_REFRESHED" && sameUser\)' "$auth_provider"
rg -q 'void loadUserContext\(next, false\);' "$auth_provider"
test "$(rg -c 'void loadUserContext\(next, false\);' "$auth_provider")" -eq 1
rg -q 'void loadUserContext\(next, !sameUser\);' "$auth_provider"
token_refresh_block=$(awk '
  /if \(event === "TOKEN_REFRESHED" && sameUser\)/ { in_block = 1 }
  in_block { print }
  in_block && /^[[:space:]]*}/ { exit }
' "$auth_provider")
printf '%s\n' "$token_refresh_block" | rg -q 'loadUserContext\(next, false\)'
! printf '%s\n' "$token_refresh_block" | rg -q 'setSessionRole|setProfile|setIsPlatformAdmin|setTeams|setRole'

# Only a new identity clears and pins authorization state before its session is
# published. Same-user token refreshes bypass this block and retain the role.
identity_block=$(awk '
  /if \(!sameUser\)/ { in_block = 1 }
  in_block { print }
  in_block && /^[[:space:]]*}/ { exit }
' "$auth_provider")
for reset in \
  'setProfile\(null\)' \
  'setIsPlatformAdmin\(false\)' \
  'setTeams\(\[\]\)' \
  'setTeamsError\(null\)' \
  'setRoleKeys\(\[\]\)' \
  'setRoleState\(null\)'
do
  printf '%s\n' "$identity_block" | rg -q "$reset"
done
printf '%s\n' "$identity_block" | rg -q 'setSessionRoles\(nextUserId \? \["employee"\] : null'

role_pin_line=$(rg -n 'setSessionRoles\(nextUserId \? \["employee"\] : null' "$auth_provider" | cut -d: -f1)
admin_reset_line=$(awk '/if \(!sameUser\)/ { identity_change = 1 } identity_change && /setIsPlatformAdmin\(false\)/ { print NR; exit }' "$auth_provider")
profile_reset_line=$(awk '/if \(!sameUser\)/ { identity_change = 1 } identity_change && /setProfile\(null\)/ { print NR; exit }' "$auth_provider")
role_reset_line=$(awk '/if \(!sameUser\)/ { identity_change = 1 } identity_change && /setRoleState\(null\)/ { print NR; exit }' "$auth_provider")
session_line=$(rg -n '^[[:space:]]*setSession\(next\);' "$auth_provider" | cut -d: -f1)
test -n "$role_pin_line"
test -n "$admin_reset_line"
test -n "$profile_reset_line"
test -n "$role_reset_line"
test -n "$session_line"
test "$role_pin_line" -lt "$session_line"
test "$admin_reset_line" -lt "$session_line"
test "$profile_reset_line" -lt "$session_line"
test "$role_reset_line" -lt "$session_line"

# Auth transitions, unmount, and explicit sign-out invalidate older requests.
test "$(rg -c 'contextRequestGenerationRef\.current \+= 1;' "$auth_provider")" -ge 3
signout_invalidate_line=$(awk '/const signOut = useCallback/ { signout = 1 } signout && /contextRequestGenerationRef\.current \+= 1/ { print NR; exit }' "$auth_provider")
signout_call_line=$(awk '/const signOut = useCallback/ { signout = 1 } signout && /await supabase\.auth\.signOut\(\)/ { print NR; exit }' "$auth_provider")
test -n "$signout_invalidate_line"
test -n "$signout_call_line"
test "$signout_invalidate_line" -lt "$signout_call_line"

# Each awaited context source is followed by a generation + identity guard, and
# final context status cannot be committed by an obsolete request.
rg -q 'contextRequestGenerationRef\.current === requestGeneration' "$auth_provider"
rg -q 'activeUserIdRef\.current === userId' "$auth_provider"
test "$(rg -c 'if \(!isCurrentContextRequest\(\)\) return;' "$auth_provider")" -ge 6
identity_check_line=$(rg -n 'if \(!providerActiveRef\.current \|\| activeUserIdRef\.current !== userId\) return;' "$auth_provider" | cut -d: -f1)
generation_line=$(rg -n 'const requestGeneration = \+\+contextRequestGenerationRef\.current;' "$auth_provider" | cut -d: -f1)
test -n "$identity_check_line"
test -n "$generation_line"
test "$identity_check_line" -lt "$generation_line"

# Provider lifecycle is distinct from the nullable active identity. Disposal is
# recorded before generation invalidation, and both deferred callbacks and context
# commits require an active provider.
rg -q 'const providerActiveRef = useRef\(false\);' "$auth_provider"
rg -q 'const explicitSignOutRef = useRef\(false\);' "$auth_provider"
rg -q 'const signOutInFlightRef = useRef<Promise<\{ error\?: string \}> \| null>\(null\);' "$auth_provider"
rg -q '!providerActiveRef\.current || activeUserIdRef\.current !== userId' "$auth_provider"
rg -q 'providerActiveRef\.current &&' "$auth_provider"
deferred_block=$(awk '
  /setTimeout\(\(\) => \{/ { in_block = 1 }
  in_block { print }
  in_block && /activeUserIdRef\.current !== nextUserId/ { exit }
' "$auth_provider")
printf '%s\n' "$deferred_block" | rg -q '!providerActiveRef\.current'
printf '%s\n' "$deferred_block" | rg -q 'contextRequestGenerationRef\.current !== eventGeneration'
cleanup_inactive_line=$(awk '/return \(\) => \{/ { cleanup = 1 } cleanup && /providerActiveRef\.current = false/ { print NR; exit }' "$auth_provider")
cleanup_signout_line=$(awk '/return \(\) => \{/ { cleanup = 1 } cleanup && /explicitSignOutRef\.current = false/ { print NR; exit }' "$auth_provider")
cleanup_inflight_line=$(awk '/return \(\) => \{/ { cleanup = 1 } cleanup && /signOutInFlightRef\.current = null/ { print NR; exit }' "$auth_provider")
cleanup_generation_line=$(awk '/return \(\) => \{/ { cleanup = 1 } cleanup && /contextRequestGenerationRef\.current \+= 1/ { print NR; exit }' "$auth_provider")
test -n "$cleanup_inactive_line"
test -n "$cleanup_signout_line"
test -n "$cleanup_inflight_line"
test -n "$cleanup_generation_line"
test "$cleanup_inactive_line" -lt "$cleanup_generation_line"
test "$cleanup_signout_line" -lt "$cleanup_generation_line"
test "$cleanup_inflight_line" -lt "$cleanup_generation_line"
rg -q 'explicitSignOutRef\.current = false;' "$auth_provider"

# Rejected initial-session and context operations finalize only while their
# lifecycle, generation, and identity are still current.
rg -q 'const isCurrentInitialRequest = \(\) =>' "$auth_provider"
rg -q '\.catch\(\(\) => \{' "$auth_provider"
rg -q 'if \(!isCurrentInitialRequest\(\)\) return;' "$auth_provider"
rg -q 'setContextError\(AUTH_SESSION_ERROR\);' "$auth_provider"
rg -q 'setLoading\(false\);' "$auth_provider"
context_catch_block=$(awk '
  /} catch \{/ { catch_count += 1; if (catch_count == 1) in_block = 1 }
  in_block { print }
  in_block && /} finally \{/ { exit }
' "$auth_provider")
printf '%s\n' "$context_catch_block" | rg -q 'if \(!isCurrentContextRequest\(\)\) return;'
printf '%s\n' "$context_catch_block" | rg -q 'setSessionRoles\(\["employee"\], "employee"\)'
printf '%s\n' "$context_catch_block" | rg -q 'setContextError\(AUTH_CONTEXT_ERROR\)'
rg -q 'if \(isCurrentContextRequest\(\)\) setContextLoading\(false\);' "$auth_provider"

# Remote sign-out errors still result in coherent fail-closed local state and a
# generic user-visible message.
signout_block=$(awk '
  /const signOut = useCallback/ { in_block = 1 }
  in_block { print }
  in_block && /^[[:space:]]*}, \[\]\);/ { exit }
' "$auth_provider")
listener_block=$(awk '
  /onAuthStateChange\(\(event, next\)/ { in_block = 1 }
  in_block { print }
  in_block && /const nextUserId =/ { exit }
' "$auth_provider")
printf '%s\n' "$listener_block" | rg -q 'if \(explicitSignOutRef\.current && next\) return;'
! printf '%s\n' "$listener_block" | rg -q 'setSession|loadUserContext'
printf '%s\n' "$signout_block" | rg -q 'if \(signOutInFlightRef\.current\) return signOutInFlightRef\.current;'
printf '%s\n' "$signout_block" | rg -q 'const \{ error \} = await supabase\.auth\.signOut\(\);'
printf '%s\n' "$signout_block" | rg -q '} catch \{'
printf '%s\n' "$signout_block" | rg -q 'remoteSignOutFailed = true;'
printf '%s\n' "$signout_block" | rg -q 'await supabase\.auth\.signOut\(\{ scope: "local" \}\);'
guard_set_line=$(printf '%s\n' "$signout_block" | rg -n 'explicitSignOutRef\.current = true;' | cut -d: -f1)
signout_generation_line=$(printf '%s\n' "$signout_block" | rg -n 'contextRequestGenerationRef\.current \+= 1;' | cut -d: -f1)
local_clear_line=$(printf '%s\n' "$signout_block" | rg -n 'if \(providerActiveRef\.current\) clearLocalAuthState\(null\);' | cut -d: -f1)
remote_signout_line=$(printf '%s\n' "$signout_block" | rg -n 'const \{ error \} = await supabase\.auth\.signOut\(\);' | cut -d: -f1)
test -n "$guard_set_line"
test -n "$signout_generation_line"
test -n "$local_clear_line"
test -n "$remote_signout_line"
test "$guard_set_line" -lt "$signout_generation_line"
test "$guard_set_line" -lt "$local_clear_line"
test "$guard_set_line" -lt "$remote_signout_line"
test "$signout_generation_line" -lt "$remote_signout_line"
test "$local_clear_line" -lt "$remote_signout_line"
printf '%s\n' "$signout_block" | rg -q '} finally \{'
owner_finally_block=$(awk '
  /if \(signOutInFlightRef\.current === ownedOperation\)/ { in_block = 1 }
  in_block { print }
  in_block && /^[[:space:]]*}/ { exit }
' <<< "$signout_block")
printf '%s\n' "$owner_finally_block" | rg -q 'explicitSignOutRef\.current = false;'
printf '%s\n' "$owner_finally_block" | rg -q 'signOutInFlightRef\.current = null;'
printf '%s\n' "$signout_block" | rg -q 'signOutInFlightRef\.current = ownedOperation;'
for reset in \
  'setSession\(null\)' \
  'setProfile\(null\)' \
  'setIsPlatformAdmin\(false\)' \
  'setTeams\(\[\]\)' \
  'setTeamsError\(null\)' \
  'setRoleKeys\(\[\]\)' \
  'setRoleState\(null\)' \
  'setSessionRoles\(null\)' \
  'setContextLoading\(false\)'
do
  printf '%s\n' "$signout_block" | rg -q "$reset"
done
printf '%s\n' "$signout_block" | rg -q 'AUTH_SIGN_OUT_ERROR'
rg -q 'if \(result\.error\) toast\.error\(result\.error\);' "$top_header"
mapfile -t signout_consumers < <(rg -l 'await signOut\(\);' "$root/src" --glob '*.ts' --glob '*.tsx' --glob '!routeTree.gen.ts')
test "${#signout_consumers[@]}" -eq 1
test "${signout_consumers[0]}" = "$top_header"

# Auth context failures retain safe categories without logging raw backend error
# objects to the browser console.
! rg -q 'console\.error' "$auth_provider"
for error_var in profileError adminError teamsErr rolesErr
do
  ! rg -q "console\\.(error|warn|log)\\([^)]*${error_var}" "$auth_provider"
done
rg -q 'const AUTH_CONTEXT_ERROR = "Account context could not be loaded\. Please try again\.";' "$auth_provider"
rg -q 'setTeamsError\("Teams could not be loaded\."\);' "$auth_provider"

# Blocking context loading is entered only when least-privilege pinning is
# required for a newly introduced identity. AuthGate waits for that state before
# role-based redirects or protected rendering.
pin_block=$(awk '
  /if \(pinToLeastPrivilege\)/ { in_block = 1 }
  in_block { print }
  in_block && /^[[:space:]]*}/ { exit }
' "$auth_provider")
printf '%s\n' "$pin_block" | rg -q 'setSessionRoles\(\["employee"\], "employee"\)'
printf '%s\n' "$pin_block" | rg -q 'setContextLoading\(true\)'
rg -q 'const identityContextPending = Boolean\(session\) && contextLoading;' "$auth_gate"
rg -q 'else if \(identityContextPending\)' "$auth_gate"
rg -q 'loading \|\| identityContextPending' "$auth_gate"
! rg -q 'if \(session\) navigate\(' "$auth_route"

rg -q '"/admin/templates":[[:space:]]+\[\.\.\.ADMINS, "sd_lead"\]' "$permissions"
! rg -q '"/admin/templates"[^\n]*"doc_editor"' "$permissions"

for capability in \
  tickets.commentPublic \
  tickets.commentInternal \
  tickets.attachments.view \
  tickets.attachments.upload \
  tickets.attachments.manage
do
  rg -q "\"$capability\"" "$permissions"
done

# The staged RBAC migration grants attachment reads to platform_auditor,
# which AuthProvider maps to the frontend auditor role.
rg -q '"tickets\.attachments\.view":[[:space:]]+ROLES\.map\(\(r\) => r\.id\)' "$permissions"

rg -q 'enabled: enabled && Boolean\(ticket\) && canViewAttachments' "$ticket_detail"
rg -q 'a.uploadedBy === userId \|\| canManageAttachments' "$ticket_detail"
rg -q '\{canUploadAttachments && \(' "$ticket_detail"
rg -q 'internalAllowed && canCommentInternal' "$ticket_detail"
rg -q 'if \(!canCommentPublic\)' "$ticket_detail"
rg -q 'internal: internal && internalAllowed && canCommentInternal' "$ticket_detail"
! rg -q '\bcanCreate\b' "$ticket_detail"

printf 'Frontend authorization integration assertions passed.\n'
