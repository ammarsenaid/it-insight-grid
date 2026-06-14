#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
route="$root/src/routes/ipam.tsx"
drawer="$root/src/components/ipam/SubnetDetailsDrawer.tsx"
service="$root/src/lib/ipam/addresses.ts"
queries="$root/src/lib/ipam/queries.ts"
permissions="$root/src/lib/permissions.tsx"
dashboard="$root/src/routes/index.tsx"
cmdb="$root/src/routes/cmdb.tsx"
import_dialog="$root/src/components/common/ImportPreviewDialog.tsx"
csv="$root/src/lib/csv.ts"
csv_qa="$root/scripts/qa/production_hardening_csv.sh"
concurrency_qa="$root/scripts/qa/production_hardening_ipam_concurrency.sh"
sql="$root/supabase/pending/20260613010000_ipam_backend.sql"
qa="$root/supabase/pending/20260613010000_ipam_backend.qa.sql"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

! rg -q '@/lib/data/store|setState\(|trashItem\(|uid\(|data\.ipam' "$route" "$drawer" "$dashboard"
rg -q 'useQuery\(.*ipamAddressesQuery' "$route"
rg -q 'ipamAddressesQuery\(false\)' "$dashboard"
rg -q 'ipamQuery\.isSuccess' "$dashboard"
rg -q 'useMutation' "$route"
rg -q 'can\("ipam\.manage", role\)' "$route" "$drawer"
rg -q '"ipam\.manage":[[:space:]]+\["super_admin", "it_admin", "network_admin"\]' "$permissions"
! rg -q 'ipam\.write' "$permissions" "$route" "$drawer" "$dashboard"
rg -q 'cap: "ipam\.manage"' "$dashboard"

for contract in list_ipam_addresses save_ipam_address import_ipam_addresses \
  set_ipam_allocation_state reserve_next_ipam_address soft_delete_ipam_address \
  restore_ipam_address soft_delete_ipam_network restore_ipam_network \
  soft_delete_ipam_subnet restore_ipam_subnet; do
  rg -q "rpc\(\"$contract\"" "$service"
done
rg -q 'ipamAddressesQuery' "$queries" "$route"

for table in ipam_networks ipam_subnets ipam_addresses ipam_reservations; do
  rg -q "alter table public\.$table enable row level security" "$sql"
done
rg -q "public\.has_permission\('ipam\.view'\)" "$sql"
rg -q "public\.has_permission\('ipam\.manage'\)" "$sql"
rg -q 'organization_id = public\.current_organization_id\(\)' "$sql"
rg -q 'foreign key \(organization_id, linked_asset_id\)' "$sql"
rg -q 'uq_ipam_addresses_ip_live' "$sql"
rg -q 'new\.ip_address := host\(new\.ip_address\)::inet' "$sql"
rg -q 'new\.gateway := host\(new\.gateway\)::inet' "$sql"
test "$(rg -c 'masklen\(.*case family\(' "$sql")" -ge 2
rg -q 'IP address is outside its subnet' "$sql"
rg -q 'Gateway addresses must be reserved' "$sql"
rg -q 'IPAM import must be an array of at most 500 addresses' "$sql"
rg -q 'revoke all privileges on public\.ipam_networks' "$sql"
rg -q 'Active subnets must be deleted before deleting this network' "$sql"
rg -q 'Active addresses must be deleted before deleting this subnet' "$sql"
rg -q 'A live IPAM network conflicts with this restore' "$sql"
rg -q 'A live IPAM subnet conflicts with this restore' "$sql"

for column in linkedAssetId reservationName reservationExpiresAt reservationNotes notes; do
  rg -q "\"$column\"" "$route"
done
rg -q 'CSV headers must exactly match' "$route"
rg -q 'await onImport\(parsed\.rows\)' "$import_dialog"
rg -q 'const \[isImporting, setIsImporting\] = useState\(false\)' "$import_dialog"
rg -q 'if \(result === false\) return' "$import_dialog"
rg -Fq 'catch {' "$import_dialog"
rg -q 'onOpenChange\(false\)' "$import_dialog"
rg -q 'if \(isImporting\) return' "$import_dialog"
rg -q 'disabled=.*isImporting' "$import_dialog"
rg -q 'importMutation\.mutateAsync\(parsed\)' "$route" "$cmdb"
! rg -q 'importMutation\.mutate\(parsed\)' "$route" "$cmdb"
rg -q 'let inQuotes = false' "$csv"
rg -q 'unterminated quoted field' "$csv"
rg -q 'character === "\\n" \|\| character === "\\r"' "$csv"
test -x "$csv_qa"
test -x "$concurrency_qa"
rg -q 'Concurrent subnet creation versus network deletion' "$concurrency_qa"
rg -q 'Concurrent address creation versus subnet deletion' "$concurrency_qa"
rg -q 'Concurrent gateway-preserving update versus release' "$concurrency_qa"
rg -q 'Concurrent reserve-next calls' "$concurrency_qa"
rg -q 'Opposite caller order must not control multi-network import lock acquisition' "$concurrency_qa"
rg -q "select current_database\(\);" "$concurrency_qa"
rg -q "''\|postgres\|template0\|template1\|supabase" "$concurrency_qa"
rg -Fq '^itkc_[a-z0-9_]*(rehearsal|restore|disposable|qa|test)[a-z0-9_]*$' "$concurrency_qa"
rg -q 'P15_CONFIRM_DISPOSABLE.*I_UNDERSTAND_THIS_MUST_BE_DISPOSABLE' "$concurrency_qa"
rg -q 'P15_CONFIRM_MODIFY_VALIDATED_DATABASE.*MODIFY_VALIDATED_DISPOSABLE_DATABASE' "$concurrency_qa"
rg -q 'itkc_disposable_database_marker' "$concurrency_qa"
guard_line=$(rg -n 'P15_CONFIRM_MODIFY_VALIDATED_DATABASE' "$concurrency_qa" | tail -1 | cut -d: -f1)
trap_line=$(rg -n '^trap cleanup EXIT$' "$concurrency_qa" | cut -d: -f1)
fixture_line=$(rg -n '^insert into auth\.users' "$concurrency_qa" | cut -d: -f1)
test "$guard_line" -lt "$trap_line"
test "$trap_line" -lt "$fixture_line"
! rg -q '^[[:space:]]*bash "\$concurrency_qa"' "$0"

rg -q 'network -> subnet -> address' "$sql"
save_block=$(sed -n '/create or replace function public.save_ipam_address/,/^\$\$;/p' "$sql")
printf '%s\n' "$save_block" | rg -q 'public\.ipam_networks'
printf '%s\n' "$save_block" | rg -q 'public\.ipam_subnets'
printf '%s\n' "$save_block" | rg -q 'public\.ipam_addresses'
test "$(printf '%s\n' "$save_block" | rg -c 'for update')" -ge 3
allocation_block=$(sed -n '/create or replace function public.set_ipam_allocation_state/,/^\$\$;/p' "$sql")
printf '%s\n' "$allocation_block" | rg -q 'order by networks\.id for update'
printf '%s\n' "$allocation_block" | rg -q 'order by subnets\.id for update'
printf '%s\n' "$allocation_block" | rg -q 'order by addresses\.id for update'
import_block=$(sed -n '/create or replace function public.import_ipam_addresses/,/^\$\$;/p' "$sql")
printf '%s\n' "$import_block" | rg -q 'Parse, normalize, and validate the complete batch'
printf '%s\n' "$import_block" | rg -q 'order by networks\.id for update'
printf '%s\n' "$import_block" | rg -q 'order by subnets\.id for update'
printf '%s\n' "$import_block" | rg -q 'order by addresses\.id for update'
printf '%s\n' "$import_block" | rg -q 'order by rows\.network_cidr::cidr, rows\.subnet_cidr::cidr'
printf '%s\n' "$import_block" | rg -q 'rows\.host_address::inet, rows\.row_ordinal'
printf '%s\n' "$import_block" | rg -q 'CSV order must never control lock acquisition'
reserve_block=$(sed -n '/create or replace function public.reserve_next_ipam_address/,/^\$\$;/p' "$sql")
printf '%s\n' "$reserve_block" | rg -q 'public\.ipam_subnets'
printf '%s\n' "$reserve_block" | rg -q 'for update skip locked'
for contract in soft_delete_ipam_network soft_delete_ipam_subnet restore_ipam_network \
  restore_ipam_subnet restore_ipam_address; do
  block=$(sed -n "/create or replace function public\.$contract/,/^\$\$;/p" "$sql")
  printf '%s\n' "$block" | rg -q 'for update'
done
restore_address_block=$(sed -n '/create or replace function public.restore_ipam_address/,/^\$\$;/p' "$sql")
printf '%s\n' "$restore_address_block" | rg -q 'locked_network\.deleted_at is not null'
printf '%s\n' "$restore_address_block" | rg -q 'locked_subnet\.deleted_at is not null'
network_lock_line=$(printf '%s\n' "$restore_address_block" | rg -n 'select \* into locked_network' | cut -d: -f1)
subnet_lock_line=$(printf '%s\n' "$restore_address_block" | rg -n 'select \* into locked_subnet' | cut -d: -f1)
address_lock_line=$(printf '%s\n' "$restore_address_block" | rg -n 'select \* into deleted_address' | cut -d: -f1)
test "$network_lock_line" -lt "$subnet_lock_line"
test "$subnet_lock_line" -lt "$address_lock_line"

rg -q 'organization B must not read organization A IPAM addresses' "$qa"
rg -q 'duplicate live IP unexpectedly succeeded' "$qa"
rg -q 'duplicate IPv4 host-mask variant unexpectedly succeeded' "$qa"
rg -q 'duplicate IPv6 host-mask variant unexpectedly succeeded' "$qa"
rg -q 'IPv4 gateway masks must normalize to /32' "$qa"
rg -q 'failed IPAM import must be atomic' "$qa"
rg -q 'valid export-compatible allocated rows can be imported' "$qa"
rg -q 'valid export-compatible reserved rows can be imported' "$qa"
rg -q 'reserved allocation must create a reservation' "$qa"
rg -q 'authenticated caller unexpectedly inserted directly' "$qa"
rg -q 'hard-delete attempt unexpectedly succeeded' "$qa"
rg -q 'deleted address ordinary update unexpectedly succeeded' "$qa"
rg -q 'address restoration collision unexpectedly succeeded' "$qa"
rg -q 'gateway address bulk release unexpectedly succeeded' "$qa"
rg -q 'network deletion with an active subnet unexpectedly succeeded' "$qa"
rg -q 'subnet deletion with an active address unexpectedly succeeded' "$qa"
rg -q 'network restoration collision unexpectedly succeeded' "$qa"
rg -q 'subnet restoration collision unexpectedly succeeded' "$qa"
rg -q 'organization B unexpectedly linked organization A CMDB asset' "$qa"
rg -q 'mixed-organization bulk mutations fail atomically' "$qa"
rg -q 'P15 concurrent subnet creation versus network deletion' "$qa"
rg -q 'P15 concurrent address creation versus subnet deletion' "$qa"
rg -q 'P15 concurrent gateway release versus gateway-preserving update' "$qa"
rg -q 'P15 concurrent reserve-next calls' "$qa"
rg -q 'P15 opposite-order multi-network imports' "$qa"
rg -q 'address restore below a deleted network unexpectedly succeeded' "$qa"
rg -q 'address restore below a deleted subnet unexpectedly succeeded' "$qa"
rg -q 'active network and subnet must allow address restore' "$qa"
rg -q 'gateway restore as free unexpectedly succeeded' "$qa"
rg -q 'qa_ipam_asset_type_id' "$qa"
! rg -q 'select value::text from qa_ipam_ids' "$qa"
rg -q "select id::text from qa_ipam_ids where key = 'asset_type'" "$qa"
! rg -q "asset_type_id'.*cmdb_asset_types" "$qa"
rg -q '## Milestone 26 - Organization-Scoped IPAM Backend' "$status"

bash "$csv_qa" >/dev/null

printf 'IPAM backend integration assertions passed.\n'
