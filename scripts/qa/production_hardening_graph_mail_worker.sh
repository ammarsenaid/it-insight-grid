#!/usr/bin/env bash
set -euo pipefail
set +x

migration="supabase/migrations/20260624142000_microsoft_graph_mail_intake_rpc.sql"
worker="scripts/workers/microsoft-graph-mail-intake.mjs"

test -f "$migration"
test -f "$worker"

rg -Fq "create or replace function public.process_microsoft_graph_mail" "$migration"
rg -Fq "provider = 'microsoft_graph'" "$migration"
rg -Fq "source_email" "$migration"
rg -Fq "'email'" "$migration"
rg -Fq "grant execute on function public.process_microsoft_graph_mail" "$migration"
rg -Fq "to service_role" "$migration"

rg -Fq "MICROSOFT_TENANT_ID" "$worker"
rg -Fq "MICROSOFT_CLIENT_ID" "$worker"
rg -Fq "MICROSOFT_CLIENT_SECRET" "$worker"
rg -Fq "ITKC_MAIL_INTAKE_MAILBOX" "$worker"
rg -Fq "ITKC_MAIL_INTAKE_SINCE_ISO" "$worker"
rg -Fq "https://graph.microsoft.com/v1.0/users/" "$worker"
rg -Fq "/rest/v1/rpc/process_microsoft_graph_mail" "$worker"

if rg -i "client_secret=|secret_value|paste_secret|password=" "$migration" "$worker"; then
  echo "ERROR: secret-looking literal found in committed files."
  exit 1
fi

if rg -i "markasread|isRead.*true|PATCH.*graph.microsoft" "$worker"; then
  echo "ERROR: worker must not mark mail as read in this phase."
  exit 1
fi

echo "Microsoft Graph mail worker static QA passed."
