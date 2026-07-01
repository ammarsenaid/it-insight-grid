-- Static/transactional QA. Run after the matching migration with ON_ERROR_STOP.
begin;

do $$
declare
  function_count integer;
begin
  if to_regclass('public.identity_admin_audit_log') is null then
    raise exception 'identity_admin_audit_log is missing';
  end if;
  select count(*) into function_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'set_user_global_role_admin',
       'set_user_team_assignment_admin',
       'create_workspace_admin',
       'update_workspace_admin',
       'set_workspace_member_admin'
     )
     and p.prosecdef;
  if function_count <> 5 then
    raise exception 'Expected five security-definer admin mutation functions, found %',
      function_count;
  end if;
  if exists (
    select 1 from information_schema.routine_privileges
     where routine_schema = 'public'
       and routine_name like '%_admin'
       and grantee in ('PUBLIC', 'anon')
       and privilege_type = 'EXECUTE'
  ) then
    raise exception 'Admin mutation function executable by PUBLIC/anon';
  end if;
  if has_table_privilege('authenticated', 'public.identity_admin_audit_log', 'INSERT')
     or has_table_privilege('authenticated', 'public.identity_admin_audit_log', 'UPDATE')
     or has_table_privilege('authenticated', 'public.identity_admin_audit_log', 'DELETE') then
    raise exception 'Authenticated role can mutate identity audit rows directly';
  end if;
end $$;

rollback;
