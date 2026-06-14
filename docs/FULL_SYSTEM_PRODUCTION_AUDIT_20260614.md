# Full System Production Audit - 2026-06-14

## Audit Scope and Method

This audit covers the repository state on branch
`hardening/production-readiness-20260612` as inspected on 2026-06-14. It is a
repository-only assessment. No database connection, migration execution,
container operation, service startup, network access, deployment, or runtime
environment inspection occurred.

Evidence reviewed:

- All route files under `src/routes/` and their principal components.
- Frontend authentication, role, capability, and page-visibility logic.
- Browser-local stores, seeds, templates, preferences, and cross-module helpers.
- Supabase query and mutation layers under `src/lib/`.
- Applied SQL under `supabase/migrations/`.
- Staged SQL and transaction-backed QA under `supabase/pending/`.
- Static QA scripts under `scripts/qa/`.
- Production-hardening plans, status records, and route conventions.
- Build configuration, package scripts, server error handling, and public client
  configuration code. Secret-bearing files were not inspected.

Safe static validation performed during this audit:

- `bunx --no-install tsc --noEmit` - passed.
- `bash -n scripts/qa/*.sh` - passed for all 22 shell scripts.
- All 20 non-database `production_hardening_*.sh` assertion scripts - passed.
- `production_hardening_ipam_concurrency.sh` was intentionally not executed
  because it connects to and mutates a disposable database.
- `disposable_protocols_qa.sh` and `knowledge_rc1_staging_smoke.sh` were not
  executed because they use Docker/database or start a local preview service.

## 1. Executive Summary

The repository contains a substantial and generally thoughtful security
hardening program. Authentication is centralized, authenticated role context is
loaded fail-closed, frontend authorization supports additive roles, unknown
capabilities and routes deny by default, sensitive write paths increasingly use
constrained RPCs, and the SQL drafts consistently use RLS, explicit grants, and
`SECURITY DEFINER` functions with restricted `search_path` values. Static QA is
unusually strong for source-level security invariants.

The system is nevertheless **not production ready**. The primary blocker is not
the quality of the staged SQL; it is that nearly the entire Service Desk and
operations backend remains in `supabase/pending/` and is explicitly marked as
not applied. A deployment based only on `supabase/migrations/` would have the
identity and Knowledge Base schema but would lack the tables, policies, RPCs,
triggers, grants, and organization isolation required by Tickets, Catalog,
Notifications, CMDB, IPAM, Tasks, Notes, Protocols, Recycle Bin, and the live
Audit page.

The frontend is also still hybrid. Reports remain entirely browser-local;
dashboard ticket/SLA and recent-activity widgets use seeded local data; admin
Users, Teams, and Roles are local prototypes; Tasks use local identity constants
and a browser template registry; Notes can create local-only Documents and Tasks;
and Search/Dashboard combine a live Knowledge Base with a separate local
Knowledge store. These surfaces can display plausible but non-authoritative
information, which is a production integrity risk even when no privilege
escalation is possible.

The recommended release posture is **No-Go** until the pending migration chain
is promoted, applied to a disposable environment in exact order, all SQL QA is
executed successfully, and a minimum browser role matrix is completed. After
that gate, the next application milestone should eliminate the local Reports
surface or clearly disable it until live aggregation exists.

## 2. Production Readiness Score

**Overall score: 46/100 - Not production ready**

| Area | Score | Assessment |
| --- | ---: | --- |
| Authentication and session safety | 78 | Centralized provider, race guards, fail-closed role loading, and coherent sign-out handling; browser race tests are still absent. |
| Authorization design | 74 | Explicit capability/page matrices and extensive RLS/RPC design; some frontend/backend scope mismatches remain. |
| Database security design | 76 | Strong staged RLS, grants, path validation, organization scoping, and constrained RPC patterns. |
| Database deployment readiness | 15 | Most production backend SQL is pending and unexecuted. No reproducible promotion or CI migration gate exists. |
| Data integrity and source authority | 42 | Core operational modules are live-query based, but important routes and cross-module actions still use local/demo state. |
| Frontend resilience and UX | 55 | Many routes have loading/retry/error states, but several expose raw backend messages or silently collapse failures to empty data. |
| Automated QA | 54 | Excellent static assertions and substantial SQL QA drafts; no executed full SQL suite, unit-test script, browser suite, or CI workflow. |
| Operations and observability | 30 | Generic SSR error pages exist, but there is no documented deployment pipeline, health check, monitoring contract, or production runbook. |
| Documentation accuracy | 58 | Hardening history is detailed, but “repository-side review completed” can overstate readiness while SQL remains staged and local surfaces remain. |

## 3. Biggest Risks

1. **Pending backend chain:** Twelve production schema/QA pairs are staged under
   `supabase/pending/`. Frontend code already assumes those objects exist.
2. **Unverified SQL behavior:** Static assertions pass, but transaction-backed
   SQL QA has not been executed against the complete migration chain.
3. **Authoritative-data ambiguity:** Reports, dashboard Service Desk metrics,
   admin directory/team management, and several cross-module workflows still
   operate on browser-local seed data.
4. **No release gate:** There is no CI workflow, test script, migration drift
   check, browser role suite, or documented deployment/rollback process.
5. **Misleading failure behavior:** Search, dashboard, Tasks, and some detail
   subqueries can render empty or partial results when backend queries fail.
6. **Backend error disclosure:** Several routes render Supabase/backend
   `error.message` values directly to users.
7. **RBAC contract drift:** Frontend capability names and SQL permission keys are
   manually mirrored. Static QA catches many known cases but no generated or
   canonical shared contract prevents future divergence.

## 4. Full Route and Module Inventory

| Route | Module | Current authority | Gate | Production assessment |
| --- | --- | --- | --- | --- |
| `/auth` | Authentication | Supabase Auth | Public | Live; needs browser failure/race testing. |
| `/` | Dashboard | Mixed: live CMDB/IPAM/Tasks/Notes/Protocols/Recycle Bin; local tickets, SLA, activity, and Knowledge summary | AuthGate, non-requester | Partial and potentially misleading. |
| `/dashboard` | Dashboard alias | Redirects to `/` | Explicit page rule | Acceptable alias. |
| `/documents` | Knowledge Base | Supabase Knowledge backend | All authenticated roles plus backend RLS | Strongest fully migrated module. |
| `/search` | Global search | Live operations plus both local and live Knowledge sources | Non-requester | Duplicate/stale Knowledge results; query failures are not surfaced. |
| `/tickets` | Service Desk queue | Pending Supabase Service Desk schema | Queue roles | Frontend ready; backend deployment blocked. |
| `/tickets/:id` | Ticket detail | Pending Supabase tables/RPCs/storage | All roles at route, record visibility by RLS | Strong data-boundary design; subquery error handling is incomplete. |
| `/my-requests` | Requester tickets | Pending Supabase Service Desk schema | All authenticated | Live contract pending deployment. |
| `/service-catalog` | Catalog browse | Pending Supabase catalog | All authenticated | Live contract pending deployment. |
| `/service-catalog/:id` | Catalog request | Pending constrained RPC | All authenticated plus `catalog.request` backend check | Good design; pending deployment. |
| `/notifications` | Notifications | Pending caller-bound table/RPC | All authenticated | Good mutation boundary; pending deployment. |
| `/cmdb` | CMDB | Pending organization-scoped table/RPCs | IT roles | Live frontend; pending schema and runtime QA. |
| `/ipam` | IPAM | Pending organization-scoped RPC layer | IT roles | Strong concurrency design on paper; concurrency QA unexecuted. |
| `/tasks` | Tasks | Pending organization-scoped RPC layer plus local saved views/templates/identity constants | IT roles | Authoritative tasks are live; supporting identity/template UX remains local. |
| `/notes` | Notes | Pending organization-scoped RPC layer plus local conversion targets | IT roles | Authoritative notes live; conversions can create disposable local records. |
| `/protocols` | Protocol layout | Pending organization-scoped RPC layer | IT roles | Live contract pending deployment. |
| `/protocols/` | Protocol list/templates | Pending RPC layer | IT roles | Strong static coverage; runtime QA pending. |
| `/protocols/:id` | Protocol run | Pending RPC layer | IT roles plus backend checks | Strong static coverage; runtime QA pending. |
| `/audit` | Service Desk audit | Pending append-only `ticket_audit_log` | Admins/auditor frontend; RLS uses platform admin or `tickets.view_all` | Live-data UI, but permission scopes differ and schema is pending. |
| `/reports` | Reports | Entirely local `data` and local Knowledge store | Admins, Service Desk lead, auditor | Not production-authoritative. |
| `/recycle-bin` | Recycle Bin alias | Redirects to `/trash` | Admins | Acceptable alias. |
| `/trash` | Recycle Bin | Aggregated pending CMDB/IPAM/Tasks/Notes soft-delete APIs | Admins | Good retention posture; pending backend deployment. |
| `/settings` | Personal settings | Browser-local settings | All authenticated; write capability not enforced because settings are local | Acceptable only if explicitly documented as per-browser preferences. |
| `/admin/catalog` | Catalog administration | Pending catalog table and RLS | Admins/Service Desk lead | Live contract pending deployment; raw load errors exposed. |
| `/admin/ticket-settings` | Ticket configuration | Pending configuration tables | Admins/Service Desk lead | Read UI only for most configuration; pending deployment. |
| `/admin/mailbox` | Mailbox configuration display | Pending configuration table | Admins/Service Desk lead | No operational mailbox ingestion; raw errors exposed. |
| `/admin/templates` | Canned responses | Pending configuration tables | Admins/Service Desk lead; delete only platform admin | Good delete restriction; raw errors exposed. |
| `/admin/users` | User administration | Browser-local seed store | Admins | Prototype only; must not be presented as real identity administration. |
| `/admin/teams` | Team administration | Browser-local seed store | Admins | Conflicts with live identity/RBAC team tables. |
| `/admin/roles` | Role matrix/preview | Frontend matrix plus browser-local users | Admins | Useful diagnostic UI, not authoritative role administration. |
| `/admin/diagnostics` | Local diagnostics | Browser-local data, Knowledge store, snapshots/import/export | Unknown-admin fallback, platform admin only | Safe from remote mutation but high confusion/data-loss risk within a browser. |

Supporting modules:

| Module | State |
| --- | --- |
| Authentication/RBAC | Applied identity foundation plus frontend additive-role integration. |
| Knowledge Base | Applied Supabase schema, review workflow, attachments, audit, and hardening. |
| Service Desk | Frontend integrated; schema/RPC/RLS chain pending. |
| Organization tenancy | Pending; required by CMDB/IPAM/Tasks/Notes/Protocols. |
| CMDB/IPAM/Tasks/Notes/Protocols | Frontend integrated; schemas and RPCs pending. |
| Recycle Bin | Live aggregation over pending module soft-delete contracts. |
| Reports | Local-only. |
| Admin identity/team management | Local-only despite applied identity tables. |
| Template registry | Browser-local; separate from live canned responses, note templates, and protocol templates. |

## 5. Findings Table

Severity definitions: **P0 Critical** blocks any production release; **P1 High**
must be resolved before general availability; **P2 Medium** should be resolved
before broad rollout; **P3 Low** is hardening or maintainability work.

| ID | Severity | Finding | Impact | Evidence / required correction |
| --- | --- | --- | --- | --- |
| F-01 | P0 | Most backend migrations are staged, not applied. | A normal migration deployment lacks nearly every operational table and RPC used by the frontend. | All files in `supabase/pending/` declare draft/not-applied status. Promote in dependency order and validate on a disposable database. |
| F-02 | P0 | The complete SQL chain and transaction QA have never been executed together. | Static correctness cannot prove syntax, dependency ordering, trigger behavior, RLS outcomes, or rollback safety. | Execute all pending migrations and `.qa.sql` suites in an isolated clone with explicit evidence. |
| F-03 | P1 | Reports are entirely browser-local. | Executives/auditors can export convincing but false operational and SLA data. | Replace `/reports` with live bounded aggregates or disable it until live reporting exists. |
| F-04 | P1 | Dashboard ticket counts, SLA alerts, assigned work, and recent activity are local seed data. | The main operational landing page can contradict the ticket queue and audit log. | Add a live Service Desk dashboard aggregation contract with explicit SLA semantics. |
| F-05 | P1 | Admin Users and Teams mutate only browser-local records. | Administrators may believe identity or team changes affected production authorization when they did not. | Integrate constrained admin RPCs or label/disable these prototype actions. |
| F-06 | P1 | Notes-to-Document and Notes-to-Task conversions write to legacy local stores. | Users receive success feedback for records that are not shared, durable, or visible in authoritative modules. | Replace with Knowledge/Task RPCs and atomic cross-resource linking. |
| F-07 | P1 | Tasks use local constants and browser-local registry templates for assignment/filter behavior. | “My” and “Team” scopes can be wrong for the authenticated identity; custom templates are device-specific. | Derive identity/team context from AuthProvider and move templates/views to backend or mark them personal local preferences. |
| F-08 | P1 | Search and dashboard mix local Knowledge data with live Knowledge data. | Duplicate, stale, or inaccessible articles can appear in search and metrics. | Remove `useKnowledge()` from production search/dashboard and use only RLS-backed Knowledge queries. |
| F-09 | P1 | No CI, automated browser suite, or release pipeline definition exists. | Regressions and migration drift can reach deployment without enforcement. | Add CI gates for typecheck, static QA, build, migration lint/apply, SQL QA, and browser role smoke tests. |
| F-10 | P1 | Several routes render backend `error.message` directly. | PostgREST/schema/policy details may be exposed and UX varies by backend failure. | Map errors to stable public messages; retain technical details only in controlled telemetry. |
| F-11 | P1 | Query failures often degrade to empty/partial data without a page-level warning. | Operators can interpret missing data as “zero” or “all clear.” | Add aggregate failure banners and disable derived metrics/export when required queries fail. |
| F-12 | P1 | Frontend audit access and backend audit RLS use different permission concepts. | Roles with `tickets.view_all` may query audit rows through the API even when `audit.view` is absent. | Change RLS to an explicit `audit.view` permission or document the broader contract and align the UI. |
| F-13 | P2 | Ticket SLA exists only in the legacy client model; the live ticket DTO has no calculated SLA state/deadline. | Dashboard and reports cannot migrate without inventing inconsistent client calculations. | Define server-authoritative SLA targets, clocks, breach state, and reporting semantics. |
| F-14 | P2 | The live Audit page is capped at 500 rows with client-side filtering/export and no pagination cursor. | Older evidence is inaccessible and exports are incomplete without warning. | Add server-side filters, cursor pagination, and explicit export scope. |
| F-15 | P2 | Audit actors render UUIDs rather than scoped display names. | Low usability and weak incident-review ergonomics. | Add an RLS-safe actor display projection/RPC. |
| F-16 | P2 | Configuration and catalog use direct table mutations in places while other modules use constrained RPCs. | Correctness depends on every RLS policy and column grant remaining exact; multi-step audit behavior is less explicit. | Prefer RPCs for destructive/configuration mutations requiring validation or audit coupling. |
| F-17 | P2 | Applied Knowledge migrations allow broad table DML subject to RLS, whereas newer modules prefer RPC-only mutation. | Security style and failure behavior are inconsistent across modules. | Review Knowledge writes for invariant-sensitive operations and consolidate mutation contracts where needed. |
| F-18 | P2 | Diagnostics can reset/import/export browser data and snapshots. | Platform admins can unintentionally erase local preferences/prototype records or mistake them for remote backups. | Clearly label the page “local browser diagnostics,” separate preferences from demo data, and remove it from production builds if unnecessary. |
| F-19 | P2 | No documented production health check, monitoring/SLO, backup/restore, incident, or rollback procedure exists. | Operational failures will be detected and recovered from manually. | Add deployment and operations runbooks with owners and measurable checks. |
| F-20 | P2 | Package scripts lack a `test`, `typecheck`, or scoped QA aggregator. | Validation knowledge lives in human instructions and ad hoc commands. | Add deterministic local scripts that CI and reviewers can run identically. |
| F-21 | P2 | Auth, role-refresh, and sign-out protections have static assertions but no deterministic runtime race tests. | Session-event ordering regressions may expose stale privileged UI or break sign-out. | Add controlled Supabase-client tests for replacement, refresh, rejection, and concurrent sign-out. |
| F-22 | P2 | Storage authorization has not been exercised against a disposable full stack. | Metadata/storage policy parity and cleanup ordering remain unproven at runtime. | Execute ticket and Knowledge attachment tests against isolated storage/database services. |
| F-23 | P3 | Root metadata still describes the product as a “Local IT documentation and operations portal.” | Production positioning conflicts with shared multi-user behavior. | Update metadata after architecture is finalized. |
| F-24 | P3 | Documentation contains historical statements that no longer match later milestones. | Reviewers can misread current architecture, for example old dashboard/recycle-bin gaps. | Add a concise current-state architecture section and mark historical milestone notes as superseded. |
| F-25 | P3 | RBAC is manually duplicated across TypeScript and SQL. | New roles/permissions can drift despite static spot checks. | Generate one side from a canonical manifest or add a full matrix comparator. |

## 6. RBAC and RLS Matrix

Frontend role aliases map `platform_admin` to `super_admin` and
`platform_auditor` to `auditor`. Authorization evaluates the union of all
recognized effective global roles; display precedence does not remove grants.

| Role | Ticket access | Knowledge | CMDB / IPAM | Tasks / Notes / Protocols | Admin / audit / reports | Alignment assessment |
| --- | --- | --- | --- | --- | --- | --- |
| Platform/Super Admin | Full queue, assignment, lifecycle, config, attachments | Full | Manage / manage | Manage all | Full, including canned-response delete and recycle restore | Broadly aligned; pending SQL deployment. |
| IT Admin | Full Service Desk except platform-only canned-response delete | Full | Manage / manage | Manage all | Users, teams, roles, audit, reports | Frontend admin pages for users/teams are local, not DB authoritative. |
| Service Desk Lead | Full queue and lifecycle; catalog/config | Draft read, no general authoring | View / view | Manage all three | Reports; no audit route | Backend `tickets.view_all` also permits ticket audit table reads, creating drift. |
| Helpdesk | Queue, assign, resolve, public/internal comments | Draft read | View / view | Manage all three | No admin/audit/reports | Backend audit RLS may still allow reads through `tickets.view_all`. |
| Technician | Queue, assign, resolve, comments | Draft read | Manage CMDB / view IPAM | Manage all three | No admin/audit/reports | Backend role mappings require disposable verification. |
| Network Admin | Queue/internal read; no assignment or lifecycle | Draft read | Manage CMDB / manage IPAM | Manage all three | No admin/audit/reports | Least-privilege ticket controls are statically asserted. |
| Documentation Editor | Own/requester-style ticket creation and public comments; no queue | Create/edit/archive/change status | View / view | Manage all three | No admin/audit/reports | Broad operations write grants should be product-reviewed. |
| Platform Auditor | Read queue and internal notes; no writes | Draft/archived read | View / view | View all | Audit and reports | Read-only intent is clear; audit SQL currently derives access from ticket permission. |
| Employee | Own tickets, catalog requests, public comments/attachments | Published/visible content through RLS | None | None | None | Least-privilege fallback role; good fail-closed default. |

Key authorization observations:

- `AuthGate` denies unknown non-admin paths and restricts unknown admin paths to
  platform administrators after authenticated context resolves.
- Route gates are UX controls only. Supabase RLS/RPC checks remain the actual
  security boundary, which is the correct architecture.
- Unknown frontend capability keys deny for every role.
- The authenticated role store degrades to `employee` if role loading fails.
- Direct table operations remain safe only where grants and RLS are both
  correct. They should not be treated as equivalent to constrained RPCs for
  multi-step or invariant-sensitive writes.
- `ticket_audit_log_select_managers` should use an explicit audit permission;
  `tickets.view_all` is broader than the frontend `audit.view` contract.

## 7. Local and Mock Data Matrix

| Local source | Consumers | Authority risk | Required disposition |
| --- | --- | --- | --- |
| `src/lib/data/store.ts` / `seed.ts` | Dashboard tickets/activity, Reports, admin Users/Teams/Roles/Diagnostics, settings shell integrations, relation pickers, command palette | High | Remove from production-authoritative screens; retain only clearly named demo fixtures or personal preferences. |
| Legacy ticket model and `recomputeSla` | Dashboard and Reports | High | Replace with server-authoritative ticket/SLA aggregates. |
| `src/lib/knowledge/store.ts` | Dashboard Knowledge metrics, Search local Knowledge group, Diagnostics; legacy workspace code | High | Remove from production routes now served by the backend Knowledge workspace. |
| `src/lib/templates/store.ts` | Task templates/usage | Medium/High | Move shared templates to backend or explicitly scope as personal browser templates. |
| Legacy task helpers/constants | Task saved views, categories, current user/team, template checklist resolution; note conversion | High | Derive identity/team from authenticated context and persist shared objects through RPCs. |
| `src/lib/data/notes.ts` conversions | Notes “convert to document/task” | High | Replace both conversions with backend mutations and relationship updates. |
| `src/lib/dashboard-prefs.ts` | Dashboard layout and pending ticket filters | Low | Appropriate browser preference/session handoff; document as non-authoritative. |
| `src/lib/knowledge/recent.ts` | Recently viewed Knowledge UX | Low | Appropriate device-local convenience data if clearly non-authoritative. |
| Role preview localStorage | Admin role preview / unauthenticated fallback | Medium | Acceptable for preview only; keep authenticated session pinning and clear labels. |
| App settings in local store | Theme/table page size/related settings | Low/Medium | Separate personal preferences from legacy application data before removing the store. |
| Diagnostics snapshots/import/export | Platform-admin diagnostics | Medium | Restrict to development or label unmistakably as browser-local. |

## 8. Database, RPC, and RLS Matrix

### Applied migrations

| Area | Objects | RLS / mutation model | Assessment |
| --- | --- | --- | --- |
| Identity and RBAC | Profiles, teams, roles, permissions, role mappings, team memberships; helper functions and team creation RPC | RLS enabled on all identity tables; explicit grants; helper functions restricted | Applied foundation is solid, but admin UI does not manage it. |
| Knowledge content | Spaces, categories, articles, tags, article tags, revisions | Team/article visibility RLS; direct DML constrained by policies and triggers | Production-capable design with static/runtime gaps. |
| Knowledge review | Review events and transition RPC | Status transition hardened through RPC and blockers | Good invariant boundary. |
| Knowledge attachments | Metadata and storage policies | Path validation, metadata-backed storage visibility, signed URLs | Strong design; full-stack storage QA pending. |
| Knowledge audit | Append-only audit table and trigger | Manager-scoped reads; browser writes revoked | Strong design. |

### Pending migration chain

| Order | Pending area | Principal tables | Principal RPCs / functions | RLS and grants | Readiness |
| ---: | --- | --- | --- | --- | --- |
| 1 | Service Desk foundation | `catalog_items`, `tickets`, `ticket_comments`, `ticket_status_events`, `ticket_audit_log` | `create_ticket`, `update_ticket`, `submit_catalog_request`, `can_view_ticket`; audit/status triggers | RLS on all five; constrained ticket writes; audit trigger | Designed and statically tested; not applied. |
| 2 | Service Desk RBAC expansion | Role/permission catalog additions | `list_service_desk_profiles` | Scoped directory output; explicit execute grant | Not applied. |
| 3 | Ticket attachments | `ticket_attachments`, storage bucket policies | Path validator | Metadata/storage parity and attachment permissions | Not applied; storage runtime unverified. |
| 4 | Ticket configuration | Categories, priorities, SLA policies, routing rules, canned responses, mailbox configs | Primarily policy-protected table operations | RLS on six tables; platform-only canned deletion | Not applied. |
| 5 | Ticket assignments | `ticket_assignment_history` | Assignment capture trigger | Visible-ticket read policy; trigger-only writes | Not applied. |
| 6 | Notifications | `notifications` | `mark_notifications_read`; notification trigger functions | Own-row reads; RPC-only browser mutation | Not applied. |
| 7 | Organization foundation | `organizations`, `organization_members`; organization columns/backfill | `current_organization_id`, membership helpers | Establishes tenant boundary for later modules | Not applied; prerequisite for operations modules. |
| 8 | CMDB | `cmdb_asset_types`, `cmdb_assets` | Soft delete/restore, bulk status, import | Organization-scoped RLS and permissions | Not applied. |
| 9 | IPAM | Networks, subnets, addresses | List/save/import/allocation/reservation/delete/restore RPCs | Organization scope plus concurrency controls | Not applied; concurrency QA unexecuted. |
| 10 | Tasks | Tasks and comments | List/save/status/escalate/archive/duplicate/link/reminder/comment/bulk/delete/restore RPCs | Organization and permission checks; RPC-only writes | Not applied. |
| 11 | Notes | Notes and note templates | List/save/pin/archive/duplicate/link/delete/restore RPCs | Organization and permission checks | Not applied. |
| 12 | Protocols | Templates, runs, run comments/approvals embedded or related | Twelve list/save/run/status/step/approval/comment/delete/restore RPCs | Organization and permission checks; hard-delete denial | Not applied. |

Cross-cutting SQL strengths:

- Pending module migrations are forward-oriented and heavily revoke default
  privileges before granting narrow access.
- Security-definer RPCs generally use `set search_path = ''` and schema-qualified
  references.
- Organization-aware modules consistently check current organization membership.
- Soft deletion is favored over hard deletion for operational auditability.
- Ticket and Knowledge storage policies bind object paths to metadata rows.

Cross-cutting SQL release risks:

- The chain has not been executed in one clean environment.
- Migration promotion order is documented only implicitly by filenames and
  comments; it is not enforced by CI.
- Pending dates extend beyond the audit date (`20260615`, `20260616`), reinforcing
  that these are planned drafts rather than a deployable migration history.
- There is no schema drift check against an actual target environment.

## 9. QA Coverage Matrix

| Area | Static QA | SQL/disposable QA present | Executed in this audit | Remaining gap |
| --- | --- | --- | --- | --- |
| TypeScript | Repository-wide compiler | N/A | Passed | No unit-test type fixtures. |
| Shell QA syntax | All 22 scripts | N/A | Passed | Syntax does not prove behavior. |
| Frontend auth/RBAC | Extensive source and direct-function assertions | Identity/role SQL indirectly covered | Passed | Browser navigation/control rendering and auth races. |
| Ticket creation/update/comments/catalog | Static RPC and grant assertions | Extensive transaction QA | Static passed | Full disposable execution. |
| Ticket attachments | Metadata/storage structural assertions | Extensive transaction QA | Static passed | Real storage service and cleanup failure tests. |
| Ticket configuration | Error-state and role assertions | Transaction QA | Static passed | Runtime role rendering and mutation behavior. |
| Notifications | Cache and RPC-boundary assertions | Transaction QA | Static passed | Multi-tab/cache/runtime behavior. |
| Service Desk profiles | Output-shape and grant assertions | Transaction QA | Static passed | Runtime assignment selector behavior. |
| CMDB | Frontend/SQL/static assertions | Transaction QA | Static passed | Disposable apply and browser CRUD/import. |
| IPAM | Frontend/SQL/concurrency guards | Transaction and concurrency QA | Static passed; concurrency skipped | Actual concurrent reservation/import behavior. |
| Tasks | Frontend/RPC/SQL assertions | Transaction QA | Static passed | Browser workflows, identity scopes, local-template cleanup. |
| Notes | Frontend/RPC/SQL assertions | Transaction QA | Static passed | Conversion integrity and browser workflows. |
| Protocols | Frontend/RPC/SQL assertions | Transaction QA and disposable helper | Static passed; disposable helper skipped | Full state-machine and approval runtime behavior. |
| Recycle Bin | Aggregation and no-hard-delete assertions | Covered by module SQL QA | Static passed | Browser restore and partial-query failure behavior. |
| Dashboard/Search/Audit | Live-source regression assertions | Underlying module QA | Static passed | Error/partial-data browser behavior and report consistency. |
| Knowledge Base | Security SQL scripts and attachment static QA | Existing SQL checks | Attachment static passed; DB scripts not run | Full applied migration/storage/browser regression suite. |
| Build/SSR | Typecheck and prior hardening assertions | N/A | Typecheck passed; build not run | Production build, SSR smoke, CSP/headers, asset serving. |
| End-to-end | None | None | Not available | Role matrix, critical workflows, accessibility, browser compatibility. |

QA program conclusions:

- Static security regression coverage is a major strength.
- SQL QA volume is substantial, but unexecuted SQL QA is evidence of intent,
  not evidence of a working database.
- There is no configured unit-test script and no CI workflow.
- There is no automated browser test harness for authentication, authorization,
  file upload/download, cross-module navigation, or failure injection.
- Accessibility, performance, responsive behavior, and browser compatibility are
  not systematically tested.

## 10. P0/P1/P2/P3 Roadmap

### P0 - Release blockers

1. Freeze the pending SQL dependency order and promote the twelve production
   migration files into the real migration chain without semantic edits during
   promotion.
2. Apply the complete migration chain to a fresh disposable database cloned only
   from approved schema prerequisites.
3. Execute every pending `.qa.sql` suite plus IPAM concurrency QA and protocol
   disposable QA. Capture exact versions, order, results, and schema diff.
4. Verify storage bucket policies for Knowledge and ticket attachments in an
   isolated full stack.
5. Produce a deployment manifest proving the frontend revision and database
   migration level are compatible. Do not release if any required RPC/table is
   absent.

### P1 - Required before general availability

1. Replace or disable local Reports.
2. Replace dashboard local ticket/SLA/activity data with server-authoritative
   aggregates.
3. Replace or disable local admin Users/Teams mutation flows.
4. Replace Notes conversion paths with backend Document/Task creation.
5. Remove local Knowledge from Search and Dashboard.
6. Align audit RLS with `audit.view` and review every frontend/SQL role mapping.
7. Replace direct backend error rendering with public error mapping.
8. Add visible partial-failure handling for dashboard, search, task, protocol,
   and ticket subqueries.
9. Establish CI with typecheck, static QA, build, migration apply/lint, SQL QA,
   and a minimal browser role matrix.

### P2 - Required before broad operational rollout

1. Define server-authoritative SLA calculations and reporting aggregates.
2. Migrate task templates/saved views and authenticated identity scopes.
3. Add server-side audit filtering, pagination, actor display names, and export.
4. Add deterministic auth race/sign-out tests and multi-tab notification tests.
5. Add deployment, rollback, backup/restore, monitoring, incident, and ownership
   runbooks.
6. Add production build/SSR smoke checks, accessibility testing, responsive
   testing, and supported-browser coverage.
7. Review direct table mutations and move invariant-sensitive operations to
   constrained RPCs.

### P3 - Hardening and maintainability

1. Consolidate current-state documentation and mark historical statements as
   superseded where appropriate.
2. Generate TypeScript/SQL permission matrices from one canonical manifest or
   add a complete comparator.
3. Separate personal browser preferences from legacy demo application state.
4. Remove obsolete local stores, components, helpers, and seed records after all
   consumers migrate.
5. Add performance budgets, pagination standards, telemetry redaction rules,
   retention policies, and audit-export limits.

## 11. Exact Next Recommended Milestone

### Milestone 34 - Reproducible Pending Migration Promotion and Disposable Full-Chain Validation

This should be the next milestone because every recently hardened live-data
route depends on backend objects that are still explicitly staged. Further
frontend migration work would increase dependency on an unproven schema and
would not reduce the release-blocking risk.

Exact scope:

1. Define and review the immutable application order for all twelve pending
   production migrations.
2. Promote them into `supabase/migrations/` using forward-only filenames and no
   live database access.
3. Add a repository-local orchestration script that refuses known live database
   names, requires an explicit disposable marker, applies the full migration
   chain, runs all `.qa.sql` suites, and destroys only the disposable database.
4. Add static QA that verifies every frontend-referenced table/RPC exists in the
   promoted migration chain and every security-definer function has restricted
   execution grants and a safe `search_path`.
5. Execute the orchestration only after explicit human approval in an isolated
   environment, then record exact results and remaining failures.
6. Do not include Reports or other frontend migrations in the same milestone;
   migration readiness is a single release-blocking concern and should remain
   independently reviewable.

Acceptance criteria:

- A clean disposable database can apply all migrations in order with no manual
  intervention.
- Every SQL QA suite passes and rolls back its fixtures.
- IPAM concurrency and Protocols disposable tests pass.
- Schema inspection confirms RLS is enabled on every exposed application table.
- Anonymous access, authenticated grants, RPC execution grants, organization
  isolation, and storage policy parity match the documented contracts.
- The live database remains untouched until a separate, explicitly approved
  deployment change.

## Final Production Decision

**Decision: NO-GO for production deployment as of 2026-06-14.**

The repository demonstrates strong security engineering direction and passes all
safe static checks run for this audit. The release remains blocked by staged and
unexecuted backend migrations, unresolved local/demo authoritative surfaces, and
the absence of a reproducible database/browser release gate.
