-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: Teams admin management RPCs
-- ------------------------------------------------------------
-- AUTHORITATIVE. Forward-only and additive.
-- Depends on 20260609194000_identity_rbac_foundation.sql, which left the
-- write surface for public.teams / public.team_members /
-- public.team_member_roles as create-only (public.create_team). This
-- migration adds the matching update/delete/member-management RPCs used by
-- the /admin/teams page.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. UPDATE TEAM
-- ------------------------------------------------------------
create or replace function public.update_team(
  p_team_id uuid,
  p_name text,
  p_slug text,
  p_description text default null
)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_team public.teams;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_permission('team.manage', p_team_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.teams
  set name = trim(p_name),
      slug = lower(trim(p_slug)),
      description = nullif(trim(p_description), '')
  where id = p_team_id
  returning * into updated_team;

  if updated_team.id is null then
    raise exception 'Team not found';
  end if;

  return updated_team;
end;
$$;

revoke all on function public.update_team(uuid, text, text, text) from public;
grant execute on function public.update_team(uuid, text, text, text)
  to authenticated;

-- ------------------------------------------------------------
-- 2. DELETE TEAM
-- ------------------------------------------------------------
create or replace function public.delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    public.is_platform_admin()
    or public.has_team_role(p_team_id, array['team_owner'])
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  delete from public.teams where id = p_team_id;
end;
$$;

revoke all on function public.delete_team(uuid) from public;
grant execute on function public.delete_team(uuid)
  to authenticated;

-- ------------------------------------------------------------
-- 3. ADD TEAM MEMBER
-- ------------------------------------------------------------
create or replace function public.add_team_member(
  p_team_id uuid,
  p_user_id uuid,
  p_role_key text default 'team_viewer'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_permission('team.manage_members', p_team_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select id into v_role_id
  from public.roles
  where role_key = p_role_key
    and role_scope = 'team';

  if v_role_id is null then
    raise exception 'Unknown team role: %', p_role_key;
  end if;

  insert into public.team_members (team_id, user_id, membership_status, invited_by)
  values (p_team_id, p_user_id, 'active', auth.uid())
  on conflict (team_id, user_id) do update
    set membership_status = 'active';

  insert into public.team_member_roles (team_id, user_id, role_id, granted_by)
  values (p_team_id, p_user_id, v_role_id, auth.uid())
  on conflict (team_id, user_id, role_id) do nothing;
end;
$$;

revoke all on function public.add_team_member(uuid, uuid, text) from public;
grant execute on function public.add_team_member(uuid, uuid, text)
  to authenticated;

-- ------------------------------------------------------------
-- 4. REMOVE TEAM MEMBER
-- ------------------------------------------------------------
create or replace function public.remove_team_member(
  p_team_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_owners int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_permission('team.manage_members', p_team_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select count(*) into remaining_owners
  from public.team_member_roles tmr
  join public.roles r on r.id = tmr.role_id
  where tmr.team_id = p_team_id
    and r.role_key = 'team_owner'
    and tmr.user_id <> p_user_id;

  if remaining_owners = 0 and exists (
    select 1
    from public.team_member_roles tmr
    join public.roles r on r.id = tmr.role_id
    where tmr.team_id = p_team_id
      and tmr.user_id = p_user_id
      and r.role_key = 'team_owner'
  ) then
    raise exception 'Cannot remove the only remaining team owner';
  end if;

  delete from public.team_members
  where team_id = p_team_id
    and user_id = p_user_id;
end;
$$;

revoke all on function public.remove_team_member(uuid, uuid) from public;
grant execute on function public.remove_team_member(uuid, uuid)
  to authenticated;

-- ------------------------------------------------------------
-- 5. SET TEAM MEMBER ROLE
-- ------------------------------------------------------------
create or replace function public.set_team_member_role(
  p_team_id uuid,
  p_user_id uuid,
  p_role_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
  remaining_owners int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_permission('team.manage_roles', p_team_id) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select id into v_role_id
  from public.roles
  where role_key = p_role_key
    and role_scope = 'team';

  if v_role_id is null then
    raise exception 'Unknown team role: %', p_role_key;
  end if;

  if p_role_key <> 'team_owner' then
    select count(*) into remaining_owners
    from public.team_member_roles tmr
    join public.roles r on r.id = tmr.role_id
    where tmr.team_id = p_team_id
      and r.role_key = 'team_owner'
      and tmr.user_id <> p_user_id;

    if remaining_owners = 0 and exists (
      select 1
      from public.team_member_roles tmr
      join public.roles r on r.id = tmr.role_id
      where tmr.team_id = p_team_id
        and tmr.user_id = p_user_id
        and r.role_key = 'team_owner'
    ) then
      raise exception 'Cannot demote the only remaining team owner';
    end if;
  end if;

  delete from public.team_member_roles tmr
  using public.roles r
  where tmr.role_id = r.id
    and tmr.team_id = p_team_id
    and tmr.user_id = p_user_id
    and r.role_scope = 'team';

  insert into public.team_member_roles (team_id, user_id, role_id, granted_by)
  values (p_team_id, p_user_id, v_role_id, auth.uid());
end;
$$;

revoke all on function public.set_team_member_role(uuid, uuid, text) from public;
grant execute on function public.set_team_member_role(uuid, uuid, text)
  to authenticated;

commit;
