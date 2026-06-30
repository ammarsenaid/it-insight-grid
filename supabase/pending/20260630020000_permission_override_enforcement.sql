-- Enforce access overrides at the existing RLS/RPC permission boundaries.
-- Depends on both 20260630000000 and 20260630010000.
-- Staged for human review. Do not apply automatically.
begin;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.profiles p
         join public.user_global_roles ugr on ugr.user_id = p.id
         join public.roles r on r.id = ugr.role_id
        where p.id = auth.uid()
          and p.is_active = true
          and r.role_key = 'platform_admin'
          and r.role_scope = 'platform'
     );
$$;

create or replace function public.has_permission(
  requested_permission_key text,
  requested_team_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  permission_id uuid;
  active_organization_id uuid;
  team_workspace_id uuid;
  platform_admin boolean;
  override_effect public.access_override_effect;
  role_allowed boolean;
begin
  if caller_id is null then
    return false;
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = caller_id and p.is_active = true
  ) then
    return false;
  end if;

  select p.id into permission_id
    from public.permissions p
   where p.permission_key = requested_permission_key;
  if permission_id is null then
    return false;
  end if;

  active_organization_id := public.current_organization_id();
  platform_admin := public.is_platform_admin();

  if requested_team_id is not null then
    select t.workspace_id
      into team_workspace_id
      from public.teams t
     where t.id = requested_team_id
       and t.organization_id = active_organization_id;
    if not found then
      return false;
    end if;
    if not platform_admin and not exists (
      select 1 from public.team_members tm
       where tm.team_id = requested_team_id
         and tm.user_id = caller_id
         and tm.membership_status = 'active'
    ) then
      return false;
    end if;
  end if;

  override_effect := public.resolve_permission_override(
    caller_id,
    permission_id,
    active_organization_id,
    team_workspace_id,
    requested_team_id
  );
  if override_effect is not null then
    return override_effect = 'allow';
  end if;

  select platform_admin
      or exists (
        select 1
          from public.user_global_roles ugr
          join public.roles r
            on r.id = ugr.role_id and r.role_scope = 'platform'
          join public.role_permissions rp on rp.role_id = r.id
         where ugr.user_id = caller_id
           and rp.permission_id = permission_id
      )
      or (
        requested_team_id is not null
        and exists (
          select 1
            from public.team_member_roles tmr
            join public.team_members tm
              on tm.team_id = tmr.team_id and tm.user_id = tmr.user_id
            join public.roles r
              on r.id = tmr.role_id and r.role_scope = 'team'
            join public.role_permissions rp on rp.role_id = r.id
           where tmr.team_id = requested_team_id
             and tmr.user_id = caller_id
             and tm.membership_status = 'active'
             and rp.permission_id = permission_id
        )
      )
    into role_allowed;

  return coalesce(role_allowed, false);
exception
  when others then
    -- Authorization helpers fail closed. Callers never receive database details.
    return false;
end;
$$;

create or replace function public.has_workspace_permission(
  p_workspace_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  permission_id uuid;
  active_organization_id uuid;
  platform_admin boolean;
  override_effect public.access_override_effect;
  role_allowed boolean;
begin
  if caller_id is null then
    return false;
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = caller_id and p.is_active = true
  ) then
    return false;
  end if;

  active_organization_id := public.current_organization_id();
  if not exists (
    select 1
      from public.workspaces w
     where w.id = p_workspace_id
       and w.organization_id = active_organization_id
       and w.status = 'active'
       and w.deleted_at is null
  ) then
    return false;
  end if;

  platform_admin := public.is_platform_admin();
  if not platform_admin and not exists (
    select 1
      from public.workspace_members wm
     where wm.workspace_id = p_workspace_id
       and wm.user_id = caller_id
       and wm.status = 'active'
  ) then
    return false;
  end if;

  select p.id into permission_id
    from public.permissions p
   where p.permission_key = p_permission_key;
  if permission_id is null then
    return false;
  end if;

  override_effect := public.resolve_permission_override(
    caller_id,
    permission_id,
    active_organization_id,
    p_workspace_id,
    null
  );
  if override_effect is not null then
    return override_effect = 'allow';
  end if;

  select platform_admin or exists (
    select 1
      from public.workspace_members wm
      join public.workspace_member_roles wmr on wmr.workspace_member_id = wm.id
      join public.roles r
        on r.id = wmr.role_id and r.role_scope = 'workspace'
      join public.role_permissions rp
        on rp.role_id = r.id and rp.permission_id = permission_id
     where wm.workspace_id = p_workspace_id
       and wm.user_id = caller_id
       and wm.status = 'active'
  ) into role_allowed;

  return coalesce(role_allowed, false);
exception
  when others then
    return false;
end;
$$;

create or replace function public.get_access_control_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'version', 1,
    'overrides', true,
    'runtime_resolution', true,
    'permission_enforcement', true
  );
end;
$$;

revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.has_permission(text, uuid) from public, anon;
revoke all on function public.has_workspace_permission(uuid, text) from public, anon;
revoke all on function public.get_access_control_status()
  from public, anon, authenticated;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.has_permission(text, uuid) to authenticated, service_role;
grant execute on function public.has_workspace_permission(uuid, text)
  to authenticated, service_role;
grant execute on function public.get_access_control_status() to service_role;

comment on function public.has_permission(text, uuid) is
  'Authoritative permission check with user, team, workspace, then role precedence.';
comment on function public.has_workspace_permission(uuid, text) is
  'Authoritative workspace permission check with membership and override enforcement.';
comment on function public.is_platform_admin() is
  'Returns true only for active profiles holding the platform_admin platform role.';
comment on function public.get_access_control_status() is
  'Service-only activation marker for the complete access-control migration chain.';

commit;
