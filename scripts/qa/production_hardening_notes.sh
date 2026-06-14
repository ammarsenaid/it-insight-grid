#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
route="$root/src/routes/notes.tsx"
service="$root/src/lib/notes/notes.ts"
queries="$root/src/lib/notes/queries.ts"
sql="$root/supabase/pending/20260615000000_notes_backend.sql"
qa="$root/supabase/pending/20260615000000_notes_backend.qa.sql"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

extract_import_block() {
  # Print the import statement ending at the first line matching $2, in file $1.
  local file=$1 end_pattern=$2
  local end_line start_line
  end_line=$(rg -n -F "$end_pattern" "$file" | head -1 | cut -d: -f1)
  start_line=$(awk -v end="$end_line" 'NR<=end && /^import \{$/{s=NR} END{print s}' "$file")
  sed -n "${start_line},${end_line}p" "$file"
}

# ---- Notes must no longer use the local prototype store as authoritative persistence ----
! rg -q 'data\.notes\b|data\.noteTemplates\b' "$route"
! rg -q 'from "@/lib/data/types"' "$route"

legacy_import=$(rg -F 'from "@/lib/data/notes"' "$route")
for fn in convertNoteToDocument convertNoteToTask exportNoteMarkdown; do
  printf '%s\n' "$legacy_import" | rg -Fq "$fn"
done
for fn in NOTE_CATEGORIES archiveNote createNote deleteNote deleteTemplate duplicateNote \
  saveAsTemplate togglePin unarchiveNote updateNote; do
  ! printf '%s\n' "$legacy_import" | rg -q "\\b$fn\\b"
done

# ---- New typed service layer + React Query integration ----
new_service_import=$(extract_import_block "$route" 'from "@/lib/notes/notes";')
for fn in saveNote saveNoteTemplate toggleNotePin setNoteArchived duplicateNote saveNoteLinks \
  softDeleteNote softDeleteNoteTemplate publicNoteError; do
  printf '%s\n' "$new_service_import" | rg -q "\\b$fn\\b"
done
rg -Fq 'from "@/lib/notes/types"' "$route"
rg -Fq 'from "@/lib/notes/queries"' "$route"
rg -Fq 'notesKeys, notesQuery, noteTemplatesKeys, noteTemplatesQuery' "$route"
rg -Fq 'export const notesKeys' "$queries"
rg -Fq 'export const notesQuery' "$queries"
rg -Fq 'export const noteTemplatesKeys' "$queries"
rg -Fq 'export const noteTemplatesQuery' "$queries"
rg -Fq 'useQuery(notesQuery())' "$route"
rg -Fq 'useQuery(noteTemplatesQuery())' "$route"
rg -Fq 'invalidateQueries({ queryKey: notesKeys.all })' "$route"
rg -Fq 'invalidateQueries({ queryKey: noteTemplatesKeys.all })' "$route"
test "$(rg -c 'useMutation' "$route")" -ge 8

# ---- Destructive / multi-step operations must go through RPC, never direct table writes ----
for rpc in list_notes list_note_templates save_note save_note_template toggle_note_pin \
  set_note_archived duplicate_note save_note_links soft_delete_note restore_note \
  soft_delete_note_template restore_note_template; do
  rg -Fq "rpc(\"$rpc\"" "$service"
done
! rg -q '\.from\("notes"\)|\.from\("note_templates"\)' "$service" "$route"

# ---- Backend contract: RLS + org/permission scoping ----
for table in notes note_templates; do
  rg -Fq "alter table public.$table enable row level security" "$sql"
done
rg -Fq "public.has_permission('notes.view')" "$sql"
rg -Fq "public.has_permission('notes.manage')" "$sql"
rg -Fq 'organization_id = public.current_organization_id()' "$sql"
rg -Fq "create or replace function public.assert_notes_manage()" "$sql"
rg -Fq "set search_path = ''" "$sql"
rg -Fq 'check (jsonb_typeof(links) = ' "$sql"
rg -Fq 'check ((deleted_at is null and deleted_by is null) or deleted_at is not null)' "$sql"
rg -Fq 'revoke all privileges on public.notes, public.note_templates from anon, authenticated;' "$sql"
rg -Fq 'revoke all on function public.soft_delete_note(uuid) from public;' "$sql"
rg -Fq 'revoke all on function public.soft_delete_note_template(uuid) from public;' "$sql"

# ---- QA coverage spot-checks ----
rg -Fq 'save_note_links must merge link arrays while preserving linkedDocumentId' "$qa"
rg -Fq 'duplicate_note must reset pinned/archived, append (copy), and carry links' "$qa"
rg -Fq 'save_note must update linkedDocumentId without wiping previously linked records' "$qa"
rg -Fq 'organization B must not see organization A notes' "$qa"
rg -Fq 'list_notes with include_deleted must surface a deleted note for notes.manage' "$qa"
rg -Fq 'hard-delete attempt unexpectedly succeeded' "$qa"
rg -Fq 'direct note insert unexpectedly succeeded' "$qa"
rg -Fq 'direct note template insert unexpectedly succeeded' "$qa"
rg -Fq 'display_name = excluded.display_name' "$qa"

rg -Fq '## Milestone 28' "$status"

printf 'Notes backend integration assertions passed.\n'
