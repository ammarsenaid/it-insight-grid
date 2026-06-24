# Production Hardening Status

Last updated: 2026-06-24

## Current Progress

- Completed milestone: 1 - Ticket Attachments Security Hardening
- Completed milestone: 2 - Client Attachment Failure Handling
- Completed milestone: 3 - Server Error Response Hardening
- Completed milestone: 4 - Production Readiness Baseline
- Completed milestone: 5 - Markdown Link Safety
- Completed milestone: 6 - Frontend Authorization Integration
- Completed milestone: 7 - Knowledge Attachment Delete Consistency
- Completed milestone: 8 - Notification Mutation Consistency
- Completed milestone: 9 - Ticket Configuration Failure Handling
- Completed milestone: 10 - Auth Transition Least-Privilege Pinning
- Completed milestone: 11 - Auth Context Refresh and Race Hardening
- Completed milestone: 12 - Constrained Manual Ticket Creation Contract
- Completed milestone: 13 - Constrained Ticket Update Contract
- Completed milestone: 14 - Public Comment Permission Enforcement
- Completed milestone: 15 - Catalog Request Permission Enforcement
- Completed milestone: 16 - Notification Read-State Mutation Boundary
- Completed milestone: 17 - Comment Attachment Ticket Binding
- Completed milestone: 18 - Explicit Fail-Closed Route Protection
- Completed milestone: 19 - Deny Unknown Permission Keys
- Completed milestone: 20 - Additive Multi-Role Frontend Capabilities
- Completed milestone: 21 - Network Admin Ticket Control Alignment
- Completed milestone: 22 - Scoped Service Desk Profile Directory
- Completed milestone: 23 - Platform-Admin-Only Canned-Response Deletion
- Completed milestone: 24 - Shared CMDB Backend
- Completed milestone: 25 - Organization-Scoped CMDB Correction
- Completed milestone: 26 - Organization-Scoped IPAM Backend
- Completed milestone: 27 - Organization-Scoped Tasks Backend
- Completed milestone: 28 - Organization-Scoped Notes Backend
- Completed milestone: 29 - Organization-Scoped Protocols Backend
- Completed milestone: 30 - Recycle Bin Backend Aggregation
- Completed milestone: 31 - Global Search Live-Data Integration
- Completed milestone: 32 - Dashboard Live-Data Integration
- Completed milestone: 33 - Service Desk Audit Live-Data Integration
- Completed milestone: 34 - Repository-Side Pending Migration Promotion Planning
- Completed milestone: 35 - Disposable Validation Runner Preparation
- Completed milestone: 36 - Disposable Full-Chain Execution Plan Review
- Completed milestone: 37 - Disposable Database Preflight Only
- Completed milestone: 38 - Disposable Execution Commands Preparation Only
- Completed milestone: 77 - Admin Users Live-Data Integration
- Completed milestone: 92 - Dashboard Command Center UX Hardening
- Active milestone: none; disposable execution remains unapproved.
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
- Known admin pages now follow the explicit page-visibility matrix, allowing
  authorized Service Desk roles through while unknown admin paths and diagnostics
  remain platform-admin-only. Reply templates are limited to roles whose staged
  backend permissions allow canned-response reads.
- Ticket comments and attachment controls now use capabilities that mirror the
  staged database permissions instead of inferring access from ticket creation or
  assignment permissions.
- Knowledge Base attachment deletion now removes the storage object before its
  metadata row and reports storage failures, preserving a visible retry path.
- Notification mark-read mutations now update only numeric-limit notification
  list cache entries, excluding the unread-count cache, and update the
  unread count immediately using the RPC's affected-row count, invalidate for
  server reconciliation, and surface generic failures on both notification
  surfaces. Duplicate or stale mutations that affect zero rows leave cached
  unread state unchanged.
- Ticket configuration now shows a generic incomplete-load error with a retry for
  all five data sources instead of rendering failed queries as empty settings.
- New authenticated identities now pin the frontend permission store to the
  employee role and clear previous identity-derived context before publishing the
  session. Same-user token refreshes preserve the established role while
  reloading authorization context, stale async identity loads are rejected, and
  role-based routing waits for new identity context resolution.
- Auth context loading now has a provider lifecycle guard, so disposed providers
  and stale deferred callbacks cannot commit state. Rejected context and initial
  session operations finalize loading only while current, and remote sign-out
  failures still complete a coherent fail-closed local sign-out.
- Explicit sign-out now blocks session-bearing auth events from republishing a
  session while remote sign-out is pending. Auth-context failures retain generic
  browser messages without logging raw Supabase error objects.
- Overlapping explicit sign-out calls reuse one in-flight operation, so only that
  operation owns and releases the session-event guard.
- Manual portal ticket creation now uses a constrained SECURITY DEFINER RPC that
  derives requester identity from `auth.uid()`. Browser clients no longer receive
  direct INSERT privilege on `public.tickets`, preventing crafted assignment,
  lifecycle, source, and timestamp fields during requester creation.
- Public ticket-comment insertion now requires `tickets.comment_public` in
  addition to ticket visibility and author binding. Internal notes remain
  separately protected by `tickets.comment_internal`, and read-only auditors
  cannot use either write path.
- Dashboard, protocol, ticket-detail, catalog-detail, and recycle-bin routes now
  have explicit visibility rules. Dynamic route segments are matched
  structurally, unknown non-admin paths fail closed, and unknown `/admin/*`
  paths remain platform-admin-only and visible only to platform admins in the
  sidebar.
- Unknown frontend capability keys now deny for every role, including
  `super_admin`. Static QA verifies literal `can()` callers and permission-matrix
  UI entries reference defined keys while preserving representative known-role
  allow and deny behavior.
- Authenticated frontend capabilities and page visibility now use the union of
  all effective global role keys. Role precedence remains display-only, and
  platform role aliases are normalized before authorization checks.
- `network_admin` retains ticket queue and internal visibility but no longer
  receives assignment or resolution capabilities. Queue and detail mutation
  controls now render only when their matching backend capability is present.
- Dashboard Tasks, CMDB, Notes, and Recycle Bin metrics now use the existing
  permission-gated Supabase query layers instead of stale browser-local rows.
- The Audit Log now reads the append-only, RLS-protected Service Desk audit
  table instead of seeded browser-local activity.
- Admin Users now reads RLS-protected profiles, global roles, and team
  memberships from Supabase. Unsupported account mutations and unavailable
  profile metadata are explicitly identified instead of modifying browser-local
  demo data.

## Changed Files

Pre-existing, preserved changes:

- `supabase/migrations/20260611020000_ticket_attachments.sql`
- `supabase/pending/20260611020000_ticket_attachments.qa.sql`

Hardening-phase documentation:

- `AGENTS.md`
- `docs/PRODUCTION_HARDENING_PLAN.md`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 1 implementation (including the preserved baseline changes):

- `supabase/migrations/20260611020000_ticket_attachments.sql`
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

Milestone 6 implementation:

- `src/components/layout/AuthGate.tsx`
- `src/lib/permissions.tsx`
- `src/routes/tickets.$id.tsx`
- `scripts/qa/production_hardening_frontend_auth.sh`

Milestone 7 implementation:

- `src/lib/knowledge/attachments.ts`
- `scripts/qa/production_hardening_knowledge_attachments.sh`

Milestone 8 implementation:

- `src/lib/service-desk/queries.ts`
- `src/routes/notifications.tsx`
- `src/components/common/NotificationDrawer.tsx`
- `scripts/qa/production_hardening_notifications.sh`

Milestone 9 implementation:

- `src/routes/admin.ticket-settings.tsx`
- `scripts/qa/production_hardening_ticket_configuration.sh`

Milestone 10 implementation:

- `src/lib/auth/AuthProvider.tsx`
- `scripts/qa/production_hardening_frontend_auth.sh`

Milestone 11 implementation:

- `src/lib/auth/AuthProvider.tsx`
- `src/components/layout/AuthGate.tsx`
- `src/components/layout/TopHeader.tsx`
- `src/routes/auth.tsx`
- `scripts/qa/production_hardening_frontend_auth.sh`

Milestone 12 implementation:

- `supabase/migrations/20260611000000_service_desk_foundation.sql`
- `supabase/pending/20260611000000_service_desk_foundation.qa.sql`
- `src/lib/service-desk/tickets.ts`
- `scripts/qa/production_hardening_ticket_creation.sh`

Milestone 14 implementation:

- `supabase/migrations/20260611000000_service_desk_foundation.sql`
- `supabase/pending/20260611000000_service_desk_foundation.qa.sql`
- `supabase/pending/20260611010000_service_desk_rbac_expand.qa.sql`

Milestone 15 implementation:

- `supabase/migrations/20260611000000_service_desk_foundation.sql`
- `supabase/pending/20260611000000_service_desk_foundation.qa.sql`
- `scripts/qa/production_hardening_catalog_request.sh`

Milestone 16 implementation:

- `supabase/migrations/20260611050000_notifications.sql`
- `supabase/pending/20260611050000_notifications.qa.sql`
- `scripts/qa/production_hardening_notifications.sh`

Milestone 17 implementation:

- `supabase/migrations/20260611020000_ticket_attachments.sql`
- `supabase/pending/20260611020000_ticket_attachments.qa.sql`
- `scripts/qa/production_hardening_ticket_attachments.sh`

Milestone 18 implementation:

- `src/lib/permissions.tsx`
- `src/components/layout/AuthGate.tsx`
- `src/components/layout/AppSidebar.tsx`
- `scripts/qa/production_hardening_frontend_auth.sh`

Milestone 19 implementation:

- `src/lib/permissions.tsx`
- `scripts/qa/production_hardening_frontend_auth.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 20 implementation:

- `src/lib/auth/AuthProvider.tsx`
- `src/lib/permissions.tsx`
- `src/routes/admin.roles.tsx`
- `scripts/qa/production_hardening_frontend_auth.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 21 implementation:

- `src/lib/permissions.tsx`
- `src/routes/tickets.tsx`
- `src/routes/tickets.$id.tsx`
- `supabase/migrations/20260611010000_service_desk_rbac_expand.sql`
- `supabase/pending/20260611010000_service_desk_rbac_expand.qa.sql`
- `scripts/qa/production_hardening_frontend_auth.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 22 implementation:

- `src/lib/service-desk/profiles.ts`
- `supabase/migrations/20260611010000_service_desk_rbac_expand.sql`
- `supabase/pending/20260611010000_service_desk_rbac_expand.qa.sql`
- `scripts/qa/production_hardening_service_desk_profiles.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 23 implementation:

- `src/lib/permissions.tsx`
- `src/routes/admin.templates.tsx`
- `supabase/migrations/20260611030000_ticket_configuration.sql`
- `supabase/pending/20260611030000_ticket_configuration.qa.sql`
- `scripts/qa/production_hardening_ticket_configuration.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 24 implementation:

- `src/routes/cmdb.tsx`
- `src/routes/index.tsx`
- `src/components/cmdb/AssetDetailsDrawer.tsx`
- `src/lib/cmdb/assets.ts`
- `src/lib/cmdb/queries.ts`
- `src/lib/cmdb/types.ts`
- `src/lib/permissions.tsx`
- `supabase/migrations/20260613000000_cmdb_backend.sql`
- `supabase/pending/20260613000000_cmdb_backend.qa.sql`
- `scripts/qa/production_hardening_cmdb.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 26 implementation:

- `src/routes/ipam.tsx`
- `src/routes/cmdb.tsx`
- `src/routes/index.tsx`
- `src/components/common/ImportPreviewDialog.tsx`
- `src/components/ipam/SubnetDetailsDrawer.tsx`
- `src/lib/csv.ts`
- `src/lib/ipam/addresses.ts`
- `src/lib/ipam/queries.ts`
- `src/lib/ipam/types.ts`
- `src/lib/permissions.tsx`
- `supabase/migrations/20260613010000_ipam_backend.sql`
- `supabase/pending/20260613010000_ipam_backend.qa.sql`
- `scripts/qa/production_hardening_ipam.sh`
- `scripts/qa/production_hardening_csv.sh`
- `scripts/qa/production_hardening_ipam_concurrency.sh`
- `scripts/qa/production_hardening_frontend_auth.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 32 implementation:

- `src/routes/index.tsx`
- `scripts/qa/production_hardening_dashboard.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 33 implementation:

- `src/routes/audit.tsx`
- `src/lib/service-desk/audit.ts`
- `src/lib/service-desk/queries.ts`
- `src/lib/service-desk/types.ts`
- `scripts/qa/production_hardening_audit.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 34 implementation:

- `docs/PENDING_MIGRATION_PROMOTION_PLAN_20260614.md`
- `scripts/qa/production_hardening_pending_migration_plan.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 35 implementation:

- `scripts/qa/run_disposable_full_chain_validation.sh`
- `scripts/qa/production_hardening_disposable_runner.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 36 implementation:

- `docs/DISPOSABLE_FULL_CHAIN_VALIDATION_RUNBOOK_20260614.md`
- `scripts/qa/production_hardening_disposable_runbook.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 37 implementation:

- `docs/DISPOSABLE_DATABASE_PREFLIGHT_20260614.md`
- `scripts/qa/production_hardening_disposable_preflight.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 38 implementation:

- `docs/DISPOSABLE_EXECUTION_COMMAND_PLAN_20260614.md`
- `scripts/qa/production_hardening_disposable_command_plan.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

## Validation Results

- Disposable execution command-plan assertions: passed; the plan references the
  Milestone 35 runner, Milestone 36 runbook, and Milestone 37 preflight,
  preserves both exact twelve-file orders, includes phases A-K, keeps all
  database-tool examples comment-prefixed, and preserves the later-milestone
  execution and separate live-deployment approval boundaries.
- `bash -n scripts/qa/production_hardening_disposable_command_plan.sh`: passed.
- `bash scripts/qa/production_hardening_disposable_command_plan.sh`: passed.
- `bunx --no-install tsc --noEmit`: passed after milestone 38.
- `git diff --check`: passed after milestone 38.
- No command template, database command, or disposable runner was executed
  during Milestone 38 static validation.
- Disposable database preflight assertions: passed; the document references the
  Milestone 35 runner and Milestone 36 runbook, contains the required human,
  target, live-refusal, secret, backup, evidence, stop, and result checklists,
  and preserves the separate later-execution approval boundary.
- `bash -n scripts/qa/production_hardening_disposable_preflight.sh`: passed.
- `bash scripts/qa/production_hardening_disposable_preflight.sh`: passed.
- `bunx --no-install tsc --noEmit`: passed after milestone 37.
- `git diff --check`: passed after milestone 37.
- No database was contacted during Milestone 37 static validation.
- Disposable full-chain runbook assertions: passed; the runbook references the
  Milestone 35 runner, preserves both exact twelve-file orders, and contains the
  required live-database prohibition, disposable-only boundary, naming and
  backup rules, result paths, and no-live-deployment statement.
- `bash -n scripts/qa/production_hardening_disposable_runbook.sh`: passed.
- `bash scripts/qa/production_hardening_disposable_runbook.sh`: passed.
- `bunx --no-install tsc --noEmit`: passed after milestone 36.
- `git diff --check`: passed after milestone 36.
- Service Desk audit live-data assertions: passed; `/audit` has no browser-store
  dependency, uses the bounded read-only audit query, handles load failures, and
  remains aligned with the existing manager-only RLS policy and grants.
- `bash -n scripts/qa/production_hardening_audit.sh`: passed.
- `bash scripts/qa/production_hardening_audit.sh`: passed.
- `bunx --no-install tsc --noEmit`: passed after milestone 33.
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
- Frontend authorization integration assertions: passed; known admin pages use
  the role matrix, unknown admin paths remain platform-admin-only, and ticket
  attachment/comment controls use their matching capabilities.
- Bun transpiler syntax validation: passed for the three TypeScript/TSX files
  changed by milestone 6.
- `bash -n scripts/qa/production_hardening_frontend_auth.sh`: passed.
- Knowledge attachment deletion assertions: passed; storage deletion precedes
  metadata deletion and returned storage errors are handled.
- Bun transpiler syntax validation: passed for the Knowledge Base attachment
  service changed by milestone 7.
- `bash -n scripts/qa/production_hardening_knowledge_attachments.sh`: passed.
- Notification mutation consistency assertions: passed; both notification
  surfaces update cached read state and handle mutation failures.
- Bun transpiler syntax validation: passed for the three notification files
  changed by milestone 8.
- `bash -n scripts/qa/production_hardening_notifications.sh`: passed.
- Scoped Service Desk profile-directory assertions: passed; frontend lookup uses
  the RPC, role grants are explicit, output is assignment-filtered, and private
  profile fields are absent.
- Bun transpilation passed for `src/lib/service-desk/profiles.ts`.
- `bash -n scripts/qa/production_hardening_service_desk_profiles.sh`: passed.
- `bash scripts/qa/production_hardening_service_desk_profiles.sh`: passed.
- Explicit route-protection assertions: passed; dashboard and all protocol URL
  variants use explicit rules, dynamic paths match structurally, unknown
  non-admin paths deny, and unknown admin paths retain the platform-admin-only
  fallback.
- Bun transpiler syntax validation: passed for all three TypeScript/TSX files
  changed by milestone 18.
- `bash -n scripts/qa/production_hardening_frontend_auth.sh`: passed after the
  milestone 18 assertions were added.
- Unknown-capability assertions: passed; undefined keys deny even for
  `super_admin`, every literal `can()` caller resolves to a defined capability,
  permission-matrix UI keys are defined, and representative known role outcomes
  remain unchanged.
- Bun transpiler syntax validation: passed for `src/lib/permissions.tsx` after
  milestone 19.
- `bash -n scripts/qa/production_hardening_frontend_auth.sh`: passed after the
  milestone 19 assertions were added.
- `bash scripts/qa/production_hardening_frontend_auth.sh`: passed after the
  milestone 19 assertions were added.
- Additive multi-role authorization assertions: passed for single-role behavior,
  `doc_editor` + `platform_auditor`, `helpdesk` + `platform_auditor`,
  `network_admin` + `platform_auditor`, and platform-admin combinations.
- Authenticated-store assertions confirm existing scalar display-role callers
  still evaluate the full effective role set for capabilities and page visibility.
- Bun transpiler syntax validation: passed for all three TypeScript/TSX files
  changed by milestone 20.
- `bash -n scripts/qa/production_hardening_frontend_auth.sh`: passed after the
  milestone 20 assertions were added.
- `bash scripts/qa/production_hardening_frontend_auth.sh`: passed after the
  milestone 20 assertions were added.
- Network-admin ticket-control assertions: passed for `network_admin` alone and
  combined with `platform_auditor`; both retain their read/infra permissions and
  deny ticket assignment and resolution.
- `bunx --no-install tsc --noEmit`: reported only the four previously documented
  `/documents` search-parameter errors outside milestone 20.
- `bunx --no-install tsc --noEmit`: ran and reported only the four previously
  documented `/documents` search-parameter errors outside this milestone.
- Ticket attachment binding assertions: passed; comment-linked metadata uses a
  composite same-ticket foreign key while storage paths remain bound to the same
  `ticket_id`.
- `bash -n scripts/qa/production_hardening_ticket_attachments.sh`: passed.
- Ticket configuration error-state assertions: passed; all five queries
  participate in the failure state and retry action.
- Bun transpiler syntax validation: passed for the ticket configuration route
  changed by milestone 9.
- `bash -n scripts/qa/production_hardening_ticket_configuration.sh`: passed.
- Canned-response delete authorization assertions: platform admin retains
  deletion, while IT admin and Service Desk lead retain create/edit without the
  destructive control or mutation path.
- Frontend authorization integration assertions also verify that new identities
  are pinned before session publication, same-user token refreshes preserve the
  established role while reloading context, stale requests cannot commit after
  identity replacement or sign-out, and role-based routing waits for new identity
  context resolution.
- Focused auth assertions verify provider disposal, guarded rejection
  finalization, and fail-closed local cleanup after returned or thrown remote
  sign-out failures. Deterministic runtime race and failure-injection tests remain
  required.
- Focused auth assertions also verify that session-bearing events are ignored
  during explicit sign-out and raw auth backend errors are not logged. A
  deterministic delayed-sign-out runtime test remains required.
- Concurrent sign-out assertions verify reuse of the owning in-flight operation
  and owner-only guard cleanup. Deterministic concurrent-click testing remains
  required.
- Bun transpiler syntax validation passed for the four auth TSX files covered by
  the scoped lifecycle and sign-out fix.
- Bun transpiler syntax validation passed for the three TypeScript/TSX files
  changed by milestone 11.
- `bunx --no-install tsc --noEmit` was available but remains blocked by four
  pre-existing `/documents` search-parameter type errors outside the auth batch.
- Bun transpiler syntax validation: passed for `src/lib/auth/AuthProvider.tsx`.
- `bash -n scripts/qa/knowledge_rc1_staging_smoke.sh`: passed.
- Focused ESLint is locally available; the auth files currently report existing
  formatting-only findings that were not changed by this scoped milestone.
- Type checking is locally available and remains blocked by four pre-existing
  `/documents` search-parameter errors outside the auth batch.
- Constrained manual ticket-creation static assertions: passed; browser direct
  INSERT privilege is removed, requester identity is server-derived, and
  transaction-backed disposable-database QA covers an allowed RPC call plus a
  crafted privileged direct-INSERT rejection.
- SQL execution: not run; database connections and migration execution are
  prohibited.
- Public-comment authorization static review: passed; public and internal
  comment writes require their distinct permissions, ticket visibility, and
  caller-bound authorship. Transaction-backed QA covers requester, employee,
  helpdesk, technician, auditor, lead, admin, foreign-ticket, spoofed-author,
  and anonymous cases.
- Catalog-request authorization static assertions: passed; the RPC rejects
  anonymous and unauthorized callers before catalog lookup while preserving
  restricted-item and required-field enforcement.
- `bash -n scripts/qa/production_hardening_catalog_request.sh`: passed.
- Notification read-state authorization assertions: passed; authenticated table
  access is SELECT-only and browser mutation remains on the caller-bound
  `mark_notifications_read(...)` RPC.
- `bash -n scripts/qa/production_hardening_notifications.sh`: passed.

## Known Issues

- SQL QA cannot be executed under the current safety rules because that would
  require a database connection and migration state.
- The repository has no configured unit-test script.
- Client attachment behavior has static validation only because no local test
  harness or installed dependencies are available.
- Deterministic auth lifecycle, rejection, and sign-out failure tests still
  require a browser-capable runtime harness with controlled Supabase responses.
- The pending SQL migration and its transaction-backed QA have not been executed.
  Their runtime behavior still requires database-backed human validation.

## Next Checkpoint

Human review of this scoped diff. Any next step involving dependency installation,
database-backed SQL QA, migration execution, Docker, network access, or deployment
requires explicit approval under `AGENTS.md`.

## Milestone 13 - Constrained Ticket Update Contract

- Added `public.update_ticket(uuid, jsonb)` as the controlled Service Desk
  ticket-mutation boundary.
- Removed direct authenticated `UPDATE` access to `public.tickets`.
- Separated assignment permissions from lifecycle-transition permissions.
- Added server-side validation for legal ticket status transitions.
- Preserved a narrow requester-safe reopen path for an owned resolved or closed
  ticket.
- Preserved atomic status-event, audit-log, assignment-history, and notification
  behavior through the existing ticket-row triggers.
- Updated frontend ticket mutations to use the constrained RPC.
- Added transaction-backed disposable-database QA for allowed and denied ticket
  mutations.
- Adjusted notification QA fixtures for compatibility with the constrained
  P01 and P02 browser contracts.
- SQL execution was not run. The protected live database remains untouched.

## Milestone 14 - Public Comment Permission Enforcement

- Added `tickets.comment_public` to the Service Desk foundation permission set
  and existing queue-writing role mappings.
- Required `tickets.comment_public` for non-internal ticket-comment insertion.
- Kept internal notes on the separate `tickets.comment_internal` authorization
  branch.
- Added transaction-backed disposable-database QA for requester, employee,
  helpdesk, technician, auditor, lead, admin, and unauthorized insert cases.
- SQL execution was not run. The protected live database remains untouched.


## Milestone 15 - Catalog Request Permission Enforcement

- `submit_catalog_request(...)` now requires `catalog.request`.
- Authentication alone no longer authorizes service-catalog submission.
- The foundation migration defines and maps `catalog.request` for intended
  requester and Service Desk roles while keeping `platform_auditor` read-only.
- Transaction-backed disposable-database QA covers an allowed requester, an
  unprivileged authenticated role, an anonymous caller, a restricted item, and
  required dynamic-field validation with explicit expected SQLSTATE classes.
- Repository-local static QA also verifies authorization ordering, safe
  `search_path`, restricted-item enforcement, and required-field validation.
- SQL execution has not occurred. The protected live database remains untouched.

## Milestone 16 - Notification Read-State Mutation Boundary

- Removed direct authenticated `UPDATE` access to `public.notifications` and
  explicitly dropped the legacy own-row update policy.
- Kept notification reads isolated by `user_id = auth.uid()` and retained the
  SECURITY DEFINER `mark_notifications_read(...)` RPC as the sole browser
  mutation boundary.
- The RPC updates only unread rows owned by the caller, so supplied foreign IDs
  and already-read IDs are zero-row no-ops.
- Transaction-backed disposable-database QA covers direct owner/content
  tampering denial, one-row success, zero-row no-op, cross-user denial, and
  mark-all behavior.
- Existing frontend cache-key filtering and affected-row reconciliation remain
  unchanged and are enforced by repository-local static QA.
- SQL execution has not occurred. The protected live database remains untouched.

## Milestone 17 - Comment Attachment Ticket Binding

- Replaced the single-column attachment comment reference with a composite
  foreign key from `(comment_id, ticket_id)` to `ticket_comments(id, ticket_id)`.
- Inserts and updates can no longer bind attachment metadata to a comment from a
  different ticket.
- Deleting a comment nulls only `comment_id`, preserving the attachment as a
  ticket-only record with its non-null ticket and validated storage path intact.
- Transaction-backed disposable-database QA covers valid same-ticket and null
  bindings, cross-ticket insert and update rejection, comment deletion,
  requester/internal visibility, and attachment deletion authorization.
- Existing storage-path validation and metadata-backed storage policies remain
  unchanged and aligned with `ticket_id`.
- SQL execution has not occurred. The protected live database remains untouched.

## Milestone 18 - Explicit Fail-Closed Route Protection

- Added explicit visibility rules for `/dashboard`, `/protocols`,
  `/protocols/`, and `/protocols/:id`, plus every other routed protected URL.
- Added structural dynamic-segment matching for protocol, ticket, and service
  catalog detail routes.
- Changed unmatched non-admin routes from implicit allow to fail closed while
  preserving the platform-admin-only fallback for unknown `/admin/*` paths.
- Preserved the unmatched diagnostics route as the intentional admin fallback
  and kept its sidebar link visible only to platform admins.
- Added repository-local static and direct function assertions for dashboard,
  protocol variants, dynamic detail paths, overlong paths, and unknown routes.
- Browser role-matrix testing remains required for direct navigation as an
  employee, technician, auditor, Service Desk lead, IT admin, and platform admin.
  It must cover `/dashboard`, `/protocols`, `/protocols/`, a real
  `/protocols/:id`, an unknown non-admin path, and an unknown `/admin/*` path.
- No database or migration execution occurred.

## Milestone 19 - Deny Unknown Permission Keys

- Changed unknown frontend capability checks from implicit allow to explicit
  deny for every role.
- Retained fail-closed page visibility and the documented platform-admin-only
  fallback for unknown `/admin/*` routes.
- Audited literal capability callers, dashboard action capability fields,
  permission-matrix UI keys, routed protected paths, AuthGate, and the sidebar;
  no missing capability or page rules were found.
- Added repository-local assertions for known allow and deny outcomes, unknown
  capability denial, caller-to-matrix coverage, and permission-matrix UI key
  coverage.
- Browser role-matrix testing remains required to verify rendered controls for
  representative roles and direct navigation behavior end to end.
- No database or migration execution occurred.

## Milestone 20 - Additive Multi-Role Frontend Capabilities

- Preserved a deterministic display role while publishing every recognized
  effective global role to the frontend permission store.
- Normalized `platform_admin` and `platform_auditor` to their frontend aliases
  before display selection and authorization.
- Changed capability and page-visibility checks to allow when any effective role
  grants access, matching the backend's additive role-permission model.
- Kept role-matrix previews isolated to the selected preview role.
- Cleared the complete effective-role set on identity replacement, session
  restore failure, context failure fallback, and sign-out transitions.
- Added repository-local assertions for the required role combinations and for
  existing scalar callers using the authenticated effective-role union.
- Browser testing remains required for sidebar, direct-route, and guarded-button
  rendering while signing in as users with each tested multi-role combination.
- No database or migration execution occurred.

## Milestone 21 - Network Admin Ticket Control Alignment

- Adopted the staged SQL role matrix as the product contract: `network_admin`
  may read the ticket queue and internal ticket context but may not assign,
  resolve, close, or otherwise change ticket lifecycle state.
- Split ticket operators from queue-visible IT roles in the frontend capability
  map, removing `network_admin` from `tickets.assign` and `tickets.resolve`.
- Removed queue bulk-selection and mutation controls, row assignment/status
  actions, detail assignment controls, and resolve/reopen controls when the
  corresponding capability is absent.
- Documented the same least-privilege contract in the pending RBAC migration and
  added staged SQL QA for `network_admin` alone and combined with
  `platform_auditor`.
- Added repository-local frontend role-matrix and control-visibility assertions
  for both role combinations.
- SQL was not executed; disposable-database and browser role-rendering tests
  remain required.
- No database, migration, Docker, network, deployment, service, or Git-history
  action occurred.

## Milestone 22 - Scoped Service Desk Profile Directory

- Added an explicit `tickets.directory` permission for Service Desk queue roles,
  including read-only queue rendering for `network_admin`, while keeping
  employees and platform auditors denied.
- Added `list_service_desk_profiles()` as a `SECURITY DEFINER` RPC with an empty
  `search_path`, authentication and permission checks, and authenticated-only
  execution privileges.
- Limited directory output to `id` and `display_name` for users whose platform
  role grants `tickets.assign`; email and other profile attributes remain private.
- Kept the existing self-or-platform-admin `profiles` SELECT policy unchanged.
- Switched the shared Service Desk frontend profile query from direct table
  access to the scoped RPC, covering queue and ticket-detail assignee selectors.
- Added disposable-database QA for helpdesk, technician, Service Desk lead, IT
  admin, network admin, employee, and auditor callers; assignee filtering;
  cross-user RLS preservation; and exact output-field shape.
- SQL was not executed; disposable-database and browser assignment-flow tests
  remain required.

## Milestone 23 - Platform-Admin-Only Canned-Response Deletion

- Adopted the existing staged SQL delete policy as the least-privilege product
  contract: canned-response creation and editing remain available to ticket
  configuration roles, while deletion is platform-admin-only.
- Added a separate frontend delete capability and removed the destructive
  control from IT administrators and Service Desk leads without changing their
  create/edit access.
- Guarded the delete mutation and confirmation dialog with the same capability
  used for button visibility.
- Added repository-local role/control assertions for platform admin, IT admin,
  and Service Desk lead behavior.
- Added transaction-backed disposable-database QA proving config-role updates,
  denied deletes for IT admin and Service Desk lead, and successful platform
  admin deletion.
- SQL was not executed; disposable-database and browser role-rendering tests
  remain required.

## Milestone 24 - Shared CMDB Backend

- Replaced CMDB route and drawer asset reads and writes with typed Supabase and
  TanStack Query contracts; browser-local assets are no longer authoritative for
  the CMDB module.
- Added pending forward-only schema for configurable asset types, shared assets,
  explicit ownership, lifecycle events, constrained identifiers, live-row
  uniqueness, soft deletion, and restore.
- Added least-privilege RLS for `cmdb.view` and `cmdb.manage`; viewers cannot see
  deleted assets, managers can restore them, hard deletion is unavailable, and
  lifecycle rows cannot be forged by authenticated clients.
- Added security-definer RPCs with empty search paths and explicit permission
  checks for atomic CSV import, soft deletion, and restore. Import is capped at
  500 rows and rejects inactive or unknown asset types.
- Aligned frontend authorization with the staged RBAC permission key
  `cmdb.manage`, replacing the obsolete frontend-only `cmdb.write` key.
- Added static frontend/SQL assertions and staged disposable-database QA
  requirements for RLS, lifecycle integrity, constraints, atomic import, soft
  deletion, restore, and denied hard deletion.
- SQL was not executed. Disposable-database authorization/constraint tests and
  browser CMDB CRUD, filter, import, export, delete, and restore tests remain
  required.

## Milestone 25 - Organization-Scoped CMDB Correction

- Confirmed the approved tenant contract: one customer company equals one
  organization.
- Added the pending `organizations` and `organization_members` foundation.
- Added fail-closed active-organization helpers with pinned empty search paths.
- Scoped CMDB assets and lifecycle records to `organization_id`.
- Added a composite same-organization lifecycle foreign key.
- Derived CMDB organization context server-side for asset inserts and imports.
- Prevented direct movement of assets between organizations.
- Scoped CMDB reads, updates, soft deletion, restoration, bulk lifecycle changes,
  imports, and lifecycle visibility to the active organization.
- Kept CMDB asset types as global read-only reference data until a dedicated
  organization-customization contract is approved.
- Added repository-local and disposable-database QA for tenant isolation.
- SQL was not executed. The protected live database remains untouched.

## Milestone 26 - Organization-Scoped IPAM Backend

- Replaced IPAM route and subnet-drawer reads and writes with typed Supabase and
  TanStack Query contracts; browser-local IPAM rows are no longer authoritative.
- Added organization-scoped networks, subnets, addresses, and reservations with
  PostgreSQL `cidr`/`inet` validation and same-organization composite foreign
  keys to CMDB assets.
- Added least-privilege RLS for `ipam.view` and `ipam.manage`, revoked all direct
  authenticated writes, and constrained every mutation to permission-checked,
  empty-search-path RPCs that derive the active organization server-side.
- Enforced unique live IP addresses and one live address per linked asset,
  rejected addresses and gateways outside their subnet, and exposed integrity
  conflict reasons for legacy or manually staged inconsistent rows.
- Added atomic save/import, bulk reserve/release, reserve-next, soft-delete, and
  restore operations. Reservation rows are created and retired with allocation
  state transitions; restored addresses return as unlinked and free.
- Aligned frontend authorization with the staged `ipam.manage` backend key and
  removed the obsolete `ipam.write` capability from IPAM and dashboard callers.
- Added static frontend/SQL assertions and transaction-backed disposable QA for
  RLS, direct-write denial, tenant isolation, conflict rejection, reservation
  consistency, atomic import, soft deletion, and restoration.
- Corrected the reviewed P15 patch to canonicalize every stored IPv4 host and
  gateway as `/32` and every IPv6 host and gateway as `/128`, with trigger
  normalization and mask constraints protecting every write path.
- Replaced the dashboard's remaining browser-local IPAM counts and alerts with
  the typed shared React Query contract and fail-closed loading/error states.
- Defined one exact round-trip CSV contract including CMDB asset links,
  reservation expiry and notes, and address notes; imports reject mismatched
  headers and remain atomic and capped at 500 rows.
- Added permission-checked, empty-search-path network and subnet soft-delete and
  restore RPCs with active-dependency rejection, active-parent requirements,
  and explicit live-row collision rejection. No lifecycle UI was added because
  the current screen exposes lifecycle controls only for addresses.
- Expanded static and disposable-database QA fixtures for tenant mutation
  isolation, host-mask duplicates, gateway normalization, denied hard deletes,
  atomic mixed-organization bulk operations and imports, CMDB link integrity,
  reservation/gateway consistency, and network/subnet lifecycle safety.
- Serialized IPAM mutations with a documented network, subnet, then address row-
  lock order so lifecycle checks, gateway edits, allocation changes, imports,
  and reserve-next operations cannot create invalid live parent-child state.
- Updated the shared import preview to await IPAM and CMDB mutation completion,
  keep failed imports open, and prevent duplicate submission while pending.
- Replaced line-based CSV parsing with quoted-field state handling for commas,
  escaped quotes, BOMs, trailing empties, and LF/CRLF multiline values; added
  executable round-trip QA and malformed-quote rejection coverage.
- Finalized P15 import concurrency by preflighting and canonicalizing complete
  batches, locking all existing networks, subnets, and addresses in UUID order,
  then processing rows by canonical network, subnet, and host order. Address
  restore now rejects deleted network and subnet ancestors before locking the
  address. The disposable concurrency harness now requires two exact
  confirmations, a strict database-name allowlist, `current_database()` identity,
  and an explicit disposable marker before cleanup or fixture writes are armed.
- SQL was not executed. Disposable-database and browser runtime validation remain
  required; the protected live database remains untouched.

## Milestone 27 - Organization-Scoped Tasks Backend

- Replaced the Tasks route and task details drawer's reads and writes with typed
  Supabase and TanStack Query contracts (`src/lib/tasks/types.ts`,
  `src/lib/tasks/tasks.ts`, `src/lib/tasks/queries.ts`); browser-local task rows
  are no longer authoritative. Saved-view preferences (`data.taskViews`) and the
  static `CURRENT_USER`/`CURRENT_TEAM`/`TASK_*` constants remain local UI state,
  consistent with prior milestones.
- Added an organization-scoped `tasks` table (priority/status/scope/source enums,
  recurrence, checklist, tags, watchers, opaque `links` jsonb for cross-module
  references, soft delete) and a `task_comments` table, both with least-privilege
  RLS gated on `tasks.view` (non-deleted rows) and `tasks.manage` (full access,
  including writes).
- Added `prepare_tasks_write`/`prepare_task_comments_write` triggers that derive
  `organization_id`, `created_by`/`updated_by`/`author`, and forbid
  cross-organization moves, plus an `assert_tasks_manage()` helper used by every
  mutating RPC.
- Revoked all direct authenticated table writes and exposed `list_tasks`,
  `save_task`, `set_task_status`, `escalate_task`, `set_task_archived`,
  `duplicate_task`, `save_task_links`, `set_task_reminder`, `add_task_comment`,
  `soft_delete_task`, `restore_task`, `bulk_update_tasks`, `bulk_add_task_tag`,
  `bulk_set_tasks_archived`, and `bulk_soft_delete_tasks` as permission-checked,
  empty-search-path RPCs.
- `set_task_status` records `completed_at` on completion/reopen and, for tasks
  with a `recurring` schedule and a due date, creates a follow-up task at the
  next occurrence with a freshly-keyed, unchecked checklist via
  `next_task_occurrence`/`duplicate_task_checklist`.
- Added an additive `role_permissions` grant so `doc_editor` (which already has
  `tasks.view` and the frontend `tasks.write` capability) also holds the backend
  `tasks.manage` permission, aligning the existing frontend/DB permission
  mismatch without removing any existing grant.
- Corrected `save_task`'s UPDATE path so an empty `assigned_to`/`owner`/`team`
  value in the input no longer overwrites the existing value (matches the
  `nullif` pattern already used for `due_date`/`reminder_at` and the INSERT
  path).
- Cross-module "linked records" reads in the task details drawer (assets,
  documents, tickets, IPAM, notes) continue to read the browser-local seed
  store, matching the precedent set by the CMDB/IPAM milestones; only the
  Tasks module's own data moved to the backend.
- Added transaction-backed disposable QA covering RLS enablement, direct-write
  denial, the `doc_editor` RBAC alignment, validation errors (checklist,
  recurrence, priority/status/scope/source enums, blank title), recurring
  follow-up creation and reopen, escalation idempotency, archive toggling,
  duplication, links/reminder updates, comments, bulk operations with
  `completed_at` side effects, soft delete/restore, hard-delete and direct-write
  rejection, and organization-isolation for both reads and every mutating RPC.
- Added a static frontend/SQL assertion script
  (`scripts/qa/production_hardening_tasks.sh`) verifying the Tasks route and
  drawer no longer use the local store or legacy `src/lib/data/tasks.ts`
  mutators, use the new service layer and React Query keys, and that destructive
  operations are RPC-only.
- P16 disposable-database validation passed against a read-only live snapshot restored
  into a temporary QA database; the protected live database was not migrated.
- Browser runtime validation remains required before any live apply.

## Milestone 28 - Organization-Scoped Notes Backend

- Replaced the Notes route's reads and writes with typed Supabase and TanStack
  Query contracts (`src/lib/notes/types.ts`, `src/lib/notes/notes.ts`,
  `src/lib/notes/queries.ts`); browser-local note/template rows are no longer
  authoritative. `src/lib/data/notes.ts` was trimmed to the non-authoritative
  `exportNoteMarkdown`, `convertNoteToDocument`, and `convertNoteToTask` helpers,
  which continue to read/write the local Documents/Tasks seed stores, consistent
  with the cross-module precedent set by prior milestones.
- Added organization-scoped `notes` and `note_templates` tables (tags, pinned,
  archived, `is_template`, owner, opaque `links` jsonb for cross-module
  references, soft delete), both with least-privilege RLS gated on `notes.view`
  (non-deleted rows) and `notes.manage` (full access, including writes).
- Added `prepare_notes_write`/`prepare_note_templates_write` triggers that derive
  `organization_id`, `created_by`/`updated_by`, and forbid cross-organization
  moves, plus an `assert_notes_manage()` helper used by every mutating RPC.
- Revoked all direct authenticated table writes and exposed `list_notes`,
  `list_note_templates`, `save_note`, `save_note_template`, `toggle_note_pin`,
  `set_note_archived`, `duplicate_note`, `save_note_links`, `soft_delete_note`,
  `restore_note`, `soft_delete_note_template`, and `restore_note_template` as
  permission-checked, empty-search-path RPCs.
- `save_note` derives `owner` from the caller's profile on create, preserves it
  on update, and merges the `links` jsonb only on the `linkedDocumentId` key so
  RelationPicker-managed link arrays survive a subsequent note edit.
  `save_note_links` validates the payload is a JSON object and merges
  `linkedTicketIds`/`linkedAssetIds`/`linkedIpamIds`/`linkedTaskIds`/
  `linkedUserIds` without disturbing `linkedDocumentId`. `duplicate_note` resets
  `pinned`/`archived`, appends " (copy)" to the title, and carries `links`.
- Confirmed the existing `notes.manage` permission grant already matches the
  frontend `notes.write` capability's role set exactly (platform_admin/
  super_admin, it_admin, sd_lead, helpdesk, technician, network_admin,
  doc_editor), so no additional RBAC-alignment grant was required for this
  milestone.
- Cross-module "linked records" reads in the notes detail panel (tickets,
  assets, IPAM, tasks, documents) and the note activity timeline continue to
  read the browser-local seed store, matching the precedent set by the
  CMDB/IPAM/Tasks milestones; only the Notes module's own data moved to the
  backend. Markdown export remains client-side.
- Added transaction-backed disposable QA covering RLS enablement, direct-write
  denial, validation errors (blank title), pin/archive toggling, links merging
  and non-object rejection, duplication with link carry-over, note templates
  (create/update/list/soft-delete/restore), soft delete/restore/hard-delete
  rejection, direct-insert rejection, and organization isolation for both reads
  and every mutating RPC.
- Added a static frontend/SQL assertion script
  (`scripts/qa/production_hardening_notes.sh`) verifying the Notes route no
  longer uses the local store or legacy `src/lib/data/notes.ts` mutators, uses
  the new service layer and React Query keys, and that destructive operations
  are RPC-only.
- SQL was not executed. Disposable-database and browser runtime validation
  remain required; the protected live database remains untouched.

## Milestone 29 - Organization-Scoped Protocols Backend

### P18 static-review follow-up

- Replaced the dashboard's remaining `useProtocols()` browser-store read with
  the shared `protocolRunsQuery()` contract, so Protocols counts no longer come
  from seeded local browser state.
- Removed the now-unreachable `src/lib/protocols/store.ts` and
  `src/lib/protocols/seed.ts` prototype persistence modules and their legacy
  `ProtocolState` type. Protocol records no longer have a browser-local
  persistence path.
- Added explicit `protocols.view` and `protocols.manage` frontend capabilities.
  Protocols routes now gate writes with the same permission name enforced by
  the RLS-backed RPCs, and the dashboard run shortcut requires
  `protocols.manage`.
- Extended `scripts/qa/production_hardening_protocols.sh` to reject Protocols
  local-store imports anywhere under `src`, require the dashboard query and
  capability integration, and prevent a return to the unrelated
  `tasks.write` UI gate. The disposable SQL QA now also asserts evidence is
  persisted through `update_protocol_run_step`. SQL remains pending and
  unexecuted.

- Replaced the Protocols list and run-detail routes' reads and writes with
  typed Supabase and TanStack Query contracts (`src/lib/protocols/types.ts`,
  `src/lib/protocols/protocols.ts`, `src/lib/protocols/queries.ts`); the
  former browser-local Protocols store is no longer present.
- Added organization-scoped `protocol_templates`, `protocol_runs`, and
  `protocol_run_comments` tables (templates carry a jsonb `steps` array and
  soft-delete columns; runs carry jsonb `steps`/`approvals` arrays and a jsonb
  `links` object for cross-module ticket/asset/task references; comments are a
  separate table mirroring the Tasks comment pattern), all with least-privilege
  RLS gated on `protocols.view` (read) and `protocols.manage` (full access,
  including writes). Only `protocol_templates` supports soft delete/restore;
  `protocol_runs` are immutable history once created.
- Added `prepare_protocol_templates_write`/`prepare_protocol_runs_write`/
  `prepare_protocol_run_comments_write` triggers that derive
  `organization_id`, `created_by`/`updated_by`, forbid cross-organization
  moves, and maintain `updated_at`, plus an `assert_protocols_manage()` helper
  used by every mutating RPC.
- Revoked all direct authenticated table writes and exposed
  `list_protocol_templates`, `list_protocol_runs`, `save_protocol_template`,
  `set_protocol_template_archived`, `duplicate_protocol_template`,
  `soft_delete_protocol_template`, `restore_protocol_template`,
  `start_protocol_run`, `set_protocol_run_status`, `update_protocol_run_step`,
  `add_protocol_run_approval`, and `add_protocol_run_comment` as
  permission-checked, empty-search-path RPCs.
- `save_protocol_template` validates title length, a non-empty `steps` jsonb
  array with titled steps, `recurrence`, and `visibility`.
  `duplicate_protocol_template` appends " (Copy)" to the title, regenerates
  step ids, and resets `archived`/`last_run_at`. `start_protocol_run`
  allocates sequential `PR-####` run numbers per organization, copies the
  template's steps into the run, sets status to `in_progress`, stores the
  `links` payload, and updates the template's `last_run_at`.
  `update_protocol_run_step` derives `completedBy`/`completedAt` from the
  caller's profile and clears them when a step is uncompleted.
  `set_protocol_run_status` records `completed_at`/`final_summary` on terminal
  statuses and validates the status value. `add_protocol_run_approval` records
  an approval/rejection (server-derived `by`), resuming the run on approval and
  marking it failed on rejection. `add_protocol_run_comment` resolves the
  author's display name via `profiles`, mirroring `list_tasks`' comment
  pattern.
- Added an RBAC-alignment grant of `protocols.manage` to the `sd_lead`,
  `helpdesk`, and `technician` roles, matching the frontend's existing
  `tasks.write` capability gate used by the Protocols UI.
- Added transaction-backed disposable QA covering RLS enablement, direct-write
  denial on all three tables, `save_protocol_template` validation (steps
  array/title/recurrence/visibility), template duplication, run start with
  sequential numbering and copied steps/links, run step updates (including
  uncompletion clearing audit fields and rejection of unknown step ids/invalid
  patches), run status transitions including approval/rejection flows, comment
  authoring with profile display names, soft delete/restore/hard-delete
  rejection for templates, hard-delete rejection for runs, and organization
  isolation for both reads and every mutating RPC.
- Added a static frontend/SQL assertion script
  (`scripts/qa/production_hardening_protocols.sh`) verifying the Protocols
  routes no longer use the local store, use the new service layer and React
  Query keys, that all 12 RPCs are wired up, that destructive operations are
  RPC-only, and spot-checking the RLS/RBAC/validation contract against the
  migration and QA SQL.
- SQL was not executed. Disposable-database and browser runtime validation
  remain required; the protected live database remains untouched.

## Milestone 30 - Recycle Bin Backend Aggregation

- Replaced the Recycle Bin route's reads and writes (`src/routes/trash.tsx`),
  which previously operated entirely on the legacy browser-local `data.trash`
  collection via `useData()`/`setState()`/`logActivity()`, with a typed
  TanStack Query aggregation layer (`src/lib/recycle-bin/types.ts`,
  `src/lib/recycle-bin/recycleBin.ts`, `src/lib/recycle-bin/queries.ts`) built
  entirely on top of the soft-delete RPCs already shipped in Milestones 24-29.
  No new database migration was required: `list_assets`/`list_ipam_addresses`/
  `list_tasks`/`list_notes` (each called with `includeDeleted = true`) and
  `restore_cmdb_asset`/`restore_ipam_address`/`restore_task`/`restore_note`
  already exist, are already RLS- and permission-gated (`*.manage` required to
  see soft-deleted rows, matching `recyclebin.restore`'s admin-only grant), and
  are already covered by each module's own disposable QA.
- `src/lib/recycle-bin/recycleBin.ts` maps each module's soft-deleted records
  (`CmdbAsset`, `IpamAddress`, `Task`, `Note` with non-null `deletedAt`) into a
  normalized `RecycleBinItem` (`id`, `kind`, `name`, `originalLocation`,
  `deletedAt`) and dispatches `restoreRecycleBinItem` to the matching
  per-module `restore*` RPC wrapper.
- The Recycle Bin previously covered `folder`/`document`/`asset`/`ipam`/
  `task`/`note` kinds via a single flat local array populated by ad-hoc
  `trashItem()` calls from legacy ticket/task/catalog code. The rebuilt route
  covers exactly `asset`/`ipam`/`task`/`note` - the four kinds with a
  Supabase-backed `list_*(includeDeleted)` + `restore_*` pair. `folder`/
  `document` are out of scope: the Knowledge Base is already served by
  `KnowledgeBackendWorkspace` with its own restore surface. CMDB and IPAM
  already expose an in-module "Deleted assets/addresses" toggle with restore
  in `cmdb.tsx`/`ipam.tsx`; the Recycle Bin remains valuable as the *only*
  restore surface for soft-deleted Tasks and Notes, which have no such
  in-module toggle.
- "Permanently delete" and "Empty bin" were removed rather than left wired to
  dead local-store mutations. No module exposes a hard-delete RPC by design -
  every Milestone 24-29 QA file explicitly asserts hard-deletes are rejected
  for audit immutability - so a real "permanently delete" action is not
  available from this UI. The route now shows an explanatory note ("Deleted
  records are retained for audit and compliance ... Permanent deletion is not
  available.") and keeps Restore as the only action, alongside a CSV export
  (name/type/original location/deleted-at; the legacy `size` column was
  dropped as none of the four record types carry a meaningful byte size).
- The "Recoverable" / "Most recently deleted" / "Oldest" metric cards and the
  search/type filter are preserved, recomputed from the live aggregated query
  results instead of the static `data.trash` array.
- The legacy `data.trash` collection, `TrashItem`/`TrashKind` types, and the
  `trashItem()` helper in `src/lib/data/store.ts` are left in place: they
  remain read by the dashboard's "Recycle Bin summary" widget
  (`src/routes/index.tsx`) and `src/routes/admin.diagnostics.tsx`, which are
  non-authoritative cross-module reads following the same precedent as the
  CMDB/IPAM/Tasks/Notes/Protocols seed collections.
- Added a static frontend assertion script
  (`scripts/qa/production_hardening_recycle_bin.sh`) verifying the Recycle Bin
  route no longer reads/writes the legacy `data.trash` store, uses the new
  `src/lib/recycle-bin` service/query layer, wires all four `restore*` RPC
  wrappers, contains no "Empty bin"/"permanently delete" actions, and that the
  underlying per-module `list_*`/`restore_*` RPCs and QA coverage from
  Milestones 24-29 are still present.
- No SQL was added or executed. This milestone is a pure frontend
  aggregation over already-migrated, already-QA'd backend objects; the
  protected live database remains untouched.

## Milestone 31 - Global Search Live-Data Integration

- Replaced Global Search's (`src/routes/search.tsx`) CMDB/IPAM/Tasks/Notes/
  Protocols result sources with the live Supabase-backed TanStack Query
  layers added in Milestones 24-29 (`cmdbAssetsQuery`, `ipamAddressesQuery`,
  `tasksQuery`, `notesQuery`, `protocolTemplatesQuery`, `protocolRunsQuery`).
  Previously these five sections searched the legacy browser-local
  `data.assets`/`data.ipam`/`data.tasks`/`data.notes` seed arrays and the
  `useProtocols()` local store (`protocols.templates`/`protocols.runs`), so
  records created, edited, restored, or deleted through the now-backend-driven
  CMDB/IPAM/Tasks/Notes/Protocols/Recycle-Bin UIs never appeared in (or
  disappeared from) search results.
- No new database migration was required: `list_assets`/`list_ipam_addresses`/
  `list_tasks`/`list_notes`/`list_protocol_templates`/`list_protocol_runs` and
  their query-key/queryOptions wrappers already exist and are already RLS- and
  permission-scoped (rows the caller cannot see are filtered out server-side,
  not raised as errors), so each search section degrades to "no results" for
  users without the corresponding `*.view`/`*.manage` permission rather than
  failing the whole page.
- Result field mappings (`hostname`/`displayName`/`ipAddress` for assets,
  `ipAddress`/`hostname`/`subnet` for IPAM, `title`/`category`/`status` for
  tasks, `title`/`category`/`content` for notes, `title`/`category`/`tags`/
  `steps` for protocol templates, `runNumber`/`templateTitle`/`status`/
  `assignedUser` for protocol runs) were unchanged - the new types from
  `src/lib/<module>/types.ts` expose the same field names the legacy `data.*`
  shapes used, so the existing `Group` rendering and result-grouping UI is
  preserved exactly.
- The "Knowledge Base" (`useKnowledge()` local tree) and "Knowledge Base
  (Live)" (`useTeamArticles()`) sections are unchanged and out of scope for
  this milestone; that dual-source duplication predates Milestones 24-30 and
  is tracked separately.
- Added a static frontend assertion script
  (`scripts/qa/production_hardening_global_search.sh`) verifying the search
  route no longer reads `@/lib/data/store` or `@/lib/protocols/store` for
  these five modules, uses the five modules' live query layers via
  `useQuery(...)`, derives results from `*.data ?? []`, and that the
  Knowledge Base sections remain untouched.
- No SQL was added or executed. This milestone is a pure frontend
  aggregation over already-migrated, already-QA'd backend objects; the
  protected live database remains untouched.
- Remaining known gap: the dashboard (`src/routes/index.tsx`) still has the
  same staleness issue for several widgets (`data.tasks`/`data.assets`/
  `data.notes` counts) and is the natural candidate for the next milestone.

## Milestone 32 - Dashboard Live-Data Integration

- Replaced the dashboard's Tasks, CMDB, and Notes reads with the existing
  Supabase-backed TanStack Query contracts (`tasksQuery`, `cmdbAssetsQuery`,
  and `notesQuery`). Active-task counts, overdue-task alerts, assigned-task
  counts, maintenance-asset alerts/counts, total asset count, and note count no
  longer come from the browser-local seed store.
- Replaced the dashboard's legacy `data.trash` summary with the same four
  include-deleted queries and normalization helpers used by the live Recycle
  Bin route. The summary now counts recoverable CMDB assets, IPAM addresses,
  Tasks, and Notes that are visible through the existing backend contracts.
- Each query is enabled only when the current frontend role has the matching
  `tasks.view`, `cmdb.view`, `notes.view`, or `recyclebin.restore` capability.
  The underlying list operations remain the authorization boundary and enforce
  organization and permission scope through their existing RLS/RPC contracts.
- Preserved the dashboard layout, metric labels, alert ordering, click-through
  behavior, and customization preferences. No SQL or backend contract change
  was required.
- Kept the legacy ticket and recent-activity reads explicitly scoped to
  `legacyTickets` and `localActivity`. The live Service Desk ticket DTO does not
  expose the SLA deadline/state used by the dashboard's breach widgets, and no
  live cross-module activity aggregation query exists; replacing either in this
  milestone would change behavior rather than preserve it.
- Added `scripts/qa/production_hardening_dashboard.sh` to reject regressions to
  `data.tasks`/`data.assets`/`data.notes`/`data.trash`, require capability-gated
  live queries and recycle-bin aggregation, verify the existing query contracts,
  and pin the two explicitly deferred local reads.
- No SQL was added or executed. Disposable-database validation is not required
  for this query-only patch beyond the existing module QA, but browser runtime
  validation remains required for loading/error transitions and role-specific
  dashboard counts.

## Milestone 33 - Service Desk Audit Live-Data Integration

- Replaced `/audit` browser-local `data.activity` reads with a bounded,
  newest-first query of the existing append-only `ticket_audit_log` table.
  Filtering, metrics, CSV export, event details, and the default ten-row page
  size remain available without presenting seeded events as production data.
- Added a typed Service Desk audit DTO and read-only data-access/query contract.
  Audit payloads are mapped defensively and converted to concise UI summaries;
  backend error objects are not rendered to users.
- Added explicit loading, generic failure, and retry states. Query failures no
  longer render as an authoritative empty audit log.
- Authorization remains enforced at the data boundary by the existing
  `ticket_audit_log_select_managers` RLS policy, which permits platform admins
  or callers with `tickets.view_all`; the frontend `audit.view` route guard is
  retained as a UX boundary, not treated as the security control.
- Added `scripts/qa/production_hardening_audit.sh` to reject browser-store
  regressions, require the bounded read-only query, pin loading/error handling,
  and assert the existing RLS and grants remain aligned with the frontend.
- No SQL was added or executed. Browser role testing and disposable-database
  RLS verification remain required; the protected live database remains
  untouched.

## Milestone 34 - Repository-Side Pending Migration Promotion Planning

- Added `docs/PENDING_MIGRATION_PROMOTION_PLAN_20260614.md` to freeze the exact
  dependency order for all twelve pending production migrations and pair each
  migration with its transaction-backed QA SQL, frontend consumers, existing
  static QA coverage, and required disposable-database validation.
- Added `scripts/qa/production_hardening_pending_migration_plan.sh`, a read-only
  static guard that verifies the plan, complete SQL/QA manifest, dependency
  order, audit NO-GO reference, live-database refusal language, disposable-only
  approval boundary, and all major dependent modules.
- No pending SQL file was moved into `supabase/migrations/`, and no SQL or
  migration was executed. No database connection was made; the live database
  remains untouched.
- Actual migration promotion and disposable full-chain execution are separate
  later milestones. Disposable database execution requires explicit human
  approval before any database, migration, SQL QA, concurrency, or storage
  validation command is run; disposable success would not authorize a live
  deployment.

## Milestone 35 - Disposable Validation Runner Preparation

- Added `scripts/qa/run_disposable_full_chain_validation.sh` as a guarded,
  preparation-only template for the later disposable full-chain validation.
  It requires explicit disposable target variables, refuses known live
  database names, requires a `disposable` or `staging` name marker, prints the
  complete twelve-migration and twelve-QA-SQL order, and requires a typed
  confirmation phrase.
- The runner exits before every database command. Its migration-apply and QA
  SQL sections are comments only; actual database execution requires a
  separate later milestone with explicit human approval.
- Added `scripts/qa/production_hardening_disposable_runner.sh` to statically
  verify the ordered manifests, refusal and confirmation guards, pre-execution
  exit, inactive command placeholders, and references to the Milestone 34 plan
  and NO-GO audit.
- No database was touched and no migration was executed. The runner is not
  allowed to perform database work in this milestone; actual disposable
  execution remains a separate later approval step.

## Milestone 36 - Disposable Full-Chain Execution Plan Review

- Added `docs/DISPOSABLE_FULL_CHAIN_VALIDATION_RUNBOOK_20260614.md` as the
  human-readable review plan for a later, separately approved disposable-only
  full-chain execution. It records the current NO-GO posture, live-database
  prohibition, exact prerequisites, naming and backup rules, complete ordered
  twelve-migration and twelve-QA-SQL manifests, success and failure handling,
  evidence and cleanup requirements, and the separate live-deployment approval
  boundary.
- Added `scripts/qa/production_hardening_disposable_runbook.sh` to statically
  verify the runbook exists, references the Milestone 35 runner, preserves both
  exact ordered manifests, contains the required safety and authorization
  language, explains both result paths, and is recorded in this status document.
- This milestone performed repository-only documentation and static QA work.
  No database was touched, no SQL or migration was executed, and no disposable
  or live deployment action was authorized.

## Milestone 37 - Disposable Database Preflight Only

- Added `docs/DISPOSABLE_DATABASE_PREFLIGHT_20260614.md` as the operator and
  reviewer preflight gate for any future disposable full-chain execution. It
  records current readiness, completed preparation, remaining work, the
  preflight-only authorization boundary, human approval requirements, target
  naming and live-database refusal checks, secret and backup handling, evidence
  planning, stop conditions, and exact pass/fail criteria.
- Added `scripts/qa/production_hardening_disposable_preflight.sh` as a read-only
  static guard for the required document, Milestone 35 runner and Milestone 36
  runbook references, required refusal and later-milestone statements,
  checklists, status entry, and absence of active `psql`, `docker`, or `sudo`
  command lines in the Milestone 37 artifacts.
- This milestone contacted no database, touched no live DB, created no
  disposable database, and executed no migration or QA SQL. Actual disposable
  execution remains a separate later approval step.

## Milestone 38 - Disposable Execution Commands Preparation Only

- Added `docs/DISPOSABLE_EXECUTION_COMMAND_PLAN_20260614.md` as the exact A-K
  human-review sequence for a later disposable full-chain milestone. It covers
  repository verification, disposable-only variables, target confirmation,
  evidence planning, both ordered twelve-file manifests, and deliberately
  non-runnable database creation, migration, QA, result, and cleanup templates.
- Added `scripts/qa/production_hardening_disposable_command_plan.sh` to verify
  the prior milestone references, all required phases, both ordered manifests,
  inert-command and authorization language, live-database refusal, status entry,
  and absence of active `psql`, `docker`, or `sudo` command lines in the plan.
- Commands are inert documentation/templates only. No database was contacted,
  no live DB was touched, no disposable database was created, no migration or QA
  SQL was executed, and no `psql`, `docker`, or `sudo` command was executed.
  Actual disposable execution remains a separate later approval step.

## Milestone 40 - Ticket Attachments Storage Bucket Compatibility

- Milestone 39 disposable full-chain validation applied 12 of 22 ordered SQL
  files before stopping at
  `supabase/migrations/20260611020000_ticket_attachments.sql`. The disposable
  `storage.buckets` table exposed `id`, `name`, `owner`, `created_at`, and
  `updated_at`, but no `public` column; the migration's unconditional
  `insert into storage.buckets (id, name, public)` therefore failed.
- Replaced that unconditional insert with an idempotent compatibility block
  that checks the storage bucket catalog. When `public` exists, the bucket is
  inserted or updated with `public = false`; when it does not, only `id` and
  `name` are inserted or updated. The bucket id/name and all metadata/path and
  storage-object authorization policies remain unchanged.
- Updated the transaction-backed ticket attachment QA and static guard so they
  do not blindly assume the optional column exists, while still requiring the
  bucket to be private whenever the schema exposes `public` and preserving the
  attachment path and storage policy assertions.
- This patch is repository-only. No disposable or live database was contacted
  or modified, and no migration or QA SQL was executed. Full-chain validation
  must be rerun from a fresh disposable database under separate explicit human
  approval before any promotion or deployment decision.

---

## Milestone 47 — Live Remaining Backend Modules Applied

Status: PASSED.

Date: 2026-06-14.

Branch: `hardening/production-readiness-20260612`.

Latest pushed commit before live application: `7ce34df Fix ticket attachment bucket compatibility`.

### What changed on live DB

The remaining backend modules were applied to the live self-hosted Supabase database after a successful disposable gate:

- IPAM backend
- Tasks backend
- Notes backend
- Protocols backend

The live database final state was verified as:

- `service_desk=true`
- `cmdb=true`
- `ipam=true`
- `tasks=true`
- `notes=true`
- `protocols=true`
- `public_tables=47`
- `auth_users=1`

### Safety gates completed

- Current live DB was backed up before reclassification:
  `/opt/it-knowledge-center/backups/current-live-before-reclassification-20260614_150641`
- Remaining migrations were tested on a disposable DB restored from the current live backup.
- Disposable migration gate passed.
- Live migrations were applied after disposable success.
- Live rollback QA files passed.
- Post-migration live backup was created:
  `/opt/it-knowledge-center/backups/post-remaining-migrations-live-20260614_151452`
- Post-migration system health passed:
  - Supabase containers healthy: 11/11
  - Frontend service: active
  - Frontend local HTTP: 200
  - Supabase gateway local HTTP: 401 expected unauthenticated response

### Important note

The live database was not a clean baseline when Milestone 41 started. It already contained Service Desk, ticket configuration, ticket attachments, notifications, organization foundation, and CMDB tables. Therefore, the workflow was reclassified from “full clean baseline migration” to “current-live-state continuation with protected backups.”

## Milestone 69 — Organization Context Fix + Final Authenticated Smoke Checkpoint

Status: PASSED

Date: 2026-06-14

Production hardening checkpoint after resolving authenticated backend 403 errors.

Confirmed root cause:
- Authenticated user had platform_admin and required permissions.
- Backend RLS policies required `organization_id = current_organization_id()`.
- Live database had zero organizations and zero organization memberships.
- `current_organization_id()` failed with: `Exactly one active organization context is required`.

Live data fix applied:
- Created one active organization:
  - Name: IT Knowledge Center
  - Slug: it-knowledge-center
  - ID: ab83d1a0-2159-4d39-9101-91f6024ece2e
- Created one active organization membership for:
  - User: amar.senaid@gmail.com
  - User ID: a77572fc-e400-453c-aed6-3e64d3b6cbe1

Pre-fix backup:
- `/opt/it-knowledge-center/backups/pre-org-context-fix-20260614_160511`

Post-fix backup:
- `/opt/it-knowledge-center/backups/post-org-context-fix-auth-smoke-pass-20260614_161545`
- SHA256:
  - `18e34fc6f81dcf490806e70bb332e5f0c1af228d646186d587e8af3c9dec4dc5`

Final authenticated browser smoke result:
- Login: PASS
- Routes: 25
- Passed: 25
- Failed: 0
- Console errors: 0
- Tooltip errors: 0
- HTTP errors: 0
- Forbidden errors: 0
- Non-auth HTTP errors: 0
- Unexpected failed requests: 0
- Expected notification HEAD aborts: 26

Final auth smoke summary:
- `/home/mit/itkc_temp_browser_validation_20260614_152822/auth-smoke-v3-results-2026-06-14T16-12-29-716Z/summary.json`

Repository state at checkpoint:
- Branch: `hardening/production-readiness-20260612`
- Commit before this documentation update: `c8d630cccf6e2eed1c8f049303e618b84c194739`

Boundary:
- This milestone documents the completed live organization-context fix.
- No schema changes were made in this milestone.
- No service restart was required.
- Temporary browser automation still exists and should be removed only after the full production validation is finalized.

## Milestone 71 — Runtime Wrapper Static Asset Checkpoint

Status: PASSED

Date: 2026-06-14

Production runtime checkpoint for the external Bun frontend wrapper.

Confirmed:
- systemd service `itkc-frontend` is active.
- Live service runs `/opt/it-knowledge-center/runtime/itkc-frontend-server.mjs`.
- Runtime wrapper checksum:
  - `208e8b05b2c379b0baa8219b01ded010437bc56d77362e8ce19f003279ba1901`
- Wrapper serves `/assets/*` from `/opt/it-knowledge-center/app/dist/client`.
- Wrapper validates path traversal by resolving requested assets under `dist/client`.
- Wrapper returns correct content types for JavaScript and CSS.
- Wrapper returns `Cache-Control: public, max-age=31536000, immutable`.
- Current root HTML referenced 13 assets.
- All referenced assets existed on disk.
- All referenced assets returned HTTP 200.
- Frontend app returned HTTP 200 after asset verification.
- No DB change was made.
- No service restart was made.

Repository hardening action:
- Added repository recovery copy:
  - `ops/runtime/itkc-frontend-server.mjs`
- Added runtime recovery notes:
  - `ops/runtime/README.md`

Reason:
- The live runtime wrapper is outside the repository.
- This checkpoint preserves the production wrapper logic in git so the static asset fix can be restored after server rebuild, accidental deletion, or future deployment migration.

## Milestone 73 — Final Production Checkpoint

Status: PASSED

Date: 2026-06-14

Final production validation checkpoint for the current hardening branch.

Confirmed live state:
- Branch: `hardening/production-readiness-20260612`
- Frontend service: active
- Frontend HTTP status: 200
- Supabase core containers healthy:
  - `supabase-auth`
  - `supabase-db`
  - `supabase-kong`
  - `supabase-rest`
- Repository clean and pushed.
- No DB change was made during the final checkpoint.
- No repo change was made during the final checkpoint.
- No service restart was made during the final checkpoint.

Organization context:
- One active organization exists.
- One active organization membership exists.
- Organization ID: `ab83d1a0-2159-4d39-9101-91f6024ece2e`
- Organization name: `IT Knowledge Center`
- Organization slug: `it-knowledge-center`
- User: `amar.senaid@gmail.com`
- `current_organization_id()` returns the expected organization.
- `is_platform_admin()` returns true.
- `has_permission('cmdb.view')` returns true.

Authenticated UI validation:
- Login: PASS
- Routes checked: 25
- Routes passed: 25
- Routes failed: 0
- Console errors: 0
- Tooltip errors: 0
- Unexpected failed requests: 0
- HTTP errors: 0
- Forbidden errors: 0
- Non-auth HTTP errors: 0
- Expected notification HEAD aborts: 26

Runtime wrapper:
- Live runtime wrapper checksum:
  - `208e8b05b2c379b0baa8219b01ded010437bc56d77362e8ce19f003279ba1901`
- Repository recovery wrapper checksum matches live wrapper.
- Current root assets verified:
  - All referenced assets exist on disk.
  - All referenced assets return HTTP 200.
- Runtime wrapper asset serving is verified.

Backup checkpoint:
- `/opt/it-knowledge-center/backups/post-org-context-fix-auth-smoke-pass-20260614_161545`
- Backup SHA256:
  - `18e34fc6f81dcf490806e70bb332e5f0c1af228d646186d587e8af3c9dec4dc5`

Cleanup:
- Temporary browser automation folder deleted:
  - `/home/mit/itkc_temp_browser_validation_20260614_152822`

Final result:
- FINAL PRODUCTION CHECKPOINT PASSED.
- Authenticated UI smoke: PASSED.
- 403 authorization issue: FIXED.
- Organization context: PRESENT.
- Runtime wrapper asset serving: VERIFIED.
- Post-fix backup: PRESENT.
- Temporary browser automation: DELETED.

## Milestone 74 — Migration Provenance Repair

Date: 2026-06-14 18:34:45

Status: VALIDATED IN DISPOSABLE DATABASE — NOT APPLIED TO LIVE DB IN THIS MILESTONE.

Problem fixed:
- Production SQL files had been validated/applied operationally but remained under `supabase/pending/`.
- This meant a clean repository-only deployment could not prove it recreated the current backend system.

Actions:
- Promoted the twelve production SQL files from `supabase/pending/` to `supabase/migrations/`.
- Kept transaction-backed QA SQL files under `supabase/pending/` as QA-only files.
- Added the required ticket attachment storage grants for authenticated RLS evaluation.
- Added the required CMDB table grants for authenticated RLS evaluation.
- Added the required `auth.uid()` execution grants for CMDB security-invoker trigger execution.
- Updated repository references from pending production SQL paths to authoritative migration paths.

Validation:
- Disposable database was reset from the clean pre-ITKC Supabase baseline.
- Authoritative migrations in `supabase/migrations/` replayed successfully from scratch.
- Pending QA SQL files passed against the disposable database.
- Static production hardening QA scripts passed.
- Live database was not contacted or modified.
- No service restart was performed.

Remaining:
- Commit and push only after the full validation command completes successfully.

## Milestone 75 - Clean Deployment Replay Test

Date: 2026-06-14

Status: BLOCKED - repository gate added; database/schema comparison not executed.

Acceptance assessment:
- All 22 tracked migrations are present in `supabase/migrations/`.
- No production SQL remains hidden under `supabase/pending/`.
- Milestone 74 records a successful clean disposable replay.
- Equivalence with the current live schema is not yet proven because this
  workspace has no PostgreSQL/Supabase CLI tooling and no approved schema-only
  live dump. No database was contacted in this milestone.

Repository changes:
- Added `scripts/qa/verify_clean_deployment_schema_equivalence.sh` to compare
  normalized replay/live schema-only dumps and retain a failure diff.
- Added `scripts/qa/production_hardening_clean_deployment_replay.sh` with pass
  and policy-difference regression cases.
- Added `docs/CLEAN_DEPLOYMENT_REPLAY_TEST_20260614.md` with the exact execution
  and evidence requirements.
- Ignored local `.artifacts/` evidence and temporary replay-test directories.

Release gate:
- Do not claim clean-deployment equivalence or real production readiness until
  an explicitly approved run applies all 22 migrations to a fresh Supabase
  baseline and the schema-equivalence verifier reports `PASS` against a
  schema-only live export.

## Milestone 76 - Clean Deployment Replay Schema Equivalence Executed

Date: 2026-06-14

Status: PASSED.

Acceptance evidence:
- Disposable database was reset from the clean pre-ITKC Supabase baseline.
- All 22 tracked migrations under `supabase/migrations/` replayed successfully.
- Current live database was read only with `pg_dump --schema-only`.
- Replay and live schema-only dumps were compared with `scripts/qa/verify_clean_deployment_schema_equivalence.sh`.
- Initial schema diff contained only internal `TO postgres` owner-role grants.
- After normalizing those internal owner-role grants, the verifier reported `PASS`.
- No missing application tables, functions, policies, or grants were found.
- No hidden production SQL remains under `supabase/pending/`.
- No live database write was performed.
- No service restart was performed.

Evidence directory:
- `/opt/it-knowledge-center/app/.artifacts/clean-deployment-replay/20260614_190728`

## Milestone 77 - Real Admin User Creation

Date: 2026-06-15

Status: IMPLEMENTED - local validation pending.

Implementation:
- Restored the existing Add user drawer with display name, email, initial
  platform role, optional team, and active status fields.
- Added a same-origin TanStack server route that verifies the caller's Supabase
  access token and requires an active `platform_admin` assignment before any write.
- Kept `SUPABASE_SERVICE_ROLE_KEY` in `.server.ts` code and server-only runtime
  configuration; no privileged key is imported by browser code.
- Active accounts are created with `inviteUserByEmail`; inactive accounts are
  created banned and unconfirmed without sending an invite.
- The server creates/updates `public.profiles`, assigns an optional global role,
  and assigns optional team membership. Failed metadata setup triggers auth-user
  cleanup and reports whether manual cleanup is required.
- Added visible drawer errors and refreshed the real Supabase user list after a
  successful creation.

Validation required before commit:
- `scripts/qa/production_hardening_admin_users.sh`
- `bunx tsc --noEmit`
- `bun run build`

Operational notes:
- Deployment must provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only to
  the server runtime. Their values were not inspected during this milestone.
- No database connection, migration, service restart, or live user creation was
  performed.

## M2 — Knowledge Shelves (BookStack-parity top-level)

Status: STAGED ONLY. Migration not applied. Frontend gracefully falls back
to empty shelves/shelfBooks until the migration runs.

Files:
- `supabase/pending/20260618000000_knowledge_shelves.sql` — adds
  `public.knowledge_shelves` and `public.knowledge_shelf_books` (M:N
  shelf↔book junction matching BookStack), grants to authenticated +
  service_role, RLS via `public.has_permission('knowledge.*', team_id)`,
  audit-protection trigger mirroring `knowledge_spaces`.
- `supabase/pending/20260618000000_knowledge_shelves.qa.sql` —
  transaction-rollback harness: RLS-enabled assertions, grant assertions,
  anon-denial assertions, slug/name CHECK assertions, composite-FK
  cross-team-guard assertions, trigger-installed assertion.
- `src/lib/knowledge/backend-types.ts` — new `KbShelf` and `KbShelfBook`
  types; `KnowledgeBackendData` extended with `shelves` and `shelfBooks`.
- `src/lib/knowledge/useKnowledgeBackend.ts` — loads both new tables in
  parallel with existing reads; ignores per-table errors so the workspace
  keeps working before the migration is applied.

Authorization model: identical to existing `knowledge_*` tables — auth-only,
no anon grants, RLS scoped through `has_permission`. Junction inserts/deletes
require `knowledge.update` on the owning team.

Validation required before commit:
- Apply `supabase/pending/20260618000000_knowledge_shelves.sql` to a
  disposable database.
- Run `supabase/pending/20260618000000_knowledge_shelves.qa.sql` against the
  same disposable database; the transaction must reach `rollback` with no
  assertion failures.
- `bunx tsc --noEmit`
- `bun run build`

Operational notes:
- No database connection, migration, or service restart was performed.
- UI for shelves (overview pane, shelf CRUD dialogs, book↔shelf assignment)
  is deferred to M2.5 so the workspace stays usable before the migration
  is applied.

## Milestone 78 - Live Database Role Permission Matrix

Date: 2026-06-20

Status: IMPLEMENTED - LOCAL BUILD AND STATIC VALIDATION PASSED; RESTART BLOCKED.

Implementation:
- Replaced the static role-list and capability-matrix displays on
  `/admin/roles` with authenticated reads from `roles`, `permissions`, and
  `role_permissions`.
- Added a same-origin server route that validates UUID inputs and the requested
  grant/revoke action, verifies an active caller with a real global
  `platform_admin` assignment, and performs the narrowly requested mapping
  write with the server-only service-role client.
- Made all Platform Administrator permission cells read-only in the UI and
  rejected every `platform_admin` revoke on the server to prevent lockout.
- Kept `PAGE_VISIBILITY`, `AppSidebar`, `AuthGate`, and the static role-preview
  authorization fallback unchanged.
- Added loading, retry, per-cell saving, disabled, and sanitized mutation-error
  states without optimistic authorization changes.

Validation:
- `bunx tsc --noEmit`: passed.
- Focused ESLint on the touched TypeScript files: passed.
- `scripts/qa/production_hardening_admin_roles.sh`: passed.
- `npm run build`: unavailable because this VPS has no `npm` executable.
- Equivalent repository build `bun run build` (`vite build`): passed for client
  and SSR output.
- `sudo systemctl restart itkc-frontend`: not performed because sudo required
  an interactive password.
- Existing local service returned HTTP 200 for `/admin/roles` and
  `/admin/users`; these responses do not prove the new build was restarted.
- Public-IP `/admin/roles` returned HTTP 200 on a bounded no-proxy retry.

Operational notes:
- No migration or database schema change is part of this milestone.
- Role metadata editing and live page visibility remain deferred.

## Milestone 79 - Live Role Display Metadata Editing

Date: 2026-06-20

Status: IMPLEMENTED - LOCAL BUILD AND STATIC VALIDATION PASSED; RESTART BLOCKED.

Implementation:
- Added a protected PATCH contract on `/api/admin-roles` for updating only a
  role's display `name` and nullable `description`.
- The server validates the access token, active profile, real global
  `platform_admin` assignment, role UUID, trimmed non-empty name, and bounded
  description before using the server-only service-role client.
- Added a role-list edit dialog with save, cancel, saving, and sanitized error
  states. Successful saves invalidate and refetch the admin roles query without
  an optimistic metadata update.
- Exposed role ID, role key, scope, and system-role status as read-only identity
  metadata. No API or UI path edits role key, role scope, system status, or ID.
- Added no role create/delete behavior and no migration.
- Permission management remains unchanged from Milestone 78. Static page
  visibility, `AppSidebar`, `AuthGate`, and role preview remain unchanged.

Validation:
- `scripts/qa/production_hardening_admin_roles.sh`: passed.
- `git diff --check`: passed.
- `bunx tsc --noEmit`: passed.
- Focused ESLint on touched TypeScript files: passed.
- `npm run build`: unavailable because this VPS has no `npm` executable.
- Equivalent repository build `bun run build` (`vite build`): passed for client
  and SSR output.
- `sudo systemctl restart itkc-frontend`: not performed because sudo required
  an interactive password.
- Existing local service returned HTTP 200 for `/admin/roles` and
  `/admin/users`; public nginx returned HTTP 200 for `/admin/roles`. These
  responses confirm availability but do not prove the new build was restarted.

Operational notes:
- Page-visibility database modeling and editing remain deferred.

## Milestone 80 - Page Visibility Database Model Prepared

Date: 2026-06-20

Status: STAGED ONLY - NOT APPLIED TO LIVE DATABASE.

Implementation:
- Added a pending `role_page_visibility` migration with one explicit boolean
  row for every current static route and managed platform role combination.
- Mapped frontend `super_admin` to DB `platform_admin`, frontend `auditor` to
  DB `platform_auditor`, and matching frontend/DB role keys directly.
- Added structural route validation, platform-scope enforcement, employee
  administration denial, and protected Platform Administrator access to
  `/admin/roles` at the database trigger boundary.
- Enabled RLS and restricted direct privileges: anon has no access,
  authenticated receives SELECT only, and service_role receives only SELECT,
  INSERT, and UPDATE. DELETE is not an operational mutation path.
- Added a transaction-backed disposable-database QA script covering grants,
  RLS, complete seed equivalence, constraints, protection triggers, and the
  no-DELETE model.
- Frontend code remains unchanged and continues using static
  `PAGE_VISIBILITY` exclusively.

Validation:
- Static SQL and repository-scope checks completed locally.
- Migration and QA were not executed because no disposable database run was
  approved in this milestone.

Next gate:
- Apply the staged migration to a disposable database and run the QA file to
  rollback completion before considering live migration approval.

Operational notes:
- The live database was not contacted or modified.
- No frontend build or service restart was required or performed.

## Milestone 81 - Live Page Visibility Read-only Display

Date: 2026-06-20

Status: IMPLEMENTED - LOCAL BUILD AND STATIC VALIDATION PASSED.

Implementation:
- Added a separate authenticated SELECT query for
  `public.role_page_visibility`, including role ID, route path, visibility, and
  joined role key for deterministic display ordering.
- Updated only the `/admin/roles` Page visibility tab to display the live DB
  matrix as check/X indicators with DB platform-role columns.
- Added no page-visibility inputs, toggles, mutations, or API write contracts.
- A query failure or empty result displays a safe error and keeps the static
  page-visibility matrix visible as fallback.
- `AuthGate`, `AppSidebar`, and static `PAGE_VISIBILITY` enforcement remain
  unchanged. Live rows are display-only and do not influence routing.

Validation:
- `scripts/qa/production_hardening_admin_roles.sh`: passed.
- `git diff --check`: passed.
- `bunx tsc --noEmit`: passed.
- Focused ESLint on touched TypeScript files: passed.
- `bun run build`: passed for client and SSR output.

Next gate:
- Plan either editable page-visibility UI or live enforcement as one isolated
  milestone. Do not combine both changes.

Operational notes:
- The database was not modified in this milestone.
- No migration, service restart, commit, or push was performed.

## Milestone 82 - Live Page Visibility Editing

Date: 2026-06-20

Status: IMPLEMENTED - LOCAL BUILD AND STATIC VALIDATION PASSED.

Implementation:
- Added a dedicated same-origin PATCH endpoint for updates to existing
  `role_page_visibility` rows.
- The server validates the Bearer token, active caller profile, real global
  `platform_admin` assignment, role UUID, route structure, boolean value,
  existing target row, and platform role scope.
- The only table update fields are `can_view` and `updated_by`. The endpoint
  contains no insert, delete, upsert, role-ID update, or route-path update.
- Repeated self-lockout protection server-side and in the UI: Platform
  Administrator cannot lose `/admin/roles`, and Employee cannot gain any
  `/admin/*` route.
- Added pessimistic matrix checkboxes for active platform administrators with
  saving, disabled, protected-cell, and sanitized error states. Other users
  retain the read-only matrix.
- Successful writes invalidate and refetch only the page-visibility query.
- No route enforcement changed. `AuthGate`, `AppSidebar`, and static
  `PAGE_VISIBILITY` continue controlling routing and sidebar visibility.

Validation:
- `scripts/qa/production_hardening_admin_roles.sh` passed.
- `git diff --check` passed.
- `bunx tsc --noEmit` passed.
- Focused ESLint checks for the touched TypeScript/TSX files passed.
- `bun run build` passed.

Next gate:
- Plan the live-enforcement read path and validation/fallback behavior as a
  separate milestone. Do not combine enforcement with further editing work.

Operational notes:
- No schema change or migration is part of this milestone.
- No service restart, commit, or push was performed.

## Milestone 84 - Page Visibility Recovery-route Guardrails

Date: 2026-06-20

Status: IMPLEMENTED - LOCAL BUILD AND STATIC VALIDATION PASSED.

Implementation:
- Added server-side protection preventing `/` from being disabled for every
  managed non-employee platform role.
- Added server-side protection preventing `/my-requests` from being disabled
  for Employee.
- Mirrored these recovery-route protections as disabled cells in the live page
  visibility matrix with an explicit recovery-destination tooltip.
- Retained the existing Platform Administrator `/admin/roles` lockout guard
  and Employee `/admin/*` grant prohibition.
- These rules preserve the static redirect destinations needed before any
  future DB-backed route enforcement can be reconsidered.
- DB-backed AuthGate and AppSidebar enforcement was not re-enabled. Static
  `PAGE_VISIBILITY` remains the active route and navigation authority.

Validation:
- `scripts/qa/production_hardening_admin_roles.sh` passed.
- `git diff --check` passed.
- `bunx tsc --noEmit` passed.
- Focused ESLint for changed TypeScript/TSX files passed.
- `bun run build` passed for client and SSR output.

Next gate:
- Perform authenticated browser validation of safe page-visibility edits and
  every protected recovery cell before planning any enforcement work.

Operational notes:
- No database schema or migration change is part of this milestone.
- No live database write, service restart, commit, or push was performed.

## Milestone 85 - Page Visibility Matrix UI Clarity

Date: 2026-06-20

Status: IMPLEMENTED - LOCAL BUILD AND STATIC VALIDATION PASSED.

Implementation:
- Improved only the `/admin/roles` page-visibility presentation with readable,
  unique role labels and full role-name tooltips.
- Added sticky route and header cells, clearer route labels and paths, stronger
  spacing and contrast, aligned visibility controls, and bounded scrolling.
- Added a client-side route label/path filter without changing the backend
  query or mutation contracts.
- Added a legend for visible, hidden, protected, and saving states and clarified
  every protected-cell tooltip and the static-routing warning.
- Editable and protected cell behavior, saving/error states, query invalidation,
  and the static fallback remain unchanged.
- This milestone is UI only. It enables no DB-backed route or sidebar
  enforcement; static `PAGE_VISIBILITY` remains authoritative.

Validation:
- `scripts/qa/production_hardening_admin_roles.sh` passed.
- `git diff --check` passed.
- `bunx tsc --noEmit` passed.
- Focused ESLint on the changed TSX file passed.
- `bun run build` passed for client and SSR output during normal SSH validation.
- Browser validation confirmed the site loads after frontend restart and hard refresh.

Next gate:
- Manually validate the improved matrix UI in an authenticated browser,
  including horizontal/vertical scrolling, route filtering, protected-cell
  tooltips, safe edits, saving feedback, errors, and static fallback display.

Operational notes:
- No database schema or migration change is part of this milestone.
- The live database was not contacted or written.
- No service restart, commit, or push was performed.

## Milestone 86 - Page Visibility Recovery Invariants at the Data Boundary

Date: 2026-06-22

Status: STAGED ONLY - NOT APPLIED TO LIVE DATABASE.

Implementation:
- Confirmed that the page-visibility API protected required recovery routes,
  but the staged database trigger protected only Platform Administrator access
  to `/admin/roles` and Employee denial on `/admin/*`.
- Hardened the clean-deployment trigger and added an additive pending migration
  for databases where the base page-visibility migration was already applied.
- Database invariants now reject disabling, moving, or deleting `/` for every
  managed non-employee platform role and `/my-requests` for Employee.
- Added rollback-only SQL QA that exercises all protected role/route pairs and
  extended static admin-role QA assertions for the migration and QA contract.

Validation:
- Static repository QA only. No SQL was executed against any database.

Next gate:
- Review and apply the page-visibility migrations in order to a disposable
  database, then execute both matching QA files and confirm they roll back.
- If the base migration is already live, review and apply only the additive
  `20260622000000_harden_role_page_visibility_recovery.sql` migration after the
  disposable rehearsal.

Operational notes:
- DB-backed route enforcement remains disabled; static routing remains active.
- No live database write, service restart, commit, push, or deployment occurred.

## Milestone 87 - Page Visibility Enforcement Status Clarity

Date: 2026-06-22

Status: IMPLEMENTED - LOCAL VALIDATION PASSED.

Implementation:
- Confirmed that `/admin/roles` saves page-visibility edits to the backend
  `role_page_visibility` table, but `AppSidebar`, `AuthGate`, and
  `CommandPalette` continue to enforce static `PAGE_VISIBILITY` rules.
- Confirmed that static `/notes` visibility excludes frontend role `employee`.
- Confirmed that the database role key is `employee`; “Employee / Requester” is
  its display label. No `requester` or `normal_user` role mapping is involved.
- Confirmed that Notes data access separately requires backend permission
  `notes.view` or `notes.manage`; Employee is intentionally seeded with neither.
- Replaced incorrect “DB-enforced” UI claims with a prominent warning that the
  stored matrix is not active routing and cannot grant backend permissions or
  bypass RLS.
- Did not add Notes to requester navigation, grant Notes data access, or enable
  DB-backed routing. Those changes require a separate product and security
  milestone because Notes are organization-wide internal content.

Validation:
- `scripts/qa/production_hardening_admin_roles.sh`: passed.
- `bunx tsc --noEmit`: passed.
- `bun run build`: passed for client and SSR output.
- `git diff --check`: passed.

Blocked follow-up:
- A future DB-backed visibility milestone must define authenticated loading,
  fail-closed behavior, multi-role resolution, cache/session transitions, and
  consistency across all three consumers before replacing static enforcement.
- Requester Notes access additionally requires an explicit data-scope decision
  and reviewed `role_permissions`/RLS changes; page visibility alone is
  insufficient.

Operational notes:
- No database connection, migration execution, live-data change, restart,
  deployment, commit, or push occurred.

## Milestone 4E - Safe Frontend Deployment

Date: 2026-06-21

Status: IMPLEMENTED - SHELL SYNTAX VALIDATION PASSED; NOT EXECUTED.

Implementation:
- Added `scripts/ops/deploy_frontend_safe.sh` to require the expected repository,
  clean `main` checkout, exact `origin/main` commit, and absence of prohibited
  Lovable files before deployment.
- Added the existing admin-role QA, Git diff, TypeScript, and production build
  gates.
- Made the frontend restart the immediate next command after a successful build.
- Added post-restart service, local route, public route, and local HTML asset
  checks. Every referenced JavaScript and CSS asset must exist under
  `dist/client`.
- Documented the required workflow and asset-mismatch failure mode in
  `docs/production-deployment.md`.

Validation:
- `bash -n scripts/ops/deploy_frontend_safe.sh` passed.
- The deployment script was intentionally not executed.

Operational notes:
- No database, migration, Supabase, authentication, authorization, backend API,
  permission, or Lovable file was changed.
- No build, service restart, commit, pull, or push was performed.

## Milestone 4E.1 - Safe Deployment Asset Extraction Fix

Date: 2026-06-21

Status: IMPLEMENTED - LOCAL VALIDATION PENDING.

Reason:
- The first execution of `scripts/ops/deploy_frontend_safe.sh` successfully built
  the frontend, restarted `itkc-frontend`, and verified local and public routes.
- The final asset-reference check failed because `grep` treated the downloaded
  HTML response as binary and did not emit the matched `/assets/*.js` and
  `/assets/*.css` paths.

Fix:
- Updated the asset extraction command from `grep -Eo` to `grep -aEo` so the
  HTML response is always processed as text.

Operational notes:
- No database, migration, Supabase, authentication, authorization, backend API,
  permission, or Lovable file was changed.
- No build, service restart, commit, pull, or push was performed by this fix step.

## Milestone 88 - Backend-driven Effective Access (Staged)

Date: 2026-06-22

Status: SOURCE AND PENDING MIGRATION IMPLEMENTED; NOT APPLIED OR DEPLOYED.

Problem confirmed:
- `/admin/roles` persisted permission grants to `role_permissions` and visibility
  booleans to `role_page_visibility`, but authenticated routing still evaluated
  frontend role arrays in `PAGE_VISIBILITY` through `canSeePage`.
- The static consumers were `AuthGate`, `AppSidebar`, `CommandPalette`, and the
  dashboard route's conditional links. The Roles page also used the static
  matrix for preview/comparison. `permissions.tsx` defined `PAGE_VISIBILITY`,
  `pageVisibilityFor`, `hasPageVisibilityRule`, and `canSeePage`.
- Consequently a successful visibility save changed a database row but did not
  change route guards or navigation. Permission saves did affect RLS/RPC checks
  that use `has_permission`, but did not affect the static frontend capability
  or route matrices.

Staged architecture:
- Added pending `public.get_my_effective_access()` returning one JSON object with
  effective global/team role keys, effective permission keys, visible route
  patterns, a protected recovery route, and the platform-admin flag.
- The RPC derives state from `profiles`, `roles`, `permissions`,
  `role_permissions`, `role_page_visibility`, `user_global_roles`,
  `team_members`, and `team_member_roles`. Existing data-boundary helpers remain
  `is_platform_admin`, `has_permission`, `has_team_role`, and `is_team_member`.
- `AuthProvider` validates the RPC response and exposes `effectiveAccess`.
  Missing, malformed, inactive-account, or RPC-error states remain null and
  therefore fail closed. Token refresh calls reload the snapshot.
- `ROUTE_REQUIREMENTS` is the single code-reviewed mapping from a route pattern
  to existing backend permission keys or a documented self-scoped contract.
  `canAccessRoute` requires both a saved visible route and its backend contract.
  Unknown routes and routes marked `missing` deny by default.
- `AuthGate`, `AppSidebar`, `CommandPalette`, and dashboard conditional links now
  consume this shared decision. Static `PAGE_VISIBILITY` remains only for the
  Roles comparison/preview display and is not authenticated enforcement.

Route/backend contract audit:
- Knowledge/dashboard/search use `knowledge.read`; knowledge tables and storage
  are protected by RLS using `has_permission` and article visibility helpers.
- Ticket queue uses `tickets.view_all`; ticket detail and My Requests are
  self-scoped, with ticket RLS/RPC ownership checks remaining authoritative.
- Catalog requests use `catalog.request`; notifications use
  `notifications.view_own` plus owner-scoped RLS.
- CMDB, IPAM, Tasks, Notes, and Protocols use their existing `*.view` or
  `*.manage` keys. Their RLS and write RPCs check `has_permission`.
- Audit and Reports use existing `audit.view`/`platform.view_audit` and
  `reports.view` keys. Admin Users, Teams, and Roles remain restricted to
  `platform_admin`, matching their current server mutation APIs; the broader
  catalog permissions are not treated as an authorization bypass. Ticket
  administration uses `tickets.config`.
- Templates, admin catalog management, recycle bin/trash, and Settings have no
  defensible dedicated backend permission contract yet. They are explicitly
  marked missing and fail closed even if visibility is checked.

Roles-page behavior:
- Permission, metadata, and visibility writes remain in authenticated,
  platform-admin-only server APIs using the service credential server-side.
- Every successful write now explicitly refetches active role queries before a
  success toast. Rejected and failed writes continue to show errors and never
  show fake success.
- Visibility cells warn when visibility is enabled without the required backend
  permission, or when a backend permission is granted while visibility is off.
  Missing backend route contracts are shown as blocked warnings.
- The UI states that the runtime source and pending migration must be released
  together and that existing sessions need an access refresh afterward.

Pending database files:
- `supabase/pending/20260622010000_effective_access_rpc.sql`
- `supabase/pending/20260622010000_effective_access_rpc.qa.sql`

Disposable rehearsal order:
1. Restore a production-shaped schema into an isolated disposable Supabase DB.
2. Apply pending page-visibility migrations in timestamp order, then apply the
   effective-access RPC migration.
3. Run the paired SQL QA inside the disposable DB and test active/inactive users,
   additive global roles, active/suspended team roles, permission revocation,
   visibility toggles, unknown routes, and protected recovery routes.
4. Run both static QA scripts, TypeScript, and the production build.
5. Release the reviewed database migration before or atomically with frontend
   source. Deploying this frontend without the RPC intentionally fails closed.

Operational notes:
- No SQL was executed and no database connection was made.
- No live migration, live data write, deployment, restart, commit, or push
  occurred.

## Milestone 89 - Roles and Permissions Effective-access UX

Date: 2026-06-22

Status: IMPLEMENTED AND LOCALLY VALIDATED.

- Reframed the Roles page around the active two-gate access model: stored page
  visibility controls navigation and route exposure, while backend permissions
  and RLS remain authoritative for data and actions.
- Added session-refresh guidance and explicit, non-color-only labels for
  visible-and-allowed, visibility/permission mismatch, protected recovery route,
  and missing backend-contract states.
- Improved matrix scanning with legends, sensitive-permission warnings, sticky
  headers, keyboard-focusable scroll regions, and narrow-screen guidance.
- Rebuilt Role Preview to combine live database grants and stored visibility.
  Blocked, hidden, and missing-contract routes are no longer presented as
  accessible. Static preview data is identified as non-authoritative fallback.
- Preserved mutations, query refetch behavior, protected cells, route guards,
  authorization rules, effective-access consumers, and backend APIs.

Operational notes:
- No database, SQL, migration, Supabase pending file, authorization, route-guard,
  backend API, deployment, service restart, commit, or push operation was performed.

## Milestone 90 - Service Navigation Removal

Date: 2026-06-22

Status: IMPLEMENTED AND LOCALLY VALIDATED.

- Removed Service Catalog and Notifications from the left sidebar for every
  role.
- Removed the same destinations from Command Palette navigation and recent-item
  resolution.
- Preserved both routes, backend-driven effective access, route guards,
  authorization, RLS, database permissions, and backend behavior.
- Added static frontend authorization QA assertions that prevent either route
  from returning to these navigation surfaces.

Operational notes:
- No database, SQL, migration, Supabase pending file, authorization, route-guard,
  backend API, deployment, service restart, commit, or push operation was performed.

## Milestone 91 - Documents Knowledge Center UX Hardening

Date: 2026-06-22

Status: IMPLEMENTED AND LOCALLY VALIDATED.

- Added a clear Knowledge Center header with active-team context, backend-driven
  read-only state, permission-resolution failure messaging, quick actions, and a
  prominent article search with live result counts.
- Added explicit multi-team selection instead of silently leaving users on the
  first accessible team, while preserving the existing team-scoped backend hook
  and permission checks.
- Improved library filters with an accessible archived toggle, automatic archived
  visibility for the Archived status, clear-filter actions, and a real no-results
  state. Articles under archived spaces or categories no longer inflate visible
  search results.
- Corrected the overview metric that labeled archived content as drafts, removed
  a Preview button that had no effect, improved light-theme status contrast, and
  replaced route error detail exposure with safe recovery copy. Fixed a
  conditional React hook that could break after creating the first space.
- Preserved existing knowledge CRUD, review workflow, revision, attachment,
  audit, route guard, RBAC, RLS, and effective-access behavior.

Operational notes:
- No database, SQL, migration, Supabase pending file, authorization, route-guard,
  backend API, deployment, service restart, commit, or push operation was performed.

## Milestone 92 - Dashboard Command Center UX Hardening

Date: 2026-06-24

Status: IMPLEMENTED AND LOCALLY VALIDATED.

- Reframed the Dashboard as an operational command center with workspace
  context, live/partial/refreshing status, an explicit refresh action, and
  stronger source-of-truth labeling for live backend data versus browser-local
  previews.
- Expanded Attention Required and My Work to surface live task and protocol
  urgency where data exists, while preserving honest placeholders for
  unavailable or unwired data.
- Added a permission-aware Platform Snapshot that links only to existing routes
  and labels each module as live backend, browser-local preview, unavailable, or
  count-not-wired.
- Improved Quick Actions, recent activity empty state, and module cards without
  changing backend contracts, route guards, RBAC, RLS, schema, migrations, or
  package metadata.

Operational notes:
- No database, SQL, migration, Supabase pending file, authorization, route-guard,
  backend API, commit, push, branch, package, or generated route-tree operation
  was performed.
