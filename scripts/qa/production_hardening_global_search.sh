#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
route="$root/src/routes/search.tsx"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

# ---- Global Search must no longer search the legacy local stores for
#      CMDB/IPAM/Tasks/Notes/Protocols ----
! rg -q 'from "@/lib/data/store"' "$route"
! rg -q 'from "@/lib/protocols/store"' "$route"
! rg -q '\bdata\.assets\b|\bdata\.ipam\b|\bdata\.tasks\b|\bdata\.notes\b' "$route"
! rg -q 'protocols\.templates\b|protocols\.runs\b' "$route"

# ---- Must use the live Supabase-backed query layers for each module ----
rg -Fq 'from "@/lib/cmdb/queries"' "$route"
rg -Fq 'from "@/lib/ipam/queries"' "$route"
rg -Fq 'from "@/lib/tasks/queries"' "$route"
rg -Fq 'from "@/lib/notes/queries"' "$route"
rg -Fq 'from "@/lib/protocols/queries"' "$route"

rg -Fq 'useQuery(cmdbAssetsQuery())' "$route"
rg -Fq 'useQuery(ipamAddressesQuery())' "$route"
rg -Fq 'useQuery(tasksQuery())' "$route"
rg -Fq 'useQuery(notesQuery())' "$route"
rg -Fq 'useQuery(protocolTemplatesQuery())' "$route"
rg -Fq 'useQuery(protocolRunsQuery())' "$route"

# ---- Results must be derived from the query data, not local arrays ----
rg -Fq 'assetsQ.data ?? []' "$route"
rg -Fq 'addressesQ.data ?? []' "$route"
rg -Fq 'tasksQ.data ?? []' "$route"
rg -Fq 'notesQ.data ?? []' "$route"
rg -Fq 'protocolTemplatesQ.data ?? []' "$route"
rg -Fq 'protocolRunsQ.data ?? []' "$route"

# ---- Knowledge Base sections (out of scope for this milestone) must be untouched ----
rg -Fq 'from "@/lib/knowledge/store"' "$route"
rg -Fq 'from "@/lib/knowledge/useTeamArticles"' "$route"

# ---- Underlying query/RPC layers (Milestones 24-29) must still be present ----
rg -Fq 'export const cmdbAssetsQuery' "$root/src/lib/cmdb/queries.ts"
rg -Fq 'export const ipamAddressesQuery' "$root/src/lib/ipam/queries.ts"
rg -Fq 'export const tasksQuery' "$root/src/lib/tasks/queries.ts"
rg -Fq 'export const notesQuery' "$root/src/lib/notes/queries.ts"
rg -Fq 'export const protocolTemplatesQuery' "$root/src/lib/protocols/queries.ts"
rg -Fq 'export const protocolRunsQuery' "$root/src/lib/protocols/queries.ts"

rg -Fq '## Milestone 31' "$status"

printf 'Global Search live-data integration assertions passed.\n'
