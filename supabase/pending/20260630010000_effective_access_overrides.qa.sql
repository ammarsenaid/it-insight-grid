-- Static catalog QA. Run only after both 20260630000000 and 20260630010000.
begin;

do $$
declare
  function_definition text;
begin
  assert to_regprocedure(
    'public.resolve_permission_override(uuid,uuid,uuid,uuid,uuid)'
  ) is not null, 'permission override resolver must exist';
  assert to_regprocedure(
    'public.resolve_page_visibility_override(uuid,text,uuid)'
  ) is not null, 'page visibility override resolver must exist';
  assert to_regprocedure('public.get_my_effective_access()') is not null,
    'effective access function must exist';

  assert not has_function_privilege(
    'authenticated',
    'public.resolve_permission_override(uuid,uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ), 'authenticated must not invoke the internal permission resolver';
  assert not has_function_privilege(
    'authenticated',
    'public.resolve_page_visibility_override(uuid,text,uuid)',
    'EXECUTE'
  ), 'authenticated must not invoke the internal route resolver';
  assert has_function_privilege(
    'authenticated', 'public.get_my_effective_access()', 'EXECUTE'
  ), 'authenticated must invoke only its own effective access snapshot';

  select pg_get_functiondef('public.get_my_effective_access()'::regprocedure)
    into function_definition;
  assert function_definition like '%resolve_permission_override%',
    'effective access must apply permission overrides';
  assert function_definition like '%resolve_page_visibility_override%',
    'effective access must apply page visibility overrides';
  assert function_definition like '%safe_recovery_route%',
    'effective access must preserve recovery routing';
  assert function_definition like '%active_organization%',
    'effective access must preserve organization context';
  assert function_definition like '%workspaces%',
    'effective access must preserve workspace context';
end;
$$;

rollback;
