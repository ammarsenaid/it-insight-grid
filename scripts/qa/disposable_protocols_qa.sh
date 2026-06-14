#!/usr/bin/env bash
# ============================================================
# Disposable-database QA runbook: Protocols backend (Milestone 29)
# ============================================================
#
# Run this on the host where the Supabase Postgres container is reachable
# via `docker exec` (NOT inside the sandbox app container). It:
#
#   1. Inspects the live database read-only (counts, table presence, schema hash)
#   2. Clones the live database into a brand-new disposable database
#   3. Applies the Notes migration to the disposable DB only if missing
#   4. Applies the Protocols migration to the disposable DB
#   5. Runs the Notes QA file (only if Notes was newly applied) and the
#      Protocols QA file against the disposable DB
#   6. Verifies the Protocols objects exist in the disposable DB
#   7. Re-inspects the live database and confirms it is unchanged
#   8. Drops the disposable database
#
# SAFETY:
#   - All commands that write data run with `-d "$DISPOSABLE_DB"`.
#   - The only commands run against "$LIVE_DB" are read-only SELECTs and a
#     read-only `pg_dump`.
#   - The disposable database name is generated (itkc_disposable_protocols_qa_<ts>)
#     and is verified via current_database() before being dropped.
#   - This script does NOT restart docker/postgres/supabase/nginx/frontend
#     and does NOT push/commit anything.
#
# CONFIGURE before running:
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-supabase-db}"   # docker container running Postgres
PG_SUPERUSER="${PG_SUPERUSER:-supabase_admin}"      # role with CREATEDB privilege
LIVE_DB="${LIVE_DB:-postgres}"                # live Supabase database name

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
notes_sql="$root/supabase/pending/20260615000000_notes_backend.sql"
notes_qa="$root/supabase/pending/20260615000000_notes_backend.qa.sql"
protocols_sql="$root/supabase/pending/20260616000000_protocols_backend.sql"
protocols_qa="$root/supabase/pending/20260616000000_protocols_backend.qa.sql"

ts=$(date +%Y%m%d%H%M%S)
DISPOSABLE_DB="itkc_disposable_protocols_qa_${ts}"

dpsql() { # run psql against a given database
  local db=$1; shift
  docker exec -i "$PG_CONTAINER" psql -X -q -U "$PG_SUPERUSER" -d "$db" -v ON_ERROR_STOP=1 "$@"
}

dpsql_scalar() { # run a single SQL expression and print the bare result
  local db=$1 sql=$2
  docker exec -i "$PG_CONTAINER" psql -X -At -U "$PG_SUPERUSER" -d "$db" -v ON_ERROR_STOP=1 -c "$sql"
}

dpsql_file() { # run a host SQL file against a given database through stdin
  local db=$1 file=$2
  docker exec -i "$PG_CONTAINER" psql -X -q -U "$PG_SUPERUSER" -d "$db" -v ON_ERROR_STOP=1 < "$file"
}

echo "==> Config: container=$PG_CONTAINER user=$PG_SUPERUSER live_db=$LIVE_DB disposable_db=$DISPOSABLE_DB"

# ------------------------------------------------------------
# Step 1: read-only inspection of the live database
# ------------------------------------------------------------
echo "==> Step 1: inspecting live database (read-only)"
live_users_before=$(dpsql_scalar "$LIVE_DB" "select count(*) from auth.users;")
live_tables_before=$(dpsql_scalar "$LIVE_DB" "select count(*) from information_schema.tables where table_schema = 'public';")
notes_present_live=$(dpsql_scalar "$LIVE_DB" "select to_regclass('public.notes') is not null;")
protocols_present_live=$(dpsql_scalar "$LIVE_DB" "select to_regclass('public.protocol_templates') is not null;")
live_schema_hash_before=$(docker exec "$PG_CONTAINER" pg_dump -U postgres -d "$LIVE_DB" --schema-only --schema=public --no-owner --no-privileges | md5sum | cut -d' ' -f1)

echo "    auth.users count        : $live_users_before"
echo "    public table count      : $live_tables_before"
echo "    notes tables present    : $notes_present_live"
echo "    protocols tables present: $protocols_present_live"
echo "    public schema hash      : $live_schema_hash_before"

if [[ "$protocols_present_live" == "t" ]]; then
  echo "ERROR: protocol_templates already exists on the live database. Refusing to continue." >&2
  exit 1
fi

# ------------------------------------------------------------
# Step 2: clone live database into a disposable database
# ------------------------------------------------------------
echo "==> Step 2: creating disposable database $DISPOSABLE_DB from a live clone"
docker exec "$PG_CONTAINER" createdb -U "$PG_SUPERUSER" "$DISPOSABLE_DB"
docker exec "$PG_CONTAINER" bash -c "pg_dump -U postgres -d '$LIVE_DB' --no-owner --no-privileges | psql -X -q -U '$PG_SUPERUSER' -d '$DISPOSABLE_DB' -v ON_ERROR_STOP=1" >/dev/null

disposable_ident=$(dpsql_scalar "$DISPOSABLE_DB" "select current_database();")
if [[ "$disposable_ident" != "$DISPOSABLE_DB" ]]; then
  echo "ERROR: disposable database identity check failed ($disposable_ident != $DISPOSABLE_DB)" >&2
  exit 1
fi
echo "    cloned ok, current_database() = $disposable_ident"

# ------------------------------------------------------------
# Step 3: apply Notes migration to the disposable DB, only if missing
# ------------------------------------------------------------
notes_present_disposable=$(dpsql_scalar "$DISPOSABLE_DB" "select to_regclass('public.notes') is not null;")
notes_applied_this_run=false
if [[ "$notes_present_disposable" == "f" ]]; then
  echo "==> Step 3: applying Notes migration to $DISPOSABLE_DB (missing)"
  dpsql_file "$DISPOSABLE_DB" "$notes_sql"
  notes_applied_this_run=true
else
  echo "==> Step 3: Notes tables already present in $DISPOSABLE_DB, skipping"
fi

# ------------------------------------------------------------
# Step 4: apply Protocols migration to the disposable DB
# ------------------------------------------------------------
echo "==> Step 4: applying Protocols migration to $DISPOSABLE_DB"
dpsql_file "$DISPOSABLE_DB" "$protocols_sql"

# ------------------------------------------------------------
# Step 5: run QA files
# ------------------------------------------------------------
if [[ "$notes_applied_this_run" == "true" ]]; then
  echo "==> Step 5a: running Notes QA against $DISPOSABLE_DB"
  dpsql_file "$DISPOSABLE_DB" "$notes_qa"
fi

echo "==> Step 5b: running Protocols QA against $DISPOSABLE_DB"
dpsql_file "$DISPOSABLE_DB" "$protocols_qa"

# ------------------------------------------------------------
# Step 6: verify Protocols objects exist in the disposable DB
# ------------------------------------------------------------
echo "==> Step 6: verifying Protocols objects in $DISPOSABLE_DB"
dpsql "$DISPOSABLE_DB" -c "
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('protocol_templates','protocol_runs','protocol_run_comments')
 order by table_name;
"
dpsql "$DISPOSABLE_DB" -c "
select routine_name
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in (
     'list_protocol_templates','list_protocol_runs','save_protocol_template',
     'set_protocol_template_archived','duplicate_protocol_template',
     'soft_delete_protocol_template','restore_protocol_template',
     'start_protocol_run','set_protocol_run_status','update_protocol_run_step',
     'add_protocol_run_approval','add_protocol_run_comment','assert_protocols_manage'
   )
 order by routine_name;
"
dpsql "$DISPOSABLE_DB" -c "
select relname, relrowsecurity
  from pg_class
 where relname in ('protocol_templates','protocol_runs','protocol_run_comments')
 order by relname;
"

# ------------------------------------------------------------
# Step 7: verify the live database is unchanged
# ------------------------------------------------------------
echo "==> Step 7: re-inspecting live database (read-only)"
live_users_after=$(dpsql_scalar "$LIVE_DB" "select count(*) from auth.users;")
live_tables_after=$(dpsql_scalar "$LIVE_DB" "select count(*) from information_schema.tables where table_schema = 'public';")
live_schema_hash_after=$(docker exec "$PG_CONTAINER" pg_dump -U postgres -d "$LIVE_DB" --schema-only --schema=public --no-owner --no-privileges | md5sum | cut -d' ' -f1)

echo "    auth.users count   : $live_users_after (was $live_users_before)"
echo "    public table count : $live_tables_after (was $live_tables_before)"
echo "    public schema hash : $live_schema_hash_after (was $live_schema_hash_before)"

live_unchanged=true
if [[ "$live_users_after" != "$live_users_before" ]]; then live_unchanged=false; fi
if [[ "$live_tables_after" != "$live_tables_before" ]]; then live_unchanged=false; fi
if [[ "$live_schema_hash_after" != "$live_schema_hash_before" ]]; then live_unchanged=false; fi

if [[ "$live_unchanged" == "true" ]]; then
  echo "    LIVE DATABASE UNCHANGED: yes"
else
  echo "    LIVE DATABASE UNCHANGED: NO -- investigate before proceeding" >&2
fi

# ------------------------------------------------------------
# Step 8: drop the disposable database
# ------------------------------------------------------------
echo "==> Step 8: dropping disposable database $DISPOSABLE_DB"
final_ident=$(dpsql_scalar "$DISPOSABLE_DB" "select current_database();")
if [[ "$final_ident" != "$DISPOSABLE_DB" || "$DISPOSABLE_DB" != itkc_disposable_protocols_qa_* ]]; then
  echo "ERROR: refusing to drop database that does not match the disposable identity check" >&2
  exit 1
fi
docker exec "$PG_CONTAINER" dropdb -U "$PG_SUPERUSER" "$DISPOSABLE_DB"

echo "==> Done. Protocols disposable QA passed: $DISPOSABLE_DB (dropped)."
if [[ "$live_unchanged" != "true" ]]; then
  exit 1
fi
