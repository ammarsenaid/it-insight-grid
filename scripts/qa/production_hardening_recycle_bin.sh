#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
route="$root/src/routes/trash.tsx"
types="$root/src/lib/recycle-bin/types.ts"
service="$root/src/lib/recycle-bin/recycleBin.ts"
queries="$root/src/lib/recycle-bin/queries.ts"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

# ---- Recycle Bin must no longer use the legacy local trash store ----
! rg -q 'from "@/lib/data/' "$route"
! rg -q '\buseData\b|\bsetState\b|\blogActivity\b|\bTrashItem\b|\bTrashKind\b' "$route"
! rg -q 'data\.trash' "$route"

# ---- New typed service layer + React Query integration ----
rg -Fq 'from "@/lib/recycle-bin/types"' "$route"
rg -Fq 'from "@/lib/recycle-bin/recycleBin"' "$route"
rg -Fq 'from "@/lib/recycle-bin/queries"' "$route"

rg -Fq 'export type RecycleBinKind' "$types"
rg -Fq 'export interface RecycleBinItem' "$types"
rg -Fq 'export const RECYCLE_BIN_KINDS' "$types"

for fn in assetsToRecycleBinItems addressesToRecycleBinItems tasksToRecycleBinItems \
  notesToRecycleBinItems restoreRecycleBinItem; do
  rg -Fq "export function $fn" "$service"
  rg -q "\\b$fn\\b" "$route"
done

for qfn in recycleBinDeletedAssetsQuery recycleBinDeletedAddressesQuery \
  recycleBinDeletedTasksQuery recycleBinDeletedNotesQuery recycleBinInvalidationKeys; do
  rg -Fq "export const $qfn" "$queries"
  rg -q "\\b$qfn\\b" "$route"
done

# ---- Aggregation must request includeDeleted = true from each module ----
rg -Fq 'cmdbAssetsQuery(true)' "$queries"
rg -Fq 'ipamAddressesQuery(true)' "$queries"
rg -Fq 'tasksQuery(true)' "$queries"
rg -Fq 'notesQuery(true)' "$queries"

# ---- Restore must go through the existing per-module restore RPC wrappers ----
rg -Fq 'import { restoreAsset } from "@/lib/cmdb/assets"' "$service"
rg -Fq 'import { restoreIpamAddress } from "@/lib/ipam/addresses"' "$service"
rg -Fq 'import { restoreTask } from "@/lib/tasks/tasks"' "$service"
rg -Fq 'import { restoreNote } from "@/lib/notes/notes"' "$service"

# ---- No hard-delete / empty-bin actions: backend has no hard-delete RPC by design ----
! rg -qi 'empty bin|permanently delet|trash\.purge|trash\.empty' "$route"
! rg -q 'ConfirmDialog' "$route"

# ---- Restore must invalidate query state via TanStack Query, not setState ----
rg -Fq 'useMutation' "$route"
rg -Fq 'invalidateQueries({ queryKey: recycleBinInvalidationKeys[item.kind] })' "$route"

# ---- Underlying per-module RPCs (Milestones 24-29) must still be present ----
rg -Fq 'rpc("restore_cmdb_asset"' "$root/src/lib/cmdb/assets.ts"
rg -Fq 'rpc("restore_ipam_address"' "$root/src/lib/ipam/addresses.ts"
rg -Fq 'rpc("restore_task"' "$root/src/lib/tasks/tasks.ts"
rg -Fq 'rpc("restore_note"' "$root/src/lib/notes/notes.ts"
rg -Fq 'rpc("list_tasks"' "$root/src/lib/tasks/tasks.ts"
rg -Fq 'rpc("list_notes"' "$root/src/lib/notes/notes.ts"
rg -Fq 'rpc("list_ipam_addresses"' "$root/src/lib/ipam/addresses.ts"
rg -Fq '.from("cmdb_assets")' "$root/src/lib/cmdb/assets.ts"

rg -Fq '## Milestone 30' "$status"

printf 'Recycle Bin backend aggregation assertions passed.\n'
