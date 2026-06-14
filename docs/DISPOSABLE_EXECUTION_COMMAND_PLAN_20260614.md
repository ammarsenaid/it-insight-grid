# Disposable Execution Command Plan - 2026-06-14

## Current readiness status

Milestone 38 prepares a human-review command sequence only. The production
decision remains **NO-GO**. Commands are inert documentation only.

No command in this document may be run without a later explicit approval.

The live DB must not be touched.

Disposable execution requires a later milestone.

## What is behind us

- Milestone 35 added the preparation-only runner
  `scripts/qa/run_disposable_full_chain_validation.sh`, which exits before all
  database, migration, and QA SQL commands.
- Milestone 36 added
  `docs/DISPOSABLE_FULL_CHAIN_VALIDATION_RUNBOOK_20260614.md`, which freezes the
  execution order and disposable-only safety rules.
- Milestone 37 added
  `docs/DISPOSABLE_DATABASE_PREFLIGHT_20260614.md`, which defines the approval,
  target, secret, backup, evidence, refusal, and pass/fail checks.

## What is still not authorized

This milestone does not authorize database creation, migration execution, QA
execution, cleanup, or live deployment. It also does not authorize database
connection or inspection, Docker use, service operation, promotion from
`supabase/pending/`, or execution of the Milestone 35 runner.

All examples below are comment-prefixed templates for later human review. They
are intentionally incomplete and non-runnable. A later approved milestone must
replace every angle-bracket placeholder, review every resulting command, and
authorize the exact target and operation before any command is entered.

## Required operator/reviewer confirmation

- [ ] The later approval names one operator and one independent reviewer.
- [ ] Both confirm the exact branch, commit, working-tree scope, target host,
      target database name, credential boundary, backup decision, evidence
      folder, stop conditions, and cleanup owner.
- [ ] Both compare this plan with the Milestone 35 runner, Milestone 36 runbook,
      and Milestone 37 preflight.
- [ ] Both sign the exact expanded commands before the first database action.
- [ ] The reviewer has authority to stop the run immediately.

## Required disposable database name pattern

Use `itkc_disposable_full_chain_YYYYMMDD_HHMMSS`. The lowercase name must
contain `disposable` or `staging` and must not equal `postgres`, `supabase`,
`production`, `prod`, `live`, `it_knowledge_center`, or `itkc`. A compliant name
does not make an unknown, shared, or live host acceptable.

## Required target identity checks

- [ ] Set the host and database name explicitly; do not source `.env` files or
      inherit live environment configuration.
- [ ] Operator and reviewer independently compare the printed host and database
      name with the approved target record before every database phase.
- [ ] Confirm the target is fresh, isolated, disposable-only, and has no route,
      alias, proxy, tunnel, fallback, credentials, backup, or service connection
      to any live system.
- [ ] Stop on any mismatch, ambiguity, unexpected prompt, or live indicator.

## Required non-secret evidence folder plan

The later approval must name a repository-external or ignored evidence folder.
It must contain only non-secret timestamps, repository identity, target labels,
reviewed command transcripts, ordered results, checksums, failure details,
reviewer decisions, and cleanup evidence. It must not contain passwords, tokens,
private keys, service-role keys, connection strings, database URLs, private
object URLs, or reusable authentication material.

## Command phases for a later milestone

Every line in the fenced examples is prefixed with `#` and is inert. Do not
remove the prefix or substitute placeholders in Milestone 38.

### Phase A - Verify repo state

```text
# cd /opt/it-knowledge-center/app
# test "$(id -un)" = "mit"
# test "$(git branch --show-current)" = "hardening/production-readiness-20260612"
# git status --short --branch
# git rev-parse HEAD
```

The later approval must identify the expected commit and define whether any
working-tree change is permitted during execution.

### Phase B - Define disposable-only variables

```text
# DISPOSABLE_DATABASE_HOST='<APPROVED_DISPOSABLE_HOST>'
# DISPOSABLE_DATABASE_NAME='itkc_disposable_full_chain_YYYYMMDD_HHMMSS'
# DISPOSABLE_VALIDATION_MODE='<LATER_APPROVED_EXECUTION_MODE>'
# DISPOSABLE_EVIDENCE_DIR='<APPROVED_NON_SECRET_EVIDENCE_FOLDER>'
```

No credential, connection string, or database URL may appear in the plan,
terminal transcript, evidence folder, or shell history.

### Phase C - Print and confirm target identity

```text
# printf 'Disposable host: %s\n' "$DISPOSABLE_DATABASE_HOST"
# printf 'Disposable database: %s\n' "$DISPOSABLE_DATABASE_NAME"
# printf 'Evidence folder: %s\n' "$DISPOSABLE_EVIDENCE_DIR"
# printf 'Operator: <APPROVED_OPERATOR>\nReviewer: <APPROVED_REVIEWER>\n'
# printf 'Typed confirmation required: <LATER_APPROVED_EXACT_PHRASE>\n'
```

The operator and reviewer must compare this output with the signed approval.
No connectivity check is part of target confirmation.

### Phase D - Create evidence folder

```text
# test -n "$DISPOSABLE_EVIDENCE_DIR"
# mkdir -p -- "$DISPOSABLE_EVIDENCE_DIR"
# chmod 700 -- "$DISPOSABLE_EVIDENCE_DIR"
```

Folder creation is deferred. The later milestone must approve its exact path,
retention, access, and secret-screening process.

### Phase E - List exact 12 migrations

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

```text
# printf '%s\n' '<THE_12_REVIEWED_MIGRATION_PATHS_IN_THE_ORDER_ABOVE>'
```

### Phase F - List exact 12 QA SQL files

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

```text
# printf '%s\n' '<THE_12_REVIEWED_QA_SQL_PATHS_IN_THE_ORDER_ABOVE>'
```

### Phase G - Future database creation placeholder

```text
# psql <LATER_REVIEWED_DISPOSABLE_ADMIN_ARGUMENTS> \
#   --command '<LATER_REVIEWED_CREATE_DISPOSABLE_DATABASE_STATEMENT>'
# docker <NOT_PART_OF_THIS_PLAN_WITHOUT_SEPARATE_EXPLICIT_APPROVAL>
```

This placeholder is deliberately non-runnable. It does not select a tool,
credential source, host, or database-creation statement.

### Phase H - Future migration application placeholder

```text
# for migration in <THE_12_REVIEWED_MIGRATION_PATHS_IN_ORDER>; do
#   psql <LATER_REVIEWED_DISPOSABLE_TARGET_ARGUMENTS> \
#     --file "$migration" <LATER_REVIEWED_FAIL_FAST_AND_LOGGING_ARGUMENTS>
# done
```

The later milestone must preserve serial order, stop on the first failure, and
prohibit retries or manual schema repair during the run.

### Phase I - Future QA execution placeholder

```text
# for qa_sql in <THE_12_REVIEWED_QA_SQL_PATHS_IN_ORDER>; do
#   psql <LATER_REVIEWED_DISPOSABLE_TARGET_ARGUMENTS> \
#     --file "$qa_sql" <LATER_REVIEWED_FAIL_FAST_AND_LOGGING_ARGUMENTS>
# done
```

QA may begin only after all twelve migrations pass against the same verified
disposable target.

### Phase J - Future result capture placeholder

```text
# printf '%s\n' '<REPOSITORY_IDENTITY>' > '<APPROVED_EVIDENCE_PATH>/repo.txt'
# printf '%s\n' '<NON_SECRET_TARGET_LABELS>' > '<APPROVED_EVIDENCE_PATH>/target.txt'
# printf '%s\n' '<ORDERED_RESULTS_AND_DURATIONS>' > '<APPROVED_EVIDENCE_PATH>/results.txt'
# printf '%s\n' '<REVIEWER_PASS_OR_FAIL_DECISION>' > '<APPROVED_EVIDENCE_PATH>/decision.txt'
```

Result capture must exclude all secrets and preserve the first failure without
continuing to later phases.

### Phase K - Future cleanup placeholder

```text
# printf 'Reconfirm disposable target before cleanup: %s / %s\n' \
#   "$DISPOSABLE_DATABASE_HOST" "$DISPOSABLE_DATABASE_NAME"
# psql <LATER_REVIEWED_DISPOSABLE_ADMIN_ARGUMENTS> \
#   --command '<LATER_REVIEWED_DROP_ONLY_THE_VERIFIED_DISPOSABLE_DATABASE_STATEMENT>'
```

Cleanup requires a fresh reviewer confirmation after evidence is secured. It
must refuse an unknown, changed, shared, or live target.

## Authorization boundary

These command templates are not an execution script. Passing static review does
not prove connectivity, migration behavior, QA behavior, or cleanup safety. No
database creation, connection, migration, QA, result capture, cleanup, Docker,
or live deployment action is approved by Milestone 38. Disposable execution
still requires a later milestone and live deployment requires a separate later
review even after a successful disposable run.
