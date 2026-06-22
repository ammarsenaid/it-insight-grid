-- Backend source of truth for the authenticated frontend authorization context.
-- Pending only: rehearse with the paired QA file on a disposable database.
begin;

create or replace function public.get_my_effective_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  role_keys text[] := array[]::text[];
  permission_keys text[] := array[]::text[];
  visible_routes text[] := array[]::text[];
  platform_admin boolean := false;
  recovery_route text;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where profiles.id = caller_id and profiles.is_active = true
  ) then
    raise exception 'Active account required' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct effective.role_key order by effective.role_key), array[]::text[])
    into role_keys
  from (
    select roles.role_key
    from public.user_global_roles
    join public.roles on roles.id = user_global_roles.role_id
    where user_global_roles.user_id = caller_id
      and roles.role_scope = 'platform'
    union
    select roles.role_key
    from public.team_member_roles
    join public.team_members
      on team_members.team_id = team_member_roles.team_id
     and team_members.user_id = team_member_roles.user_id
    join public.roles on roles.id = team_member_roles.role_id
    where team_member_roles.user_id = caller_id
      and team_members.membership_status = 'active'
      and roles.role_scope = 'team'
  ) effective;

  platform_admin := 'platform_admin' = any(role_keys);

  select coalesce(array_agg(distinct permissions.permission_key order by permissions.permission_key), array[]::text[])
    into permission_keys
  from public.permissions
  where platform_admin
     or permissions.id in (
       select role_permissions.permission_id
       from public.user_global_roles
       join public.roles on roles.id = user_global_roles.role_id
       join public.role_permissions on role_permissions.role_id = roles.id
       where user_global_roles.user_id = caller_id
         and roles.role_scope = 'platform'
       union
       select role_permissions.permission_id
       from public.team_member_roles
       join public.team_members
         on team_members.team_id = team_member_roles.team_id
        and team_members.user_id = team_member_roles.user_id
       join public.roles on roles.id = team_member_roles.role_id
       join public.role_permissions on role_permissions.role_id = roles.id
       where team_member_roles.user_id = caller_id
         and team_members.membership_status = 'active'
         and roles.role_scope = 'team'
     );

  select coalesce(array_agg(distinct visibility.route_path order by visibility.route_path), array[]::text[])
    into visible_routes
  from public.role_page_visibility visibility
  join public.roles on roles.id = visibility.role_id
  join public.user_global_roles
    on user_global_roles.role_id = roles.id
   and user_global_roles.user_id = caller_id
  where roles.role_scope = 'platform'
    and visibility.can_view = true;

  recovery_route := case
    when platform_admin and '/admin/roles' = any(visible_routes) then '/admin/roles'
    when exists (
      select 1 from unnest(role_keys) role_key
      where role_key not in ('employee', 'team_owner', 'team_admin', 'team_editor', 'team_viewer')
    ) and '/' = any(visible_routes) then '/'
    when 'employee' = any(role_keys) and '/my-requests' = any(visible_routes) then '/my-requests'
    else null
  end;

  if recovery_route is null then
    raise exception 'No safe recovery route is configured for this account'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'role_keys', to_jsonb(role_keys),
    'permission_keys', to_jsonb(permission_keys),
    'visible_routes', to_jsonb(visible_routes),
    'safe_recovery_route', recovery_route,
    'is_platform_admin', platform_admin
  );
end;
$$;

revoke all on function public.get_my_effective_access() from public, anon;
grant execute on function public.get_my_effective_access() to authenticated, service_role;

comment on function public.get_my_effective_access() is
  'Returns the caller effective roles, permissions, visible routes, recovery route, and platform-admin flag.';

commit;
