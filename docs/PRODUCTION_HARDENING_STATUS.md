# Production Hardening Status

Last updated: 2026-06-12

## Current Progress

- Completed milestone: 1 - Ticket Attachments Security Hardening
- Completed milestone: 2 - Client Attachment Failure Handling
- Completed milestone: 3 - Server Error Response Hardening
- Completed milestone: 4 - Production Readiness Baseline
- Completed milestone: 5 - Markdown Link Safety
- Active milestone: none; safe local hardening plan completed.
- Repository inventory completed without reading secret-bearing files.
- Existing uncommitted ticket-attachment SQL and QA changes identified and
  preserved as the milestone baseline.
- Permanent repository rules and the milestone plan have been added.
- Attachment metadata paths are constrained to their `ticket_id`.
- Storage reads now require visible metadata and match metadata visibility.
- Metadata and storage reads now enforce `tickets.attachments.view`.
- QA coverage now includes structural path cases, cross-ticket path rejection,
  permission denial, public/internal visibility parity, and delete authorization.
- Client deletion now requires storage removal to succeed before metadata is
  removed, preserving a retry path and preventing silently orphaned objects.
- Catastrophic SSR responses are detected through parsed JSON instead of brittle
  string matching, and raw framework response bodies are no longer logged.
- Server-generated 500 pages now consistently disable caching and MIME sniffing.
- Common environment and private-key filenames are now ignored, while sanitized
  `.env` example files remain trackable.
- A repository-wide TypeScript/TSX syntax pass covered all 182 source files with
  Bun's local transpiler.
- User-authored Markdown now emits links only for relative targets and the
  `http`, `https`, `mailto`, and `tel` schemes. Unsafe schemes render as text.

## Changed Files

Pre-existing, preserved changes:

- `supabase/pending/20260611020000_ticket_attachments.sql`
- `supabase/pending/20260611020000_ticket_attachments.qa.sql`

Hardening-phase documentation:

- `AGENTS.md`
- `docs/PRODUCTION_HARDENING_PLAN.md`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 1 implementation (including the preserved baseline changes):

- `supabase/pending/20260611020000_ticket_attachments.sql`
- `supabase/pending/20260611020000_ticket_attachments.qa.sql`

Milestone 2 implementation:

- `src/lib/service-desk/attachments.ts`

Milestone 3 implementation:

- `src/lib/error-page.ts`
- `src/server.ts`
- `src/start.ts`

Milestone 4 implementation:

- `.gitignore`
- `docs/PRODUCTION_HARDENING_PLAN.md`

Milestone 5 implementation:

- `src/lib/markdown-links.ts`
- `src/components/common/Markdown.tsx`

## Validation Results

- Repository file inventory: passed.
- Working-tree baseline review: passed; only the two ticket-attachment files were
  modified before hardening work began.
- `git diff --check`: passed.
- Ticket attachment policy assertion: passed; exactly two read boundaries enforce
  `tickets.attachments.view`.
- Ticket attachment QA coverage assertions: passed.
- Client attachment delete-order assertion: passed; storage deletion precedes
  metadata deletion and returned storage errors are propagated.
- Executable error-response assertions via local Bun runtime: passed for status,
  secure headers, and absence of internal error details.
- Server error-path source assertions: passed; all generic 500 paths use the
  shared response builder and raw-body logging is absent.
- Tracked sensitive-filename audit: passed; no tracked environment, credential,
  secret, private-key, or common key-container filenames were found.
- `.gitignore` assertions: passed for `.env`, environment variants, PEM/key/P12/PFX
  files, and common SSH private-key names.
- Bun transpiler syntax validation: passed for all 183 TypeScript/TSX files after
  the final milestone.
- Executable Markdown URL-policy assertions: passed for allowed relative,
  HTTP(S), email, and telephone targets and blocked script/data/file/blob schemes
  plus control-character input.
- Markdown renderer integration assertion: passed; links use the URL-policy helper
  and `noopener noreferrer`.
- `bash -n scripts/qa/knowledge_rc1_staging_smoke.sh`: passed.
- `bun run lint`: unavailable because `node_modules` is absent and ESLint is not
  installed locally. No dependency installation was attempted because network
  access is prohibited.
- Type checking and production build: unavailable for the same missing-dependency
  reason.
- SQL execution: not run; database connections and migration execution are
  prohibited.

## Known Issues

- SQL QA cannot be executed under the current safety rules because that would
  require a database connection and migration state.
- The repository has no configured unit-test script.
- Client attachment behavior has static validation only because no local test
  harness or installed dependencies are available.
- Local JavaScript dependencies are not installed, preventing lint, type-check,
  and build validation without prohibited network access.
- The pending SQL migration and its transaction-backed QA have not been executed.
  Their runtime behavior still requires database-backed human validation.

## Next Checkpoint

Human review of this scoped diff. Any next step involving dependency installation,
database-backed SQL QA, migration execution, Docker, network access, or deployment
requires explicit approval under `AGENTS.md`.
