-- ============================================================
-- IT KNOWLEDGE CENTER
-- QA: Workspace-aware effective access
-- ------------------------------------------------------------
-- Run only after 20260623095000_effective_access_workspaces.sql.
-- ============================================================

begin;

do $$
declare
  fn_count integer;
begin
  select count(*)
    into fn_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'get_my_effective_access';

  if fn_count <> 1 then
    raise exception 'QA FAIL: expected exactly one get_my_effective_access function, got %', fn_count;
  end if;
end $$;

do $$
declare
  fn_def text;
begin
  select pg_get_functiondef(p.oid)
    into fn_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'get_my_effective_access';

  if fn_def not like '%active_organization%' then
    raise exception 'QA FAIL: active_organization key missing from function definition';
  end if;

  if fn_def not like '%workspaces%' then
    raise exception 'QA FAIL: workspaces key missing from function definition';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from information_schema.tables
     where table_schema = 'public'
       and table_name = 'workspaces'
  ) then
    raise exception 'QA FAIL: workspaces table missing';
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
    raise exception 'QA FAIL: team without workspace_id exists';
  end if;
end $$;

rollback;
