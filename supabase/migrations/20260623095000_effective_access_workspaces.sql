-- ============================================================
-- IT KNOWLEDGE CENTER
-- Pending Migration: Workspace-aware effective access
-- ------------------------------------------------------------
-- PURPOSE:
-- Extend get_my_effective_access() with workspace context.
--
-- SAFE / ADDITIVE:
-- - Existing JSON keys stay unchanged.
-- - Frontend parser currently ignores unknown extra keys.
-- - Does not alter route visibility behavior.
-- - Does not alter has_permission().
-- - Does not migrate tickets or knowledge yet.
-- ============================================================

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
  active_organization_id uuid;
  active_organization jsonb := null;
  role_keys text[] := array[]::text[];
  permission_keys text[] := array[]::text[];
  visible_routes text[] := array[]::text[];
  workspaces jsonb := '[]'::jsonb;
  platform_admin boolean := false;
  recovery_route text;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.profiles
     where profiles.id = caller_id
       and profiles.is_active = true
  ) then
    raise exception 'Active account required' using errcode = '42501';
  end if;

  active_organization_id := public.current_organization_id();

  select jsonb_build_object(
           'id', organizations.id,
           'slug', organizations.slug,
           'name', organizations.name,
           'status', organizations.status
         )
    into active_organization
    from public.organizations
   where organizations.id = active_organization_id;

  select coalesce(array_agg(distinct effective.role_key order by effective.role_key), array[]::text[])
    into role_keys
  from (
    select roles.role_key
      from public.user_global_roles
      join public.roles
        on roles.id = user_global_roles.role_id
     where user_global_roles.user_id = caller_id
       and roles.role_scope = 'platform'

    union

    select roles.role_key
      from public.team_member_roles
      join public.team_members
        on team_members.team_id = team_member_roles.team_id
       and team_members.user_id = team_member_roles.user_id
      join public.roles
        on roles.id = team_member_roles.role_id
     where team_member_roles.user_id = caller_id
       and team_members.membership_status = 'active'
       and team_members.organization_id = active_organization_id
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
          join public.roles
            on roles.id = user_global_roles.role_id
          join public.role_permissions
            on role_permissions.role_id = roles.id
         where user_global_roles.user_id = caller_id
           and roles.role_scope = 'platform'

        union

        select role_permissions.permission_id
          from public.team_member_roles
          join public.team_members
            on team_members.team_id = team_member_roles.team_id
           and team_members.user_id = team_member_roles.user_id
          join public.roles
            on roles.id = team_member_roles.role_id
          join public.role_permissions
            on role_permissions.role_id = roles.id
         where team_member_roles.user_id = caller_id
           and team_members.membership_status = 'active'
           and team_members.organization_id = active_organization_id
           and roles.role_scope = 'team'
      );

  select coalesce(array_agg(distinct visibility.route_path order by visibility.route_path), array[]::text[])
    into visible_routes
    from public.role_page_visibility visibility
    join public.roles
      on roles.id = visibility.role_id
    join public.user_global_roles
      on user_global_roles.role_id = roles.id
     and user_global_roles.user_id = caller_id
   where roles.role_scope = 'platform'
     and visibility.can_view = true;

  /*
    Workspace context is intentionally separate from top-level permission_keys.

    Reason:
    Top-level permission_keys still drive current route behavior.
    Workspace-scoped permissions must not be flattened into global permissions,
    otherwise a workspace-only grant could appear global in the frontend before
    tickets/knowledge RLS are fully workspace-aware.
  */
  select coalesce(jsonb_agg(workspace_payload order by workspace_payload->>'slug'), '[]'::jsonb)
    into workspaces
  from (
    select jsonb_build_object(
             'id', w.id,
             'organization_id', w.organization_id,
             'slug', w.slug,
             'name', w.name,
             'type', w.type,
             'status', w.status,
             'membership_status',
               case
                 when platform_admin then 'platform_admin'
                 else wm.status
               end,
             'role_keys',
               coalesce(
                 (
                   select jsonb_agg(distinct r.role_key order by r.role_key)
                     from public.workspace_members wm_roles
                     join public.workspace_member_roles wmr
                       on wmr.workspace_member_id = wm_roles.id
                     join public.roles r
                       on r.id = wmr.role_id
                      and r.role_scope = 'workspace'
                    where wm_roles.workspace_id = w.id
                      and wm_roles.user_id = caller_id
                      and wm_roles.status = 'active'
                 ),
                 case when platform_admin then jsonb_build_array('platform_admin') else '[]'::jsonb end
               ),
             'permission_keys',
               coalesce(
                 (
                   select jsonb_agg(distinct p.permission_key order by p.permission_key)
                     from public.workspace_members wm_perm
                     join public.workspace_member_roles wmr
                       on wmr.workspace_member_id = wm_perm.id
                     join public.roles r
                       on r.id = wmr.role_id
                      and r.role_scope = 'workspace'
                     join public.role_permissions rp
                       on rp.role_id = r.id
                     join public.permissions p
                       on p.id = rp.permission_id
                    where wm_perm.workspace_id = w.id
                      and wm_perm.user_id = caller_id
                      and wm_perm.status = 'active'
                 ),
                 case
                   when platform_admin then (
                     select coalesce(jsonb_agg(permission_key order by permission_key), '[]'::jsonb)
                       from public.permissions
                      where permission_key like 'workspace.%'
                         or permission_key in ('queue.manage', 'mailbox.manage')
                   )
                   else '[]'::jsonb
                 end
               ),
             'teams',
               coalesce(
                 (
                   select jsonb_agg(
                            jsonb_build_object(
                              'id', teams.id,
                              'slug', teams.slug,
                              'name', teams.name
                            )
                            order by teams.slug
                          )
                     from public.teams
                    where teams.organization_id = w.organization_id
                      and teams.workspace_id = w.id
                 ),
                 '[]'::jsonb
               )
           ) as workspace_payload
      from public.workspaces w
      left join public.workspace_members wm
        on wm.workspace_id = w.id
       and wm.user_id = caller_id
       and wm.status = 'active'
     where w.organization_id = active_organization_id
       and w.status = 'active'
       and w.deleted_at is null
       and (
         platform_admin
         or wm.id is not null
       )
  ) workspace_rows;

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
    'is_platform_admin', platform_admin,
    'active_organization', active_organization,
    'workspaces', workspaces
  );
end;
$$;

revoke all
  on function public.get_my_effective_access()
  from public;

grant execute
  on function public.get_my_effective_access()
  to authenticated;

commit;
