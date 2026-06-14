#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
route="$root/src/routes/tasks.tsx"
drawer="$root/src/components/tasks/TaskDetailsDrawer.tsx"
service="$root/src/lib/tasks/tasks.ts"
queries="$root/src/lib/tasks/queries.ts"
sql="$root/supabase/pending/20260614000000_tasks_backend.sql"
qa="$root/supabase/pending/20260614000000_tasks_backend.qa.sql"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

extract_import_block() {
  # Print the import statement ending at the first line matching $2, in file $1.
  local file=$1 end_pattern=$2
  local end_line start_line
  end_line=$(rg -n -F "$end_pattern" "$file" | head -1 | cut -d: -f1)
  start_line=$(awk -v end="$end_line" 'NR<=end && /^import \{$/{s=NR} END{print s}' "$file")
  sed -n "${start_line},${end_line}p" "$file"
}

# ---- Tasks must no longer use the local prototype store as authoritative persistence ----
! rg -q 'data\.tasks\b' "$route" "$drawer"
! rg -q 'from "@/lib/data/tasks"' "$drawer"

legacy_import=$(extract_import_block "$route" 'from "@/lib/data/tasks";')
printf '%s\n' "$legacy_import" | rg -Fq 'CURRENT_TEAM, CURRENT_USER, TASK_CATEGORIES, TASK_OWNERS, TASK_TEAMS, TASK_SOURCES,'
printf '%s\n' "$legacy_import" | rg -Fq 'deleteTaskView, saveTaskView,'
for fn in createTask updateTask completeTask reopenTask archiveTask unarchiveTask deleteTask \
  bulkAddTag bulkArchive bulkDelete escalateTask duplicateTask scheduleReminder \
  convertTicketToTask createTaskFromProtocolRun linkProtocolRunToTask \
  isOverdue checklistProgress blockedByOpen setTaskStatus bulkUpdateTasks; do
  ! printf '%s\n' "$legacy_import" | rg -q "\\b$fn\\b"
done

# ---- New typed service layer + React Query integration ----
new_service_import=$(extract_import_block "$route" 'from "@/lib/tasks/tasks";')
for fn in saveTask setTaskStatus escalateTask setTaskArchived duplicateTask saveTaskLinks \
  setTaskReminder softDeleteTask bulkUpdateTasks bulkAddTaskTag bulkSetTasksArchived \
  bulkSoftDeleteTasks isOverdue checklistProgress publicTaskError; do
  printf '%s\n' "$new_service_import" | rg -q "\\b$fn\\b"
done
rg -Fq 'from "@/lib/tasks/types"' "$route" "$drawer"
rg -Fq 'from "@/lib/tasks/queries"' "$route"
rg -Fq 'tasksKeys, tasksQuery' "$queries" "$route"
rg -Fq 'export const tasksKeys' "$queries"
rg -Fq 'export const tasksQuery' "$queries"
rg -Fq 'useQuery({ ...tasksQuery(), enabled: canSeeAll })' "$route"
rg -Fq 'invalidateQueries({ queryKey: tasksKeys.all })' "$route"
test "$(rg -c 'useMutation' "$route")" -ge 12
rg -Fq 'blockedByOpen, isOverdue' "$drawer"
rg -Fq 'from "@/lib/tasks/tasks"' "$drawer"

# ---- Destructive / multi-step operations must go through RPC, never direct table writes ----
for rpc in list_tasks save_task set_task_status escalate_task set_task_archived duplicate_task \
  save_task_links set_task_reminder add_task_comment soft_delete_task restore_task \
  bulk_update_tasks bulk_add_task_tag bulk_set_tasks_archived bulk_soft_delete_tasks; do
  rg -Fq "rpc(\"$rpc\"" "$service"
done
! rg -q '\.from\("tasks"\)|\.from\("task_comments"\)' "$service" "$route" "$drawer"

# ---- Backend contract: RLS + org/permission scoping ----
for table in tasks task_comments; do
  rg -Fq "alter table public.$table enable row level security" "$sql"
done
rg -Fq "public.has_permission('tasks.view')" "$sql"
rg -Fq "public.has_permission('tasks.manage')" "$sql"
rg -Fq 'organization_id = public.current_organization_id()' "$sql"
rg -Fq 'revoke all on function public.soft_delete_task' "$sql"
rg -Fq 'revoke all on function public.bulk_soft_delete_tasks' "$sql"
rg -Fq "role_key = 'doc_editor'" "$sql"
rg -Fq "permission_key = 'tasks.manage'" "$sql"

# ---- QA coverage spot-checks ----
rg -Fq 'follow-up checklist must be reset with completed=false and new item ids' "$qa"
rg -Fq 'an empty owner must not wipe the existing owner' "$qa"
rg -Fq 'organization B must not' "$qa"
rg -Fq 'hard-delete attempt unexpectedly succeeded' "$qa"
rg -Fq 'direct insert unexpectedly succeeded' "$qa"
rg -Fq 'completing a recurring task must create a follow-up' "$qa"

# ---- list_tasks must surface comment author display names ----
rg -Fq "'authorName', coalesce(nullif(trim(p.display_name), ''), p.email, '')" "$sql"
rg -Fq 'list_tasks must surface comments with author display names' "$qa"
# QA profile fixtures must overwrite the placeholder display_name that
# public.handle_new_user() inserts when the QA auth.users rows are created.
rg -Fq 'display_name = excluded.display_name' "$qa"

rg -Fq '## Milestone 27' "$status"

printf 'Tasks backend integration assertions passed.\n'
