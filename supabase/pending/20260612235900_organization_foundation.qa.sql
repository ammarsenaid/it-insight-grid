-- Transaction-backed QA for 20260612235900_organization_foundation.sql.
-- Run only against a disposable database after pending migrations are applied.

begin;

do $$
declare
  body text;
begin
  assert (
    select relrowsecurity
      from pg_class
     where oid = 'public.organizations'::regclass
  ), 'organizations RLS must be enabled';

  assert (
    select relrowsecurity
      from pg_class
     where oid = 'public.organization_members'::regclass
  ), 'organization_members RLS must be enabled';

  assert not has_table_privilege(
    'authenticated',
    'public.organizations',
    'INSERT'
  ), 'authenticated must not create organizations directly';

  assert not has_table_privilege(
    'authenticated',
    'public.organization_members',
    'INSERT'
  ), 'authenticated must not create memberships directly';

  select pg_get_functiondef(
    'public.current_organization_id()'::regprocedure
  )
    into body;

  assert lower(body) like '%security definer%',
    'current organization helper must be security definer';

  assert lower(body) like '%set search_path to %',
    'current organization helper must pin search_path';

  assert lower(body) like
    '%exactly one active organization context is required%',
    'current organization helper must fail closed without one context';
end;
$$;

insert into auth.users (
  id,
  email,
  instance_id,
  aud,
  role,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-0000000000e1',
  'qa-suspended-org-member@example.com',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  '',
  now(),
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.profiles (
  id,
  email,
  display_name
)
values (
  '00000000-0000-0000-0000-0000000000e1',
  'qa-suspended-org-member@example.com',
  'QA Suspended Organization Member'
)
on conflict (id) do nothing;

insert into public.organizations (
  id,
  name,
  slug,
  status
)
values (
  '10000000-0000-0000-0000-0000000000e1',
  'QA Suspended Organization',
  'qa-suspended-organization',
  'suspended'
)
on conflict (id) do nothing;

insert into public.organization_members (
  organization_id,
  user_id,
  status
)
values (
  '10000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-0000000000e1',
  'active'
)
on conflict (organization_id, user_id) do nothing;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}',
  true
);

do $$
begin
  assert not public.is_active_organization_member(
    '10000000-0000-0000-0000-0000000000e1'
  ), 'suspended organization must not be treated as active';

  begin
    perform public.current_organization_id();

    raise exception
      'suspended organization unexpectedly resolved context';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","organization_id":"10000000-0000-0000-0000-0000000000e1"}',
  true
);

do $$
begin
  begin
    perform public.current_organization_id();

    raise exception
      'requested suspended organization unexpectedly resolved context';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

rollback;
