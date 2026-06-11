-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration Batch: Service Desk Foundation (Batch 1)
-- ------------------------------------------------------------
-- DRAFT — NOT YET APPLIED.
-- Move into supabase/migrations/ as
--   20260611000000_service_desk_foundation.sql
-- via the migration tool when ready to apply.
--
-- Forward-only additive. No existing object is dropped or altered.
-- Adds:
--   * catalog_items
--   * tickets (+ automatic ticket_number sequence)
--   * ticket_comments
--   * ticket_status_events
--   * ticket_audit_log
--   * Trigger functions: updated_at (reused), status-event, audit
--   * Permission keys for catalog and tickets
--   * Platform roles: it_admin, sd_lead, helpdesk
--   * RLS policies leveraging existing helper functions
--   * Atomic RPC: submit_catalog_request(catalog_item_id, values)
--
-- Out of scope for this batch (handled in later batches):
--   * ticket_attachments + storage bucket
--   * ticket_settings (mailbox, SLA, routing, templates)
--   * ticket_assignments history table
--   * email intake
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. NEW PLATFORM ROLES (additive)
-- ------------------------------------------------------------
insert into public.roles (role_key, name, description, role_scope, is_system)
values
  ('it_admin',
   'IT Administrator',
   'Full access to all Service Desk modules. Cannot manage tenant-level keys.',
   'platform', true),
  ('sd_lead',
   'Service Desk Lead',
   'Manages ticket queues, catalog services, SLA policies and team routing.',
   'platform', true),
  ('helpdesk',
   'Helpdesk Agent',
   'Handles incoming tickets and end-user requests.',
   'platform', true)
on conflict (role_key) do update
  set name = excluded.name,
      description = excluded.description,
      role_scope = excluded.role_scope,
      is_system = excluded.is_system;

-- ------------------------------------------------------------
-- 2. NEW PERMISSIONS
-- ------------------------------------------------------------
insert into public.permissions (permission_key, name, description)
values
  ('catalog.manage',           'Manage Service Catalog',
   'Create, edit, publish, archive and delete catalog services.'),
  ('tickets.view_all',         'View All Tickets',
   'View every ticket in the service desk queue, not just your own.'),
  ('tickets.assign',           'Assign Tickets',
   'Assign and reassign tickets to teams or agents.'),
  ('tickets.resolve',          'Resolve Tickets',
   'Transition tickets to resolved, closed or reopened.'),
  ('tickets.view_internal',    'Read Internal Notes',
   'Read internal notes on tickets (hidden from requesters).'),
  ('tickets.comment_internal', 'Write Internal Notes',
   'Post internal notes on tickets.')
on conflict (permission_key) do update
  set name = excluded.name,
      description = excluded.description;

-- ------------------------------------------------------------
-- 3. ROLE -> PERMISSION MAPPINGS
-- ------------------------------------------------------------
-- platform_admin (already gets every permission via the foundation
-- seed; re-applying is a no-op due to ON CONFLICT DO NOTHING).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_key = 'platform_admin'
  and p.permission_key in (
    'catalog.manage', 'tickets.view_all', 'tickets.assign',
    'tickets.resolve', 'tickets.view_internal', 'tickets.comment_internal'
  )
on conflict do nothing;

-- it_admin: full service desk authority
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_key in (
    'catalog.manage', 'tickets.view_all', 'tickets.assign',
    'tickets.resolve', 'tickets.view_internal', 'tickets.comment_internal'
  )
where r.role_key = 'it_admin'
on conflict do nothing;

-- sd_lead: catalog manager + full ticket queue authority
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_key in (
    'catalog.manage', 'tickets.view_all', 'tickets.assign',
    'tickets.resolve', 'tickets.view_internal', 'tickets.comment_internal'
  )
where r.role_key = 'sd_lead'
on conflict do nothing;

-- helpdesk: works the queue but cannot manage the catalog
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_key in (
    'tickets.view_all', 'tickets.assign', 'tickets.resolve',
    'tickets.view_internal', 'tickets.comment_internal'
  )
where r.role_key = 'helpdesk'
on conflict do nothing;

-- platform_auditor: read-only access to queue & internal notes
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_key in ('tickets.view_all', 'tickets.view_internal')
where r.role_key = 'platform_auditor'
on conflict do nothing;


-- ------------------------------------------------------------
-- 4. CATALOG ITEMS
-- ------------------------------------------------------------
create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 200),
  category text not null check (char_length(trim(category)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 4000),
  icon text not null default 'ShoppingBag' check (char_length(icon) <= 60),
  default_priority text not null default 'normal' check (
    default_priority in ('low','normal','high','critical')
  ),
  default_team text check (char_length(default_team) <= 120),
  estimated_time text check (char_length(estimated_time) <= 80),
  visibility text not null default 'internal' check (
    visibility in ('internal','restricted')
  ),
  fields_schema jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (
    status in ('draft','published','archived')
  ),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.catalog_items is
  'Service catalog entries available for employees to request.';

create index if not exists idx_catalog_items_status   on public.catalog_items(status);
create index if not exists idx_catalog_items_category on public.catalog_items(category);

drop trigger if exists catalog_items_set_updated_at on public.catalog_items;
create trigger catalog_items_set_updated_at
before update on public.catalog_items
for each row
execute function public.set_updated_at();


-- ------------------------------------------------------------
-- 5. TICKETS (+ automatic ticket_number)
-- ------------------------------------------------------------
create sequence if not exists public.ticket_number_seq;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique
    default ('TKT-' || lpad(nextval('public.ticket_number_seq')::text, 6, '0')),
  requester_id uuid not null references auth.users(id) on delete cascade,
  catalog_item_id uuid references public.catalog_items(id) on delete set null,
  subject text not null check (char_length(trim(subject)) between 2 and 250),
  description text not null default '' check (char_length(description) <= 20000),
  type text not null default 'request' check (
    type in ('request','incident','problem','change')
  ),
  category text check (char_length(category) <= 120),
  subcategory text check (char_length(subcategory) <= 200),
  priority text not null default 'normal' check (
    priority in ('low','normal','high','critical')
  ),
  status text not null default 'open' check (
    status in ('open','in_progress','on_hold','resolved','closed','reopened')
  ),
  source text not null default 'portal' check (
    source in ('portal','service_catalog','email','api')
  ),
  source_email text check (char_length(source_email) <= 320),
  affected_service text check (char_length(affected_service) <= 200),
  assigned_team text check (char_length(assigned_team) <= 120),
  assignee_id uuid references auth.users(id) on delete set null,
  tags text[] not null default '{}',
  catalog_values jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tickets is
  'Service desk tickets and catalog requests submitted by users.';

create index if not exists idx_tickets_requester    on public.tickets(requester_id);
create index if not exists idx_tickets_assignee     on public.tickets(assignee_id);
create index if not exists idx_tickets_status       on public.tickets(status);
create index if not exists idx_tickets_catalog_item on public.tickets(catalog_item_id);

drop trigger if exists tickets_set_updated_at on public.tickets;
create trigger tickets_set_updated_at
before update on public.tickets
for each row
execute function public.set_updated_at();


-- ------------------------------------------------------------
-- 6. TICKET COMMENTS (public replies + internal notes)
-- ------------------------------------------------------------
create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 10000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.ticket_comments is
  'Conversation entries on a ticket. internal=true is hidden from requesters.';

create index if not exists idx_ticket_comments_ticket
  on public.ticket_comments(ticket_id, created_at);
create index if not exists idx_ticket_comments_internal
  on public.ticket_comments(ticket_id, internal);


-- ------------------------------------------------------------
-- 7. TICKET STATUS EVENTS
-- ------------------------------------------------------------
create table if not exists public.ticket_status_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  reason text check (char_length(reason) <= 1000),
  changed_at timestamptz not null default now()
);

comment on table public.ticket_status_events is
  'Immutable log of every status transition for a ticket.';

create index if not exists idx_ticket_status_events_ticket
  on public.ticket_status_events(ticket_id, changed_at);


-- ------------------------------------------------------------
-- 8. TICKET AUDIT LOG
-- ------------------------------------------------------------
create table if not exists public.ticket_audit_log (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id) on delete set null,
  actor_id  uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.ticket_audit_log is
  'Append-only audit trail of ticket-related actions.';

create index if not exists idx_ticket_audit_log_ticket
  on public.ticket_audit_log(ticket_id, created_at);


-- ------------------------------------------------------------
-- 9. STATUS-EVENT TRIGGER
-- ------------------------------------------------------------
create or replace function public.tickets_capture_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_status_events (
      ticket_id, from_status, to_status, changed_by
    )
    values (new.id, null, new.status, auth.uid());
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.ticket_status_events (
      ticket_id, from_status, to_status, changed_by
    )
    values (new.id, old.status, new.status, auth.uid());

    if new.status = 'resolved' and new.resolved_at is null then
      new.resolved_at := now();
    end if;
    if new.status = 'closed' and new.closed_at is null then
      new.closed_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_status_event_insert on public.tickets;
create trigger tickets_status_event_insert
after insert on public.tickets
for each row
execute function public.tickets_capture_status_event();

drop trigger if exists tickets_status_event_update on public.tickets;
create trigger tickets_status_event_update
before update of status on public.tickets
for each row
execute function public.tickets_capture_status_event();


-- ------------------------------------------------------------
-- 10. AUDIT TRIGGER FUNCTIONS
-- ------------------------------------------------------------
create or replace function public.tickets_write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_audit_log (ticket_id, actor_id, action, payload)
    values (new.id, auth.uid(), 'ticket.create',
      jsonb_build_object(
        'ticket_number',   new.ticket_number,
        'requester_id',    new.requester_id,
        'catalog_item_id', new.catalog_item_id,
        'subject',         new.subject,
        'priority',        new.priority,
        'status',          new.status,
        'source',          new.source
      ));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.status        is distinct from old.status
       or new.assignee_id    is distinct from old.assignee_id
       or new.assigned_team  is distinct from old.assigned_team
       or new.priority       is distinct from old.priority then
      insert into public.ticket_audit_log (ticket_id, actor_id, action, payload)
      values (new.id, auth.uid(), 'ticket.update',
        jsonb_build_object(
          'status',        jsonb_build_object('from', old.status,        'to', new.status),
          'assignee_id',   jsonb_build_object('from', old.assignee_id,   'to', new.assignee_id),
          'assigned_team', jsonb_build_object('from', old.assigned_team, 'to', new.assigned_team),
          'priority',      jsonb_build_object('from', old.priority,      'to', new.priority)
        ));
    end if;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists tickets_audit_iu on public.tickets;
create trigger tickets_audit_iu
after insert or update on public.tickets
for each row
execute function public.tickets_write_audit();

create or replace function public.ticket_comments_write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ticket_audit_log (ticket_id, actor_id, action, payload)
  values (
    new.ticket_id,
    auth.uid(),
    case when new.internal then 'comment.internal' else 'comment.public' end,
    jsonb_build_object('comment_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists ticket_comments_audit_i on public.ticket_comments;
create trigger ticket_comments_audit_i
after insert on public.ticket_comments
for each row
execute function public.ticket_comments_write_audit();

create or replace function public.catalog_items_write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ticket_audit_log (ticket_id, actor_id, action, payload)
  values (
    null,
    auth.uid(),
    case tg_op
      when 'INSERT' then 'catalog.create'
      when 'UPDATE' then 'catalog.update'
      when 'DELETE' then 'catalog.delete'
    end,
    case tg_op
      when 'DELETE' then jsonb_build_object('catalog_item_id', old.id, 'name', old.name)
      else jsonb_build_object('catalog_item_id', new.id, 'name', new.name, 'status', new.status)
    end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists catalog_items_audit_iud on public.catalog_items;
create trigger catalog_items_audit_iud
after insert or update or delete on public.catalog_items
for each row
execute function public.catalog_items_write_audit();


-- ------------------------------------------------------------
-- 11. RLS HELPER: can the current user view a ticket?
-- ------------------------------------------------------------
create or replace function public.can_view_ticket(requested_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_platform_admin()
    or public.has_permission('tickets.view_all')
    or exists (
      select 1 from public.tickets t
      where t.id = requested_ticket_id
        and t.requester_id = auth.uid()
    );
$$;


-- ------------------------------------------------------------
-- 12. ATOMIC CATALOG SUBMIT RPC
-- ------------------------------------------------------------
create or replace function public.submit_catalog_request(
  catalog_item_id uuid,
  values jsonb default '{}'::jsonb
)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  item   public.catalog_items;
  result public.tickets;
  caller uuid := auth.uid();
  field  jsonb;
  fkey   text;
  fval   text;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into item from public.catalog_items where id = catalog_item_id;

  if item.id is null then
    raise exception 'Catalog item not found' using errcode = 'P0002';
  end if;

  if item.status <> 'published' then
    raise exception 'Catalog item is not published' using errcode = '42501';
  end if;

  -- Required-field validation against fields_schema
  for field in
    select * from jsonb_array_elements(coalesce(item.fields_schema, '[]'::jsonb))
  loop
    if coalesce((field ->> 'required')::boolean, false) then
      fkey := field ->> 'key';
      fval := trim(coalesce(values ->> fkey, ''));
      if fval = '' then
        raise exception 'Missing required field: %', coalesce(field ->> 'label', fkey)
          using errcode = '22023';
      end if;
    end if;
  end loop;

  insert into public.tickets (
    requester_id, catalog_item_id, subject, description, type,
    category, subcategory, priority, source, affected_service,
    assigned_team, tags, catalog_values
  )
  values (
    caller, item.id, item.name, coalesce(item.description, ''), 'request',
    item.category, item.name, item.default_priority, 'service_catalog', item.category,
    item.default_team, array['catalog', lower(item.category)], coalesce(values, '{}'::jsonb)
  )
  returning *
  into result;

  return result;
end;
$$;


-- ------------------------------------------------------------
-- 13. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.catalog_items        enable row level security;
alter table public.tickets              enable row level security;
alter table public.ticket_comments      enable row level security;
alter table public.ticket_status_events enable row level security;
alter table public.ticket_audit_log     enable row level security;

-- ---- catalog_items ----
drop policy if exists catalog_items_select_visible on public.catalog_items;
create policy catalog_items_select_visible
on public.catalog_items for select to authenticated
using (status = 'published' or public.has_permission('catalog.manage'));

drop policy if exists catalog_items_insert_managers on public.catalog_items;
create policy catalog_items_insert_managers
on public.catalog_items for insert to authenticated
with check (public.has_permission('catalog.manage'));

drop policy if exists catalog_items_update_managers on public.catalog_items;
create policy catalog_items_update_managers
on public.catalog_items for update to authenticated
using       (public.has_permission('catalog.manage'))
with check  (public.has_permission('catalog.manage'));

drop policy if exists catalog_items_delete_managers on public.catalog_items;
create policy catalog_items_delete_managers
on public.catalog_items for delete to authenticated
using (public.has_permission('catalog.manage'));

-- ---- tickets ----
drop policy if exists tickets_select_visible on public.tickets;
create policy tickets_select_visible
on public.tickets for select to authenticated
using (
  requester_id = (select auth.uid())
  or public.has_permission('tickets.view_all')
);

drop policy if exists tickets_insert_own on public.tickets;
create policy tickets_insert_own
on public.tickets for insert to authenticated
with check (requester_id = (select auth.uid()));

drop policy if exists tickets_update_agents on public.tickets;
create policy tickets_update_agents
on public.tickets for update to authenticated
using (
  public.has_permission('tickets.view_all')
  and (public.has_permission('tickets.assign') or public.has_permission('tickets.resolve'))
)
with check (public.has_permission('tickets.view_all'));

drop policy if exists tickets_delete_admin on public.tickets;
create policy tickets_delete_admin
on public.tickets for delete to authenticated
using (public.is_platform_admin());

-- ---- ticket_comments ----
drop policy if exists ticket_comments_select_visible on public.ticket_comments;
create policy ticket_comments_select_visible
on public.ticket_comments for select to authenticated
using (
  public.can_view_ticket(ticket_id)
  and (internal = false or public.has_permission('tickets.view_internal'))
);

drop policy if exists ticket_comments_insert_authorized on public.ticket_comments;
create policy ticket_comments_insert_authorized
on public.ticket_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and public.can_view_ticket(ticket_id)
  and (internal = false or public.has_permission('tickets.comment_internal'))
);

-- ---- ticket_status_events (writes occur via SECURITY DEFINER triggers only) ----
drop policy if exists ticket_status_events_select_visible on public.ticket_status_events;
create policy ticket_status_events_select_visible
on public.ticket_status_events for select to authenticated
using (public.can_view_ticket(ticket_id));

-- ---- ticket_audit_log (managers + admin only) ----
drop policy if exists ticket_audit_log_select_managers on public.ticket_audit_log;
create policy ticket_audit_log_select_managers
on public.ticket_audit_log for select to authenticated
using (public.is_platform_admin() or public.has_permission('tickets.view_all'));


-- ------------------------------------------------------------
-- 14. DATA-API PRIVILEGES
-- ------------------------------------------------------------
revoke all privileges on table public.catalog_items        from anon;
revoke all privileges on table public.tickets              from anon;
revoke all privileges on table public.ticket_comments      from anon;
revoke all privileges on table public.ticket_status_events from anon;
revoke all privileges on table public.ticket_audit_log     from anon;

revoke all privileges on table public.catalog_items        from authenticated;
revoke all privileges on table public.tickets              from authenticated;
revoke all privileges on table public.ticket_comments      from authenticated;
revoke all privileges on table public.ticket_status_events from authenticated;
revoke all privileges on table public.ticket_audit_log     from authenticated;

grant select, insert, update, delete on table public.catalog_items        to authenticated;
grant select, insert, update         on table public.tickets              to authenticated;
grant select, insert                 on table public.ticket_comments      to authenticated;
grant select                         on table public.ticket_status_events to authenticated;
grant select                         on table public.ticket_audit_log     to authenticated;

grant all on table public.catalog_items        to service_role;
grant all on table public.tickets              to service_role;
grant all on table public.ticket_comments      to service_role;
grant all on table public.ticket_status_events to service_role;
grant all on table public.ticket_audit_log     to service_role;

grant usage, select on sequence public.ticket_number_seq to authenticated, service_role;


-- ------------------------------------------------------------
-- 15. FUNCTION EXECUTION PRIVILEGES
-- ------------------------------------------------------------
revoke all on function public.tickets_capture_status_event()      from public;
revoke all on function public.tickets_write_audit()               from public;
revoke all on function public.ticket_comments_write_audit()       from public;
revoke all on function public.catalog_items_write_audit()         from public;
revoke all on function public.can_view_ticket(uuid)               from public;
revoke all on function public.submit_catalog_request(uuid, jsonb) from public;

grant execute on function public.can_view_ticket(uuid)               to authenticated;
grant execute on function public.submit_catalog_request(uuid, jsonb) to authenticated;

commit;
