#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

if [[ "$#" -ne 3 ]]; then
  printf 'Usage: %s <replay-schema.sql> <live-schema.sql> <evidence-dir>\n' "$0" >&2
  exit 2
fi

replay_dump=$1
live_dump=$2
evidence_dir=$3

for dump in "$replay_dump" "$live_dump"; do
  if [[ ! -f "$dump" || ! -s "$dump" ]]; then
    printf 'ERROR: schema dump is missing or empty: %s\n' "$dump" >&2
    exit 1
  fi
done

mapfile -t tracked_migrations < <(
  git -C "$root" ls-files 'supabase/migrations/*.sql' | LC_ALL=C sort
)
mapfile -t present_migrations < <(
  cd "$root"
  printf '%s\n' supabase/migrations/*.sql | LC_ALL=C sort
)

if [[ "${#tracked_migrations[@]}" -eq 0 ]]; then
  printf 'ERROR: no tracked migrations found.\n' >&2
  exit 1
fi

if ! diff -u \
  <(printf '%s\n' "${tracked_migrations[@]}") \
  <(printf '%s\n' "${present_migrations[@]}") >/dev/null; then
  printf 'ERROR: tracked and present migration inventories differ.\n' >&2
  exit 1
fi

while IFS= read -r pending_sql; do
  case "$pending_sql" in
    *.qa.sql) ;;
    *)
      printf 'ERROR: hidden production SQL remains outside the migration chain: %s\n' \
        "$pending_sql" >&2
      exit 1
      ;;
  esac
done < <(cd "$root" && find supabase/pending -maxdepth 1 -type f -name '*.sql' -print | LC_ALL=C sort)

assert_schema_dump() {
  local dump=$1

  if rg -q '^COPY |^INSERT INTO ' "$dump"; then
    printf 'ERROR: expected schema-only dump, but data statements were found: %s\n' \
      "$dump" >&2
    exit 1
  fi

  for required in \
    'CREATE TABLE public.' \
    'CREATE FUNCTION public.' \
    'CREATE POLICY ' \
    'GRANT '; do
    if ! rg -Fq "$required" "$dump"; then
      printf 'ERROR: schema dump lacks required object class %q: %s\n' \
        "$required" "$dump" >&2
      exit 1
    fi
  done
}

normalize_dump() {
  sed -E \
    -e '/^--/d' \
    -e '/^SET /d' \
    -e '/^SELECT pg_catalog\.set_config/d' \
    -e '/^GRANT .* TO postgres;/d' \
    -e '/^\\(un)?restrict /d' \
    -e '/^[[:space:]]*$/d' \
    "$1"
}

assert_schema_dump "$replay_dump"
assert_schema_dump "$live_dump"

mkdir -p -- "$evidence_dir"
chmod 700 -- "$evidence_dir"

manifest="$evidence_dir/tracked-migrations.txt"
replay_normalized="$evidence_dir/replay-schema.normalized.sql"
live_normalized="$evidence_dir/live-schema.normalized.sql"
schema_diff="$evidence_dir/replay-vs-live.diff"
summary="$evidence_dir/result.txt"

printf '%s\n' "${tracked_migrations[@]}" >"$manifest"
normalize_dump "$replay_dump" >"$replay_normalized"
normalize_dump "$live_dump" >"$live_normalized"

if ! diff -u "$live_normalized" "$replay_normalized" >"$schema_diff"; then
  {
    printf 'FAIL: clean deployment replay schema differs from live schema.\n'
    printf 'Tracked migrations: %s\n' "${#tracked_migrations[@]}"
    printf 'Diff: %s\n' "$schema_diff"
  } | tee "$summary" >&2
  exit 1
fi

rm -f -- "$schema_diff"
{
  printf 'PASS: clean deployment replay schema matches live schema.\n'
  printf 'Tracked migration manifest entries: %s\n' "${#tracked_migrations[@]}"
  printf 'No hidden production SQL found under supabase/pending/.\n'
} | tee "$summary"
