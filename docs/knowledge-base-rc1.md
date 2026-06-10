# Knowledge Base — RC1.1 Release Summary

Date: 2026-06-10
Scope: Backend-backed Knowledge Base, hardened for production.

RC1.1 is a security-hardening pass on top of RC1. No deployment was
performed. No production database migration was applied.

## Workflow (complete)

```
draft ── submit ──▶ in_review
in_review ── withdraw ──▶ draft
in_review ── approve ──▶ approved
in_review ── request_changes ──▶ draft
approved ── request_changes ──▶ draft
approved ── publish ──▶ published
published ── archive ──▶ archived
archived ── restore ──▶ draft
```

Authority:

- `submit`, `withdraw`, `publish`, `archive`, `restore` → `knowledge.update`
- `approve`, `request_changes` → `team.manage`

All transitions go through the security-definer RPC
`knowledge_transition_article_status(uuid, text, text)`. A `BEFORE UPDATE`
trigger on `knowledge_articles` rejects any direct `status` change made
outside the RPC, so the browser cannot bypass the workflow.

## Original RC1 milestones

1. **M1 — CRUD workspace** — Space/category/article/tag CRUD, slug helpers, permission-gated affordances, Markdown editor.
2. **M2 — Review workflow** — Draft → In Review → Approved → Published → Archived transitions with timeline panel.
3. **M3 — Attachments** — Per-article files in Supabase Storage with RLS-aware upload/delete.
4. **M4 — UX polish** — Auto Table of Contents, stable heading IDs, recently-viewed list, `/` search shortcut, copy-link button.
5. **M5 — Cross-platform integration** — Dashboard panel, deep-linking via `?article=<id>`, live results in Command Palette and global Search.
6. **M6 — Audit log** — `knowledge_audit_log` table, security-definer trigger, read-only UI panel per article.
7. **M7 — Release wrap** — Automated security scan (clean), this summary.

## RC1.1 hardening summary

1. **Atomic, DB-enforced review workflow** — RPC + status-change guard trigger; generic `updateArticle` can no longer set `status`.
2. **Storage isolation** — pointer-row trigger enforces `{team_id}/{article_id}` path consistency; storage policies validate bucket, team, article, and reference `can_read_knowledge_article` for SELECT.
3. **MIME allowlist** — conservative allowlist enforced client-side AND by a CHECK constraint on `knowledge_attachments`.
4. **Audit redaction** — trigger never stores `content_markdown`; for article rows it captures `title`, `slug`, `status`, `content_length`, `content_hash`. SELECT tightened to `team.manage` for RC1.1.
5. **Multi-team dashboard / search** — `useTeamArticles` loads every team the user can access (RLS-bounded), shows team names in dashboard panel, command palette, and `/search`; stale responses and late errors are discarded.
6. **Automated RC1.1 tests** — `scripts/qa/knowledge_rc1_security_checks.sql` (static + behavioral assertions) and `scripts/qa/knowledge_rc1_staging_smoke.sh` (build + HTTP smoke on local preview).

## Migrations

Forward-only. None auto-applied. Apply in order against the target environment
before enabling RC1.1 in prod.

### RC1 (already shipped)

- `20260609210000_knowledge_review_workflow.sql`
- `20260609213000_knowledge_attachments.sql`
- `20260609220000_knowledge_audit_log.sql`

### RC1.1 (new)

- `20260610010000_harden_knowledge_review_workflow.sql`
- `20260610011000_harden_knowledge_attachments.sql`
- `20260610012000_harden_knowledge_audit_log.sql`

### RC1.2 (new)

- `20260610013000_harden_knowledge_article_creation.sql` — extends
  `knowledge_articles_block_status_change()` to handle INSERT as well as
  UPDATE, and recreates `trg_knowledge_articles_status_guard` as
  `BEFORE INSERT OR UPDATE`. New articles must start with
  `status = 'draft'`; any other initial status is rejected with `42501`.
  `createArticle()` in `src/lib/knowledge/mutations.ts` no longer accepts
  a `status` field and always inserts `'draft'`.

## Private bucket configuration

The `knowledge-attachments` bucket must be created out-of-band before
RC1.1 is enabled. Recommended settings:

| Setting | Value |
|---|---|
| Name | `knowledge-attachments` |
| Public | `false` |
| File size limit | `26214400` bytes (25 MiB) |
| Allowed MIME types | `image/png`, `image/jpeg`, `image/webp`, `application/pdf`, `text/plain`, `text/markdown`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |

The same allowlist is enforced server-side by the CHECK constraint
`knowledge_attachments_mime_allowlist` and client-side by
`ALLOWED_ATTACHMENT_MIME_TYPES` in `src/lib/knowledge/attachments.ts`.

## Staging procedure

1. Restore production schema into a staging Supabase project.
2. Apply RC1 migrations, then RC1.1 migrations, in order.
3. Configure the `knowledge-attachments` bucket per the table above.
4. Seed two teams with one article each and a user in each team.
5. Run `scripts/qa/knowledge_rc1_security_checks.sql` against staging.
6. Run `scripts/qa/knowledge_rc1_staging_smoke.sh` locally against a staging build.
7. Perform the manual checks listed in `docs/knowledge-base-rc1-testing.md`.

## Automated QA procedure

See `docs/knowledge-base-rc1-testing.md`.

## Known limitations (RC1.1)

- Audit log SELECT is currently scoped to `team.manage`. A finer-grained
  article-aware visibility policy is a post-RC1.1 follow-up.
- `actor_id` is shown as a truncated UUID in `AuditLogPanel`; resolving
  it to a display name needs a join through the profile table.
- Article body changes appear in the audit log as
  `{redacted: true, from_length, to_length, from_hash, to_hash}` — useful
  for change detection, not for diff reconstruction. Full versioning /
  restore from audit diffs remains a post-RC1.1 follow-up.
- The workflow RPC's allowed transitions are intentionally narrow; adding
  a transition requires both a migration and a UI change.

## Confirmation

- No deployment was performed.
- No migration was applied to a production database.
- No service-role key is exposed to the browser.
- The Supabase singleton browser client and Phase 1 authentication implementation are unchanged.
