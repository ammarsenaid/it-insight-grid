-- Production-safe Identity & Access administration contracts.
-- Additive only: no hard user deletion and no destructive workspace deletion.
begin;

create table if not exists public.identity_admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (char_length(action) between 3 and 80),
  subject_type text not null check (subject_type in ('user', 'team', 'workspace')),
  subject_id uuid not null,
  previous_value jsonb,
  new_value jsonb,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now()
);

create index if not exists identity_admin_audit_subject_idx
  on public.identity_admin_audit_log(subject_type, subject_id, created_at desc);

alter table public.identity_admin_audit_log enable row level security;
revoke all privileges on table public.identity_admin_audit_log from public, anon, authenticated;
grant select, insert on table public.identity_admin_audit_log to service_role;
grant usage, select on sequence public.identity_admin_audit_log_id_seq to service_role;

create or replace function public.require_active_platform_admin()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1
      from public.profiles p
      join public.user_global_roles ugr on ugr.user_id = p.id
      join public.roles r on r.id = ugr.role_id
     where p.id = actor
       and p.is_active = true
       and r.role_key = 'platform_admin'
       and r.role_scope = 'platform'
  ) then
    raise exception 'Active platform administrator access is required'
      using errcode = '42501';
  end if;
  return actor;
end;
$$;

create or replace function public.set_user_global_role_admin(
  p_user_id uuid,
  p_role_key text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_platform_admin();
  next_role_id uuid;
  previous_roles jsonb;
  target_is_admin boolean;
begin
  if coalesce(char_length(trim(p_reason)), 0) not between 3 and 500 then
    raise exception 'Audit reason is required';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found';
  end if;
  if nullif(trim(p_role_key), '') is not null then
    select id into next_role_id from public.roles
     where role_key = trim(p_role_key) and role_scope = 'platform';
    if next_role_id is null then raise exception 'Invalid platform role'; end if;
  end if;

  select coalesce(jsonb_agg(r.role_key order by r.role_key), '[]'::jsonb),
         bool_or(r.role_key = 'platform_admin')
    into previous_roles, target_is_admin
    from public.user_global_roles ugr
    join public.roles r on r.id = ugr.role_id
   where ugr.user_id = p_user_id and r.role_scope = 'platform';

  if coalesce(target_is_admin, false)
     and coalesce(trim(p_role_key), '') <> 'platform_admin'
     and not exists (
       select 1
         from public.profiles p
         join public.user_global_roles ugr on ugr.user_id = p.id
         join public.roles r on r.id = ugr.role_id
        where p.is_active = true and p.id <> p_user_id
          and r.role_key = 'platform_admin' and r.role_scope = 'platform'
     ) then
    raise exception 'Cannot remove the last active platform administrator';
  end if;

  delete from public.user_global_roles ugr using public.roles r
   where ugr.role_id = r.id and ugr.user_id = p_user_id
     and r.role_scope = 'platform';
  if next_role_id is not null then
    insert into public.user_global_roles(user_id, role_id, granted_by)
    values (p_user_id, next_role_id, actor);
  end if;

  insert into public.identity_admin_audit_log
    (actor_id, action, subject_type, subject_id, previous_value, new_value, reason)
  values
    (actor, 'set_global_role', 'user', p_user_id, previous_roles,
     jsonb_build_object('role_key', nullif(trim(p_role_key), '')), trim(p_reason));
end;
$$;

create or replace function public.set_user_team_assignment_admin(
  p_user_id uuid,
  p_team_id uuid,
  p_role_key text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_platform_admin();
  previous_value jsonb;
begin
  if coalesce(char_length(trim(p_reason)), 0) not between 3 and 500 then
    raise exception 'Audit reason is required';
  end if;
  select jsonb_build_object('member', tm.user_id is not null, 'roles',
    coalesce(jsonb_agg(r.role_key) filter (where r.id is not null), '[]'::jsonb))
    into previous_value
    from public.team_members tm
    left join public.team_member_roles tmr
      on tmr.team_id = tm.team_id and tmr.user_id = tm.user_id
    left join public.roles r on r.id = tmr.role_id
   where tm.team_id = p_team_id and tm.user_id = p_user_id
   group by tm.user_id;

  if nullif(trim(p_role_key), '') is null then
    perform public.remove_team_member(p_team_id, p_user_id);
  else
    if exists (
      select 1 from public.team_members
       where team_id = p_team_id and user_id = p_user_id
    ) then
      perform public.set_team_member_role(p_team_id, p_user_id, trim(p_role_key));
    else
      perform public.add_team_member(p_team_id, p_user_id, trim(p_role_key));
    end if;
  end if;

  insert into public.identity_admin_audit_log
    (actor_id, action, subject_type, subject_id, previous_value, new_value, reason)
  values
    (actor, 'set_team_assignment', 'user', p_user_id, previous_value,
     jsonb_build_object('team_id', p_team_id, 'role_key', nullif(trim(p_role_key), '')),
     trim(p_reason));
end;
$$;

create or replace function public.create_workspace_admin(
  p_name text, p_slug text, p_description text, p_type text, p_reason text
)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_platform_admin();
  organization uuid := public.current_organization_id();
  created public.workspaces;
begin
  if organization is null then raise exception 'Active organization context required'; end if;
  if coalesce(char_length(trim(p_reason)), 0) not between 3 and 500 then raise exception 'Audit reason is required'; end if;
  insert into public.workspaces
    (organization_id, name, slug, description, type, status, created_by, updated_by)
  values
    (organization, trim(p_name), lower(trim(p_slug)), nullif(trim(p_description), ''),
     p_type, 'active', actor, actor)
  returning * into created;
  insert into public.identity_admin_audit_log
    (actor_id, action, subject_type, subject_id, new_value, reason)
  values (actor, 'create_workspace', 'workspace', created.id,
    jsonb_build_object('name', created.name, 'slug', created.slug, 'type', created.type),
    trim(p_reason));
  return created;
end;
$$;

create or replace function public.update_workspace_admin(
  p_workspace_id uuid, p_name text, p_slug text, p_description text,
  p_type text, p_status text, p_reason text
)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_platform_admin();
  previous public.workspaces;
  updated public.workspaces;
begin
  if coalesce(char_length(trim(p_reason)), 0) not between 3 and 500 then raise exception 'Audit reason is required'; end if;
  select * into previous from public.workspaces where id = p_workspace_id for update;
  if previous.id is null then raise exception 'Workspace not found'; end if;
  if p_status not in ('active', 'suspended', 'archived') then raise exception 'Invalid status'; end if;
  update public.workspaces set
    name = trim(p_name), slug = lower(trim(p_slug)),
    description = nullif(trim(p_description), ''), type = p_type,
    status = p_status, deleted_at = case when p_status = 'archived' then coalesce(deleted_at, now()) else null end,
    updated_by = actor
  where id = p_workspace_id returning * into updated;
  insert into public.identity_admin_audit_log
    (actor_id, action, subject_type, subject_id, previous_value, new_value, reason)
  values (actor, 'update_workspace', 'workspace', p_workspace_id,
    jsonb_build_object('name', previous.name, 'slug', previous.slug, 'type', previous.type, 'status', previous.status),
    jsonb_build_object('name', updated.name, 'slug', updated.slug, 'type', updated.type, 'status', updated.status),
    trim(p_reason));
  return updated;
end;
$$;

create or replace function public.set_workspace_member_admin(
  p_workspace_id uuid, p_user_id uuid, p_role_key text, p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_platform_admin();
  organization uuid;
  member_id uuid;
  role_id uuid;
  previous_value jsonb;
begin
  if coalesce(char_length(trim(p_reason)), 0) not between 3 and 500 then raise exception 'Audit reason is required'; end if;
  select organization_id into organization from public.workspaces where id = p_workspace_id;
  if organization is null then raise exception 'Workspace not found'; end if;
  if not exists (
    select 1 from public.organization_members
     where organization_id = organization and user_id = p_user_id and status = 'active'
  ) then raise exception 'Active organization membership required'; end if;
  select wm.id, jsonb_build_object('status', wm.status, 'roles',
    coalesce(jsonb_agg(r.role_key) filter (where r.id is not null), '[]'::jsonb))
    into member_id, previous_value
    from public.workspace_members wm
    left join public.workspace_member_roles wmr on wmr.workspace_member_id = wm.id
    left join public.roles r on r.id = wmr.role_id
   where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id
   group by wm.id, wm.status;

  if nullif(trim(p_role_key), '') is null then
    if member_id is not null then
      update public.workspace_members set status = 'removed' where id = member_id;
      delete from public.workspace_member_roles where workspace_member_id = member_id;
    end if;
  else
    select id into role_id from public.roles
     where role_key = trim(p_role_key) and role_scope = 'workspace';
    if role_id is null then raise exception 'Invalid workspace role'; end if;
    insert into public.workspace_members
      (organization_id, workspace_id, user_id, status, created_by)
    values (organization, p_workspace_id, p_user_id, 'active', actor)
    on conflict (workspace_id, user_id) do update set status = 'active'
    returning id into member_id;
    delete from public.workspace_member_roles where workspace_member_id = member_id;
    insert into public.workspace_member_roles(workspace_member_id, role_id, granted_by)
    values (member_id, role_id, actor);
  end if;
  insert into public.identity_admin_audit_log
    (actor_id, action, subject_type, subject_id, previous_value, new_value, reason)
  values (actor, 'set_workspace_member', 'workspace', p_workspace_id, previous_value,
    jsonb_build_object('user_id', p_user_id, 'role_key', nullif(trim(p_role_key), '')),
    trim(p_reason));
end;
$$;

revoke all on function public.require_active_platform_admin() from public;
revoke all on function public.set_user_global_role_admin(uuid, text, text) from public;
revoke all on function public.set_user_team_assignment_admin(uuid, uuid, text, text) from public;
revoke all on function public.create_workspace_admin(text, text, text, text, text) from public;
revoke all on function public.update_workspace_admin(uuid, text, text, text, text, text, text) from public;
revoke all on function public.set_workspace_member_admin(uuid, uuid, text, text) from public;
grant execute on function public.set_user_global_role_admin(uuid, text, text) to authenticated;
grant execute on function public.set_user_team_assignment_admin(uuid, uuid, text, text) to authenticated;
grant execute on function public.create_workspace_admin(text, text, text, text, text) to authenticated;
grant execute on function public.update_workspace_admin(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.set_workspace_member_admin(uuid, uuid, text, text) to authenticated;

commit;
