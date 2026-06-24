#!/usr/bin/env bash
set -euo pipefail
set +x

migration="supabase/migrations/20260624120000_email_ingestion_foundation.sql"

test -f "$migration"

rg -Fq "create table if not exists public.email_ingestion_messages" "$migration"
rg -Fq "constraint email_ingestion_messages_provider_unique" "$migration"
rg -Fq "create or replace function public.simulate_inbound_mail" "$migration"
rg -Fq "source_email" "$migration"
rg -Fq "'email'" "$migration"
rg -Fq "'simulation'" "$migration"
rg -Fq "No direct browser insert/update/delete policies" "$migration"
rg -Fq "grant select on table public.email_ingestion_messages to authenticated" "$migration"
rg -Fq "grant execute on function public.simulate_inbound_mail" "$migration"

if rg -i "client_secret|imap_password|smtp_password|oauth_secret|refresh_token|access_token|service_role_key" "$migration"; then
  echo "ERROR: migration appears to contain secret/credential storage language."
  exit 1
fi

echo "Email ingestion static QA passed."
