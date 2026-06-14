#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
verifier="$root/scripts/qa/verify_clean_deployment_schema_equivalence.sh"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"
runbook="$root/docs/CLEAN_DEPLOYMENT_REPLAY_TEST_20260614.md"
tmp=$(mktemp -d "$root/.clean-replay-test.XXXXXX")
trap 'rm -rf -- "$tmp"' EXIT

test -x "$verifier"
test -f "$status"
test -f "$runbook"

mapfile -t tracked < <(git -C "$root" ls-files 'supabase/migrations/*.sql' | LC_ALL=C sort)
mapfile -t present < <(cd "$root" && printf '%s\n' supabase/migrations/*.sql | LC_ALL=C sort)
test "${#tracked[@]}" -eq 22
diff -u <(printf '%s\n' "${tracked[@]}") <(printf '%s\n' "${present[@]}")

test "$(find "$root/supabase/pending" -maxdepth 1 -type f -name '*.sql' ! -name '*.qa.sql' | wc -l)" -eq 0

cat >"$tmp/replay.sql" <<'SQL'
-- Dumped from database version 15
SET statement_timeout = 0;
CREATE TABLE public.example (id integer NOT NULL);
CREATE TABLE public.example_extra (id integer NOT NULL);
CREATE FUNCTION public.example_fn() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
CREATE FUNCTION public.example_fn_extra() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;
CREATE POLICY example_select ON public.example FOR SELECT USING (true);
CREATE POLICY example_extra_select ON public.example_extra FOR SELECT USING (true);
GRANT SELECT ON TABLE public.example TO authenticated;
GRANT UPDATE ON TABLE public.example_extra TO authenticated;
SQL

cat >"$tmp/live.sql" <<'SQL'
-- Dumped from database version 16
SET lock_timeout = 0;
CREATE TABLE public.example (id integer NOT NULL);
CREATE TABLE public.example_extra (id integer NOT NULL);
CREATE FUNCTION public.example_fn() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
CREATE FUNCTION public.example_fn_extra() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;
CREATE POLICY example_select ON public.example FOR SELECT USING (true);
CREATE POLICY example_extra_select ON public.example_extra FOR SELECT USING (true);
GRANT SELECT ON TABLE public.example TO authenticated;
GRANT UPDATE ON TABLE public.example_extra TO authenticated;
SQL

"$verifier" "$tmp/replay.sql" "$tmp/live.sql" "$tmp/pass-evidence"
rg -Fq 'PASS: clean deployment replay schema matches live schema.' \
  "$tmp/pass-evidence/result.txt"
test ! -e "$tmp/pass-evidence/replay-vs-live.diff"

missing_definitions=(
  'CREATE TABLE public.example_extra (id integer NOT NULL);'
  'CREATE FUNCTION public.example_fn_extra() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;'
  'CREATE POLICY example_extra_select ON public.example_extra FOR SELECT USING (true);'
  'GRANT UPDATE ON TABLE public.example_extra TO authenticated;'
)

case_number=0
for missing_definition in "${missing_definitions[@]}"; do
  case_number=$((case_number + 1))
  case_dir="$tmp/fail-evidence-$case_number"
  awk -v omitted="$missing_definition" '$0 != omitted' \
    "$tmp/live.sql" >"$tmp/live-missing-$case_number.sql"

  if "$verifier" \
    "$tmp/replay.sql" \
    "$tmp/live-missing-$case_number.sql" \
    "$case_dir"; then
    printf 'ERROR: verifier accepted missing schema definition: %s\n' \
      "$missing_definition" >&2
    exit 1
  fi

  rg -Fq 'FAIL: clean deployment replay schema differs from live schema.' \
    "$case_dir/result.txt"
  test -s "$case_dir/replay-vs-live.diff"
done

rg -Fq 'Status: PASSED' "$runbook"
rg -Fq '22 tracked migrations' "$runbook"
rg -Fq 'No live database write was performed.' "$runbook"
rg -Fq '## Milestone 76 - Clean Deployment Replay Schema Equivalence Executed' "$status"

printf 'Clean deployment replay static assertions passed. No database contacted.\n'
