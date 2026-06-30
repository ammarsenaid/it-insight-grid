-- Transaction-backed catalog QA. Run only after the matching pending migration.
begin;

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
    assert to_regclass('public.' || table_name) is not null,
      format('%s must exist', table_name);
    assert (
      select relrowsecurity from pg_class where oid = to_regclass('public.' || table_name)
    ), format('%s must have RLS enabled', table_name);
    assert not has_table_privilege('authenticated', 'public.' || table_name, 'INSERT'),
      format('authenticated must not insert %s', table_name);
    assert not has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE'),
      format('authenticated must not update %s', table_name);
    assert not has_table_privilege('authenticated', 'public.' || table_name, 'DELETE'),
      format('authenticated must not delete %s', table_name);
  end loop;

  assert not has_table_privilege('service_role', 'public.access_control_audit_log', 'UPDATE'),
    'service_role must not update access audit history';
  assert not has_table_privilege('service_role', 'public.access_control_audit_log', 'DELETE'),
    'service_role must not delete access audit history';

  assert to_regprocedure('public.validate_access_override_route()') is not null,
    'route validation function must exist';
  assert to_regprocedure('public.audit_access_override()') is not null,
    'audit function must exist';
  assert to_regprocedure(
    'public.clear_access_override(text,uuid,text,text,text,uuid)'
  ) is not null, 'atomic inherit function must exist';
  assert not has_function_privilege(
    'authenticated',
    'public.clear_access_override(text,uuid,text,text,text,uuid)',
    'EXECUTE'
  ), 'authenticated must not execute atomic inherit function';
  assert has_function_privilege(
    'service_role',
    'public.clear_access_override(text,uuid,text,text,text,uuid)',
    'EXECUTE'
  ), 'service_role must execute atomic inherit function';
end $$;

rollback;
