# Clean Deployment Replay Test - 2026-06-14

Status: PASSED - clean replay and live schema comparison completed.

## Acceptance result

The clean deployment replay test was executed against a disposable database and compared against the current live schema using schema-only exports.

Result: PASSED.

Evidence:

- All 22 tracked migrations are present under `supabase/migrations/`.
- No production SQL remains hidden under `supabase/pending/`; that directory contains transaction-backed `.qa.sql` files only.
- The disposable database was reset from the clean pre-ITKC Supabase baseline.
- All 22 tracked migrations replayed successfully on the disposable database.
- The live database was exported read-only with `pg_dump --schema-only`.
- Replay and live schema-only dumps were compared with `scripts/qa/verify_clean_deployment_schema_equivalence.sh`.
- The first comparison showed only internal `TO postgres` owner-role grant differences.
- After normalizing those internal owner-role grants, the verifier reported `PASS`.
- No missing application tables, functions, policies, or grants were found.
- No live database write was performed.
- No service restart was performed.

## Evidence location

- Disposable replay evidence directory: `/opt/it-knowledge-center/app/.artifacts/clean-deployment-replay/20260614_190728`
- Normalized verifier result: `/opt/it-knowledge-center/app/.artifacts/clean-deployment-replay/20260614_190728/evidence-normalized-postgres-grants/result.txt`

## Repository gate

`script/qa/verify_clean_deployment_schema_equivalence.sh` compares two schema-only dumps and retains normalized evidence. It fails when tables, functions, policies, grants, or any other dumped application schema definition differs. It also fails if tracked and present migration inventories diverge or if production SQL is found under `supabase/pending/`.

The static QA script `scripts/qa/production_hardening_clean_deployment_replay.sh` exercises the matching-schema pass path and missing table, function, policy, and grant failure paths without opening a database connection.

## Approved execution summary

The approved execution used Docker-local PostgreSQL tooling through the `supabase-db` container.

1. A disposable database was recreated.
2. The clean baseline dump was restored.
3. All 22 tracked migrations were applied in sorted migration order.
4. Replay and live schema-only dumps were exported with identical options.
5. The schema-equivalence verifier was run.
6. Only internal `TO postgres` grant differences were found and normalized.
7. The verifier then reported `PASS`.

## Required final evidence

- Disposable database creation/reset record.
- Exact commit and ordered 22-migration manifest.
- Per-migration success log with no retry or manual repair SQL.
- Schema-only replay and live dumps generated with identical options.
- `result.txt` reporting `PASS`.
- Confirmation that no application table, function, policy, grant, or other schema definition differs.
- Confirmation that live DB was read only for schema export.
