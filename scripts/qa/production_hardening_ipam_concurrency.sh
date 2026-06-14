#!/usr/bin/env bash
set -euo pipefail

if [[ ${P15_CONFIRM_DISPOSABLE:-} != "I_UNDERSTAND_THIS_MUST_BE_DISPOSABLE" ]]; then
  printf 'Refusing to run: set P15_CONFIRM_DISPOSABLE=I_UNDERSTAND_THIS_MUST_BE_DISPOSABLE.\n' >&2
  exit 2
fi
if (( $# > 1 )); then
  printf 'Usage: %s [disposable-database-url]\n' "$0" >&2
  exit 2
fi
db=${1:-${P15_DISPOSABLE_DATABASE_URL:-}}
if [[ -z $db ]]; then
  printf 'Refusing to run: provide a dedicated database URL argument or P15_DISPOSABLE_DATABASE_URL.\n' >&2
  exit 2
fi
command -v psql >/dev/null

user_id=00000000-0000-0000-0000-0000000000e1
organization_id=20000000-0000-0000-0000-0000000000e1
claims='{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","organization_id":"20000000-0000-0000-0000-0000000000e1"}'

psql_run() {
  psql "$db" -X -v ON_ERROR_STOP=1 -q "$@"
}

# Read-only safety gates must all pass before cleanup is armed or fixtures write.
database_name=$(psql_run -Atc 'select current_database();')
database_name=${database_name//$'\r'/}
database_name=${database_name//$'\n'/}
case "$database_name" in
  ''|postgres|template0|template1|supabase)
    printf 'Refusing protected or empty database name: %q\n' "$database_name" >&2
    exit 2
    ;;
esac
if [[ ! $database_name =~ ^itkc_[a-z0-9_]*(rehearsal|restore|disposable|qa|test)[a-z0-9_]*$ ]]; then
  printf 'Refusing unrecognized disposable database name: %q\n' "$database_name" >&2
  exit 2
fi

# The disposable gate must provision this marker table/value before invocation;
# this harness only verifies it and never creates it.
marker=$(psql_run -Atc "select marker_value from public.itkc_disposable_database_marker where marker_key = 'p15_ipam_concurrency';")
marker=${marker//$'\r'/}
marker=${marker//$'\n'/}
if [[ $marker != "DISPOSABLE" ]]; then
  printf 'Refusing database without the P15 disposable marker.\n' >&2
  exit 2
fi

printf 'Validated disposable target database: %s\n' "$database_name"
if [[ ${P15_CONFIRM_MODIFY_VALIDATED_DATABASE:-} != "MODIFY_VALIDATED_DISPOSABLE_DATABASE" ]]; then
  printf 'Refusing to modify validated database: set P15_CONFIRM_MODIFY_VALIDATED_DATABASE=MODIFY_VALIDATED_DISPOSABLE_DATABASE.\n' >&2
  exit 2
fi

cleanup() {
  psql_run <<SQL >/dev/null 2>&1 || true
delete from public.ipam_reservations where organization_id = '$organization_id';
delete from public.ipam_addresses where organization_id = '$organization_id';
delete from public.ipam_subnets where organization_id = '$organization_id';
delete from public.ipam_networks where organization_id = '$organization_id';
delete from public.organization_members where organization_id = '$organization_id';
delete from public.user_global_roles where user_id = '$user_id';
delete from public.organizations where id = '$organization_id';
delete from public.profiles where id = '$user_id';
delete from auth.users where id = '$user_id';
SQL
}
trap cleanup EXIT

psql_run <<SQL
insert into auth.users (
  id, email, instance_id, aud, role, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '$user_id', 'qa-ipam-concurrency@example.com',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '',
  now(), now(), now()
) on conflict (id) do nothing;
insert into public.profiles (id, email, display_name)
values ('$user_id', 'qa-ipam-concurrency@example.com', 'QA IPAM Concurrency')
on conflict (id) do nothing;
insert into public.organizations (id, name, slug)
values ('$organization_id', 'QA IPAM Concurrency', 'qa-ipam-concurrency')
on conflict (id) do nothing;
insert into public.organization_members (organization_id, user_id)
values ('$organization_id', '$user_id') on conflict do nothing;
insert into public.user_global_roles (user_id, role_id)
select '$user_id', id from public.roles where role_key = 'network_admin'
on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claims', '$claims', false);

select public.save_ipam_address(null, jsonb_build_object(
  'network_name', 'QA Network Delete Race', 'network_cidr', '10.250.0.0/16',
  'subnet_cidr', '10.250.1.0/24', 'ip_address', '10.250.1.10',
  'allocation_state', 'free'
));
select public.soft_delete_ipam_address((
  select id from public.ipam_addresses where organization_id = '$organization_id'
    and ip_address = '10.250.1.10/32'::inet and deleted_at is null
));
select public.soft_delete_ipam_subnet((
  select id from public.ipam_subnets where organization_id = '$organization_id'
    and cidr = '10.250.1.0/24'::cidr and deleted_at is null
));

select public.save_ipam_address(null, jsonb_build_object(
  'network_name', 'QA Subnet Delete Race', 'network_cidr', '10.251.0.0/16',
  'subnet_cidr', '10.251.1.0/24', 'ip_address', '10.251.1.10',
  'allocation_state', 'free'
));
select public.soft_delete_ipam_address((
  select id from public.ipam_addresses where organization_id = '$organization_id'
    and ip_address = '10.251.1.10/32'::inet and deleted_at is null
));

select public.save_ipam_address(null, jsonb_build_object(
  'network_name', 'QA Gateway Race', 'network_cidr', '10.252.0.0/16',
  'subnet_cidr', '10.252.1.0/24', 'gateway', '10.252.1.1',
  'ip_address', '10.252.1.1', 'allocation_state', 'reserved',
  'reservation_name', 'QA gateway'
));

select public.save_ipam_address(null, jsonb_build_object(
  'network_name', 'QA Reserve Race', 'network_cidr', '10.253.0.0/16',
  'subnet_cidr', '10.253.1.0/24', 'ip_address', '10.253.1.10',
  'allocation_state', 'free'
));
select public.save_ipam_address(null, jsonb_build_object(
  'network_name', 'QA Reserve Race', 'network_cidr', '10.253.0.0/16',
  'subnet_cidr', '10.253.1.0/24', 'ip_address', '10.253.1.11',
  'allocation_state', 'free'
));

select public.save_ipam_address(null, jsonb_build_object(
  'network_name', 'QA Import Lock A', 'network_cidr', '10.254.0.0/16',
  'subnet_cidr', '10.254.1.0/24', 'ip_address', '10.254.1.10',
  'allocation_state', 'free'
));
select public.save_ipam_address(null, jsonb_build_object(
  'network_name', 'QA Import Lock B', 'network_cidr', '10.255.0.0/16',
  'subnet_cidr', '10.255.1.0/24', 'ip_address', '10.255.1.10',
  'allocation_state', 'free'
));
reset role;
SQL

# Opposite caller order must not control multi-network import lock acquisition.
(
  psql_run <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', '$claims', true);
select public.import_ipam_addresses(jsonb_build_array(
  jsonb_build_object(
    'network_name', 'QA Import Lock A', 'network_cidr', '10.254.0.0/16',
    'subnet_cidr', '10.254.1.0/24', 'ip_address', '10.254.1.20',
    'allocation_state', 'free'
  ),
  jsonb_build_object(
    'network_name', 'QA Import Lock B', 'network_cidr', '10.255.0.0/16',
    'subnet_cidr', '10.255.1.0/24', 'ip_address', '10.255.1.20',
    'allocation_state', 'free'
  )
));
select pg_sleep(2);
commit;
SQL
) &
import_a_pid=$!
sleep 0.25
psql_run <<SQL
set role authenticated;
select set_config('request.jwt.claims', '$claims', false);
select public.import_ipam_addresses(jsonb_build_array(
  jsonb_build_object(
    'network_name', 'QA Import Lock B', 'network_cidr', '10.255.0.0/16',
    'subnet_cidr', '10.255.1.0/24', 'ip_address', '10.255.1.21',
    'allocation_state', 'free'
  ),
  jsonb_build_object(
    'network_name', 'QA Import Lock A', 'network_cidr', '10.254.0.0/16',
    'subnet_cidr', '10.254.1.0/24', 'ip_address', '10.254.1.21',
    'allocation_state', 'free'
  )
));
reset role;
SQL
wait "$import_a_pid"

# Concurrent subnet creation versus network deletion.
(
  psql_run <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', '$claims', true);
select public.soft_delete_ipam_network((
  select id from public.ipam_networks where organization_id = '$organization_id'
    and cidr = '10.250.0.0/16'::cidr and deleted_at is null
));
select pg_sleep(2);
commit;
SQL
) &
network_delete_pid=$!
sleep 0.25
psql_run <<SQL
set role authenticated;
select set_config('request.jwt.claims', '$claims', false);
select public.save_ipam_address(null, jsonb_build_object(
  'network_name', 'QA Network Delete Replacement', 'network_cidr', '10.250.0.0/16',
  'subnet_cidr', '10.250.2.0/24', 'ip_address', '10.250.2.10',
  'allocation_state', 'free'
));
reset role;
SQL
wait "$network_delete_pid"

# Concurrent address creation versus subnet deletion.
(
  psql_run <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', '$claims', true);
select public.soft_delete_ipam_subnet((
  select id from public.ipam_subnets where organization_id = '$organization_id'
    and cidr = '10.251.1.0/24'::cidr and deleted_at is null
));
select pg_sleep(2);
commit;
SQL
) &
subnet_delete_pid=$!
sleep 0.25
psql_run <<SQL
set role authenticated;
select set_config('request.jwt.claims', '$claims', false);
select public.save_ipam_address(null, jsonb_build_object(
  'network_name', 'QA Subnet Delete Race', 'network_cidr', '10.251.0.0/16',
  'subnet_cidr', '10.251.1.0/24', 'ip_address', '10.251.1.20',
  'allocation_state', 'free'
));
reset role;
SQL
wait "$subnet_delete_pid"

# Concurrent gateway-preserving update versus release.
(
  psql_run <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', '$claims', true);
select public.save_ipam_address((
  select id from public.ipam_addresses where organization_id = '$organization_id'
    and ip_address = '10.252.1.1/32'::inet and deleted_at is null
), jsonb_build_object(
  'network_name', 'QA Gateway Race', 'network_cidr', '10.252.0.0/16',
  'subnet_cidr', '10.252.1.0/24', 'gateway', '10.252.1.1',
  'ip_address', '10.252.1.1', 'allocation_state', 'reserved',
  'reservation_name', 'QA gateway preserved'
));
select pg_sleep(2);
commit;
SQL
) &
gateway_update_pid=$!
sleep 0.25
psql_run <<SQL
set role authenticated;
select set_config('request.jwt.claims', '$claims', false);
do \$\$
begin
  begin
    perform public.set_ipam_allocation_state(array[(
      select id from public.ipam_addresses where organization_id = '$organization_id'
        and ip_address = '10.252.1.1/32'::inet and deleted_at is null
    )], 'free');
    raise exception 'concurrent gateway release unexpectedly succeeded';
  exception when check_violation then null;
  end;
end;
\$\$;
reset role;
SQL
wait "$gateway_update_pid"

# Concurrent reserve-next calls must select distinct addresses.
for attempt in 1 2; do
  (
    psql_run <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', '$claims', true);
select public.reserve_next_ipam_address((
  select id from public.ipam_subnets where organization_id = '$organization_id'
    and cidr = '10.253.1.0/24'::cidr and deleted_at is null
));
select pg_sleep(1);
commit;
SQL
  ) &
  reserve_pids[$attempt]=$!
done
wait "${reserve_pids[1]}" "${reserve_pids[2]}"

psql_run <<SQL
do \$\$
begin
  assert not exists (
    select 1 from public.ipam_subnets subnets
    join public.ipam_networks networks
      on networks.organization_id = subnets.organization_id and networks.id = subnets.network_id
    where subnets.organization_id = '$organization_id'
      and subnets.deleted_at is null and networks.deleted_at is not null
  ), 'active subnet references a deleted network after concurrency tests';
  assert not exists (
    select 1 from public.ipam_addresses addresses
    join public.ipam_subnets subnets
      on subnets.organization_id = addresses.organization_id and subnets.id = addresses.subnet_id
    where addresses.organization_id = '$organization_id'
      and addresses.deleted_at is null and subnets.deleted_at is not null
  ), 'active address references a deleted subnet after concurrency tests';
  assert exists (
    select 1 from public.ipam_addresses
    where organization_id = '$organization_id' and ip_address = '10.252.1.1/32'::inet
      and allocation_state = 'reserved' and deleted_at is null
  ), 'gateway was released during concurrent update';
  assert (
    select count(*) from public.ipam_addresses
    where organization_id = '$organization_id' and subnet_id = (
      select id from public.ipam_subnets where organization_id = '$organization_id'
        and cidr = '10.253.1.0/24'::cidr and deleted_at is null
    ) and allocation_state = 'reserved' and deleted_at is null
  ) = 2, 'concurrent reserve-next calls did not reserve two distinct addresses';
  assert (
    select count(*) from public.ipam_addresses
    where organization_id = '$organization_id'
      and ip_address in (
        '10.254.1.20/32'::inet, '10.254.1.21/32'::inet,
        '10.255.1.20/32'::inet, '10.255.1.21/32'::inet
      ) and deleted_at is null
  ) = 4, 'opposite-order multi-network imports did not complete safely';
end;
\$\$;
SQL

printf 'IPAM disposable concurrency assertions passed.\n'
