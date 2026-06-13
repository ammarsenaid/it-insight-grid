-- Transaction-backed QA for 20260613000000_cmdb_backend.sql.
-- Run only against a disposable database after pending migrations are applied.

begin;

do $$
declare
  body text;
begin
  assert (
    select relrowsecurity
      from pg_class
     where oid = 'public.cmdb_assets'::regclass
  ), 'cmdb_assets RLS must be enabled';

  assert (
    select relrowsecurity
      from pg_class
     where oid = 'public.cmdb_asset_types'::regclass
  ), 'cmdb_asset_types RLS must be enabled';

  assert (
    select relrowsecurity
      from pg_class
     where oid = 'public.cmdb_asset_lifecycle_events'::regclass
  ), 'cmdb lifecycle RLS must be enabled';

  assert not has_table_privilege(
    'authenticated',
    'public.cmdb_assets',
    'DELETE'
  ), 'authenticated must not hard-delete CMDB assets';

  assert not has_column_privilege(
    'authenticated',
    'public.cmdb_assets',
    'organization_id',
    'UPDATE'
  ), 'authenticated must not move CMDB assets across organizations';

  assert not has_table_privilege(
    'authenticated',
    'public.cmdb_asset_types',
    'INSERT'
  ), 'authenticated must not create global CMDB asset types';

  assert not has_table_privilege(
    'authenticated',
    'public.cmdb_asset_types',
    'UPDATE'
  ), 'authenticated must not update global CMDB asset types';

  assert not has_table_privilege(
    'authenticated',
    'public.cmdb_asset_lifecycle_events',
    'INSERT'
  ), 'authenticated must not forge CMDB lifecycle rows';

  select pg_get_functiondef(
    'public.soft_delete_cmdb_asset(uuid)'::regprocedure
  )
    into body;

  assert lower(body) like '%security definer%',
    'soft delete RPC must be security definer';

  assert lower(body) like '%set search_path to %',
    'soft delete RPC must pin search_path';

  assert lower(body) like '%current_organization_id()%',
    'soft delete RPC must enforce organization scope';

  select pg_get_functiondef(
    'public.restore_cmdb_asset(uuid)'::regprocedure
  )
    into body;

  assert lower(body) like '%current_organization_id()%',
    'restore RPC must enforce organization scope';

  select pg_get_functiondef(
    'public.set_cmdb_asset_statuses(uuid[],text)'::regprocedure
  )
    into body;

  assert lower(body) like '%current_organization_id()%',
    'bulk status RPC must enforce organization scope';

  select pg_get_functiondef(
    'public.import_cmdb_assets(jsonb)'::regprocedure
  )
    into body;

  assert lower(body) like '%current_organization_id()%',
    'import RPC must derive organization scope';
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
values
  (
    '00000000-0000-0000-0000-0000000000c1',
    'qa-cmdb-org-a-manager@example.com',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000c2',
    'qa-cmdb-org-a-viewer@example.com',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000c3',
    'qa-cmdb-org-b-manager@example.com',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000c4',
    'qa-cmdb-no-org@example.com',
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
values
  (
    '00000000-0000-0000-0000-0000000000c1',
    'qa-cmdb-org-a-manager@example.com',
    'QA CMDB Organization A Manager'
  ),
  (
    '00000000-0000-0000-0000-0000000000c2',
    'qa-cmdb-org-a-viewer@example.com',
    'QA CMDB Organization A Viewer'
  ),
  (
    '00000000-0000-0000-0000-0000000000c3',
    'qa-cmdb-org-b-manager@example.com',
    'QA CMDB Organization B Manager'
  ),
  (
    '00000000-0000-0000-0000-0000000000c4',
    'qa-cmdb-no-org@example.com',
    'QA CMDB No Organization'
  )
on conflict (id) do nothing;

insert into public.organizations (
  id,
  name,
  slug
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'QA Organization A',
    'qa-organization-a'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'QA Organization B',
    'qa-organization-b'
  )
on conflict (id) do nothing;

insert into public.organization_members (
  organization_id,
  user_id,
  status
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000c1',
    'active'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000c2',
    'active'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-0000000000c3',
    'active'
  )
on conflict (organization_id, user_id) do nothing;

insert into public.user_global_roles (
  user_id,
  role_id
)
select fixture.user_id, roles.id
from (
  values
    (
      '00000000-0000-0000-0000-0000000000c1'::uuid,
      'technician'
    ),
    (
      '00000000-0000-0000-0000-0000000000c2'::uuid,
      'helpdesk'
    ),
    (
      '00000000-0000-0000-0000-0000000000c3'::uuid,
      'technician'
    ),
    (
      '00000000-0000-0000-0000-0000000000c4'::uuid,
      'helpdesk'
    )
) as fixture(user_id, role_key)
join public.roles
  on roles.role_key = fixture.role_key
on conflict do nothing;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}',
  true
);

do $$
declare
  type_id uuid;
  derived_organization uuid;
begin
  assert public.current_organization_id() =
    '10000000-0000-0000-0000-000000000001'::uuid,
    'organization A manager must resolve organization A';

  select id
    into type_id
    from public.cmdb_asset_types
   where key = 'server';

  insert into public.cmdb_assets (
    id,
    hostname,
    display_name,
    asset_type_id,
    ip_address,
    owner_name,
    serial_number,
    asset_tag,
    mac_address
  )
  values (
    '00000000-0000-0000-0000-0000000000ca',
    'qa-shared-hostname',
    'QA Organization A Asset',
    type_id,
    '192.0.2.10',
    'QA Owner',
    'QA-ORG-A-SERIAL',
    'QA-ORG-A-TAG',
    '02:00:00:00:00:01'
  );

  select organization_id
    into derived_organization
    from public.cmdb_assets
   where id = '00000000-0000-0000-0000-0000000000ca';

  assert derived_organization =
    '10000000-0000-0000-0000-000000000001'::uuid,
    'asset insert must derive organization A';

  assert exists (
    select 1
      from public.cmdb_asset_lifecycle_events
     where asset_id =
           '00000000-0000-0000-0000-0000000000ca'
       and organization_id = derived_organization
       and event_type = 'created'
  ), 'asset creation must record same-organization lifecycle row';

  begin
    insert into public.cmdb_assets (
      hostname,
      display_name,
      asset_type_id
    )
    values (
      'qa-shared-hostname',
      'QA Duplicate Organization A Asset',
      type_id
    );

    raise exception
      'same-organization duplicate hostname unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.cmdb_assets (
      hostname,
      display_name,
      asset_type_id,
      owner_id
    )
    values (
      'qa-invalid-owner',
      'QA Invalid Cross-Organization Owner',
      type_id,
      '00000000-0000-0000-0000-0000000000c3'
    );

    raise exception
      'cross-organization owner unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}',
  true
);

do $$
declare
  type_id uuid;
begin
  assert public.current_organization_id() =
    '10000000-0000-0000-0000-000000000002'::uuid,
    'organization B manager must resolve organization B';

  select id
    into type_id
    from public.cmdb_asset_types
   where key = 'server';

  insert into public.cmdb_assets (
    id,
    hostname,
    display_name,
    asset_type_id,
    ip_address,
    owner_name,
    serial_number,
    asset_tag,
    mac_address
  )
  values (
    '00000000-0000-0000-0000-0000000000cb',
    'qa-shared-hostname',
    'QA Organization B Asset',
    type_id,
    '198.51.100.10',
    'QA Owner',
    'QA-ORG-B-SERIAL',
    'QA-ORG-B-TAG',
    '02:00:00:00:00:02'
  );
end;
$$;

reset role;

do $$
begin
  begin
    insert into public.cmdb_asset_lifecycle_events (
      organization_id,
      asset_id,
      event_type
    )
    values (
      '10000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-0000000000ca',
      'updated'
    );

    raise exception
      'cross-organization lifecycle binding unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}',
  true
);

do $$
declare
  type_id uuid;
  imported integer;
  before_count integer;
begin
  assert (
    select count(*)
      from public.cmdb_assets
     where id = '00000000-0000-0000-0000-0000000000cb'
  ) = 0, 'organization A must not read organization B assets';

  begin
    perform public.soft_delete_cmdb_asset(
      '00000000-0000-0000-0000-0000000000cb'
    );

    raise exception
      'organization A unexpectedly deleted organization B asset';
  exception
    when no_data_found then null;
  end;

  begin
    perform public.set_cmdb_asset_statuses(
      array[
        '00000000-0000-0000-0000-0000000000cb'::uuid
      ],
      'retired'
    );

    raise exception
      'organization A unexpectedly updated organization B asset';
  exception
    when no_data_found then null;
  end;

  begin
    update public.cmdb_assets
       set organization_id =
         '10000000-0000-0000-0000-000000000002'::uuid
     where id =
       '00000000-0000-0000-0000-0000000000ca';

    raise exception
      'organization A unexpectedly moved an asset';
  exception
    when insufficient_privilege then null;
  end;

  select id
    into type_id
    from public.cmdb_asset_types
   where key = 'server';

  select public.import_cmdb_assets(
    jsonb_build_array(
      jsonb_build_object(
        'organization_id',
        '10000000-0000-0000-0000-000000000002',
        'hostname',
        'qa-import-derived-org-a',
        'asset_type_id',
        type_id
      )
    )
  )
    into imported;

  assert imported = 1,
    'organization A import must insert one asset';

  assert exists (
    select 1
      from public.cmdb_assets
     where hostname = 'qa-import-derived-org-a'
       and organization_id =
         '10000000-0000-0000-0000-000000000001'::uuid
  ), 'import must derive organization A';

  select count(*)
    into before_count
    from public.cmdb_assets;

  begin
    perform public.import_cmdb_assets(
      jsonb_build_array(
        jsonb_build_object(
          'hostname',
          'qa-import-valid-before-invalid',
          'asset_type_id',
          type_id
        ),
        jsonb_build_object(
          'hostname',
          'qa-import-invalid-type',
          'asset_type_id',
          gen_random_uuid()
        )
      )
    );

    raise exception
      'mixed-validity CMDB import unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;

  assert (
    select count(*)
      from public.cmdb_assets
  ) = before_count,
    'failed CMDB import must be atomic';

  begin
    insert into public.cmdb_asset_types (
      key,
      name
    )
    values (
      'forbidden-type',
      'Forbidden Type'
    );

    raise exception
      'authenticated caller unexpectedly created global asset type';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.cmdb_assets (
      hostname,
      display_name,
      asset_type_id,
      mac_address
    )
    values (
      'qa-invalid-mac',
      'QA Invalid MAC',
      type_id,
      'not-a-mac'
    );

    raise exception
      'invalid MAC unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.cmdb_asset_lifecycle_events (
      organization_id,
      asset_id,
      event_type
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-0000000000ca',
      'updated'
    );

    raise exception
      'authenticated caller unexpectedly forged lifecycle row';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.cmdb_assets
     where id =
       '00000000-0000-0000-0000-0000000000ca';

    raise exception
      'authenticated caller unexpectedly hard-deleted asset';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select public.soft_delete_cmdb_asset(
  '00000000-0000-0000-0000-0000000000ca'
);

select public.restore_cmdb_asset(
  '00000000-0000-0000-0000-0000000000ca'
);

do $$
begin
  assert exists (
    select 1
      from public.cmdb_asset_lifecycle_events
     where asset_id =
           '00000000-0000-0000-0000-0000000000ca'
       and organization_id =
         '10000000-0000-0000-0000-000000000001'::uuid
       and event_type = 'restored'
  ), 'restore must retain same-organization lifecycle binding';
end;
$$;

reset role;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}',
  true
);

do $$
begin
  assert (
    select count(*)
      from public.cmdb_assets
     where id =
       '00000000-0000-0000-0000-0000000000ca'
  ) = 1, 'organization A viewer must read organization A asset';

  assert (
    select count(*)
      from public.cmdb_assets
     where id =
       '00000000-0000-0000-0000-0000000000cb'
  ) = 0, 'organization A viewer must not read organization B asset';

  begin
    perform public.soft_delete_cmdb_asset(
      '00000000-0000-0000-0000-0000000000ca'
    );

    raise exception
      'viewer unexpectedly soft-deleted asset';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.current_organization_id();

    raise exception
      'user without organization unexpectedly resolved context';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

set local role anon;

select set_config(
  'request.jwt.claims',
  '{}',
  true
);

do $$
begin
  begin
    perform public.current_organization_id();

    raise exception
      'anonymous caller unexpectedly resolved organization';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

rollback;
