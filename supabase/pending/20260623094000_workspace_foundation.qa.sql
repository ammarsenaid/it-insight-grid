-- ============================================================
-- IT KNOWLEDGE CENTER
-- QA: Workspace foundation
-- ------------------------------------------------------------
-- Run only on disposable/test database before live apply.
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.workspaces') is null then
    raise exception 'QA FAIL: public.workspaces table missing';
  end if;

  if to_regclass('public.workspace_members') is null then
    raise exception 'QA FAIL: public.workspace_members table missing';
  end if;

  if to_regclass('public.workspace_member_roles') is null then
    raise exception 'QA FAIL: public.workspace_member_roles table missing';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'teams'
       and column_name = 'workspace_id'
  ) then
    raise exception 'QA FAIL: teams.workspace_id missing';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
      from public.workspaces
     group by organization_id, slug
    having count(*) > 1
  ) then
    raise exception 'QA FAIL: duplicate workspace slug inside organization';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
      from public.teams
     where organization_id is not null
       and workspace_id is null
  ) then
    raise exception 'QA FAIL: existing team without workspace_id';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
      from public.teams t
      join public.workspaces w
        on w.id = t.workspace_id
     where t.organization_id is distinct from w.organization_id
  ) then
    raise exception 'QA FAIL: team workspace organization mismatch';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
      from public.team_members tm
      join public.teams t
        on t.id = tm.team_id
     where tm.membership_status = 'active'
       and not exists (
         select 1
           from public.workspace_members wm
          where wm.workspace_id = t.workspace_id
            and wm.user_id = tm.user_id
            and wm.status = 'active'
       )
  ) then
    raise exception 'QA FAIL: active team member missing active workspace membership';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from public.roles
     where role_key = 'workspace_owner'
       and role_scope = 'workspace'
  ) then
    raise exception 'QA FAIL: workspace_owner role missing';
  end if;

  if not exists (
    select 1
      from public.permissions
     where permission_key = 'workspace.view'
  ) then
    raise exception 'QA FAIL: workspace.view permission missing';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'is_workspace_member'
  ) then
    raise exception 'QA FAIL: is_workspace_member function missing';
  end if;

  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'has_workspace_permission'
  ) then
    raise exception 'QA FAIL: has_workspace_permission function missing';
  end if;
end $$;

rollback;
