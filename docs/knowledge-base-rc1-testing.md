# Knowledge Base RC1.1 / RC1.2 — Testing & QA Procedure

This document describes the **manual + automated** validation steps for the
RC1.1 + RC1.2 hardening passes. Nothing in this procedure deploys to
production or applies migrations to a production database — staging only.

RC1.2 adds one additional invariant on top of RC1.1: every newly inserted
article must start with `status = 'draft'`. Any other initial status is
rejected by `trg_knowledge_articles_status_guard`, which now fires on
`BEFORE INSERT OR UPDATE`. The transactional RPC
`public.knowledge_transition_article_status` remains the only path that
may change status afterwards.

## 1. Static security checks (SQL)

File: `scripts/qa/knowledge_rc1_security_checks.sql`

Run against a **staging** Supabase database that has every RC1 and RC1.1
migration applied:

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/qa/knowledge_rc1_security_checks.sql
```

The script asserts:

- Required tables and the `knowledge_transition_article_status(uuid,text,text)` RPC exist.
- The audit trigger function uses `search_path = pg_catalog, public`.
- `knowledge_audit_log` is SELECT-only for `anon` / `authenticated`.
- `trg_knowledge_articles_status_guard` and `trg_knowledge_attachments_validate` are present.
- The three `storage.objects` policies for the `knowledge-attachments` bucket reference `kb_storage_path_article` (team + article validation).
- The MIME-allowlist CHECK constraint exists.
- **RC1.2:** `trg_knowledge_articles_status_guard` fires on both INSERT and UPDATE (tgtype bitmask covers bits 4 and 16).

Behavioral checks (workflow bypass rejected, valid transition + event atomic,
invalid transition rejected, cross-team access denied) run when you pass
fixture variables:

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v article_a=<uuid> -v article_b=<uuid> \
  -v member_a=<uuid> \
  -f scripts/qa/knowledge_rc1_security_checks.sql
```

The RC1.2 INSERT-guard behavioral block additionally asserts that a normal
`status='draft'` insert succeeds and that inserts with `status` in
`('in_review','approved','published','archived')` are rejected with
`42501`. Each insert runs inside a savepoint and is rolled back so the
staging database is left untouched. Pass the extra fixture vars to opt in:

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v article_a=<uuid> -v article_b=<uuid> -v member_a=<uuid> \
  -v team_a=<uuid> -v space_a=<uuid> \
  -f scripts/qa/knowledge_rc1_security_checks.sql
```

## 2. Staging HTTP smoke test

File: `scripts/qa/knowledge_rc1_staging_smoke.sh`

```bash
./scripts/qa/knowledge_rc1_staging_smoke.sh
```

It builds the production bundle locally, starts `bun run preview`, and asserts:

- `/`           → 200
- `/auth`       → 200
- `/documents`  → 200
- unknown URL  → 404

The script never restarts any remote service.

## 3. Manual checks (recommended)

| Area | Check |
|------|-------|
| Workflow | Submit → approve → publish → archive → restore an article. Each step writes one row in `knowledge_review_events`. |
| Workflow bypass (UPDATE) | Try `UPDATE knowledge_articles SET status='published' WHERE id=...` from the SQL editor as `authenticated` — must fail with `42501`. |
| Workflow bypass (INSERT, RC1.2) | Try `INSERT INTO knowledge_articles (..., status) VALUES (..., 'published')` from the SQL editor as `authenticated` — must fail with `42501`. Repeat with `'approved'`, `'in_review'`, `'archived'` — all must fail. The same insert with `'draft'` must succeed. |
| Attachments | Upload a `.png` / `.pdf` (allowed) and an `.exe` (rejected). |
| Audit redaction | Edit an article's body; the new audit entry's `changes.content_markdown` contains `redacted: true`, `from_length`, `to_length`, `from_hash`, `to_hash` — never the body itself. |
| Multi-team | A user in two teams sees both teams' articles in the dashboard panel, command palette, and `/search`. |
| Deep link | `/documents?article=<id>` switches to the correct team and selects the article. |

## 4. CI / local sanity

```bash
bunx tsc --noEmit
bun run build
git diff --check
```

All three must be clean.

## 4. CI / local sanity

```bash
bunx tsc --noEmit
bun run build
git diff --check
```

All three must be clean.
