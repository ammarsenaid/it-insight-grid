-- ITKC access-control overrides.
-- Staged for human review. Do not apply automatically.
begin;

create type public.access_override_effect as enum ('allow', 'deny');

create table public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  effect public.access_override_effect not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, permission_id)
);

create table public.team_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  effect public.access_override_effect not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, permission_id)
);

create table public.workspace_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  effect public.access_override_effect not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, permission_id)
);

create table public.user_page_visibility_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  route_path text not null,
  effect public.access_override_effect not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, route_path)
);

create table public.team_page_visibility_overrides (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  route_path text not null,
  effect public.access_override_effect not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, route_path)
);

create table public.workspace_page_visibility_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  route_path text not null,
  effect public.access_override_effect not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, route_path)
);

create table public.access_control_audit_log (
  id bigint generated always as identity primary key,
  subject_type text not null check (subject_type in ('user', 'team', 'workspace')),
  subject_id uuid not null,
  resource_type text not null check (resource_type in ('permission', 'route')),
  resource_key text not null,
  previous_effect public.access_override_effect,
  new_effect public.access_override_effect,
  reason text not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index access_control_audit_subject_idx
  on public.access_control_audit_log(subject_type, subject_id, created_at desc);
create index access_control_audit_resource_idx
  on public.access_control_audit_log(resource_type, resource_key, created_at desc);

create or replace function public.validate_access_override_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.route_path := trim(new.route_path);
  if char_length(new.route_path) not between 1 and 255
     or not (
       new.route_path = '/'
       or new.route_path ~ '^/([a-z0-9-]+|:[a-z][a-z0-9_]*)(/([a-z0-9-]+|:[a-z][a-z0-9_]*))*/?$'
     ) then
    raise exception 'Invalid route path' using errcode = '22023';
  end if;

  if new.effect = 'deny'
     and new.route_path in ('/', '/my-requests', '/admin/identity', '/admin/roles') then
    raise exception 'Protected recovery route cannot be explicitly denied'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.audit_access_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_payload jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  permission_key text;
begin
  -- clear_access_override updates the reason/actor immediately before deleting
  -- so the DELETE audit row carries the administrator's current justification.
  -- Suppress only that preparatory UPDATE audit entry.
  if tg_op = 'UPDATE'
     and current_setting('itkc.access_override_clear', true) = 'on' then
    return new;
  end if;

  if tg_argv[1] = 'permission' then
    select p.permission_key into permission_key
      from public.permissions p
     where p.id = (payload->>'permission_id')::uuid;
  else
    permission_key := payload->>'route_path';
  end if;

  insert into public.access_control_audit_log (
    subject_type, subject_id, resource_type, resource_key,
    previous_effect, new_effect, reason, actor_id
  ) values (
    tg_argv[0],
    (payload->>case tg_argv[0]
      when 'user' then 'user_id'
      when 'team' then 'team_id'
      else 'workspace_id'
    end)::uuid,
    tg_argv[1],
    permission_key,
    case when old_payload is null then null
      else (old_payload->>'effect')::public.access_override_effect end,
    case when tg_op = 'DELETE' then null
      else (payload->>'effect')::public.access_override_effect end,
    payload->>'reason',
    (payload->>'updated_by')::uuid
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.clear_access_override(
  requested_subject_type text,
  requested_subject_id uuid,
  requested_resource_type text,
  requested_resource_key text,
  requested_reason text,
  requested_actor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_table text;
  subject_column text;
  resource_column text;
  affected_rows integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if char_length(trim(requested_reason)) not between 3 and 500 then
    raise exception 'Invalid reason' using errcode = '22023';
  end if;
  if not exists (
    select 1
      from public.profiles p
      join public.user_global_roles ugr on ugr.user_id = p.id
      join public.roles r on r.id = ugr.role_id
     where p.id = requested_actor_id
       and p.is_active = true
       and r.role_key = 'platform_admin'
       and r.role_scope = 'platform'
  ) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  subject_column := case requested_subject_type
    when 'user' then 'user_id'
    when 'team' then 'team_id'
    when 'workspace' then 'workspace_id'
    else null
  end;
  resource_column := case requested_resource_type
    when 'permission' then 'permission_id'
    when 'route' then 'route_path'
    else null
  end;
  if subject_column is null or resource_column is null then
    raise exception 'Invalid access target' using errcode = '22023';
  end if;

  target_table := requested_subject_type || '_' ||
    case requested_resource_type
      when 'permission' then 'permission_overrides'
      else 'page_visibility_overrides'
    end;

  perform set_config('itkc.access_override_clear', 'on', true);
  execute format(
    'update public.%I set reason = $1, updated_by = $2 where %I = $3 and %I::text = $4',
    target_table, subject_column, resource_column
  ) using trim(requested_reason), requested_actor_id, requested_subject_id,
    requested_resource_key;
  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    return false;
  end if;

  execute format(
    'delete from public.%I where %I = $1 and %I::text = $2',
    target_table, subject_column, resource_column
  ) using requested_subject_id, requested_resource_key;
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_permission_overrides', 'team_permission_overrides',
    'workspace_permission_overrides', 'user_page_visibility_overrides',
    'team_page_visibility_overrides', 'workspace_page_visibility_overrides'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end $$;

create trigger user_permission_overrides_audit after insert or update or delete
  on public.user_permission_overrides for each row execute function public.audit_access_override('user', 'permission');
create trigger team_permission_overrides_audit after insert or update or delete
  on public.team_permission_overrides for each row execute function public.audit_access_override('team', 'permission');
create trigger workspace_permission_overrides_audit after insert or update or delete
  on public.workspace_permission_overrides for each row execute function public.audit_access_override('workspace', 'permission');

create trigger user_page_visibility_validate before insert or update
  on public.user_page_visibility_overrides for each row execute function public.validate_access_override_route();
create trigger team_page_visibility_validate before insert or update
  on public.team_page_visibility_overrides for each row execute function public.validate_access_override_route();
create trigger workspace_page_visibility_validate before insert or update
  on public.workspace_page_visibility_overrides for each row execute function public.validate_access_override_route();
create trigger user_page_visibility_overrides_audit after insert or update or delete
  on public.user_page_visibility_overrides for each row execute function public.audit_access_override('user', 'route');
create trigger team_page_visibility_overrides_audit after insert or update or delete
  on public.team_page_visibility_overrides for each row execute function public.audit_access_override('team', 'route');
create trigger workspace_page_visibility_overrides_audit after insert or update or delete
  on public.workspace_page_visibility_overrides for each row execute function public.audit_access_override('workspace', 'route');

alter table public.user_permission_overrides enable row level security;
alter table public.team_permission_overrides enable row level security;
alter table public.workspace_permission_overrides enable row level security;
alter table public.user_page_visibility_overrides enable row level security;
alter table public.team_page_visibility_overrides enable row level security;
alter table public.workspace_page_visibility_overrides enable row level security;
alter table public.access_control_audit_log enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_permission_overrides', 'team_permission_overrides',
    'workspace_permission_overrides', 'user_page_visibility_overrides',
    'team_page_visibility_overrides', 'workspace_page_visibility_overrides',
    'access_control_audit_log'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_platform_admin())',
      table_name || '_select_platform_admin', table_name
    );
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    if table_name = 'access_control_audit_log' then
      execute format('revoke all on table public.%I from service_role', table_name);
      execute format('grant select on table public.%I to service_role', table_name);
    else
      execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    end if;
  end loop;
end $$;

revoke all on function public.validate_access_override_route() from public;
revoke all on function public.audit_access_override() from public;
revoke all on function public.clear_access_override(text, uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.clear_access_override(text, uuid, text, text, text, uuid)
  to service_role;

commit;
