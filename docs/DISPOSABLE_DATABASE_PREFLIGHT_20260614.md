# Disposable Database Preflight - 2026-06-14

## Current readiness status

Milestone 37 is repository-only preflight work. The production decision remains
**NO-GO**.

No database may be contacted in this milestone.

The live DB must not be touched.

Disposable execution requires a later milestone. That later milestone requires
explicit human approval.

## What is behind us

- Milestone 35 added the preparation-only runner
  `scripts/qa/run_disposable_full_chain_validation.sh`. It prints the reviewed
  manifests and exits before database, migration, or QA SQL execution.
- Milestone 36 added the human review runbook
  `docs/DISPOSABLE_FULL_CHAIN_VALIDATION_RUNBOOK_20260614.md`. It documents the
  future disposable-only execution order, safety rules, evidence requirements,
  and result handling.
- The twelve migrations and twelve QA SQL files remain staged under
  `supabase/pending/`; they have not been executed as a complete chain.

## What is in front of us

A later milestone may authorize a named operator and reviewer to provision and
use a fresh isolated disposable database, run the approved chain, collect
non-secret evidence, and perform separately approved cleanup. That later
milestone must define the exact target, commands, credentials boundary,
evidence location, backup decision, stop authority, and cleanup procedure.

## Why this is preflight only

This milestone records the decisions that must be made before execution can be
considered. It does not validate connectivity, credentials, database state,
migration behavior, QA SQL behavior, backup restoration, or cleanup. Performing
any of those actions would cross the authorization boundary for Milestone 37.

## What is still not authorized

Database creation, connection, inspection, querying, backup, restore, migration
execution, QA SQL execution, cleanup, deployment, service operation, and use of
the Milestone 35 runner are not authorized. No live or disposable database may
be contacted. No file may be promoted from `supabase/pending/`.

## Human approval requirements

- [ ] A later repository milestone explicitly authorizes disposable execution.
- [ ] The approval names one operator and one independent reviewer.
- [ ] The approval records the exact branch, commit, target host, target name,
      execution scope, evidence folder, backup decision, and cleanup owner.
- [ ] Both people confirm that the target is isolated from live systems and
      that no live credential or inherited live configuration will be used.
- [ ] Both people approve the exact commands before the first database action.
- [ ] A separate approval is required for any live deployment or promotion.

## Operator/reviewer checklist

- [ ] Operator and reviewer names and roles are recorded.
- [ ] Both reviewed the Milestone 35 runner and Milestone 36 runbook.
- [ ] Both independently verified the branch, commit, and clean execution scope.
- [ ] Both independently verified the target host and database name.
- [ ] Both signed the backup decision, evidence plan, stop conditions, and
      cleanup plan.
- [ ] The reviewer has authority to stop the run immediately.

## Target naming checklist

- [ ] `DISPOSABLE_DATABASE_NAME` will be set explicitly in the later milestone.
- [ ] The lowercase name contains `disposable` or `staging`.
- [ ] The name is not `postgres`, `supabase`, `production`, `prod`, `live`,
      `it_knowledge_center`, or `itkc`.
- [ ] The preferred unique form
      `itkc_disposable_full_chain_YYYYMMDD_HHMMSS` is used or any deviation is
      documented and approved.
- [ ] The host is separately verified; a valid-looking name never overrides an
      unknown, shared, or live host.

## Live DB refusal checklist

- [ ] The live DB must not be touched, contacted, inspected, cloned, queried,
      backed up, restored, migrated, or used as a source or template.
- [ ] The target has no route, alias, proxy, tunnel, or fallback to a live host.
- [ ] No live database name, host, credential, backup, storage bucket, or service
      is present in the approved execution inputs.
- [ ] Any uncertain or mismatched target identity causes immediate refusal.
- [ ] Suspected live contact is treated as an incident; no further database
      command is used to investigate it.

## Secret-handling checklist

- [ ] No `.env` file, credential file, token, password, private key,
      service-role key, connection string, or database URL is read or printed.
- [ ] Future credentials are disposable-specific and least privilege for the
      approved operation.
- [ ] Future target values are set explicitly without sourcing inherited shell
      or live-environment configuration.
- [ ] Logs, screenshots, checksums, and review notes contain no secrets, private
      object URLs, or reusable authentication material.
- [ ] Any accidental secret exposure stops the run and follows human-directed
      credential rotation and evidence-remediation procedures.

## Backup decision checklist

- [ ] Operator and reviewer record either an approved disposable backup plan or
      `backup not applicable: fresh empty disposable database`.
- [ ] If disposable data must survive, the later milestone defines backup,
      integrity verification, isolated restore testing, retention, and deletion.
- [ ] No live backup is created, inspected, copied, restored, or relied upon.
- [ ] Backup work, if required, is separately authorized before execution.

## Evidence folder checklist

- [ ] A repository-external or ignored evidence folder is named and approved
      before execution; Milestone 37 does not create it.
- [ ] The folder plan covers timestamps, branch and commit, target identity,
      command transcript, ordered results, checksums, schema findings, failures,
      reviewer decisions, and cleanup evidence.
- [ ] The folder must contain only non-secret evidence.
- [ ] Evidence ownership, retention, access, and final review are assigned.
- [ ] Missing, incomplete, or secret-bearing evidence is a failed run.

## Stop conditions

Stop before or during the later execution if approval is missing, the operator
or reviewer is unavailable, target identity is uncertain, a live indicator is
present, credentials are inherited or ambiguous, the branch or commit differs,
the working scope changes, an unexpected prompt or warning appears, any command
or ordered step differs from approval, a migration or QA assertion fails,
evidence is incomplete, cleanup is uncertain, or live contact is suspected.
Do not retry, repair, continue, or clean up until a human reviewer re-verifies
the target and authorizes the next action.

## Exact pass/fail criteria

**Milestone 37 passes** only when this preflight document and its static QA guard
exist, all required checklists and authorization statements are present, the
status document records Milestone 37, static validation passes, and no database,
Docker, sudo, network, migration, deployment, service, or Git-history action
occurred.

**Milestone 37 fails** if any required section or statement is missing, an active
`psql`, `docker`, or `sudo` command is added, any database is contacted, any
database is created or inspected, any migration or QA SQL is executed, the live
DB is touched, secrets are read or printed, or execution is implied to be
authorized by this milestone.

Passing Milestone 37 is documentation and static-guard evidence only. It does
not prove the pending chain and does not authorize execution. Disposable
execution requires a later milestone.
