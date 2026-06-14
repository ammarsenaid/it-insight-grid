# Production Hardening Status

Last updated: 2026-06-13

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
- Active milestone: none; repository-side review phase completed.
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

- `supabase/pending/20260611000000_service_desk_foundation.sql`
- `supabase/pending/20260611000000_service_desk_foundation.qa.sql`
- `src/lib/service-desk/tickets.ts`
- `scripts/qa/production_hardening_ticket_creation.sh`

Milestone 14 implementation:

- `supabase/pending/20260611000000_service_desk_foundation.sql`
- `supabase/pending/20260611000000_service_desk_foundation.qa.sql`
- `supabase/pending/20260611010000_service_desk_rbac_expand.qa.sql`

Milestone 15 implementation:

- `supabase/pending/20260611000000_service_desk_foundation.sql`
- `supabase/pending/20260611000000_service_desk_foundation.qa.sql`
- `scripts/qa/production_hardening_catalog_request.sh`

Milestone 16 implementation:

- `supabase/pending/20260611050000_notifications.sql`
- `supabase/pending/20260611050000_notifications.qa.sql`
- `scripts/qa/production_hardening_notifications.sh`

Milestone 17 implementation:

- `supabase/pending/20260611020000_ticket_attachments.sql`
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
- `supabase/pending/20260611010000_service_desk_rbac_expand.sql`
- `supabase/pending/20260611010000_service_desk_rbac_expand.qa.sql`
- `scripts/qa/production_hardening_frontend_auth.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 22 implementation:

- `src/lib/service-desk/profiles.ts`
- `supabase/pending/20260611010000_service_desk_rbac_expand.sql`
- `supabase/pending/20260611010000_service_desk_rbac_expand.qa.sql`
- `scripts/qa/production_hardening_service_desk_profiles.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

Milestone 23 implementation:

- `src/lib/permissions.tsx`
- `src/routes/admin.templates.tsx`
- `supabase/pending/20260611030000_ticket_configuration.sql`
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
- `supabase/pending/20260613000000_cmdb_backend.sql`
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
- `supabase/pending/20260613010000_ipam_backend.sql`
- `supabase/pending/20260613010000_ipam_backend.qa.sql`
- `scripts/qa/production_hardening_ipam.sh`
- `scripts/qa/production_hardening_csv.sh`
- `scripts/qa/production_hardening_ipam_concurrency.sh`
- `scripts/qa/production_hardening_frontend_auth.sh`
- `docs/PRODUCTION_HARDENING_STATUS.md`

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

- Replaced the Protocols list and run-detail routes' reads and writes with
  typed Supabase and TanStack Query contracts (`src/lib/protocols/types.ts`,
  `src/lib/protocols/protocols.ts`, `src/lib/protocols/queries.ts`); the
  browser-local `src/lib/protocols/store.ts` is no longer imported or
  authoritative.
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
