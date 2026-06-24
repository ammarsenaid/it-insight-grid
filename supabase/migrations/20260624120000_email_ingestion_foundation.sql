-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: Email Ingestion Foundation
-- ------------------------------------------------------------
-- Adds a safe inbound-email foundation without real provider secrets.
--
-- Scope:
--   * email_ingestion_messages table
--   * simulate_inbound_mail(...) RPC
--   * safe ticket creation from simulated inbound email
--
-- Out of scope:
--   * Microsoft Graph OAuth
--   * IMAP/SMTP credentials
--   * provider webhooks
--   * attachments
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. INBOUND EMAIL MESSAGE TRACKING
-- ------------------------------------------------------------
create table if not exists public.email_ingestion_messages (
  id uuid primary key default gen_random_uuid(),

  mailbox_config_id uuid not null
    references public.ticket_mailbox_configs(id) on delete cascade,

  provider text not null default 'simulation'
    check (provider in ('simulation','microsoft_graph','imap')),

  provider_message_id text not null
    check (char_length(trim(provider_message_id)) between 1 and 500),

  from_email text not null
    check (char_length(trim(from_email)) between 3 and 320),

  from_name text
    check (from_name is null or char_length(trim(from_name)) <= 200),

  to_email text not null
    check (char_length(trim(to_email)) between 3 and 320),

  subject text not null
    check (char_length(trim(subject)) between 1 and 500),

  body_preview text not null default ''
    check (char_length(body_preview) <= 20000),

  received_at timestamptz not null default now(),

  processing_status text not null default 'received'
    check (processing_status in ('received','ticket_created','duplicate','failed')),

  ticket_id uuid references public.tickets(id) on delete set null,

  error_message text
    check (error_message is null or char_length(error_message) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_ingestion_messages_provider_unique
    unique (mailbox_config_id, provider, provider_message_id)
);

comment on table public.email_ingestion_messages is
  'Tracks inbound email messages before/after conversion into service desk tickets. No provider secrets are stored here.';

create index if not exists idx_email_ingestion_mailbox_received
  on public.email_ingestion_messages(mailbox_config_id, received_at desc);

create index if not exists idx_email_ingestion_status
  on public.email_ingestion_messages(processing_status, received_at desc);

create index if not exists idx_email_ingestion_ticket
  on public.email_ingestion_messages(ticket_id)
  where ticket_id is not null;

drop trigger if exists email_ingestion_messages_set_updated_at on public.email_ingestion_messages;
create trigger email_ingestion_messages_set_updated_at
before update on public.email_ingestion_messages
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 2. RLS
-- ------------------------------------------------------------
alter table public.email_ingestion_messages enable row level security;

drop policy if exists email_ingestion_messages_select_service_desk
  on public.email_ingestion_messages;

create policy email_ingestion_messages_select_service_desk
on public.email_ingestion_messages
for select
to authenticated
using (
  public.is_platform_admin()
  or public.has_permission('tickets.view_all')
  or public.has_permission('tickets.config')
  or public.has_permission('mailbox.manage')
);

-- No direct browser insert/update/delete policies.
-- Ingestion must happen through reviewed RPCs or service-role backend workers.

-- ------------------------------------------------------------
-- 3. SIMULATED INBOUND EMAIL → TICKET RPC
-- ------------------------------------------------------------
create or replace function public.simulate_inbound_mail(
  p_mailbox_config_id uuid,
  p_from_email text,
  p_subject text,
  p_body text default '',
  p_provider_message_id text default null
)
returns table (
  message_id uuid,
  ticket_id uuid,
  ticket_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  mailbox record;
  existing_message record;
  new_message_id uuid;
  new_ticket public.tickets%rowtype;
  safe_subject text;
  safe_body text;
  safe_provider_message_id text;
begin
  if caller_id is null then
    raise exception 'simulate_inbound_mail requires an authenticated caller'
      using errcode = '28000';
  end if;

  if not (
    public.is_platform_admin()
    or public.has_permission('tickets.config')
    or public.has_permission('mailbox.manage')
  ) then
    raise exception 'Missing permission to simulate inbound mail'
      using errcode = '42501';
  end if;

  select *
    into mailbox
  from public.ticket_mailbox_configs
  where id = p_mailbox_config_id
    and is_active = true;

  if mailbox.id is null then
    raise exception 'Active mailbox config not found'
      using errcode = 'P0002';
  end if;

  safe_subject := left(trim(coalesce(p_subject, '')), 250);
  if char_length(safe_subject) < 1 then
    raise exception 'Inbound email subject is required'
      using errcode = '22023';
  end if;

  safe_body := left(coalesce(p_body, ''), 20000);

  safe_provider_message_id := nullif(trim(coalesce(p_provider_message_id, '')), '');
  if safe_provider_message_id is null then
    safe_provider_message_id := 'simulation-' || gen_random_uuid()::text;
  end if;

  select *
    into existing_message
  from public.email_ingestion_messages
  where mailbox_config_id = mailbox.id
    and provider = 'simulation'
    and provider_message_id = safe_provider_message_id;

  if existing_message.id is not null then
    if existing_message.ticket_id is not null then
      return query
      select
        existing_message.id,
        t.id,
        t.ticket_number
      from public.tickets t
      where t.id = existing_message.ticket_id;
      return;
    end if;

    update public.email_ingestion_messages
      set processing_status = 'duplicate',
          error_message = 'Duplicate simulated provider message id without ticket link.'
    where id = existing_message.id;

    raise exception 'Duplicate simulated message without ticket link'
      using errcode = '23505';
  end if;

  insert into public.email_ingestion_messages (
    mailbox_config_id,
    provider,
    provider_message_id,
    from_email,
    to_email,
    subject,
    body_preview,
    processing_status
  )
  values (
    mailbox.id,
    'simulation',
    safe_provider_message_id,
    lower(trim(p_from_email)),
    lower(trim(mailbox.inbound_address)),
    safe_subject,
    safe_body,
    'received'
  )
  returning id into new_message_id;

  insert into public.tickets (
    requester_id,
    subject,
    description,
    type,
    category,
    priority,
    status,
    source,
    source_email,
    assigned_team,
    tags,
    catalog_values
  )
  values (
    caller_id,
    safe_subject,
    left(
      'Inbound email simulation' || chr(10) ||
      'From: ' || lower(trim(p_from_email)) || chr(10) ||
      'To: ' || lower(trim(mailbox.inbound_address)) || chr(10) ||
      'Mailbox: ' || mailbox.name || chr(10) ||
      chr(10) ||
      safe_body,
      20000
    ),
    'request',
    mailbox.default_category,
    mailbox.default_priority,
    'open',
    'email',
    lower(trim(p_from_email)),
    mailbox.default_team,
    array['email','simulation'],
    jsonb_build_object(
      'email_ingestion_message_id', new_message_id,
      'mailbox_config_id', mailbox.id,
      'provider', 'simulation'
    )
  )
  returning * into new_ticket;

  update public.email_ingestion_messages
     set processing_status = 'ticket_created',
         ticket_id = new_ticket.id,
         error_message = null
   where id = new_message_id;

  return query
  select new_message_id, new_ticket.id, new_ticket.ticket_number;
end;
$$;

-- ------------------------------------------------------------
-- 4. DATA API PRIVILEGES
-- ------------------------------------------------------------
revoke all privileges on table public.email_ingestion_messages from anon, authenticated;
grant select on table public.email_ingestion_messages to authenticated;
grant all on table public.email_ingestion_messages to service_role;

revoke all on function public.simulate_inbound_mail(uuid, text, text, text, text) from public;
grant execute on function public.simulate_inbound_mail(uuid, text, text, text, text)
  to authenticated, service_role;

commit;
