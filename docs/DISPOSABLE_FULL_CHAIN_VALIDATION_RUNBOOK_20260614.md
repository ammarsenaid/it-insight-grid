# Disposable Full-Chain Validation Runbook - 2026-06-14

## Scope and current status

This is the Milestone 36 human review runbook for a possible later disposable
full-chain validation. The production decision remains **NO-GO** as of
2026-06-14. The repository is not production ready because the twelve backend
migrations and their transaction-backed QA SQL remain under `supabase/pending/`
and have never been executed as a complete chain.

Milestone 35 added the preparation-only runner
`scripts/qa/run_disposable_full_chain_validation.sh`. That runner prints the
ordered manifests and exits before every database, migration, or QA SQL command.
Do not execute it under this milestone. This runbook is review documentation
only and does not authorize database access or SQL execution.

## Live database prohibition

The live DB must not be touched. It must not be connected to, inspected, cloned,
backed up, restored, migrated, queried, or used as a template or source for this
validation. The staged SQL has not been proven as a complete chain, so applying
it to live data could leave production unavailable, partially migrated, or
inconsistent with the frontend. Live credentials and inherited environment
configuration must not be used.

This validation is **disposable-only**. Every future command must target a
fresh, isolated, non-live database created specifically for the approved run.

## Prerequisite checklist

All items below require human verification before a later execution milestone:

- [ ] A separate milestone explicitly authorizes disposable database execution.
- [ ] A named human operator and reviewer are assigned for the complete run.
- [ ] The exact Git branch and commit are recorded, and the working tree is
      reviewed for unrelated changes.
- [ ] The Milestone 34 promotion plan and the Milestone 35 preparation-only
      runner have been reviewed without changing the ordered manifests.
- [ ] All twelve migration files and all twelve QA SQL files below exist and
      match the reviewed repository revision.
- [ ] A fresh isolated database host is available with no route to the live DB.
- [ ] Credentials are disposable-specific, least privilege for the approved
      task, and are not inherited from any live environment.
- [ ] The target database name passes the naming rule below and has been checked
      independently by both operator and reviewer.
- [ ] The backup rule below is satisfied and its evidence location is recorded.
- [ ] A result directory is chosen for timestamps, command output, checksums,
      schema inspection, and the final pass/fail decision; it contains no
      credentials or private object URLs.
- [ ] A stop condition, cleanup owner, and disposable-database destruction
      method are approved before the first database command.
- [ ] No migration file has been moved from `supabase/pending/` or semantically
      edited as part of execution preparation.

## Disposable-only safety rules

1. Use only the separately approved disposable host and database.
2. Set target variables explicitly for the run; do not source `.env` files or
   reuse shell state containing live configuration.
3. Print and verify the target host and database name before every database
   phase. Stop immediately on any mismatch or ambiguity.
4. Never use a live host, live database, live credentials, live storage bucket,
   production service, or production backup as the validation target or source.
5. Apply migrations serially in the exact order below. Do not skip, reorder,
   retry past a failure, or make manual schema repairs during the run.
6. Run QA SQL serially in the exact order below against the same disposable
   database only after all twelve migrations succeed.
7. Capture complete non-secret evidence for every step. Redact credentials,
   tokens, private keys, connection strings, and private object URLs.
8. Any unexpected prompt, target, warning, SQL error, QA failure, timeout, or
   evidence gap is a full-run failure and requires an immediate stop.
9. Do not continue to IPAM concurrency, Protocols disposable, storage-policy,
   browser, or schema-diff validation unless those phases are separately listed
   in the approved execution milestone.
10. Destroy only the verified disposable database after evidence is secured and
    the reviewer approves cleanup. Never run a destructive command against an
    unverified target.

## Required database naming rule

`DISPOSABLE_DATABASE_NAME` must be explicitly set, must contain the literal
lowercase marker `disposable` or `staging`, and must not equal any known live
name: `postgres`, `supabase`, `production`, `prod`, `live`,
`it_knowledge_center`, or `itkc`. The preferred form is
`itkc_disposable_full_chain_YYYYMMDD_HHMMSS`. A valid-looking name does not
override host verification: any live or uncertain host is an immediate refusal.

## Required backup rule

Before execution, record a backup decision and have the reviewer sign it. If the
approved disposable source or target contains any data that must survive, create
a restorable backup using only disposable credentials and verify the restore in
an isolated disposable environment before migration execution. Record the
backup identifier, creation time, checksum or integrity evidence, restore-test
result, retention owner, and deletion date. If the target is newly created and
empty, record `backup not applicable: fresh empty disposable database` with
operator and reviewer names. Never create, inspect, copy, or rely on a live
database backup for this validation.

## Exact migration order

1. `supabase/pending/20260611000000_service_desk_foundation.sql`
2. `supabase/pending/20260611010000_service_desk_rbac_expand.sql`
3. `supabase/pending/20260611020000_ticket_attachments.sql`
4. `supabase/pending/20260611030000_ticket_configuration.sql`
5. `supabase/pending/20260611040000_ticket_assignments.sql`
6. `supabase/pending/20260611050000_notifications.sql`
7. `supabase/pending/20260612235900_organization_foundation.sql`
8. `supabase/pending/20260613000000_cmdb_backend.sql`
9. `supabase/pending/20260613010000_ipam_backend.sql`
10. `supabase/pending/20260614000000_tasks_backend.sql`
11. `supabase/pending/20260615000000_notes_backend.sql`
12. `supabase/pending/20260616000000_protocols_backend.sql`

## Exact QA SQL order

Run these only after all twelve migrations succeed, against the same verified
disposable database:

1. `supabase/pending/20260611000000_service_desk_foundation.qa.sql`
2. `supabase/pending/20260611010000_service_desk_rbac_expand.qa.sql`
3. `supabase/pending/20260611020000_ticket_attachments.qa.sql`
4. `supabase/pending/20260611030000_ticket_configuration.qa.sql`
5. `supabase/pending/20260611040000_ticket_assignments.qa.sql`
6. `supabase/pending/20260611050000_notifications.qa.sql`
7. `supabase/pending/20260612235900_organization_foundation.qa.sql`
8. `supabase/pending/20260613000000_cmdb_backend.qa.sql`
9. `supabase/pending/20260613010000_ipam_backend.qa.sql`
10. `supabase/pending/20260614000000_tasks_backend.qa.sql`
11. `supabase/pending/20260615000000_notes_backend.qa.sql`
12. `supabase/pending/20260616000000_protocols_backend.qa.sql`

## Success path

Success means all prerequisites were evidenced, the verified target remained
disposable-only, all twelve migrations completed once in order, all twelve QA
SQL files completed once in order and rolled back their fixtures as designed,
no unexpected warning or manual repair occurred, and complete non-secret logs
were captured. Success also requires reviewer confirmation that the live DB was
not touched and that cleanup affected only the named disposable database.

After success, preserve the reviewed evidence and record the exact branch,
commit, target identity, ordered results, durations, schema findings, cleanup
result, and remaining release blockers. Update the hardening status in a new
repository milestone. Disposable success is evidence for a later promotion or
deployment review only; it is not permission to move files, run against live,
or deploy.

## Failure path

Failure means any prerequisite is missing, the target cannot be proven
disposable, a migration or QA SQL file fails or runs out of order, manual repair
is needed, evidence is incomplete, the target changes unexpectedly, cleanup is
uncertain, or there is any possibility that a live system was contacted.

After failure, stop immediately and do not run later migrations, QA SQL, retries,
repairs, or cleanup until the target is re-verified. Preserve non-secret logs,
record the first failing step and database state, notify the assigned reviewer,
and open a narrowly scoped remediation milestone. A rerun requires a newly
approved fresh disposable database and must restart from migration 1. If live
contact is suspected, treat it as an incident and follow human-directed incident
handling; do not investigate by issuing more database commands.

## Authorization boundary

This runbook does not authorize live deployment. It also does not authorize
database creation, connection, migration execution, QA SQL execution, promotion
from `supabase/pending/`, storage validation, service operation, or disposable
cleanup. Each execution action requires a later explicit human-approved
milestone, and live deployment requires a separate explicit review and approval
even after a fully successful disposable run.
