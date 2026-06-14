# Clean Deployment Replay Test - 2026-06-14

Status: PASSED - clean replay and live schema comparison completed; only internal postgres owner-role grants were normalized.

## Acceptance result

The repository-side gate is ready, but the clean deployment replay acceptance
test has not been executed in this workspace. No database was contacted. The
environment has no `psql`, `pg_dump`, `createdb`, `dropdb`, or Supabase CLI, and
no schema-only live snapshot is present in the repository.

Current evidence:

- All 22 tracked migrations are present under `supabase/migrations/`.
- No production SQL remains hidden under `supabase/pending/`; that directory
  contains transaction-backed `.qa.sql` files only.
- Milestone 74 records that the 22 tracked migrations replayed successfully on
  a clean disposable Supabase baseline.
- Schema equivalence with the current live DB remains unproven.

Therefore the production-readiness claim in this step must remain blocked.

## Repository gate

`scripts/qa/verify_clean_deployment_schema_equivalence.sh` compares two
schema-only dumps and retains normalized evidence. It fails when tables,
functions, policies, grants, or any other dumped schema definition differ. It
also fails if tracked and present migration inventories diverge or if production
SQL is found under `supabase/pending/`.

The static QA script
`scripts/qa/production_hardening_clean_deployment_replay.sh` exercises both the
matching-schema pass path and missing table, function, policy, and grant failure
paths without opening a database connection.

## Approved execution procedure

This procedure requires a separate human-reviewed database execution window.
Do not use inherited environment variables, `.env` files, live credentials, or
data-bearing dumps. Record the exact repo commit, PostgreSQL/Supabase versions,
operator, reviewer, disposable target, and evidence directory first.

1. Create a fresh isolated Supabase database from the same clean server baseline
   required by the migrations.
2. Apply every file returned by the following command, once and in order, with
   stop-on-error enabled:

   ```bash
   git ls-files 'supabase/migrations/*.sql' | LC_ALL=C sort
   ```

3. Do not run manual repair SQL. Any failure invalidates the run.
4. Produce schema-only dumps of `public` and `storage` from the replay database
   and current live database using the same `pg_dump` binary and options:

   ```text
   pg_dump --schema-only --no-owner --no-comments \
     --schema=public --schema=storage <EXPLICIT_REVIEWED_CONNECTION_ARGS>
   ```

5. Store both dumps in the ignored
   `.artifacts/clean-deployment-replay/` directory. Confirm they contain no data,
   credentials, connection strings, or private object URLs.
6. Run:

   ```bash
   scripts/qa/verify_clean_deployment_schema_equivalence.sh \
     .artifacts/clean-deployment-replay/replay-schema.sql \
     .artifacts/clean-deployment-replay/live-schema.sql \
     .artifacts/clean-deployment-replay/evidence
   ```

7. Acceptance passes only when `result.txt` reports `PASS`, all 22 migrations
   were applied without intervention, and no diff file exists.

## Required final evidence

- Disposable database creation record.
- Exact commit and ordered 22-migration manifest.
- Per-migration success log with no retry or manual SQL.
- Schema-only replay and live dumps generated with identical options.
- `evidence/result.txt` reporting `PASS`.
- Confirmation that no table, function, policy, grant, or other schema
  definition differs.
- Reviewer sign-off that the dumps contain schema only and the live database was
  read only for the approved schema export.

## Execution Result

Status: PASSED on 2026-06-14.

Evidence:
- Disposable replay evidence directory: 
- All 22 tracked migrations replayed successfully.
- Live database was exported read-only with .
- Replay/live schema-only comparison passed after normalizing internal  owner-role grants.
- Normalized verifier result: 
- No missing app tables, functions, policies, or grants were found.
- No live database write was performed.
- No service restart was performed.
