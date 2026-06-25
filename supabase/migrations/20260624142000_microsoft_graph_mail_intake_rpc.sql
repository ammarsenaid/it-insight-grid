-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: Microsoft Graph Mail Intake RPC
-- ------------------------------------------------------------
-- Adds a service-role-only RPC used by the Microsoft Graph worker.
--
-- Scope:
--   * Accept one Microsoft Graph message
--   * Deduplicate by mailbox + provider + provider_message_id
--   * Insert email_ingestion_messages
--   * Create a ticket with source=email
--
-- Out of scope:
--   * secret storage
--   * Graph token handling
--   * marking emails read
--   * attachment ingestion
-- ============================================================

begin;

create or replace function public.process_microsoft_graph_mail(
  p_mailbox_address text,
  p_provider_message_id text,
  p_from_email text,
  p_from_name text default null,
  p_subject text default '(no subject)',
  p_body_preview text default '',
  p_received_at timestamptz default now()
)
returns table (
  message_id uuid,
  ticket_id uuid,
  ticket_number text,
  was_duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  mailbox record;
  existing_message record;
  new_message_id uuid;
  new_ticket public.tickets%rowtype;
  requester uuid;
  safe_mailbox_address text;
  safe_provider_message_id text;
  safe_from_email text;
  safe_from_name text;
  safe_subject text;
  safe_body text;
  safe_received_at timestamptz;
begin
  safe_mailbox_address := lower(trim(coalesce(p_mailbox_address, '')));
  if char_length(safe_mailbox_address) < 3 then
    raise exception 'Mailbox address is required' using errcode = '22023';
  end if;

  safe_provider_message_id := left(trim(coalesce(p_provider_message_id, '')), 500);
  if char_length(safe_provider_message_id) < 1 then
    raise exception 'Provider message id is required' using errcode = '22023';
  end if;

  safe_from_email := lower(trim(coalesce(nullif(p_from_email, ''), 'unknown@example.invalid')));
  if char_length(safe_from_email) < 3 then
    safe_from_email := 'unknown@example.invalid';
  end if;

  safe_from_name := nullif(left(trim(coalesce(p_from_name, '')), 200), '');
  safe_subject := left(coalesce(nullif(trim(coalesce(p_subject, '')), ''), '(no subject)'), 250);
  safe_body := left(coalesce(p_body_preview, ''), 20000);
  safe_received_at := coalesce(p_received_at, now());

  select *
    into mailbox
  from public.ticket_mailbox_configs
  where lower(inbound_address) = safe_mailbox_address
    and is_active = true
  limit 1;

  if mailbox.id is null then
    raise exception 'Active mailbox config not found for %', safe_mailbox_address
      using errcode = 'P0002';
  end if;

  select *
    into existing_message
  from public.email_ingestion_messages
  where mailbox_config_id = mailbox.id
    and provider = 'microsoft_graph'
    and provider_message_id = safe_provider_message_id;

  if existing_message.id is not null then
    return query
    select
      existing_message.id,
      t.id,
      t.ticket_number,
      true
    from public.tickets t
    where t.id = existing_message.ticket_id;

    if found then
      return;
    end if;

    update public.email_ingestion_messages
       set processing_status = 'duplicate',
           error_message = 'Duplicate Microsoft Graph message without ticket link.'
     where id = existing_message.id;

    raise exception 'Duplicate Microsoft Graph message without ticket link'
      using errcode = '23505';
  end if;

  select u.id
    into requester
  from auth.users u
  where exists (
    select 1
    from public.user_global_roles ugr
    join public.roles r on r.id = ugr.role_id
    where ugr.user_id = u.id
      and r.role_key in ('platform_admin','it_admin','sd_lead','helpdesk')
  )
  order by u.created_at
  limit 1;

  if requester is null then
    raise exception 'No service desk requester user found for email-created ticket'
      using errcode = 'P0002';
  end if;

  -- The worker calls this RPC with the service_role key, so auth.uid()
  -- is not naturally present. Some organization-scoped defaults/triggers
  -- require a request user context. Use the selected service-desk requester
  -- as the controlled system requester for email-created tickets.
  perform set_config('request.jwt.claim.sub', requester::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.email_ingestion_messages (
    mailbox_config_id,
    provider,
    provider_message_id,
    from_email,
    from_name,
    to_email,
    subject,
    body_preview,
    received_at,
    processing_status
  )
  values (
    mailbox.id,
    'microsoft_graph',
    safe_provider_message_id,
    safe_from_email,
    safe_from_name,
    safe_mailbox_address,
    safe_subject,
    safe_body,
    safe_received_at,
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
    requester,
    safe_subject,
    left(
      'Inbound email via Microsoft Graph' || chr(10) ||
      'From: ' || safe_from_email || chr(10) ||
      case when safe_from_name is not null then 'From name: ' || safe_from_name || chr(10) else '' end ||
      'To: ' || safe_mailbox_address || chr(10) ||
      'Mailbox: ' || mailbox.name || chr(10) ||
      'Received: ' || safe_received_at::text || chr(10) ||
      chr(10) ||
      safe_body,
      20000
    ),
    'request',
    mailbox.default_category,
    mailbox.default_priority,
    'open',
    'email',
    safe_from_email,
    mailbox.default_team,
    array['email','microsoft_graph'],
    jsonb_build_object(
      'email_ingestion_message_id', new_message_id,
      'mailbox_config_id', mailbox.id,
      'provider', 'microsoft_graph',
      'provider_message_id', safe_provider_message_id
    )
  )
  returning * into new_ticket;

  update public.email_ingestion_messages
     set processing_status = 'ticket_created',
         ticket_id = new_ticket.id,
         error_message = null
   where id = new_message_id;

  return query
  select new_message_id, new_ticket.id, new_ticket.ticket_number, false;
end;
$$;

revoke all on function public.process_microsoft_graph_mail(
  text, text, text, text, text, text, timestamptz
) from public;

grant execute on function public.process_microsoft_graph_mail(
  text, text, text, text, text, text, timestamptz
) to service_role;

commit;
