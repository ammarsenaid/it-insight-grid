# Knowledge Base — RC1 Release Summary

Date: 2026-06-10
Scope: Backend-backed Knowledge Base feature, end-to-end.

## Milestones delivered

1. **M1 — CRUD workspace**: Space/category/article/tag CRUD via dialogs,
   slug helpers, permission-gated affordances, Markdown content editor.
2. **M2 — Review workflow**: Draft → In Review → Published → Archived
   transitions with timeline panel and SQL migration for review states.
3. **M3 — Attachments**: Per-article file attachments backed by Supabase
   Storage with RLS-aware upload/delete and a side panel.
4. **M4 — UX polish**: Auto Table of Contents, stable heading IDs,
   recently-viewed list, `/` search shortcut, copy-link button.
5. **M5 — Cross-platform integration**: Dashboard panel, deep-linking via
   `?article=<id>`, live results in Command Palette and global Search.
6. **M6 — Audit log**: `knowledge_audit_log` table written exclusively by a
   security-definer trigger, with read-only UI panel per article.
7. **M7 — Release wrap**: Security scan (clean), this summary.

## Security posture

- Automated security scan: **no issues found**.
- All knowledge tables: RLS enabled, scoped by `knowledge.read/.create/.update/.delete`
  and `team.manage` via `has_permission` RPC.
- Audit log: SELECT-only from the client; INSERTs are trigger-driven with
  `security definer`.
- Attachments: Storage RLS scoped per team; client uses publishable key only.
- No service-role key reaches the browser.

## Migrations (not auto-applied)

- `20260609210000_knowledge_review_workflow.sql`
- `20260609213000_knowledge_attachments.sql`
- `20260609220000_knowledge_audit_log.sql`

Apply in order against the target environment before enabling RC1 in prod.

## Known follow-ups (post-RC1)

- Resolve `actor_id` to display name in `AuditLogPanel` (currently shows
  truncated UUID).
- Full-text search index on `articles.content_md` for ranked global search.
- Article versioning / restore from audit diffs.
