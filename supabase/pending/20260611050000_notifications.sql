-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: Notifications (Phase A — Batch 6/6)
-- ------------------------------------------------------------
-- DRAFT — NOT YET APPLIED. Forward-only and additive.
--
-- Adds:
--   * public.notifications
--   * Triggers populating notifications on:
--       - ticket creation        -> requester (if creator <> requester)
--                                 + assignee/team agents
--       - public ticket comment  -> requester + other participants
--       - status change          -> requester + assignee
--       - assignment change      -> the new assignee
--   * Employees are NEVER notified about internal notes.
--   * Read / unread state with mark-read helper.
--
-- Depends on:
--   20260611000000_service_desk_foundation.sql
--   20260611010000_service_desk_rbac_expand.sql
--   20260611040000_ticket_assignments.sql
-- ============================================================

begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  kind text not null check (kind in (
    'ticket.created','ticket.reply','ticket.status','ticket.assigned'
  )),
  title text not null check (char_length(trim(title)) between 1 and 200),
  body  text not null default '' check (char_length(body) <= 2000),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, read_at, created_at desc);
create index if not exists idx_notifications_ticket
  on public.notifications(ticket_id);


-- ------------------------------------------------------------
-- Helper: insert one notification skipping null user / self-notify
-- ------------------------------------------------------------
create or replace function public.notify_user(
  p_user_id uuid,
  p_ticket_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then return; end if;
  -- Don't notify the actor about their own action.
  if p_user_id = auth.uid() then return; end if;
  insert into public.notifications (user_id, ticket_id, kind, title, body, payload)
  values (p_user_id, p_ticket_id, p_kind, p_title, p_body, coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- Helper: does a user hold a permission? (security definer because we
-- need to peek across schemas without leaking RLS-protected rows).
create or replace function public.user_has_permission(
  p_user_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_global_roles ugr
      join public.role_permissions rp on rp.role_id = ugr.role_id
      join public.permissions p on p.id = rp.permission_id
      join public.roles r on r.id = ugr.role_id
     where ugr.user_id = p_user_id
       and r.role_scope = 'platform'
       and p.permission_key = p_permission_key
  );
$$;


-- ------------------------------------------------------------
-- Trigger: ticket created
-- ------------------------------------------------------------
create or replace function public.tickets_notify_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Acknowledge to the requester (e.g. if a portal creates it on their behalf).
  perform public.notify_user(
    new.requester_id, new.id, 'ticket.created',
    'Ticket ' || new.ticket_number || ' created',
    new.subject,
    jsonb_build_object('ticket_number', new.ticket_number)
  );
  -- Tell the assignee, if pre-assigned.
  if new.assignee_id is not null then
    perform public.notify_user(
      new.assignee_id, new.id, 'ticket.assigned',
      'Assigned to you: ' || new.ticket_number,
      new.subject,
      jsonb_build_object('ticket_number', new.ticket_number)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_notify_created_t on public.tickets;
create trigger tickets_notify_created_t
after insert on public.tickets
for each row execute function public.tickets_notify_created();


-- ------------------------------------------------------------
-- Trigger: status change
-- ------------------------------------------------------------
create or replace function public.tickets_notify_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform public.notify_user(
      new.requester_id, new.id, 'ticket.status',
      'Ticket ' || new.ticket_number || ' is now ' || new.status,
      new.subject,
      jsonb_build_object('from', old.status, 'to', new.status,
                         'ticket_number', new.ticket_number)
    );
    if new.assignee_id is not null then
      perform public.notify_user(
        new.assignee_id, new.id, 'ticket.status',
        'Ticket ' || new.ticket_number || ' is now ' || new.status,
        new.subject,
        jsonb_build_object('from', old.status, 'to', new.status,
                           'ticket_number', new.ticket_number)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_notify_status_t on public.tickets;
create trigger tickets_notify_status_t
after update of status on public.tickets
for each row execute function public.tickets_notify_status();


-- ------------------------------------------------------------
-- Trigger: assignment change
-- ------------------------------------------------------------
create or replace function public.tickets_notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is distinct from old.assignee_id
     and new.assignee_id is not null then
    perform public.notify_user(
      new.assignee_id, new.id, 'ticket.assigned',
      'Assigned to you: ' || new.ticket_number,
      new.subject,
      jsonb_build_object('ticket_number', new.ticket_number,
                         'from', old.assignee_id, 'to', new.assignee_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_notify_assignment_t on public.tickets;
create trigger tickets_notify_assignment_t
after update of assignee_id on public.tickets
for each row execute function public.tickets_notify_assignment();


-- ------------------------------------------------------------
-- Trigger: comment posted
--   * Internal notes:
--       - Notify other agents who can see internal notes
--       - NEVER notify the requester / any employee
--   * Public replies:
--       - Notify the requester
--       - Notify the assignee
-- ------------------------------------------------------------
create or replace function public.ticket_comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tickets;
begin
  select * into t from public.tickets where id = new.ticket_id;
  if t.id is null then return new; end if;

  if new.internal then
    -- Internal: never notify the requester, never notify the assignee
    -- unless that assignee holds tickets.view_internal.
    if t.assignee_id is not null
       and public.user_has_permission(t.assignee_id, 'tickets.view_internal') then
      perform public.notify_user(
        t.assignee_id, t.id, 'ticket.reply',
        'Internal note on ' || t.ticket_number, left(new.body, 200),
        jsonb_build_object('comment_id', new.id, 'internal', true,
                           'ticket_number', t.ticket_number)
      );
    end if;
  else
    -- Public reply: notify requester + assignee.
    perform public.notify_user(
      t.requester_id, t.id, 'ticket.reply',
      'Reply on ' || t.ticket_number, left(new.body, 200),
      jsonb_build_object('comment_id', new.id, 'internal', false,
                         'ticket_number', t.ticket_number)
    );
    if t.assignee_id is not null then
      perform public.notify_user(
        t.assignee_id, t.id, 'ticket.reply',
        'Reply on ' || t.ticket_number, left(new.body, 200),
        jsonb_build_object('comment_id', new.id, 'internal', false,
                           'ticket_number', t.ticket_number)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ticket_comments_notify_t on public.ticket_comments;
create trigger ticket_comments_notify_t
after insert on public.ticket_comments
for each row execute function public.ticket_comments_notify();


-- ------------------------------------------------------------
-- Mark-read RPC
-- ------------------------------------------------------------
create or replace function public.mark_notifications_read(
  p_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_ids is null then
    update public.notifications
       set read_at = now()
     where user_id = auth.uid() and read_at is null;
  else
    update public.notifications
       set read_at = now()
     where user_id = auth.uid()
       and read_at is null
       and id = any(p_ids);
  end if;
  get diagnostics affected = row_count;
  return affected;
end;
$$;


-- ------------------------------------------------------------
-- RLS — users see only their own notifications
-- ------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
on public.notifications for select to authenticated
using (user_id = (select auth.uid()));

-- Browser notification mutation must use mark_notifications_read(...).
-- RLS cannot restrict which columns an UPDATE changes, so direct authenticated
-- UPDATE is intentionally unavailable.
drop policy if exists notifications_update_own on public.notifications;


-- ------------------------------------------------------------
-- Data API privileges
-- ------------------------------------------------------------
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant all on table public.notifications to service_role;

revoke all on function public.notify_user(uuid, uuid, text, text, text, jsonb) from public;
revoke all on function public.user_has_permission(uuid, text)                  from public;
revoke all on function public.tickets_notify_created()                         from public;
revoke all on function public.tickets_notify_status()                          from public;
revoke all on function public.tickets_notify_assignment()                      from public;
revoke all on function public.ticket_comments_notify()                         from public;
revoke all on function public.mark_notifications_read(uuid[])                  from public;

grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

commit;
