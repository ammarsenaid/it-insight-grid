#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
route="$root/src/routes/index.tsx"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

# ---- Dashboard module metrics must not use migrated browser-local collections ----
! rg -q '\bdata\.(tasks|assets|notes|trash)\b' "$route"
rg -Fq 'const { tickets: legacyTickets, activity: localActivity } = useData();' "$route"

# ---- Existing RLS-backed query layers must drive Tasks, CMDB, and Notes ----
rg -Fq 'from "@/lib/tasks/queries"' "$route"
rg -Fq 'from "@/lib/cmdb/queries"' "$route"
rg -Fq 'from "@/lib/notes/queries"' "$route"
rg -Fq 'useQuery({ ...tasksQuery(), enabled: tasksReadable })' "$route"
rg -Fq 'useQuery({ ...cmdbAssetsQuery(), enabled: cmdbReadable })' "$route"
rg -Fq 'useQuery({ ...notesQuery(), enabled: notesReadable })' "$route"
rg -Fq 'const tasks = tasksQueryResult.data ?? [];' "$route"
rg -Fq 'const assets = cmdbQuery.data ?? [];' "$route"
rg -Fq 'const notes = notesQueryResult.data ?? [];' "$route"

# ---- Query execution must remain aligned with frontend capabilities ----
for expected in \
  'can("tasks.view", role)' \
  'can("cmdb.view", role)' \
  'can("notes.view", role)' \
  'can("recyclebin.restore", role)'; do
  rg -Fq "$expected" "$route"
done

# ---- Recycle Bin summary must reuse the live include-deleted aggregation ----
rg -Fq 'from "@/lib/recycle-bin/queries"' "$route"
rg -Fq 'from "@/lib/recycle-bin/recycleBin"' "$route"
for qfn in recycleBinDeletedAssetsQuery recycleBinDeletedAddressesQuery \
  recycleBinDeletedTasksQuery recycleBinDeletedNotesQuery; do
  rg -q "useQuery\(\{ \.\.\.$qfn\(\), enabled: recycleBinReadable \}\)" "$route"
done
for mapper in assetsToRecycleBinItems addressesToRecycleBinItems \
  tasksToRecycleBinItems notesToRecycleBinItems; do
  rg -q "\b$mapper\b" "$route"
done
rg -Fq 'recycleBinCount > 0' "$route"

# ---- Live contracts must remain backed by the existing module services ----
rg -Fq 'queryFn: () => listTasks(includeDeleted)' "$root/src/lib/tasks/queries.ts"
rg -Fq 'queryFn: () => listAssets(includeDeleted)' "$root/src/lib/cmdb/queries.ts"
rg -Fq 'queryFn: () => listNotes(includeDeleted)' "$root/src/lib/notes/queries.ts"
rg -Fq 'cmdbAssetsQuery(true)' "$root/src/lib/recycle-bin/queries.ts"
rg -Fq 'ipamAddressesQuery(true)' "$root/src/lib/recycle-bin/queries.ts"
rg -Fq 'tasksQuery(true)' "$root/src/lib/recycle-bin/queries.ts"
rg -Fq 'notesQuery(true)' "$root/src/lib/recycle-bin/queries.ts"

# ---- Incompatible legacy ticket SLA and local activity are explicitly deferred ----
rg -Fq 'legacyTickets.map(recomputeSla)' "$route"
rg -Fq 'localActivity.slice(0, 7)' "$route"
rg -Fq '## Milestone 32' "$status"

printf 'Dashboard live-data integration assertions passed.\n'
