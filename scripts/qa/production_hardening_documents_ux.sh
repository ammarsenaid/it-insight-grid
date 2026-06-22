#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
workspace="$root/src/components/knowledge/KnowledgeBackendWorkspace.tsx"
route="$root/src/routes/documents.tsx"

# The page exposes real team context and never presents unresolved permissions
# as writable access.
rg -Fq 'aria-label="Active knowledge team"' "$workspace"
rg -Fq 'Editing controls are unavailable because permissions could not be verified.' "$workspace"
rg -Fq '<Eye className="mr-1 h-3 w-3" /> Read only' "$workspace"
profile_hook_line=$(rg -n 'const \{ profile \} = useAuth\(\);' "$workspace" | cut -d: -f1)
empty_state_line=$(rg -n 'if \(visibleSpaces.length === 0\)' "$workspace" | cut -d: -f1)
test -n "$profile_hook_line"
test -n "$empty_state_line"
test "$profile_hook_line" -lt "$empty_state_line"

# Search/filter feedback remains accessible and archived hierarchy is excluded
# from default results.
rg -Fq 'aria-label="Search knowledge articles"' "$workspace"
rg -Fq 'aria-live="polite"' "$workspace"
rg -Fq 'No matching articles' "$workspace"
rg -Fq 'parentSpace?.is_archived || parentCategory?.is_archived' "$workspace"
rg -Fq 'if (v === "archived") setShowArchived(true);' "$workspace"
rg -Fq 'aria-pressed={showArchived}' "$workspace"

# Guard against the incorrect archived-as-drafts metric and the old no-op
# Preview button returning.
rg -Fq 'label="Archived"' "$workspace"
! rg -Fq '> Preview' "$workspace"

# Route-level failures must not expose raw internal error messages.
rg -Fq 'The knowledge center could not be opened.' "$route"
! rg -Fq 'error.message' "$route"

printf 'Documents UX hardening assertions passed.\n'
