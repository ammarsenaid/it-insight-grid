# Pending Migration Promotion Plan - 2026-06-14

## Decision and safety boundary

The full-system audit in `docs/FULL_SYSTEM_PRODUCTION_AUDIT_20260614.md`
records a **NO-GO for production deployment as of 2026-06-14**. This plan is
repository-side preparation only. No migration was executed, no database was
connected to, and the live database remains untouched.

**NEVER run any file under `supabase/pending/` against the live database before
an explicitly approved deployment change and human review.** Do not copy or
move these files into `supabase/migrations/`, apply them, run their QA SQL, or
invoke any database orchestration as part of this milestone.

**Disposable database only.** Future execution requires a separate
milestone plus explicit human approval. That later validation must start from a
fresh isolated database, apply the complete approved chain, run transaction QA,
capture results, and destroy only the disposable environment. Static review in
this milestone is not evidence that the SQL applies successfully.

## Immutable dependency order

The production SQL files must be reviewed and, in a later milestone, promoted
without semantic edits in exactly this order. Every production SQL file has a
matching pending transaction-backed QA SQL file. All twelve require disposable
database validation because static inspection cannot prove SQL syntax,
cross-migration references, triggers, RLS behavior, grants, or rollback safety.

### 1. Service Desk foundation

- Production SQL: `supabase/migrations/20260611000000_service_desk_foundation.sql`
- QA SQL: `supabase/pending/20260611000000_service_desk_foundation.qa.sql`
- Dependency reason: first pending migration; it builds on the already-applied
  identity/RBAC foundation and creates the ticket, catalog, comment, status,
  and audit objects required by later Service Desk migrations.
- Frontend modules: Tickets (`src/lib/service-desk/tickets.ts`, comments and
  ticket routes), Catalog (`src/lib/service-desk/catalog.ts` and catalog
  routes), and Audit (`src/lib/service-desk/audit.ts`, `src/routes/audit.tsx`).
- Static QA: `scripts/qa/production_hardening_ticket_creation.sh`,
  `scripts/qa/production_hardening_ticket_updates.sh`,
  `scripts/qa/production_hardening_catalog_request.sh`, and
  `scripts/qa/production_hardening_audit.sh`.
- Disposable DB validation required: yes; execute the matching QA SQL only in
  the separately approved disposable full-chain run.

### 2. Service Desk RBAC/profile helpers

- Production SQL: `supabase/migrations/20260611010000_service_desk_rbac_expand.sql`
- QA SQL: `supabase/pending/20260611010000_service_desk_rbac_expand.qa.sql`
- Dependency reason: follows the Service Desk roles and permissions introduced
  by step 1, then adds the permission catalog and profile-directory helper used
  by attachments, configuration, notifications, and all operations modules.
- Frontend modules: Tickets assignment/profile selectors and the capability
  matrix used by Catalog, Notifications, CMDB, IPAM, Tasks, Notes, Protocols,
  Recycle Bin, and Audit.
- Static QA: `scripts/qa/production_hardening_service_desk_profiles.sh` plus
  the module-specific static QA scripts named in later steps.
- Disposable DB validation required: yes.

### 3. Ticket attachments

- Production SQL: `supabase/migrations/20260611020000_ticket_attachments.sql`
- QA SQL: `supabase/pending/20260611020000_ticket_attachments.qa.sql`
- Dependency reason: directly references step 1 ticket/comment objects and
  visibility helpers, and step 2 attachment permissions. It must follow both.
- Frontend modules: Tickets attachment upload, download, and deletion through
  `src/lib/service-desk/attachments.ts` and ticket detail routes.
- Static QA: `scripts/qa/production_hardening_ticket_attachments.sh`.
- Disposable DB validation required: yes, including later isolated storage
  policy validation; never test the bucket or policies against live storage.

### 4. Ticket configuration

- Production SQL: `supabase/migrations/20260611030000_ticket_configuration.sql`
- QA SQL: `supabase/pending/20260611030000_ticket_configuration.qa.sql`
- Dependency reason: uses step 1 Service Desk helpers and the step 2
  `tickets.config`/role mappings; it follows attachments to preserve the fixed
  reviewed Service Desk batch order.
- Frontend modules: Tickets configuration and Catalog administration through
  `src/lib/service-desk/settings.ts`, `src/routes/admin.ticket-settings.tsx`,
  and related administration routes.
- Static QA: `scripts/qa/production_hardening_ticket_configuration.sh`.
- Disposable DB validation required: yes.

### 5. Ticket assignments

- Production SQL: `supabase/migrations/20260611040000_ticket_assignments.sql`
- QA SQL: `supabase/pending/20260611040000_ticket_assignments.qa.sql`
- Dependency reason: records changes to the step 1 `tickets` table and relies
  on its ticket visibility helper; it follows the earlier Service Desk batches
  before notifications install assignment-change triggers.
- Frontend modules: Tickets assignment history via
  `src/lib/service-desk/tickets.ts` and ticket detail routes.
- Static QA: `scripts/qa/production_hardening_ticket_updates.sh`; assignment
  trigger behavior is specifically covered by the matching QA SQL.
- Disposable DB validation required: yes.

### 6. Notifications

- Production SQL: `supabase/migrations/20260611050000_notifications.sql`
- QA SQL: `supabase/pending/20260611050000_notifications.qa.sql`
- Dependency reason: consumes step 1 ticket/comment/status objects, step 2
  notification permissions, and step 5 assignment history/events. It closes
  the ordered Service Desk batch before tenant-scoped operations begin.
- Frontend modules: Notifications (`src/lib/service-desk/notifications.ts` and
  `src/routes/notifications.tsx`) and Tickets notification side effects.
- Static QA: `scripts/qa/production_hardening_notifications.sh` and
  `scripts/qa/production_hardening_ticket_updates.sh`.
- Disposable DB validation required: yes.

### 7. Organization foundation

- Production SQL: `supabase/migrations/20260612235900_organization_foundation.sql`
- QA SQL: `supabase/pending/20260612235900_organization_foundation.qa.sql`
- Dependency reason: follows the complete Service Desk/RBAC batch and uses the
  applied profile identity model. It establishes the tenant boundary that every
  subsequent operations migration references.
- Frontend modules: Organization context underlying CMDB, IPAM, Tasks, Notes,
  Protocols, Recycle Bin, dashboard, and search data access.
- Static QA: `scripts/qa/production_hardening_cmdb.sh`, which asserts both the
  organization foundation and its QA contract.
- Disposable DB validation required: yes.

### 8. CMDB

- Production SQL: `supabase/migrations/20260613000000_cmdb_backend.sql`
- QA SQL: `supabase/pending/20260613000000_cmdb_backend.qa.sql`
- Dependency reason: directly requires step 2 CMDB permissions and step 7
  organization membership/context helpers. It supplies asset identifiers used
  by the following IPAM migration.
- Frontend modules: CMDB (`src/lib/cmdb/`, `src/routes/cmdb.tsx`), dashboard,
  search, and the CMDB portion of Recycle Bin.
- Static QA: `scripts/qa/production_hardening_cmdb.sh` and
  `scripts/qa/production_hardening_recycle_bin.sh`.
- Disposable DB validation required: yes.

### 9. IPAM

- Production SQL: `supabase/migrations/20260613010000_ipam_backend.sql`
- QA SQL: `supabase/pending/20260613010000_ipam_backend.qa.sql`
- Dependency reason: directly requires step 7 organization helpers, step 8
  CMDB assets for organization-bound asset links, and step 2 IPAM permissions.
- Frontend modules: IPAM (`src/lib/ipam/`, `src/routes/ipam.tsx`), dashboard,
  search, CMDB links, and the IPAM portion of Recycle Bin.
- Static QA: `scripts/qa/production_hardening_ipam.sh`,
  `scripts/qa/production_hardening_ipam_concurrency.sh`, and
  `scripts/qa/production_hardening_recycle_bin.sh`.
- Disposable DB validation required: yes, including separately approved real
  concurrency validation; the static concurrency guard does not open a DB.

### 10. Tasks

- Production SQL: `supabase/migrations/20260614000000_tasks_backend.sql`
- QA SQL: `supabase/pending/20260614000000_tasks_backend.qa.sql`
- Dependency reason: directly requires step 7 organization helpers and step 2
  task permissions. It follows CMDB/IPAM in the immutable operations order and
  provides task contracts referenced by later cross-module Protocol workflows.
- Frontend modules: Tasks (`src/lib/tasks/`, `src/routes/tasks.tsx`), dashboard,
  search, Notes/Protocols links, and the Tasks portion of Recycle Bin.
- Static QA: `scripts/qa/production_hardening_tasks.sh` and
  `scripts/qa/production_hardening_recycle_bin.sh`.
- Disposable DB validation required: yes.

### 11. Notes

- Production SQL: `supabase/migrations/20260615000000_notes_backend.sql`
- QA SQL: `supabase/pending/20260615000000_notes_backend.qa.sql`
- Dependency reason: directly requires step 7 organization helpers and step 2
  note permissions. It follows Tasks to preserve reviewed cross-module link and
  conversion ordering before Protocols is introduced.
- Frontend modules: Notes (`src/lib/notes/`, `src/routes/notes.tsx`), dashboard,
  search, Task conversion/link flows, and the Notes portion of Recycle Bin.
- Static QA: `scripts/qa/production_hardening_notes.sh` and
  `scripts/qa/production_hardening_recycle_bin.sh`.
- Disposable DB validation required: yes.

### 12. Protocols

- Production SQL: `supabase/migrations/20260616000000_protocols_backend.sql`
- QA SQL: `supabase/pending/20260616000000_protocols_backend.qa.sql`
- Dependency reason: directly requires step 7 organization helpers and step 2
  protocol permissions. It is last because its run links and UI workflows can
  reference CMDB assets, Tasks, Notes, and Knowledge objects established before
  the full operational state machine is validated.
- Frontend modules: Protocols (`src/lib/protocols/`, protocol routes), Tasks,
  dashboard, search, and protocol-linked operational workflows.
- Static QA: `scripts/qa/production_hardening_protocols.sh`. The existing
  `scripts/qa/disposable_protocols_qa.sh` is not authorized for execution in
  this milestone and may run only during separately approved disposable work.
- Disposable DB validation required: yes.

## Later promotion and validation gate

A later milestone may promote files only after human review confirms the exact
order above and assigns forward-only filenames. Promotion must not alter SQL
semantics, and production SQL must remain paired with its QA SQL evidence.

Before any disposable execution, the future runner must refuse known live
database names/hosts, require an explicit disposable marker, avoid inherited
live credentials, print the complete ordered manifest, and require explicit
human approval. It must apply already-approved migrations plus all twelve
pending migrations, then run all twelve `.qa.sql` files, IPAM concurrency QA,
Protocols disposable QA, RLS/grant inspection, storage-policy checks, and a
schema diff. None of those execution steps are authorized by this plan.

Actual movement from `supabase/pending/` to `supabase/migrations/`, disposable
database creation or connection, migration execution, QA SQL execution, and any
live deployment are separate later milestones. A disposable success would
still not authorize live execution; live deployment requires another explicit
review and approval.

## Promotion Completion Note

Status: COMPLETED ON 2026-06-14 18:39:26

The production SQL files listed in this plan have been promoted from `supabase/pending/` to `supabase/migrations/`.

Post-promotion state:
- Production SQL now lives under `supabase/migrations/`.
- Transaction-backed QA SQL remains under `supabase/pending/`.
- A clean disposable database replay from `supabase/migrations/` alone was validated.
- The live database was not contacted or modified during this promotion validation.
- No service restart was performed.
