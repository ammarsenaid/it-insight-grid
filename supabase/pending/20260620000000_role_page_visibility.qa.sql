-- Transaction-backed QA for 20260620000000_role_page_visibility.sql.
-- Run only against a disposable database after the staged migration is applied.
begin;

do $$
begin
  assert to_regclass('public.role_page_visibility') is not null,
    'role_page_visibility table must exist';
  assert (
    select relrowsecurity
      from pg_class
     where oid = 'public.role_page_visibility'::regclass
  ), 'role_page_visibility RLS must be enabled';
  assert exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'role_page_visibility'
       and policyname = 'role_page_visibility_select_authenticated'
       and cmd = 'SELECT'
  ), 'authenticated SELECT policy must exist';
  assert exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.role_page_visibility'::regclass
       and tgname = 'validate_role_page_visibility'
       and not tgisinternal
  ), 'visibility invariant trigger must be installed';
  assert exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.role_page_visibility'::regclass
       and tgname = 'role_page_visibility_set_updated_at'
       and not tgisinternal
  ), 'updated_at trigger must be installed';

  assert not has_table_privilege('anon', 'public.role_page_visibility', 'SELECT'),
    'anon must not select role_page_visibility';
  assert not has_table_privilege('anon', 'public.role_page_visibility', 'INSERT'),
    'anon must not insert role_page_visibility';
  assert not has_table_privilege('anon', 'public.role_page_visibility', 'UPDATE'),
    'anon must not update role_page_visibility';
  assert not has_table_privilege('anon', 'public.role_page_visibility', 'DELETE'),
    'anon must not delete role_page_visibility';

  assert has_table_privilege('authenticated', 'public.role_page_visibility', 'SELECT'),
    'authenticated must select role_page_visibility';
  assert not has_table_privilege('authenticated', 'public.role_page_visibility', 'INSERT'),
    'authenticated must not insert role_page_visibility';
  assert not has_table_privilege('authenticated', 'public.role_page_visibility', 'UPDATE'),
    'authenticated must not update role_page_visibility';
  assert not has_table_privilege('authenticated', 'public.role_page_visibility', 'DELETE'),
    'authenticated must not delete role_page_visibility';

  assert has_table_privilege('service_role', 'public.role_page_visibility', 'SELECT'),
    'service_role must select role_page_visibility';
  assert has_table_privilege('service_role', 'public.role_page_visibility', 'INSERT'),
    'service_role must insert role_page_visibility';
  assert has_table_privilege('service_role', 'public.role_page_visibility', 'UPDATE'),
    'service_role must update role_page_visibility';
  assert not has_table_privilege('service_role', 'public.role_page_visibility', 'DELETE'),
    'service_role must not delete role_page_visibility';
end;
$$;

-- The static source contains 30 known routes and nine mapped platform roles.
do $$
begin
  assert (
    select count(*) from public.role_page_visibility
  ) = 270, 'seed must contain exactly 30 routes x 9 roles';

  assert (
    select count(distinct route_path) from public.role_page_visibility
  ) = 30, 'seed must contain exactly 30 route paths';

  assert (
    select count(distinct role_id) from public.role_page_visibility
  ) = 9, 'seed must contain exactly nine platform roles';

  assert not exists (
    select role_id, route_path
      from public.role_page_visibility
     group by role_id, route_path
    having count(*) <> 1
  ), 'every role and route combination must occur exactly once';

  assert not exists (
    select 1
      from public.role_page_visibility visibility
      join public.roles on roles.id = visibility.role_id
     where roles.role_scope <> 'platform'
  ), 'all visibility rows must reference platform-scoped roles';

  assert exists (
    select 1
      from public.role_page_visibility visibility
      join public.roles on roles.id = visibility.role_id
     where roles.role_key = 'platform_admin'
       and visibility.route_path = '/admin/roles'
       and visibility.can_view
  ), 'platform_admin must retain /admin/roles visibility';

  assert not exists (
    select 1
      from public.role_page_visibility visibility
      join public.roles on roles.id = visibility.role_id
     where roles.role_key = 'employee'
       and visibility.route_path like '/admin/%'
       and visibility.can_view
  ), 'employee must not receive administration visibility';
end;
$$;

-- Verify every seeded boolean, not only the row count.
do $$
declare
  mismatch_count integer;
begin
  with
  role_sets(set_name, role_keys) as (
    values
      (
        'all',
        array[
          'platform_admin', 'it_admin', 'sd_lead', 'helpdesk',
          'technician', 'network_admin', 'doc_editor',
          'platform_auditor', 'employee'
        ]::text[]
      ),
      (
        'non_requester',
        array[
          'platform_admin', 'it_admin', 'sd_lead', 'helpdesk',
          'technician', 'network_admin', 'doc_editor',
          'platform_auditor'
        ]::text[]
      ),
      (
        'ticket_queue',
        array[
          'platform_admin', 'it_admin', 'sd_lead', 'helpdesk',
          'technician', 'network_admin', 'platform_auditor'
        ]::text[]
      ),
      ('admins', array['platform_admin', 'it_admin']::text[]),
      ('admin_config', array['platform_admin', 'it_admin', 'sd_lead']::text[]),
      (
        'reports',
        array['platform_admin', 'it_admin', 'sd_lead', 'platform_auditor']::text[]
      ),
      ('audit', array['platform_admin', 'it_admin', 'platform_auditor']::text[])
  ),
  route_rules(route_path, set_name) as (
    values
      ('/',                      'non_requester'),
      ('/dashboard',             'non_requester'),
      ('/documents',             'all'),
      ('/search',                'non_requester'),
      ('/tickets',               'ticket_queue'),
      ('/tickets/',              'ticket_queue'),
      ('/tickets/:id',           'all'),
      ('/my-requests',           'all'),
      ('/service-catalog',       'all'),
      ('/service-catalog/:id',   'all'),
      ('/notifications',         'all'),
      ('/cmdb',                  'non_requester'),
      ('/ipam',                  'non_requester'),
      ('/tasks',                 'non_requester'),
      ('/notes',                 'non_requester'),
      ('/protocols',             'non_requester'),
      ('/protocols/',            'non_requester'),
      ('/protocols/:id',         'non_requester'),
      ('/audit',                 'audit'),
      ('/reports',               'reports'),
      ('/admin/users',           'admins'),
      ('/admin/teams',           'admins'),
      ('/admin/roles',           'admins'),
      ('/admin/ticket-settings', 'admin_config'),
      ('/admin/mailbox',         'admin_config'),
      ('/admin/templates',       'admin_config'),
      ('/admin/catalog',         'admin_config'),
      ('/recycle-bin',           'admins'),
      ('/trash',                 'admins'),
      ('/settings',              'all')
  ),
  expected as (
    select
      roles.id as role_id,
      route_rules.route_path,
      roles.role_key = any(role_sets.role_keys) as can_view
    from public.roles
    cross join route_rules
    join role_sets on role_sets.set_name = route_rules.set_name
    where roles.role_scope = 'platform'
      and roles.role_key = any(array[
        'platform_admin', 'it_admin', 'sd_lead', 'helpdesk',
        'technician', 'network_admin', 'doc_editor',
        'platform_auditor', 'employee'
      ]::text[])
  ),
  mismatches as (
    (
      select role_id, route_path, can_view from expected
      except
      select role_id, route_path, can_view from public.role_page_visibility
    )
    union all
    (
      select role_id, route_path, can_view from public.role_page_visibility
      except
      select role_id, route_path, can_view from expected
    )
  )
  select count(*) into mismatch_count from mismatches;

  assert mismatch_count = 0,
    'seeded visibility booleans must exactly match static PAGE_VISIBILITY';
end;
$$;

-- Structural and invariant trigger checks run as the migration owner. Every
-- attempted write is still covered by the outer transaction rollback.
do $$
declare
  platform_admin_id uuid := (
    select id from public.roles where role_key = 'platform_admin' and role_scope = 'platform'
  );
  employee_id uuid := (
    select id from public.roles where role_key = 'employee' and role_scope = 'platform'
  );
  team_role_id uuid := (
    select id from public.roles where role_scope = 'team' order by role_key limit 1
  );
begin
  begin
    insert into public.role_page_visibility (role_id, route_path, can_view)
    values (platform_admin_id, 'not a valid route', true);
    raise exception 'invalid route_path unexpectedly succeeded';
  exception when check_violation then null;
  end;

  begin
    insert into public.role_page_visibility (role_id, route_path, can_view)
    values (employee_id, '/admin/qa-insert', true);
    raise exception 'employee admin visibility insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.role_page_visibility
       set can_view = true
     where role_id = employee_id
       and route_path = '/admin/users';
    raise exception 'employee admin visibility update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.role_page_visibility
       set can_view = false
     where role_id = platform_admin_id
       and route_path = '/admin/roles';
    raise exception 'platform_admin /admin/roles revoke unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.role_page_visibility
       set route_path = '/admin/qa-moved-protected-row'
     where role_id = platform_admin_id
       and route_path = '/admin/roles';
    raise exception 'platform_admin protected-row move unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.role_page_visibility
     where role_id = platform_admin_id
       and route_path = '/admin/roles';
    raise exception 'protected platform_admin row delete unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  if team_role_id is not null then
    begin
      insert into public.role_page_visibility (role_id, route_path, can_view)
      values (team_role_id, '/qa-team-role', true);
      raise exception 'team role visibility insert unexpectedly succeeded';
    exception when check_violation then null;
    end;
  end if;
end;
$$;

-- Even service_role cannot use DELETE as an operational mutation path.
set local role service_role;
do $$
begin
  begin
    delete from public.role_page_visibility where false;
    raise exception 'service_role DELETE unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

rollback;
