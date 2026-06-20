-- IT Knowledge Center: platform-role page visibility catalog.
-- Staged under supabase/pending for disposable rehearsal and manual review.
-- This migration must not be applied to the live database without approval.
begin;

create table if not exists public.role_page_visibility (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  route_path text not null check (
    char_length(route_path) between 1 and 255
    and (
      route_path = '/'
      or route_path ~ '^/([a-z0-9-]+|:[a-z][a-z0-9_]*)(/([a-z0-9-]+|:[a-z][a-z0-9_]*))*/?$'
    )
  ),
  can_view boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_id, route_path)
);

comment on table public.role_page_visibility is
  'Complete page-visibility matrix for platform roles. Paths may be literal routes or parameterized route patterns.';
comment on column public.role_page_visibility.role_id is
  'Platform-scoped role governed by this visibility row.';
comment on column public.role_page_visibility.route_path is
  'Normalized application route or parameterized route pattern, such as /tickets/:id.';
comment on column public.role_page_visibility.can_view is
  'Whether the role may see and directly open the route after the live matrix is validated.';
comment on column public.role_page_visibility.updated_by is
  'Verified administrator responsible for the latest server-mediated update.';

create index if not exists idx_role_page_visibility_route
  on public.role_page_visibility(route_path);

-- Enforce invariants even when writes use a service-role client.
create or replace function public.validate_role_page_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_role_key text;
  selected_role_scope text;
  previous_role_key text;
begin
  if tg_op = 'DELETE' then
    select role_key
      into selected_role_key
      from public.roles
     where id = old.role_id;

    if selected_role_key = 'platform_admin'
       and old.route_path = '/admin/roles' then
      raise exception 'Platform administrator role-management visibility is protected'
        using errcode = '42501';
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE' then
    select role_key
      into previous_role_key
      from public.roles
     where id = old.role_id;

    if previous_role_key = 'platform_admin'
       and old.route_path = '/admin/roles'
       and (
         new.role_id is distinct from old.role_id
         or new.route_path is distinct from old.route_path
         or not new.can_view
       ) then
      raise exception 'Platform administrator role-management visibility is protected'
        using errcode = '42501';
    end if;
  end if;

  select role_key, role_scope
    into selected_role_key, selected_role_scope
    from public.roles
   where id = new.role_id;

  if selected_role_key is null then
    raise exception 'Unknown role identifier'
      using errcode = '23503';
  end if;

  if selected_role_scope <> 'platform' then
    raise exception 'Page visibility supports platform roles only'
      using errcode = '23514';
  end if;

  if selected_role_key = 'employee'
     and (new.route_path = '/admin' or new.route_path like '/admin/%')
     and new.can_view then
    raise exception 'Requester roles cannot access administration pages'
      using errcode = '42501';
  end if;

  if selected_role_key = 'platform_admin'
     and new.route_path = '/admin/roles'
     and not new.can_view then
    raise exception 'Platform administrator role-management visibility is protected'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_role_page_visibility() from public;

drop trigger if exists validate_role_page_visibility
  on public.role_page_visibility;
create trigger validate_role_page_visibility
before insert or update or delete on public.role_page_visibility
for each row execute function public.validate_role_page_visibility();

drop trigger if exists role_page_visibility_set_updated_at
  on public.role_page_visibility;
create trigger role_page_visibility_set_updated_at
before update on public.role_page_visibility
for each row execute function public.set_updated_at();

-- Abort rather than silently create an incomplete authorization matrix.
do $$
declare
  missing_roles text[];
begin
  select array_agg(expected.role_key order by expected.role_key)
    into missing_roles
    from (
      values
        ('platform_admin'),
        ('it_admin'),
        ('sd_lead'),
        ('helpdesk'),
        ('technician'),
        ('network_admin'),
        ('doc_editor'),
        ('platform_auditor'),
        ('employee')
    ) as expected(role_key)
   where not exists (
     select 1
       from public.roles
      where roles.role_key = expected.role_key
        and roles.role_scope = 'platform'
   );

  if missing_roles is not null then
    raise exception 'Required platform roles are missing: %', missing_roles;
  end if;
end;
$$;

-- Seed every known static route x managed platform role combination. False
-- rows are intentional: absence must never be overloaded to mean denial.
with
role_sets(set_name, role_keys) as (
  values
    (
      'all',
      array[
        'platform_admin', 'it_admin', 'sd_lead', 'helpdesk',
        'technician', 'network_admin', 'doc_editor',
        'platform_auditor', 'employee'
      ]::text[]
    ),
    (
      'non_requester',
      array[
        'platform_admin', 'it_admin', 'sd_lead', 'helpdesk',
        'technician', 'network_admin', 'doc_editor',
        'platform_auditor'
      ]::text[]
    ),
    (
      'ticket_queue',
      array[
        'platform_admin', 'it_admin', 'sd_lead', 'helpdesk',
        'technician', 'network_admin', 'platform_auditor'
      ]::text[]
    ),
    ('admins', array['platform_admin', 'it_admin']::text[]),
    ('admin_config', array['platform_admin', 'it_admin', 'sd_lead']::text[]),
    (
      'reports',
      array['platform_admin', 'it_admin', 'sd_lead', 'platform_auditor']::text[]
    ),
    ('audit', array['platform_admin', 'it_admin', 'platform_auditor']::text[])
),
route_rules(route_path, set_name) as (
  values
    ('/',                      'non_requester'),
    ('/dashboard',             'non_requester'),
    ('/documents',             'all'),
    ('/search',                'non_requester'),
    ('/tickets',               'ticket_queue'),
    ('/tickets/',              'ticket_queue'),
    ('/tickets/:id',           'all'),
    ('/my-requests',           'all'),
    ('/service-catalog',       'all'),
    ('/service-catalog/:id',   'all'),
    ('/notifications',         'all'),
    ('/cmdb',                  'non_requester'),
    ('/ipam',                  'non_requester'),
    ('/tasks',                 'non_requester'),
    ('/notes',                 'non_requester'),
    ('/protocols',             'non_requester'),
    ('/protocols/',            'non_requester'),
    ('/protocols/:id',         'non_requester'),
    ('/audit',                 'audit'),
    ('/reports',               'reports'),
    ('/admin/users',           'admins'),
    ('/admin/teams',           'admins'),
    ('/admin/roles',           'admins'),
    ('/admin/ticket-settings', 'admin_config'),
    ('/admin/mailbox',         'admin_config'),
    ('/admin/templates',       'admin_config'),
    ('/admin/catalog',         'admin_config'),
    ('/recycle-bin',           'admins'),
    ('/trash',                 'admins'),
    ('/settings',              'all')
),
managed_roles(role_key) as (
  values
    ('platform_admin'),
    ('it_admin'),
    ('sd_lead'),
    ('helpdesk'),
    ('technician'),
    ('network_admin'),
    ('doc_editor'),
    ('platform_auditor'),
    ('employee')
)
insert into public.role_page_visibility (role_id, route_path, can_view)
select
  roles.id,
  route_rules.route_path,
  roles.role_key = any(role_sets.role_keys)
from managed_roles
join public.roles
  on roles.role_key = managed_roles.role_key
 and roles.role_scope = 'platform'
cross join route_rules
join role_sets
  on role_sets.set_name = route_rules.set_name
on conflict (role_id, route_path) do update
set can_view = excluded.can_view;

alter table public.role_page_visibility enable row level security;

drop policy if exists role_page_visibility_select_authenticated
  on public.role_page_visibility;
create policy role_page_visibility_select_authenticated
on public.role_page_visibility
for select
to authenticated
using (true);

-- Browser sessions are read-only. Future writes remain server-mediated and
-- update existing rows; DELETE is intentionally unavailable operationally.
revoke all privileges on table public.role_page_visibility
  from anon, authenticated, service_role;
grant select on table public.role_page_visibility to authenticated;
grant select, insert, update on table public.role_page_visibility to service_role;

commit;
