-- Apply access overrides to the authenticated runtime authorization snapshot.
-- Depends on 20260630000000_access_control_overrides.sql.
-- Staged for human review. Do not apply automatically.
begin;

create or replace function public.resolve_permission_override(
  requested_user_id uuid,
  requested_permission_id uuid,
  requested_organization_id uuid,
  requested_workspace_id uuid default null,
  requested_team_id uuid default null
)
returns public.access_override_effect
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved public.access_override_effect;
begin
  select effect into resolved
    from public.user_permission_overrides
   where user_id = requested_user_id
     and permission_id = requested_permission_id;
  if resolved is not null then
    return resolved;
  end if;

  select case
           when bool_or(o.effect = 'deny') then 'deny'::public.access_override_effect
           when bool_or(o.effect = 'allow') then 'allow'::public.access_override_effect
           else null
         end
    into resolved
    from public.team_permission_overrides o
    join public.team_members tm
      on tm.team_id = o.team_id
     and tm.user_id = requested_user_id
     and tm.membership_status = 'active'
    join public.teams t
      on t.id = tm.team_id
   where o.permission_id = requested_permission_id
     and t.organization_id = requested_organization_id
     and (requested_workspace_id is null or t.workspace_id = requested_workspace_id)
     and (requested_team_id is null or t.id = requested_team_id);
  if resolved is not null then
    return resolved;
  end if;

  select case
           when bool_or(o.effect = 'deny') then 'deny'::public.access_override_effect
           when bool_or(o.effect = 'allow') then 'allow'::public.access_override_effect
           else null
         end
    into resolved
    from public.workspace_permission_overrides o
    join public.workspace_members wm
      on wm.workspace_id = o.workspace_id
     and wm.user_id = requested_user_id
     and wm.status = 'active'
    join public.workspaces w
      on w.id = wm.workspace_id
   where o.permission_id = requested_permission_id
     and w.organization_id = requested_organization_id
     and (requested_workspace_id is null or w.id = requested_workspace_id);

  return resolved;
end;
$$;

create or replace function public.resolve_page_visibility_override(
  requested_user_id uuid,
  requested_route_path text,
  requested_organization_id uuid
)
returns public.access_override_effect
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved public.access_override_effect;
begin
  select effect into resolved
    from public.user_page_visibility_overrides
   where user_id = requested_user_id
     and route_path = requested_route_path;
  if resolved is not null then
    return resolved;
  end if;

  select case
           when bool_or(o.effect = 'deny') then 'deny'::public.access_override_effect
           when bool_or(o.effect = 'allow') then 'allow'::public.access_override_effect
           else null
         end
    into resolved
    from public.team_page_visibility_overrides o
    join public.team_members tm
      on tm.team_id = o.team_id
     and tm.user_id = requested_user_id
     and tm.membership_status = 'active'
    join public.teams t
      on t.id = tm.team_id
   where o.route_path = requested_route_path
     and t.organization_id = requested_organization_id;
  if resolved is not null then
    return resolved;
  end if;

  select case
           when bool_or(o.effect = 'deny') then 'deny'::public.access_override_effect
           when bool_or(o.effect = 'allow') then 'allow'::public.access_override_effect
           else null
         end
    into resolved
    from public.workspace_page_visibility_overrides o
    join public.workspace_members wm
      on wm.workspace_id = o.workspace_id
     and wm.user_id = requested_user_id
     and wm.status = 'active'
    join public.workspaces w
      on w.id = wm.workspace_id
   where o.route_path = requested_route_path
     and w.organization_id = requested_organization_id;

  return resolved;
end;
$$;

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
    select 1 from public.profiles p
     where p.id = caller_id and p.is_active = true
  ) then
    raise exception 'Active account required' using errcode = '42501';
  end if;

  active_organization_id := public.current_organization_id();

  select jsonb_build_object(
           'id', o.id, 'slug', o.slug, 'name', o.name, 'status', o.status
         )
    into active_organization
    from public.organizations o
   where o.id = active_organization_id;

  select coalesce(array_agg(distinct effective.role_key order by effective.role_key), array[]::text[])
    into role_keys
    from (
      select r.role_key
        from public.user_global_roles ugr
        join public.roles r on r.id = ugr.role_id
       where ugr.user_id = caller_id and r.role_scope = 'platform'
      union
      select r.role_key
        from public.team_member_roles tmr
        join public.team_members tm
          on tm.team_id = tmr.team_id and tm.user_id = tmr.user_id
        join public.teams t on t.id = tm.team_id
        join public.roles r on r.id = tmr.role_id
       where tmr.user_id = caller_id
         and tm.membership_status = 'active'
         and t.organization_id = active_organization_id
         and r.role_scope = 'team'
    ) effective;

  platform_admin := 'platform_admin' = any(role_keys);

  select coalesce(array_agg(p.permission_key order by p.permission_key), array[]::text[])
    into permission_keys
    from public.permissions p
   where coalesce(
           public.resolve_permission_override(
             caller_id, p.id, active_organization_id, null
           ) = 'allow',
           platform_admin or p.id in (
             select rp.permission_id
               from public.user_global_roles ugr
               join public.roles r on r.id = ugr.role_id
               join public.role_permissions rp on rp.role_id = r.id
              where ugr.user_id = caller_id and r.role_scope = 'platform'
             union
             select rp.permission_id
               from public.team_member_roles tmr
               join public.team_members tm
                 on tm.team_id = tmr.team_id and tm.user_id = tmr.user_id
               join public.teams t on t.id = tm.team_id
               join public.roles r on r.id = tmr.role_id
               join public.role_permissions rp on rp.role_id = r.id
              where tmr.user_id = caller_id
                and tm.membership_status = 'active'
                and t.organization_id = active_organization_id
                and r.role_scope = 'team'
           )
         );

  select coalesce(array_agg(candidate.route_path order by candidate.route_path), array[]::text[])
    into visible_routes
    from (
      select distinct route_path
        from public.role_page_visibility
      union
      select route_path from public.user_page_visibility_overrides where user_id = caller_id
      union
      select o.route_path
        from public.team_page_visibility_overrides o
        join public.team_members tm
          on tm.team_id = o.team_id
         and tm.user_id = caller_id
         and tm.membership_status = 'active'
        join public.teams t on t.id = tm.team_id
       where t.organization_id = active_organization_id
      union
      select o.route_path
        from public.workspace_page_visibility_overrides o
        join public.workspace_members wm
          on wm.workspace_id = o.workspace_id
         and wm.user_id = caller_id
         and wm.status = 'active'
       where wm.organization_id = active_organization_id
    ) candidate
   where coalesce(
           public.resolve_page_visibility_override(
             caller_id, candidate.route_path, active_organization_id
           ) = 'allow',
           exists (
             select 1
               from public.role_page_visibility rpv
               join public.user_global_roles ugr on ugr.role_id = rpv.role_id
               join public.roles r on r.id = ugr.role_id
              where ugr.user_id = caller_id
                and r.role_scope = 'platform'
                and rpv.route_path = candidate.route_path
                and rpv.can_view = true
           )
         );

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
               'membership_status', case when platform_admin then 'platform_admin' else wm.status end,
               'role_keys',
                 coalesce(
                   (
                     select jsonb_agg(distinct r.role_key order by r.role_key)
                       from public.workspace_members member_roles
                       join public.workspace_member_roles wmr
                         on wmr.workspace_member_id = member_roles.id
                       join public.roles r
                         on r.id = wmr.role_id and r.role_scope = 'workspace'
                      where member_roles.workspace_id = w.id
                        and member_roles.user_id = caller_id
                        and member_roles.status = 'active'
                   ),
                   case when platform_admin
                     then jsonb_build_array('platform_admin') else '[]'::jsonb end
                 ),
               'permission_keys',
                 coalesce(
                   (
                     select jsonb_agg(p.permission_key order by p.permission_key)
                       from public.permissions p
                      where coalesce(
                              public.resolve_permission_override(
                                caller_id, p.id, active_organization_id, w.id
                              ) = 'allow',
                              platform_admin or exists (
                                select 1
                                  from public.workspace_members member_permissions
                                  join public.workspace_member_roles wmr
                                    on wmr.workspace_member_id = member_permissions.id
                                  join public.roles r
                                    on r.id = wmr.role_id and r.role_scope = 'workspace'
                                  join public.role_permissions rp
                                    on rp.role_id = r.id and rp.permission_id = p.id
                                 where member_permissions.workspace_id = w.id
                                   and member_permissions.user_id = caller_id
                                   and member_permissions.status = 'active'
                              )
                            )
                   ),
                   '[]'::jsonb
                 ),
               'teams',
                 coalesce(
                   (
                     select jsonb_agg(
                              jsonb_build_object(
                                'id', t.id, 'slug', t.slug, 'name', t.name
                              ) order by t.slug
                            )
                       from public.teams t
                      where t.organization_id = w.organization_id
                        and t.workspace_id = w.id
                   ),
                   '[]'::jsonb
                 )
             ) workspace_payload
        from public.workspaces w
        left join public.workspace_members wm
          on wm.workspace_id = w.id
         and wm.user_id = caller_id
         and wm.status = 'active'
       where w.organization_id = active_organization_id
         and w.status = 'active'
         and w.deleted_at is null
         and (platform_admin or wm.id is not null)
    ) workspace_rows;

  recovery_route := case
    when platform_admin and '/admin/roles' = any(visible_routes) then '/admin/roles'
    when exists (
      select 1 from unnest(role_keys) role_key
       where role_key not in (
         'employee', 'team_owner', 'team_admin', 'team_editor', 'team_viewer'
       )
    ) and '/' = any(visible_routes) then '/'
    when 'employee' = any(role_keys)
      and '/my-requests' = any(visible_routes) then '/my-requests'
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

revoke all on function public.resolve_permission_override(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.resolve_page_visibility_override(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_effective_access() from public, anon;
grant execute on function public.get_my_effective_access() to authenticated, service_role;

comment on function public.get_my_effective_access() is
  'Returns caller effective access after user, team, workspace, and role precedence.';

commit;
