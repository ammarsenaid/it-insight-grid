-- Catalog and definition QA for permission override enforcement.
begin;

do $$
declare
  global_definition text;
  workspace_definition text;
begin
  assert to_regprocedure('public.is_platform_admin()') is not null,
    'is_platform_admin must exist';
  assert to_regprocedure('public.has_permission(text,uuid)') is not null,
    'has_permission must exist';
  assert to_regprocedure('public.has_workspace_permission(uuid,text)') is not null,
    'has_workspace_permission must exist';
  assert to_regprocedure('public.get_access_control_status()') is not null,
    'access control activation marker must exist';
  assert has_function_privilege(
    'authenticated', 'public.is_platform_admin()', 'EXECUTE'
  ), 'authenticated must execute is_platform_admin';
  assert has_function_privilege(
    'authenticated', 'public.has_permission(text,uuid)', 'EXECUTE'
  ), 'authenticated must execute has_permission';
  assert has_function_privilege(
    'authenticated', 'public.has_workspace_permission(uuid,text)', 'EXECUTE'
  ), 'authenticated must execute has_workspace_permission';
  assert not has_function_privilege(
    'authenticated', 'public.get_access_control_status()', 'EXECUTE'
  ), 'authenticated must not execute the activation marker';
  assert has_function_privilege(
    'service_role', 'public.get_access_control_status()', 'EXECUTE'
  ), 'service role must execute the activation marker';
  assert (
    select pg_get_functiondef('public.is_platform_admin()'::regprocedure)
      like '%p.is_active = true%'
  ), 'platform admin helper must require an active profile';
  assert (
    select prosecdef
      from pg_proc
     where oid = 'public.has_permission(text,uuid)'::regprocedure
  ), 'has_permission must be security definer';
  assert (
    select prosecdef
      from pg_proc
     where oid = 'public.has_workspace_permission(uuid,text)'::regprocedure
  ), 'has_workspace_permission must be security definer';

  select pg_get_functiondef('public.has_permission(text,uuid)'::regprocedure)
    into global_definition;
  select pg_get_functiondef('public.has_workspace_permission(uuid,text)'::regprocedure)
    into workspace_definition;

  assert global_definition like '%resolve_permission_override%',
    'global/team permission helper must apply overrides';
  assert global_definition like '%membership_status = ''active''%',
    'team-scoped grants must require active membership';
  assert workspace_definition like '%resolve_permission_override%',
    'workspace permission helper must apply overrides';
  assert workspace_definition like '%wm.status = ''active''%',
    'workspace grants must require active membership';
end;
$$;

rollback;
