-- Transaction-backed QA for 20260613010000_ipam_backend.sql.
-- Run only against a disposable database after all dependencies are applied.
begin;

do $$
begin
  assert (select relrowsecurity from pg_class where oid = 'public.ipam_networks'::regclass),
    'ipam_networks RLS must be enabled';
  assert (select relrowsecurity from pg_class where oid = 'public.ipam_subnets'::regclass),
    'ipam_subnets RLS must be enabled';
  assert (select relrowsecurity from pg_class where oid = 'public.ipam_addresses'::regclass),
    'ipam_addresses RLS must be enabled';
  assert (select relrowsecurity from pg_class where oid = 'public.ipam_reservations'::regclass),
    'ipam_reservations RLS must be enabled';
  assert not has_table_privilege('authenticated', 'public.ipam_addresses', 'INSERT'),
    'authenticated must not insert IPAM addresses directly';
  assert not has_table_privilege('authenticated', 'public.ipam_addresses', 'UPDATE'),
    'authenticated must not update IPAM addresses directly';
  assert not has_table_privilege('authenticated', 'public.ipam_addresses', 'DELETE'),
    'authenticated must not hard-delete IPAM addresses';
  assert not has_table_privilege('authenticated', 'public.ipam_reservations', 'INSERT'),
    'authenticated must not forge reservations';
  assert not has_table_privilege('authenticated', 'public.ipam_networks', 'DELETE'),
    'authenticated must not hard-delete IPAM networks';
  assert not has_table_privilege('authenticated', 'public.ipam_subnets', 'DELETE'),
    'authenticated must not hard-delete IPAM subnets';
  assert not has_table_privilege('authenticated', 'public.ipam_reservations', 'DELETE'),
    'authenticated must not hard-delete IPAM reservations';
end;
$$;

-- P15 lock-contract inspection. Concurrent behavior is rehearsed with two
-- disposable-database sessions using the scenarios documented below.
do $$
declare
  save_definition text := pg_get_functiondef('public.save_ipam_address(uuid,jsonb)'::regprocedure);
  allocation_definition text := pg_get_functiondef('public.set_ipam_allocation_state(uuid[],text)'::regprocedure);
  import_definition text := pg_get_functiondef('public.import_ipam_addresses(jsonb)'::regprocedure);
  address_restore_definition text := pg_get_functiondef('public.restore_ipam_address(uuid)'::regprocedure);
  network_delete_definition text := pg_get_functiondef('public.soft_delete_ipam_network(uuid)'::regprocedure);
  subnet_delete_definition text := pg_get_functiondef('public.soft_delete_ipam_subnet(uuid)'::regprocedure);
begin
  assert lower(save_definition) like '%network -> subnet -> address%',
    'IPAM mutation lock order must be documented';
  assert (length(lower(save_definition)) - length(replace(lower(save_definition), 'for update', ''))) / length('for update') >= 3,
    'save_ipam_address must lock network, subnet, and updated address rows';
  assert lower(allocation_definition) like '%order by networks.id%for update%'
     and lower(allocation_definition) like '%order by subnets.id%for update%'
     and lower(allocation_definition) like '%order by addresses.id%for update%',
    'bulk allocation must lock hierarchy rows in deterministic order';
  assert lower(import_definition) like '%order by networks.id for update%'
     and lower(import_definition) like '%order by subnets.id for update%'
     and lower(import_definition) like '%order by addresses.id for update%',
    'imports must lock existing hierarchy rows in deterministic UUID order';
  assert lower(import_definition) like '%order by rows.network_cidr::cidr, rows.subnet_cidr::cidr,%rows.host_address::inet, rows.row_ordinal%',
    'imports must process canonical hierarchy and host order before caller ordinal';
  assert lower(address_restore_definition) like '%locked_network.deleted_at is not null%'
     and lower(address_restore_definition) like '%locked_subnet.deleted_at is not null%',
    'address restore must reject deleted network and subnet ancestors';
  assert lower(network_delete_definition) like '%for update%active subnets must be deleted%',
    'network deletion must lock before checking active subnets';
  assert lower(subnet_delete_definition) like '%for update%active addresses must be deleted%',
    'subnet deletion must lock before checking active addresses';
end;
$$;

-- Disposable two-session concurrency rehearsal plan (do not run on live data):
-- 1. P15 concurrent subnet creation versus network deletion: session A calls
--    soft_delete_ipam_network and holds the transaction open; session B calls
--    save_ipam_address for that CIDR. Assert B blocks, then either uses a new
--    active network or fails, and no active subnet references a deleted network.
-- 2. P15 concurrent address creation versus subnet deletion: session A calls
--    soft_delete_ipam_subnet and holds the transaction open; session B calls
--    save_ipam_address. Assert B blocks and no active address references a
--    deleted subnet.
-- 3. P15 concurrent gateway release versus gateway-preserving update: hold a
--    save_ipam_address gateway update open while another session calls
--    set_ipam_allocation_state(..., 'free'). Assert release fails with 23514.
-- 4. P15 concurrent reserve-next calls: run reserve_next_ipam_address twice for
--    one subnet with two free addresses. Assert the calls return distinct hosts
--    and produce exactly two active reservations.
-- 5. P15 opposite-order multi-network imports: submit network A then B in one
--    session and B then A in another. Assert both complete without deadlock and
--    all four distinct hosts exist. The disposable concurrency harness stages
--    this exact caller-order inversion.
-- Existing fixtures below cover cross-organization lifecycle rejection, mixed-
-- organization bulk failure atomicity, and invalid-row import rollback.

create temporary table qa_ipam_ids (key text primary key, id uuid not null) on commit drop;
grant select, insert on qa_ipam_ids to authenticated;

insert into auth.users (
  id, email, instance_id, aud, role, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-0000000000d1', 'qa-ipam-manager-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000d2', 'qa-ipam-viewer-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000d3', 'qa-ipam-manager-b@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, email, display_name) values
  ('00000000-0000-0000-0000-0000000000d1', 'qa-ipam-manager-a@example.com', 'QA IPAM Manager A'),
  ('00000000-0000-0000-0000-0000000000d2', 'qa-ipam-viewer-a@example.com', 'QA IPAM Viewer A'),
  ('00000000-0000-0000-0000-0000000000d3', 'qa-ipam-manager-b@example.com', 'QA IPAM Manager B')
on conflict (id) do nothing;

insert into public.organizations (id, name, slug) values
  ('20000000-0000-0000-0000-0000000000d1', 'QA IPAM Organization A', 'qa-ipam-org-a'),
  ('20000000-0000-0000-0000-0000000000d2', 'QA IPAM Organization B', 'qa-ipam-org-b')
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id) values
  ('20000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1'),
  ('20000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2'),
  ('20000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d3')
on conflict do nothing;

insert into public.user_global_roles (user_id, role_id)
select fixture.user_id, roles.id
from (values
  ('00000000-0000-0000-0000-0000000000d1'::uuid, 'network_admin'),
  ('00000000-0000-0000-0000-0000000000d2'::uuid, 'platform_auditor'),
  ('00000000-0000-0000-0000-0000000000d3'::uuid, 'network_admin')
) as fixture(user_id, role_key)
join public.roles on roles.role_key = fixture.role_key
on conflict do nothing;

-- Fixture-only lookup: authenticated is intentionally not granted direct
-- SELECT on CMDB lookup tables in this disposable QA database, so resolve the
-- seed asset type as postgres before switching to the authenticated test role.
select id::text as qa_ipam_asset_type_id
from public.cmdb_asset_types
where is_active
order by sort_order
limit 1
\gset

insert into qa_ipam_ids values ('asset_type', :'qa_ipam_asset_type_id');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","organization_id":"20000000-0000-0000-0000-0000000000d1"}',
  true
);

select public.import_cmdb_assets(jsonb_build_array(jsonb_build_object(
  'hostname', 'qa-ipam-asset-a',
  'asset_type_id', :'qa_ipam_asset_type_id',
  'status', 'active'
)));

reset role;
insert into qa_ipam_ids values (
  'asset_a', (select id from public.cmdb_assets where hostname = 'qa-ipam-asset-a' and deleted_at is null)
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","organization_id":"20000000-0000-0000-0000-0000000000d1"}',
  true
);

do $$
declare v_address_id uuid;
declare before_count integer;
declare collision_address_id uuid;
declare gateway_address_id uuid;
begin
  v_address_id := public.save_ipam_address(null, jsonb_build_object(
    'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
    'subnet_cidr', '10.20.1.0/24', 'gateway', '10.20.1.1',
    'vlan', 'VLAN 20', 'location', 'QA DC', 'ip_address', '10.20.1.10',
    'hostname', 'qa-host-a', 'address_type', 'static', 'allocation_state', 'free'
  ));
  assert v_address_id is not null, 'IPAM manager must create an address';
  assert exists (
    select 1 from public.ipam_addresses
     where id = v_address_id
       and organization_id = '20000000-0000-0000-0000-0000000000d1'
  ), 'save must derive organization A';
  insert into qa_ipam_ids values ('address_a', v_address_id);

  begin
    perform public.save_ipam_address(null, jsonb_build_object(
      'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
      'subnet_cidr', '10.20.1.0/24', 'ip_address', '10.20.1.10',
      'address_type', 'static', 'allocation_state', 'free'
    ));
    raise exception 'duplicate live IP unexpectedly succeeded';
  exception when unique_violation then null;
  end;

  begin
    perform public.save_ipam_address(null, jsonb_build_object(
      'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
      'subnet_cidr', '10.20.1.0/24', 'ip_address', '10.20.1.10/24',
      'address_type', 'static', 'allocation_state', 'free'
    ));
    raise exception 'duplicate IPv4 host-mask variant unexpectedly succeeded';
  exception when unique_violation then null;
  end;

  perform public.save_ipam_address(null, jsonb_build_object(
    'network_name', 'QA IPv6 Network A', 'network_cidr', '2001:db8:20::/48',
    'subnet_cidr', '2001:db8:20:1::/64', 'gateway', '2001:db8:20:1::1/64',
    'ip_address', '2001:db8:20:1::10/64', 'address_type', 'static',
    'allocation_state', 'free'
  ));
  assert exists (
    select 1 from public.ipam_addresses
     where ip_address = '2001:db8:20:1::10/128'::inet and masklen(ip_address) = 128
  ), 'IPv6 hosts must be normalized to /128';
  assert exists (
    select 1 from public.ipam_subnets
     where cidr = '2001:db8:20:1::/64'::cidr and gateway = '2001:db8:20:1::1/128'::inet
       and masklen(gateway) = 128
  ), 'IPv6 gateways must be normalized to /128';
  begin
    perform public.save_ipam_address(null, jsonb_build_object(
      'network_name', 'QA IPv6 Network A', 'network_cidr', '2001:db8:20::/48',
      'subnet_cidr', '2001:db8:20:1::/64', 'ip_address', '2001:db8:20:1::10/128',
      'address_type', 'static', 'allocation_state', 'free'
    ));
    raise exception 'duplicate IPv6 host-mask variant unexpectedly succeeded';
  exception when unique_violation then null;
  end;
  assert exists (
    select 1 from public.ipam_subnets
     where cidr = '10.20.1.0/24'::cidr and gateway = '10.20.1.1/32'::inet
       and masklen(gateway) = 32
  ), 'IPv4 gateway masks must normalize to /32';

  begin
    perform public.save_ipam_address(null, jsonb_build_object(
      'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
      'subnet_cidr', '10.20.1.0/24', 'ip_address', '10.21.1.10',
      'address_type', 'static', 'allocation_state', 'free'
    ));
    raise exception 'out-of-subnet IP unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
  gateway_address_id := public.save_ipam_address(null, jsonb_build_object(
    'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
    'subnet_cidr', '10.20.1.0/24', 'gateway', '10.20.1.1/24',
    'ip_address', '10.20.1.1/24', 'allocation_state', 'reserved',
    'reservation_name', 'QA gateway reservation'
  ));
  begin
    perform public.set_ipam_allocation_state(array[gateway_address_id], 'free');
    raise exception 'gateway address bulk release unexpectedly succeeded';
  exception when check_violation then null;
  end;
  assert exists (
    select 1 from public.ipam_addresses a join public.ipam_reservations r on r.address_id = a.id
     where a.id = gateway_address_id and a.allocation_state = 'reserved' and r.deleted_at is null
  ), 'gateway addresses remain reserved consistently';

  select count(*) into before_count from public.ipam_addresses;
  begin
    perform public.import_ipam_addresses(jsonb_build_array(
      jsonb_build_object(
        'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
        'subnet_cidr', '10.20.1.0/24', 'ip_address', '10.20.1.11',
        'address_type', 'static', 'allocation_state', 'free'
      ),
      jsonb_build_object(
        'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
        'subnet_cidr', '10.20.1.0/24', 'ip_address', '192.0.2.1',
        'address_type', 'static', 'allocation_state', 'free'
      )
    ));
    raise exception 'mixed-validity IPAM import unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
  assert (select count(*) from public.ipam_addresses) = before_count,
    'failed IPAM import must be atomic';

  perform public.import_ipam_addresses(jsonb_build_array(
    jsonb_build_object(
      'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
      'subnet_cidr', '10.20.1.0/24', 'gateway', '10.20.1.1/24',
      'ip_address', '10.20.1.20/24', 'hostname', 'qa-export-allocated',
      'address_type', 'static', 'allocation_state', 'allocated',
      'linked_asset_id', (select id::text from qa_ipam_ids where key = 'asset_a'),
      'notes', 'address export note'
    ),
    jsonb_build_object(
      'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
      'subnet_cidr', '10.20.1.0/24', 'gateway', '10.20.1.1/32',
      'ip_address', '10.20.1.21', 'hostname', 'qa-export-reserved',
      'address_type', 'static', 'allocation_state', 'reserved',
      'reservation_name', 'QA export reservation',
      'reservation_expires_at', '2030-01-02T03:04:05Z',
      'reservation_notes', 'reservation export note', 'notes', 'reserved address note'
    )
  ));
  assert exists (
    select 1 from public.ipam_addresses
     where hostname = 'qa-export-allocated' and linked_asset_id = (select id from qa_ipam_ids where key = 'asset_a')
  ), 'valid export-compatible allocated rows can be imported';
  assert exists (
    select 1 from public.ipam_reservations r join public.ipam_addresses a on a.id = r.address_id
     where a.hostname = 'qa-export-reserved' and r.name = 'QA export reservation'
       and r.notes = 'reservation export note' and r.deleted_at is null
  ), 'valid export-compatible reserved rows can be imported';
  insert into qa_ipam_ids values (
    'reservation_a', (
      select r.id from public.ipam_reservations r join public.ipam_addresses a on a.id = r.address_id
       where a.hostname = 'qa-export-reserved' and r.deleted_at is null
    )
  );

  begin
    perform public.save_ipam_address(null, jsonb_build_object(
      'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
      'subnet_cidr', '10.20.1.0/24', 'ip_address', '10.20.1.22',
      'allocation_state', 'allocated'
    ));
    raise exception 'allocated address without a linked asset unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_ipam_address(null, jsonb_build_object(
      'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
      'subnet_cidr', '10.20.1.0/24', 'ip_address', '10.20.1.23',
      'allocation_state', 'reserved'
    ));
    raise exception 'reserved address without reservation metadata unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_ipam_address(null, jsonb_build_object(
      'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
      'subnet_cidr', '10.20.1.0/24', 'gateway', '10.20.1.1/24',
      'ip_address', '10.20.1.1/32', 'allocation_state', 'free'
    ));
    raise exception 'gateway address unexpectedly became non-reserved';
  exception when invalid_parameter_value then null;
  end;

  perform public.set_ipam_allocation_state(array[v_address_id], 'reserved');
  assert exists (
    select 1 from public.ipam_reservations
     where ipam_reservations.address_id = v_address_id and deleted_at is null
  ), 'reserved allocation must create a reservation';

  perform public.set_ipam_allocation_state(array[v_address_id], 'free');
  assert not exists (
    select 1 from public.ipam_reservations
     where ipam_reservations.address_id = v_address_id and deleted_at is null
  ), 'release must retire the active reservation';

  perform public.soft_delete_ipam_address(v_address_id);
  assert exists (
    select 1 from public.ipam_addresses where id = v_address_id and deleted_at is not null
  ), 'soft delete must retain the address row';
  begin
    perform public.save_ipam_address(v_address_id, jsonb_build_object(
      'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
      'subnet_cidr', '10.20.1.0/24', 'ip_address', '10.20.1.10',
      'allocation_state', 'free'
    ));
    raise exception 'deleted address ordinary update unexpectedly succeeded';
  exception when no_data_found then null;
  end;
  collision_address_id := public.save_ipam_address(null, jsonb_build_object(
    'network_name', 'QA Network A', 'network_cidr', '10.20.0.0/16',
    'subnet_cidr', '10.20.1.0/24', 'ip_address', '10.20.1.10/24',
    'allocation_state', 'free'
  ));
  begin
    perform public.restore_ipam_address(v_address_id);
    raise exception 'address restoration collision unexpectedly succeeded';
  exception when unique_violation then null;
  end;
  perform public.soft_delete_ipam_address(collision_address_id);
  perform public.restore_ipam_address(v_address_id);
  assert exists (
    select 1 from public.ipam_addresses
     where id = v_address_id and deleted_at is null and allocation_state = 'free'
  ), 'restore must return the address as free';

  begin
    delete from public.ipam_addresses where id = v_address_id;
    raise exception 'hard-delete attempt unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ipam_networks where id = (select id from qa_ipam_ids where key = 'network_a');
    raise exception 'network hard-delete attempt unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ipam_subnets where id = (select id from qa_ipam_ids where key = 'subnet_a');
    raise exception 'subnet hard-delete attempt unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ipam_reservations where id = (select id from qa_ipam_ids where key = 'reservation_a');
    raise exception 'reservation hard-delete attempt unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

do $$
declare lifecycle_address uuid;
declare lifecycle_subnet uuid;
declare lifecycle_network uuid;
declare replacement_address uuid;
begin
  lifecycle_address := public.save_ipam_address(null, jsonb_build_object(
    'network_name', 'QA Lifecycle Network', 'network_cidr', '10.30.0.0/16',
    'subnet_cidr', '10.30.1.0/24', 'ip_address', '10.30.1.10',
    'allocation_state', 'free'
  ));
  select subnet_id into lifecycle_subnet from public.ipam_addresses where id = lifecycle_address;
  select network_id into lifecycle_network from public.ipam_subnets where id = lifecycle_subnet;
  insert into qa_ipam_ids values ('network_a', lifecycle_network), ('subnet_a', lifecycle_subnet);

  begin
    perform public.soft_delete_ipam_network(lifecycle_network);
    raise exception 'network deletion with an active subnet unexpectedly succeeded';
  exception when check_violation then null;
  end;
  begin
    perform public.soft_delete_ipam_subnet(lifecycle_subnet);
    raise exception 'subnet deletion with an active address unexpectedly succeeded';
  exception when check_violation then null;
  end;
  perform public.soft_delete_ipam_address(lifecycle_address);
  perform public.soft_delete_ipam_subnet(lifecycle_subnet);
  perform public.soft_delete_ipam_network(lifecycle_network);
  begin
    perform public.restore_ipam_subnet(lifecycle_subnet);
    raise exception 'subnet restore without an active parent unexpectedly succeeded';
  exception when check_violation then null;
  end;

  replacement_address := public.save_ipam_address(null, jsonb_build_object(
    'network_name', 'QA Lifecycle Replacement', 'network_cidr', '10.30.0.0/16',
    'subnet_cidr', '10.30.2.0/24', 'ip_address', '10.30.2.10',
    'allocation_state', 'free'
  ));
  begin
    perform public.restore_ipam_network(lifecycle_network);
    raise exception 'network restoration collision unexpectedly succeeded';
  exception when unique_violation then null;
  end;
  perform public.soft_delete_ipam_address(replacement_address);
  perform public.soft_delete_ipam_subnet((select subnet_id from public.ipam_addresses where id = replacement_address));
  perform public.soft_delete_ipam_network((
    select s.network_id from public.ipam_addresses a join public.ipam_subnets s on s.id = a.subnet_id
     where a.id = replacement_address
  ));
  perform public.restore_ipam_network(lifecycle_network);

  replacement_address := public.save_ipam_address(null, jsonb_build_object(
    'network_name', 'QA Lifecycle Network', 'network_cidr', '10.30.0.0/16',
    'subnet_cidr', '10.30.1.0/24', 'ip_address', '10.30.1.20',
    'allocation_state', 'free'
  ));
  begin
    perform public.restore_ipam_subnet(lifecycle_subnet);
    raise exception 'subnet restoration collision unexpectedly succeeded';
  exception when unique_violation then null;
  end;
end;
$$;

do $$
declare restore_address uuid;
declare restore_gateway uuid;
declare restore_subnet uuid;
declare restore_network uuid;
begin
  restore_address := public.save_ipam_address(null, jsonb_build_object(
    'network_name', 'QA Address Restore Ancestors', 'network_cidr', '10.31.0.0/16',
    'subnet_cidr', '10.31.1.0/24', 'gateway', '10.31.1.1',
    'ip_address', '10.31.1.10', 'allocation_state', 'free'
  ));
  restore_gateway := public.save_ipam_address(null, jsonb_build_object(
    'network_name', 'QA Address Restore Ancestors', 'network_cidr', '10.31.0.0/16',
    'subnet_cidr', '10.31.1.0/24', 'gateway', '10.31.1.1',
    'ip_address', '10.31.1.1', 'allocation_state', 'reserved',
    'reservation_name', 'QA restore gateway'
  ));
  select subnet_id into restore_subnet from public.ipam_addresses where id = restore_address;
  select network_id into restore_network from public.ipam_subnets where id = restore_subnet;

  perform public.soft_delete_ipam_address(restore_address);
  perform public.soft_delete_ipam_address(restore_gateway);
  perform public.soft_delete_ipam_subnet(restore_subnet);
  perform public.soft_delete_ipam_network(restore_network);
  begin
    perform public.restore_ipam_address(restore_address);
    raise exception 'address restore below a deleted network unexpectedly succeeded';
  exception when check_violation then null;
  end;

  perform public.restore_ipam_network(restore_network);
  begin
    perform public.restore_ipam_address(restore_address);
    raise exception 'address restore below a deleted subnet unexpectedly succeeded';
  exception when check_violation then null;
  end;

  perform public.restore_ipam_subnet(restore_subnet);
  perform public.restore_ipam_address(restore_address);
  assert exists (
    select 1 from public.ipam_addresses
     where id = restore_address and deleted_at is null and allocation_state = 'free'
  ), 'active network and subnet must allow address restore';
  begin
    perform public.restore_ipam_address(restore_gateway);
    raise exception 'gateway restore as free unexpectedly succeeded';
  exception when check_violation then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated","organization_id":"20000000-0000-0000-0000-0000000000d1"}',
  true
);

do $$
begin
  assert (select count(*) from public.list_ipam_addresses(false)) > 0,
    'ipam.view must read organization A addresses';
  begin
    perform public.save_ipam_address(null, '{}'::jsonb);
    raise exception 'ipam.view unexpectedly wrote IPAM data';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ipam_addresses (
      organization_id, subnet_id, ip_address
    ) values (
      '20000000-0000-0000-0000-0000000000d1', gen_random_uuid(), '10.20.1.50'
    );
    raise exception 'authenticated caller unexpectedly inserted directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated","organization_id":"20000000-0000-0000-0000-0000000000d2"}',
  true
);

do $$
declare org_b_address uuid;
declare org_b_reservation uuid;
begin
  assert (select count(*) from public.list_ipam_addresses(false)) = 0,
    'organization B must not read organization A IPAM addresses';
  perform public.import_cmdb_assets(jsonb_build_array(jsonb_build_object(
    'hostname', 'qa-ipam-asset-b',
    'asset_type_id', (select id::text from qa_ipam_ids where key = 'asset_type'),
    'status', 'active'
  )));
  org_b_address := public.save_ipam_address(null, jsonb_build_object(
    'network_name', 'QA Network B', 'network_cidr', '10.40.0.0/16',
    'subnet_cidr', '10.40.1.0/24', 'ip_address', '10.40.1.10',
    'allocation_state', 'reserved', 'reservation_name', 'Organization B reservation'
  ));
  select id into org_b_reservation from public.ipam_reservations where address_id = org_b_address and deleted_at is null;

  begin
    perform public.soft_delete_ipam_address((select id from qa_ipam_ids where key = 'address_a'));
    raise exception 'organization B unexpectedly mutated organization A address';
  exception when no_data_found then null;
  end;
  begin
    perform public.soft_delete_ipam_subnet((select id from qa_ipam_ids where key = 'subnet_a'));
    raise exception 'organization B unexpectedly mutated organization A subnet';
  exception when no_data_found then null;
  end;
  begin
    perform public.soft_delete_ipam_network((select id from qa_ipam_ids where key = 'network_a'));
    raise exception 'organization B unexpectedly mutated organization A network';
  exception when no_data_found then null;
  end;
  begin
    update public.ipam_reservations set name = 'cross-organization mutation'
     where id = (select id from qa_ipam_ids where key = 'reservation_a');
    raise exception 'organization B unexpectedly mutated reservations directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_ipam_address(null, jsonb_build_object(
      'network_name', 'QA Network B', 'network_cidr', '10.40.0.0/16',
      'subnet_cidr', '10.40.1.0/24', 'ip_address', '10.40.1.11',
      'allocation_state', 'allocated',
      'linked_asset_id', (select id::text from qa_ipam_ids where key = 'asset_a')
    ));
    raise exception 'organization B unexpectedly linked organization A CMDB asset';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_ipam_allocation_state(
      array[org_b_address, (select id from qa_ipam_ids where key = 'address_a')], 'free'
    );
    raise exception 'mixed-organization bulk mutation unexpectedly succeeded';
  exception when no_data_found then null;
  end;
  assert exists (
    select 1 from public.ipam_addresses where id = org_b_address and allocation_state = 'reserved'
  ), 'mixed-organization bulk mutations fail atomically';
  assert exists (
    select 1 from public.ipam_reservations where id = org_b_reservation and deleted_at is null
  ), 'organization B reservation must remain active after failed mixed bulk mutation';
end;
$$;

reset role;
rollback;
