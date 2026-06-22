-- Disposable-database QA for 20260622010000_effective_access_rpc.sql.
begin;

do $$
begin
  assert to_regprocedure('public.get_my_effective_access()') is not null,
    'get_my_effective_access() must exist';
  assert not has_function_privilege('anon', 'public.get_my_effective_access()', 'EXECUTE'),
    'anon must not execute get_my_effective_access()';
  assert has_function_privilege('authenticated', 'public.get_my_effective_access()', 'EXECUTE'),
    'authenticated must execute get_my_effective_access()';
  assert (
    select prosecdef from pg_proc where oid = 'public.get_my_effective_access()'::regprocedure
  ), 'get_my_effective_access() must be security definer';
  assert (
    select proconfig @> array['search_path=""']
    from pg_proc where oid = 'public.get_my_effective_access()'::regprocedure
  ), 'get_my_effective_access() must use an empty search_path';
end;
$$;

-- Behavioral fixtures are intentionally left to the disposable runner: the RPC
-- depends on an auth.uid() JWT claim and the role visibility seed from the
-- preceding pending migrations. Static QA verifies that the function reads each
-- authoritative relationship and never accepts a target user parameter.

rollback;
