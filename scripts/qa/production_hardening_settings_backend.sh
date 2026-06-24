#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

settings_route="$root/src/routes/settings.tsx"
service_queries="$root/src/lib/service-desk/queries.ts"
service_settings="$root/src/lib/service-desk/settings.ts"
ticket_config_sql="$root/supabase/migrations/20260611030000_ticket_configuration.sql"

rg -Fq 'import { useQuery } from "@tanstack/react-query";' "$settings_route"
rg -Fq 'mailboxConfigsQuery,' "$settings_route"
rg -Fq 'ticketCategoriesQuery,' "$settings_route"
rg -Fq 'ticketPriorityConfigsQuery,' "$settings_route"
rg -Fq 'slaPoliciesQuery,' "$settings_route"
rg -Fq 'enabled: canViewServiceDeskSettings' "$settings_route"
rg -Fq 'permissionKeys.includes("tickets.view_all")' "$settings_route"
rg -Fq 'permissionKeys.includes("tickets.config")' "$settings_route"
rg -Fq 'BackendMailboxPanel' "$settings_route"
rg -Fq 'useMutation, useQuery, useQueryClient' "$settings_route"
rg -Fq 'createMailboxConfig,' "$settings_route"
rg -Fq 'updateMailboxConfig,' "$settings_route"
rg -Fq 'deleteMailboxConfig,' "$settings_route"
rg -Fq 'Save mailbox metadata' "$settings_route"
rg -Fq 'Save changes' "$settings_route"
rg -Fq 'Test provider connection later' "$settings_route"
rg -Fq 'No secrets stored' "$settings_route"
rg -Fq 'queryClient.invalidateQueries({ queryKey: mailboxConfigsQuery().queryKey })' "$settings_route"
rg -Fq 'Provider testing requires the later Microsoft 365 / mail integration phase.' "$settings_route"
rg -Fq 'ServiceDeskDefaultsPanel' "$settings_route"
rg -Fq 'Create/update controls are withheld until a workspace-scoped mailbox write contract is available.' "$settings_route"
rg -Fq 'reviewed workspace-scoped mailbox contract is available.' "$settings_route"
! rg -Fq 'Local mailbox drafts' "$settings_route"
! rg -Fq 'Add another local draft' "$settings_route"
! rg -Fq 'Save local draft' "$settings_route"
! rg -Fq 'saved locally in this browser' "$settings_route"
! rg -Fq '@/lib/shared-mailbox-prefs' "$settings_route"
! rg -Fq 'useSharedMailboxState' "$settings_route"
! rg -Fq 'addMailbox' "$settings_route"
! rg -Fq 'updateMailbox' "$settings_route"
! rg -Fq 'toast.success(`${title} saved`)' "$settings_route"
! rg -Fq '>Connected<' "$settings_route"

rg -Fq 'ticket_mailbox_configs' "$service_settings"
rg -Fq 'mailboxConfigsQuery' "$service_queries"
rg -Fq 'export interface TicketMailboxConfigInput' "$service_settings"
rg -Fq 'createMailboxConfig' "$service_settings"
rg -Fq 'updateMailboxConfig' "$service_settings"
rg -Fq 'deleteMailboxConfig' "$service_settings"
rg -Fq 'MAILBOX_CONFIG_COLS' "$service_settings"
rg -Fq 'cleanNullable' "$service_settings"
rg -Fq '.from("ticket_mailbox_configs")' "$service_settings"
! rg -Fq 'password' "$service_settings"
! rg -Fq 'client_secret' "$service_settings"
! rg -Fq 'oauth' "$service_settings"
! rg -Fq 'smtp' "$service_settings"
! rg -Fq 'imap' "$service_settings"

rg -Fq 'create table if not exists public.ticket_mailbox_configs' "$ticket_config_sql"
rg -Fq 'alter table public.ticket_mailbox_configs  enable row level security;' "$ticket_config_sql"
rg -Fq "public.has_permission('tickets.config')" "$ticket_config_sql"
rg -Fq "public.has_permission('tickets.view_all')" "$ticket_config_sql"
rg -Fq "public.is_platform_admin()" "$ticket_config_sql"

mailbox_table=$(
  awk '
    /create table if not exists public\.ticket_mailbox_configs/ { in_table = 1 }
    in_table { print }
    in_table && /^\);/ { exit }
  ' "$ticket_config_sql"
)

printf '%s\n' "$mailbox_table" | rg -Fq 'inbound_address text not null'
printf '%s\n' "$mailbox_table" | rg -Fq 'reply_to text'
printf '%s\n' "$mailbox_table" | rg -Fq 'default_priority text not null'
! printf '%s\n' "$mailbox_table" | rg -qi 'password|secret|token|oauth|smtp|imap|credential|private_key|client_secret'

printf 'Settings backend integration assertions passed.\n'
