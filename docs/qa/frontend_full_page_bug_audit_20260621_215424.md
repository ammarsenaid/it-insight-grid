# Frontend Full-Page Bug Audit

**Audit timestamp:** 2026-06-21 21:54:24 UTC  
**Repository:** `/opt/it-knowledge-center/app`  
**Branch / revision:** `main` / `fe57858`  
**Audit type:** Read-only source and route audit

## Test Constraints

`http://127.0.0.1:3000` was not listening during the audit (`curl: (7) Failed to connect`). The repository also has no installed Playwright or Puppeteer dependency. Under the instruction not to start, restart, install, or deploy anything, browser execution was not possible. Consequently:

- No authenticated browser session was available.
- No controls were clicked at runtime.
- No screenshots, browser console traces, or browser network traces were captured.
- Responsive findings are source-confirmed risks based on layout classes, not screenshot evidence.
- Source-confirmed navigation, missing-handler, persistence, loading/error, accessibility, and data-source defects are reported as confirmed.

## 1. Executive Summary

**Overall frontend quality score:** **4/10**  
**Production readiness verdict:** **Not ready**

The frontend has broad module coverage and generally consistent component styling, but several primary workflows are broken or misleading. The most serious problems are a blocked request-creation route, production-looking dashboards and reports backed by browser seed/local data, controls that claim success without persisting anything, dead reply-composer buttons, destructive bulk actions without confirmation, and record search results that do not open the selected record. Runtime behavior could not be validated because the expected local server was unavailable.

### Top 10 Problems

1. **New request is blocked by the route guard.** `/my-requests` links to `/requests/new`, but that path has no page-visibility rule and is rejected as an unknown protected route.
2. **Dashboard operational data is partly fake/local.** Tickets, activity, knowledge alerts, and several personal metrics use browser-local seeded stores while adjacent cards use live queries.
3. **Reports are based on browser-local data.** Ticket, CMDB, IPAM, task, and activity reports can disagree with their live module pages.
4. **Ticket wizard “Save draft” does not save.** It only displays a success toast.
5. **Ticket reply toolbar contains four dead icon buttons.** Attachment, emoji, mention, and image controls have no handlers and no accessible names.
6. **Dashboard ticket filters are discarded.** The dashboard writes filters to `sessionStorage`; `/tickets` never consumes them.
7. **Dashboard and command-palette record results often open generic lists.** Named task, asset, IP, and alert records are not selected at the destination.
8. **Task bulk Archive and Delete execute immediately.** There is no confirmation despite affecting all selected records.
9. **Live query failures on the dashboard are displayed as zero or “All clear.”** Most module queries lack visible loading/error states.
10. **Mobile control density and table dependence are high.** Fixed-width filters, large tables, and non-wrapping action rows require extensive horizontal scrolling or risk cramped controls.

## 2. Route-by-Route Audit

| Route | Status | Severity | Problem found | Steps to reproduce | Expected behavior | Actual behavior | Evidence | Recommended fix |
|---|---|---:|---|---|---|---|---|---|
| `/` | Static-confirmed defects | Critical | Mixed live and seeded/local dashboard data; silent query failures; broken filter handoff | Open dashboard; compare ticket/activity cards with live modules; click an SLA or ticket metric | All operational metrics come from the same authorized live sources and preserve their filters | Ticket/activity/knowledge values come from local stores; most failed queries become zero; filters are only written to storage | `src/routes/index.tsx:128-166,239-242`; `src/lib/dashboard-prefs.ts:79-100` | Replace local operational sources with existing live queries; add loading/error states; use typed URL filters |
| `/dashboard` | Static-confirmed defects | High | Aliases `/` but sidebar Dashboard item is not active and page description admits “local system activity” | Navigate directly to `/dashboard` | Same selected navigation state and semantics as `/` | Sidebar only treats exact `/` as active | `src/routes/dashboard.tsx:1-14`; `src/components/layout/AppSidebar.tsx:145-146` | Canonicalize the dashboard URL or treat both paths as active |
| `/tickets` | Static-confirmed defects | High | Does not consume dashboard filters; dense table is the only full queue presentation | Click dashboard “SLA Breached,” “Mine,” “Waiting,” or “Unassigned” | Ticket queue opens with the requested filter | `TicketsPage` initializes every filter to `all` and never calls `consumePendingTicketFilters` | `src/routes/tickets.tsx:175-195`; no consumer reference | Parse validated URL search parameters and visibly show active filters |
| `/tickets/new` | Route exists; runtime unverified | High | “Save draft” is fake; attachments are staged in UI but wizard draft feedback is false | Fill any wizard step and click Save draft | Draft is persisted and recoverable, or control is absent | Success toast is shown with no state/storage write | `src/components/service-desk/TicketWizard.tsx:334-343` | Implement real per-user draft persistence or remove/rename the action |
| `/tickets/$id` | Static-confirmed defects | High | Four dead, unlabeled reply controls; detail action density is high | Open a ticket and click paperclip, smile, @, or image icons | Each control opens its picker/action and has an accessible name | Buttons have no `onClick`, title, tooltip, or `aria-label` | `src/routes/tickets.$id.tsx:911-959` | Remove unfinished controls or implement them; add labels/tooltips |
| `/my-requests` | Broken primary CTA | Critical | “New request” links to a route blocked by top-level route visibility | Open My Requests and click New request | Request wizard opens | Navigation targets `/requests/new`; unknown protected paths fail closed | `src/routes/my-requests.tsx:176-180`; `src/components/layout/AuthGate.tsx:31-58`; no `/requests/new` visibility entry | Align the CTA with an allowed creation route without weakening authorization |
| `/requests/new` | Route unreachable through guard | Critical | Real route component exists but protected routing does not recognize it | Enter `/requests/new` directly while authenticated | Allowed requester sees request wizard | `AuthGate` treats it as unknown and redirects to role home | `src/routes/requests.new.tsx:4-10`; visibility matrix has no matching path | Add a properly authorized frontend route contract during a dedicated auth-reviewed milestone |
| `/service-catalog` | Runtime unverified | Medium | Not present in sidebar or command palette, reducing discoverability | Sign in and inspect primary navigation | Requesters can easily discover the service catalog | Route exists but primary navigation exposes only My Requests | `src/components/layout/AppSidebar.tsx:43-96`; `CommandPalette.tsx:64-83` | Add a permission-aware Service Catalog navigation entry |
| `/service-catalog/$id` | Runtime unverified | Medium | Successful request redirects to ticket detail, while requester workflow terminology points users to My Requests | Submit a safe test request in a test environment | Consistent requester destination and breadcrumb | Success navigates to `/tickets/$id`; requester may then see queue-oriented detail navigation differences | `src/routes/service-catalog.$id.tsx:53-66` | Route requesters consistently to the requester-facing detail context |
| `/documents` | Runtime unverified | High | Extremely large workspace UI has both local and backend knowledge implementations; command search local result does not select the article | Search a local knowledge page in command palette and select it | Selected article opens | Local result navigates only to `/documents` | `src/components/common/CommandPalette.tsx:143-166,283-289`; `src/routes/documents.tsx` | Remove local production results or pass the selected validated article ID |
| Document/category/article views | Dynamic UI; runtime unverified | Medium | Complex nested workspace has many tabs, drawers, editor actions, and horizontal tab strips that could not be exercised | Open document workspace and traverse a space/category/article | Stable selected state, clear save/error feedback, responsive controls | Runtime result unknown; static code uses overflow strips and extensive conditional UI | `src/components/knowledge/KnowledgeBackendWorkspace.tsx:1004,2496` | Add Playwright coverage for browse, edit, review, attachments, and mobile navigation |
| `/cmdb` | Runtime unverified | Medium | Import/Add controls can be disabled without a nearby explanation when asset types are unavailable; table/list action behavior could not be exercised | Open CMDB with zero asset types | Explain why Add asset is unavailable and how to recover | Add button is disabled based on `assetTypes.length === 0` with no button-level explanation | `src/routes/cmdb.tsx:240-243,278` | Add explanatory status/help text and retry for asset-type loading |
| `/ipam` | Runtime unverified | Medium | Fixed-width filters and bulk bar create a dense mobile experience | Open at 390px and use search/filter/selection | Controls stack cleanly and remain readable | Several fixed-width controls and action groups depend on wrapping | `src/routes/ipam.tsx:242-276,357` | Use full-width mobile controls and a compact mobile bulk-action menu |
| `/tasks` | Static-confirmed defects | High | Bulk Archive/Delete have no confirmation; Add tag uses blocking browser `prompt`; saved views are browser-local | Select tasks and activate bulk actions | Destructive operations require confirmation; tag entry uses accessible app UI | Mutations execute directly; tag uses native prompt | `src/routes/tasks.tsx:601-615`; task views use local `useData` | Add confirmation dialogs and an inline tag dialog; clearly label local preferences |
| `/notes` | Runtime unverified | Medium | Two-pane workspace and template actions are complex and not runtime tested; error/loading behavior should be covered | Open at mobile size and switch notes/templates | One clear mobile pane with reliable selection and errors | Static UI has multiple conditional panes; runtime state unknown | `src/routes/notes.tsx:243-523` | Add mobile workflow tests for select, create, template, save, and empty states |
| `/protocols` | Runtime unverified | High | Start Run mutates immediately from each row; icon-only overflow/delete controls lack consistently visible accessible labels | Open templates and use row controls | Risky run start is explicit; icon actions are labeled | Start mutation fires directly; multiple icon buttons rely on icon alone | `src/routes/protocols.index.tsx:211-216,503-516` | Add confirmation/context for run start and accessible names for icon controls |
| `/protocols/$id` | Static-confirmed risk | High | Approve, Reject, complete-with-issues, fail, and cancel actions execute directly without confirmation or required rationale | Open a run with matching status and click an action | High-impact status changes require review/confirmation and clear pending state | Direct mutation calls are bound to buttons | `src/routes/protocols.$id.tsx:177-196` | Add confirmation/rationale dialogs and disable all competing actions while pending |
| `/notifications` | Runtime unverified | Medium | Notifications without `ticketId` are clickable but perform no navigation; route is absent from primary navigation | Click a non-ticket notification | Open its relevant entity or present details | `handleOpen` only navigates when `ticketId` exists | `src/routes/notifications.tsx:96-99,185-189`; sidebar lacks route | Render non-navigable items as non-buttons or support entity destinations; add navigation entry |
| `/settings` | Visually incomplete | Medium | Page contains only a small set of browser-local display preferences despite system-style navigation label | Open Settings | Clear distinction between personal browser preferences and system settings | Sparse preferences update local store and can look tenant-wide | `src/routes/settings.tsx:1-67`; `src/lib/data/store.ts:189-191` | Rename to Personal Preferences and state browser-local scope prominently |
| `/reports` | Confirmed data-correctness defect | Critical | Entire report suite reads legacy browser-local tickets/assets/IPAM/tasks/activity | Compare report totals with live CMDB, IPAM, Tasks, and Tickets | Reports match live authorized modules | Reports derive from `useData()` local collections | `src/routes/reports.tsx:27-82,111,195-196` | Hide production reports until they use live query services, then add loading/error states |
| `/audit` | Runtime unverified | Medium | Row “view” icon has no accessible name; details expose raw error text if service does; export behavior runtime unverified | Tab to table action buttons | Screen reader announces View audit event | Eye-only button has no label/title | `src/routes/audit.tsx:89-93` | Add `aria-label` including event context and tooltip |
| `/recycle-bin` | Duplicate-route concern | Low | Alias route duplicates `/trash`, while sidebar uses only `/trash` | Visit both routes | One canonical recycle-bin URL | Two URLs render the same page and can produce inconsistent active navigation/history | `src/routes/recycle-bin.tsx`; `src/routes/trash.tsx`; sidebar uses `/trash` | Canonicalize one URL and redirect the alias |
| `/trash` | Runtime unverified | Medium | Restore is a write action available directly from rows; responsive table behavior unverified | Open recycle bin and inspect row actions | Clear confirmation where restore may overwrite/conflict | Runtime behavior unavailable; route requires targeted functional coverage | `src/routes/trash.tsx:1-150` | Add safe test coverage for empty/filter/restore/conflict states |
| `/admin/users` | Runtime unverified | Medium | Multiple icon-only overflow controls lack explicit labels; wide 900px table requires horizontal scrolling | Open at 390px and keyboard-tab row actions | Labeled controls and usable mobile presentation | More-horizontal trigger is unlabeled; table minimum width is 900px | `src/routes/admin.users.tsx:367-410` | Add accessible names and mobile card/priority-column view |
| `/admin/teams` | Runtime unverified | Medium | Wide 760px table and dense membership drawers are mobile-heavy | Open at 390px and edit a team safely without saving | Core identity and actions remain visible without excessive horizontal navigation | Table explicitly requires 760px | `src/routes/admin.teams.tsx:222`; membership controls around `493-546` | Provide mobile cards or sticky identity/action columns |
| `/admin/roles` | Runtime unverified | Medium | Disabled Preview buttons provide no explanation for unmapped roles; page is 3,500+ lines with high interaction complexity | Find a role without a preview mapping | Explain why preview is unavailable | Disabled icon/text button has no explanatory tooltip | `src/routes/admin.roles.tsx:1556-1568` | Add an explanatory tooltip/status and targeted interaction tests |
| `/admin/catalog` | Runtime unverified | Medium | 1050px table creates heavy mobile horizontal navigation; status tabs may also overflow | Open at 390px | Key service identity, status, and actions usable without scanning a 1050px table | Table minimum width is 1050px | `src/routes/admin.catalog.tsx:234-297` | Add mobile cards or responsive column prioritization |
| `/admin/templates` | Runtime unverified | Medium | 760px table and row menu are mobile-heavy | Open at 390px | Shortcut, title, scope, and action remain usable | Table minimum width is 760px | `src/routes/admin.templates.tsx:238-280` | Add responsive cards or hide secondary columns behind details |
| `/admin/ticket-settings` | Runtime unverified | Low | Read-only page is labeled “Configuration,” which implies editing; routing rules expose raw JSON rather than human-readable conditions | Open Ticket Configuration | Clear read-only “Configuration Overview” with readable routing rules | Banner explains read-only state, but page title and raw JSON remain confusing | `src/routes/admin.ticket-settings.tsx:108-120,223-258` | Rename page/description and render rule conditions/actions as labeled fields |
| `/admin/diagnostics` | Production-trust concern | High | Production navigation exposes demo reset/clear/import/snapshot tools operating on browser-local state and labels backend “Connected” without a health check | Open as platform admin | Diagnostics reflect verified live health and avoid demo controls in production UI | Page mixes local demo data tools with a static “Connected” label | `src/routes/admin.diagnostics.tsx:163-267` | Separate QA-only local tools from production diagnostics; derive health labels from real checks |
| `/admin/mailbox` | Runtime unverified | Low | Read-only configuration has no refresh control and is omitted from sidebar despite being linked from Diagnostics | Change route or recover from transient error | Discoverable page with retry/refresh | Page only loads on mount; navigation is indirect | `src/routes/admin.mailbox.tsx:48-125`; sidebar lacks route | Add permission-aware navigation and retry action for error state |

## 3. Dead Button / Broken Action Report

| Page | Button or control label | Selector or nearby text | What happens | What should happen | Severity |
|---|---|---|---|---|---:|
| `/my-requests` | New request | Header action, `Link to="/requests/new"` | Route gate redirects away because destination is unknown | Open request wizard | Critical |
| `/tickets/new`, `/requests/new` | Save draft | Sticky wizard footer | Shows “Draft saved locally” toast only | Persist and restore the draft, or remove the action | High |
| `/tickets/$id` | Paperclip | Reply composer toolbar | No handler | Open attachment picker | High |
| `/tickets/$id` | Smile | Reply composer toolbar | No handler | Open emoji picker | Medium |
| `/tickets/$id` | @ mention | Reply composer toolbar | No handler | Open mention picker | Medium |
| `/tickets/$id` | Image | Reply composer toolbar | No handler | Open image attachment picker | Medium |
| `/` and `/dashboard` | SLA Breached / Unassigned / My tickets / Waiting | Dashboard metric cards | Opens unfiltered ticket queue | Preserve and visibly apply requested filter | High |
| `/` and `/dashboard` | View all alerts | Operational Alerts footer | Always targets `/audit`, including roles without audit access | Hide it or route to an allowed aggregate view | High |
| `/` and `/dashboard` | New ticket/task/asset/IP/knowledge | Quick Actions | Opens generic list page rather than creation UI | Open the correct create route or drawer | High |
| Command palette | Local knowledge page result | “Knowledge pages” result | Opens `/documents` without selecting result | Open selected page | Medium |
| Command palette | Asset result | “Assets” result | Opens `/cmdb` without selecting asset | Open selected asset details | Medium |
| Command palette | Task result | “Tasks” result | Opens `/tasks` without selecting task | Open selected task details | Medium |
| `/notifications` | Non-ticket notification row | Notification card without `ticketId` | Marks read but otherwise does nothing | Open relevant entity/details or render non-clickable | Medium |
| `/tasks` | Add tag | Bulk action bar | Opens native blocking `prompt()` | Open accessible validated app dialog | Medium |
| `/tasks` | Archive | Bulk action bar | Executes immediately | Show confirmation with selected count | High |
| `/tasks` | Delete | Bulk action bar | Executes immediately | Show confirmation with selected count and effect | High |
| `/admin/roles` | Preview | Role card with no preview mapping | Permanently disabled without explanation | Explain why preview is unavailable | Low |

## 4. Console and Network Error Report

### Runtime Capture

No browser console or browser network report could be captured because `127.0.0.1:3000` was unavailable and no permitted installed browser runner existed.

| Page | Error message | Stack or source if available | Severity |
|---|---|---|---:|
| All | `curl: (7) Failed to connect to 127.0.0.1 port 3000` | Local endpoint availability check | Critical test blocker |
| Root error boundary | Runtime errors are explicitly logged with `console.error(error)` | `src/routes/__root.tsx:40` | Low |
| Documents/knowledge | Multiple caught backend errors log detailed objects to console | `src/lib/knowledge/useTeamArticles.ts:99,118`; `useKnowledgeBackend.ts:103,132,174,179` | Medium |
| Browser-local stores | Persistence failures log raw error objects | `src/lib/data/store.ts:73`; `src/lib/knowledge/store.ts:47`; `src/lib/templates/store.ts:35` | Low |

Raw backend error objects in production consoles can disclose implementation details and create noisy support diagnostics. User-facing errors should remain generic while structured telemetry receives sanitized context.

## 5. Responsive / Mobile Issues

| Viewport size | Page | Problem | Severity | Suggested fix |
|---:|---|---|---:|---|
| 1440px | `/`, `/dashboard` | Large number of equally weighted cards weakens hierarchy; fake/local and live data are visually indistinguishable | High | Separate live health, personal work, and optional/local widgets; label data provenance |
| 1440px | `/admin/roles` | Very large single route implementation and many simultaneous controls increase cognitive load | Medium | Split presentation into focused subcomponents/workflows and preserve clear task hierarchy |
| 1024px | `/tasks` | Seven fixed-width filters plus saved-view controls wrap into a dense multi-row toolbar | Medium | Use a filter drawer and active-filter chips at tablet widths |
| 1024px | `/admin/catalog` | 1050px minimum table already exceeds available content width | Medium | Prioritize columns and move secondary data into row details |
| 768px | `/tickets`, `/tasks`, admin tables | Wide tables require horizontal scrolling; row identity and actions can move off-screen | Medium | Sticky first/action columns or responsive cards |
| 768px | `/admin/ticket-settings` | 700px/820px inner tables plus page padding force horizontal scroll | Low | Render routing/SLA rules as cards below desktop |
| 390px | `/tickets/$id` | Reply toolbar packs four dead icons, internal-note control, and Send into a non-wrapping row | High | Remove dead icons; wrap or use an overflow menu; keep Send visible |
| 390px | `/tasks` | Filter toolbar and selected-item bulk controls contain many fixed-width selects | High | Full-width filter sheet and compact bulk-action menu |
| 390px | `/ipam`, `/cmdb` | Fixed-width filters and bulk actions depend on wrapping and consume vertical space | Medium | Full-width mobile search plus filter/action drawers |
| 390px | `/admin/users` | 900px table forces extensive horizontal navigation | Medium | Mobile user cards with primary status/action controls |
| 390px | `/admin/teams`, `/admin/templates` | 760px tables force horizontal navigation | Medium | Responsive cards or prioritized columns |
| 390px | `/admin/catalog` | 1050px table is effectively desktop-only | High | Dedicated mobile card view |
| 390px | Dashboard alerts | CTA, badges, title, and metadata share one horizontal row and truncate aggressively | Medium | Stack CTA under alert content on small screens |

## 6. UX/UI Quality Observations

### Layout and Visual Consistency

- The shared glass-card visual language is consistent, but dense operational pages overuse cards with equal visual weight.
- Several admin pages correctly wrap large tables in overflow containers, but this is functional containment rather than a usable mobile design.
- `/settings` is much sparser than other modules and looks unfinished for a top-level System destination.
- `/admin/ticket-settings` is read-only but retains the editing-oriented “Configuration” label.
- `/recycle-bin` and `/trash` duplicate the same concept and dilute URL/navigation consistency.

### Empty, Loading, and Error States

- Service Catalog, My Requests, Tickets, and several admin pages contain reasonable explicit empty/error states.
- Dashboard module queries mostly collapse loading/error into empty arrays and trustworthy zeroes.
- Recycle-bin dashboard summary disappears entirely when its queries fail or return zero, so unavailable and empty are indistinguishable.
- Mailbox has an error alert but no retry action.
- CMDB can disable creation when asset types are missing without explaining whether data is loading, failed, or unconfigured.

### Information Architecture and Labels

- Service Catalog and Notifications are accessible routes but absent from the sidebar and command palette.
- Dashboard “Quick Actions” labels imply creation but navigate to lists.
- “My Work” uses hard-coded role identities rather than the authenticated user, making the label misleading.
- Diagnostics mixes local QA/demo utilities with production-style health indicators.
- Reports look authoritative but use local browser data.

### Accessibility

- Confirmed unlabeled icon buttons exist in the ticket reply toolbar, audit row actions, and multiple overflow menus.
- Dashboard customization switches lack an associated visible label via `htmlFor`, `aria-label`, or `aria-labelledby` (`src/routes/index.tsx:780-789`).
- Several metric cards are buttons with good focus styling, but many table and card controls rely on icon recognition or hover tooltips.
- Native `prompt()` in Tasks is not consistent with the application’s dialog accessibility or validation patterns.
- Wide tables create keyboard and zoom usability problems even where horizontal scrolling technically exists.

### Data Trust

- Dashboard, Reports, Command Palette, Diagnostics, Settings, and saved task views use browser-local stores alongside live backend modules.
- The UI does not consistently label which data is local, seeded, live, or per-user.
- Local store keys are not visibly scoped by authenticated user, so shared-browser account transitions risk showing stale prior-user content.

## 7. Safe Improvement Backlog

### Critical

1. Restore the New Request workflow by aligning `/requests/new` with the existing authorized route contract through a separately reviewed authorization milestone.
2. Stop presenting browser-local dashboard/report data as live production data.
3. Replace Reports with live authorized query sources or hide the module until accurate.
4. Add visible dashboard loading/error states so failures never appear as healthy zeroes.

### High

1. Implement or remove Ticket Wizard Save Draft.
2. Remove or implement the four dead reply-composer controls and label all icon buttons.
3. Replace dashboard ticket filter `sessionStorage` handoff with typed URL search state.
4. Route Quick Actions to actual create experiences.
5. Add confirmations for task bulk Archive/Delete and protocol lifecycle decisions.
6. Open selected records from dashboard alerts and command-palette results.
7. Separate production Diagnostics from browser-local QA/demo tools.
8. Add mobile alternatives for admin catalog and user tables.

### Medium

1. Add Service Catalog and Notifications to permission-aware navigation.
2. Replace native task tag prompt with an application dialog.
3. Add accessible names/tooltips to audit, row-menu, delete-step, and overflow icon buttons.
4. Associate dashboard customization switches with their labels.
5. Clarify browser-local preferences and saved-view scope.
6. Improve tablet/mobile filter composition for Tickets, Tasks, CMDB, and IPAM.
7. Canonicalize `/trash` versus `/recycle-bin`.
8. Add retry controls to Mailbox and other transient error states.

### Low

1. Rename Ticket Configuration to Configuration Overview while it is read-only.
2. Render routing-rule JSON as readable conditions/actions.
3. Explain disabled role-preview controls.
4. Align `/dashboard` sidebar active state with `/`.
5. Reduce raw caught-error console logging in production builds.

## 8. Final Recommendation

Do not declare the frontend production-ready until route-level request creation works and operational dashboards/reports use accurate live data. Those issues directly affect whether users can complete primary work and trust what the application tells them.

The first remediation milestone should cover only the broken New Request route and have explicit authorization review. The next frontend-only milestone should remove false actions and dead controls: Save Draft, dashboard filter handoff, Quick Actions, and reply-toolbar icons. A third milestone should replace local dashboard/report/search sources with existing live query layers and add loading/error differentiation. Responsive table redesign, navigation discoverability, labeling, and visual polish can follow after workflow and data-integrity defects are resolved.

## Audit Integrity

- No source files were edited.
- No forms were submitted.
- No database, Supabase, migration, backend, auth, RBAC, route-guard, generated, operations, or deployment files were changed.
- No commit, pull, push, restart, deployment, or migration was performed.
- Runtime browser automation was not created because the local endpoint and installed browser tooling were unavailable.
