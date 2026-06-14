-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: organization-scoped IPAM backend
-- ------------------------------------------------------------
-- AUTHORITATIVE. Forward-only and additive.
-- Depends on 20260612235900_organization_foundation.sql,
-- 20260613000000_cmdb_backend.sql, and Service Desk RBAC expansion.
-- ============================================================

begin;

create table if not exists public.ipam_networks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 160),
  cidr cidr not null,
  description text not null default '' check (char_length(description) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  unique (organization_id, id),
  check ((deleted_at is null and deleted_by is null) or deleted_at is not null)
);

create unique index if not exists uq_ipam_networks_name_live
  on public.ipam_networks(organization_id, lower(name)) where deleted_at is null;
create unique index if not exists uq_ipam_networks_cidr_live
  on public.ipam_networks(organization_id, cidr) where deleted_at is null;

create table if not exists public.ipam_subnets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  network_id uuid not null,
  cidr cidr not null,
  gateway inet,
  vlan text not null default '' check (char_length(vlan) <= 160),
  location text not null default '' check (char_length(location) <= 255),
  description text not null default '' check (char_length(description) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, network_id)
    references public.ipam_networks(organization_id, id) on delete restrict,
  check (gateway is null or gateway <<= cidr),
  check (gateway is null or masklen(gateway) = case family(gateway) when 4 then 32 else 128 end),
  check ((deleted_at is null and deleted_by is null) or deleted_at is not null)
);

create unique index if not exists uq_ipam_subnets_cidr_live
  on public.ipam_subnets(organization_id, cidr) where deleted_at is null;
create index if not exists idx_ipam_subnets_network_live
  on public.ipam_subnets(organization_id, network_id) where deleted_at is null;

create table if not exists public.ipam_addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subnet_id uuid not null,
  ip_address inet not null,
  hostname text not null default '' check (char_length(hostname) <= 255),
  address_type text not null default 'static'
    check (address_type in ('static', 'dhcp', 'virtual')),
  allocation_state text not null default 'free'
    check (allocation_state in ('free', 'allocated', 'reserved')),
  linked_asset_id uuid,
  notes text not null default '' check (char_length(notes) <= 20000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, subnet_id)
    references public.ipam_subnets(organization_id, id) on delete restrict,
  foreign key (organization_id, linked_asset_id)
    references public.cmdb_assets(organization_id, id) on delete restrict,
  check (masklen(ip_address) = case family(ip_address) when 4 then 32 else 128 end),
  check (
    (allocation_state = 'allocated' and linked_asset_id is not null)
    or (allocation_state <> 'allocated' and linked_asset_id is null)
  ),
  check ((deleted_at is null and deleted_by is null) or deleted_at is not null)
);

create unique index if not exists uq_ipam_addresses_ip_live
  on public.ipam_addresses(organization_id, ip_address) where deleted_at is null;
create unique index if not exists uq_ipam_addresses_asset_live
  on public.ipam_addresses(organization_id, linked_asset_id)
  where deleted_at is null and linked_asset_id is not null;
create index if not exists idx_ipam_addresses_subnet_live
  on public.ipam_addresses(organization_id, subnet_id) where deleted_at is null;
create index if not exists idx_ipam_addresses_state_live
  on public.ipam_addresses(organization_id, allocation_state) where deleted_at is null;

create table if not exists public.ipam_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  address_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 255),
  expires_at timestamptz,
  notes text not null default '' check (char_length(notes) <= 4000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  foreign key (organization_id, address_id)
    references public.ipam_addresses(organization_id, id) on delete restrict,
  check ((deleted_at is null and deleted_by is null) or deleted_at is not null)
);

create unique index if not exists uq_ipam_reservations_address_live
  on public.ipam_reservations(organization_id, address_id) where deleted_at is null;

create or replace function public.prepare_ipam_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare active_organization uuid := public.current_organization_id();
begin
  if tg_op = 'INSERT' then
    new.organization_id := active_organization;
    new.created_by := auth.uid();
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'IPAM organization cannot be changed' using errcode = '42501';
  else
    new.organization_id := old.organization_id;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.prepare_ipam_reservation_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare active_organization uuid := public.current_organization_id();
begin
  if tg_op = 'INSERT' then
    new.organization_id := active_organization;
    new.created_by := auth.uid();
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'IPAM reservation organization cannot be changed' using errcode = '42501';
  else
    new.organization_id := old.organization_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.normalize_ipam_address_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.ip_address := host(new.ip_address)::inet;
  return new;
end;
$$;

create or replace function public.normalize_ipam_subnet_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.gateway is not null then
    new.gateway := host(new.gateway)::inet;
  end if;
  return new;
end;
$$;

drop trigger if exists ipam_networks_prepare_write on public.ipam_networks;
create trigger ipam_networks_prepare_write before insert or update on public.ipam_networks
for each row execute function public.prepare_ipam_write();
drop trigger if exists ipam_subnets_prepare_write on public.ipam_subnets;
create trigger ipam_subnets_prepare_write before insert or update on public.ipam_subnets
for each row execute function public.prepare_ipam_write();
drop trigger if exists ipam_subnets_normalize_inet on public.ipam_subnets;
create trigger ipam_subnets_normalize_inet before insert or update on public.ipam_subnets
for each row execute function public.normalize_ipam_subnet_write();
drop trigger if exists ipam_addresses_prepare_write on public.ipam_addresses;
create trigger ipam_addresses_prepare_write before insert or update on public.ipam_addresses
for each row execute function public.prepare_ipam_write();
drop trigger if exists ipam_addresses_normalize_inet on public.ipam_addresses;
create trigger ipam_addresses_normalize_inet before insert or update on public.ipam_addresses
for each row execute function public.normalize_ipam_address_write();
drop trigger if exists ipam_reservations_prepare_write on public.ipam_reservations;
create trigger ipam_reservations_prepare_write before insert or update on public.ipam_reservations
for each row execute function public.prepare_ipam_reservation_write();

alter table public.ipam_networks enable row level security;
alter table public.ipam_subnets enable row level security;
alter table public.ipam_addresses enable row level security;
alter table public.ipam_reservations enable row level security;

create policy ipam_networks_select on public.ipam_networks for select to authenticated
using (organization_id = public.current_organization_id() and (
  (deleted_at is null and public.has_permission('ipam.view')) or public.has_permission('ipam.manage')
));
create policy ipam_subnets_select on public.ipam_subnets for select to authenticated
using (organization_id = public.current_organization_id() and (
  (deleted_at is null and public.has_permission('ipam.view')) or public.has_permission('ipam.manage')
));
create policy ipam_addresses_select on public.ipam_addresses for select to authenticated
using (organization_id = public.current_organization_id() and (
  (deleted_at is null and public.has_permission('ipam.view')) or public.has_permission('ipam.manage')
));
create policy ipam_reservations_select on public.ipam_reservations for select to authenticated
using (organization_id = public.current_organization_id() and (
  (deleted_at is null and public.has_permission('ipam.view')) or public.has_permission('ipam.manage')
));

create or replace function public.assert_ipam_manage()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_permission('ipam.manage') then
    raise exception 'IPAM manage permission required' using errcode = '42501';
  end if;
  return public.current_organization_id();
end;
$$;

create or replace function public.list_ipam_addresses(p_include_deleted boolean default false)
returns table (
  id uuid, subnet_id uuid, subnet_cidr text, network_id uuid, network_name text,
  network_cidr text,
  ip_address text, hostname text, address_type text, allocation_state text,
  gateway text, vlan text, location text, linked_asset_id uuid,
  linked_asset_hostname text, reservation_id uuid, reservation_name text,
  reservation_expires_at timestamptz, reservation_notes text, notes text, conflict_reason text,
  created_at timestamptz, updated_at timestamptz, deleted_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select addresses.id, subnets.id, subnets.cidr::text, networks.id, networks.name,
         networks.cidr::text,
         addresses.ip_address::text, addresses.hostname, addresses.address_type,
         addresses.allocation_state, coalesce(subnets.gateway::text, ''),
         subnets.vlan, subnets.location, addresses.linked_asset_id,
         coalesce(assets.hostname, ''), reservations.id, coalesce(reservations.name, ''),
         reservations.expires_at, coalesce(reservations.notes, ''), addresses.notes,
         case
           when not (addresses.ip_address <<= subnets.cidr) then 'Address is outside its subnet'
           when subnets.gateway is not null and addresses.ip_address = subnets.gateway
                and addresses.allocation_state <> 'reserved' then 'Gateway address is not reserved'
           when addresses.allocation_state = 'reserved' and reservations.id is null
                then 'Reserved address has no reservation record'
           when addresses.allocation_state <> 'reserved' and reservations.id is not null
                then 'Reservation exists for a non-reserved address'
           else null
         end,
         addresses.created_at, addresses.updated_at, addresses.deleted_at
    from public.ipam_addresses as addresses
    join public.ipam_subnets as subnets
      on subnets.organization_id = addresses.organization_id and subnets.id = addresses.subnet_id
    join public.ipam_networks as networks
      on networks.organization_id = subnets.organization_id and networks.id = subnets.network_id
    left join public.cmdb_assets as assets
      on assets.organization_id = addresses.organization_id and assets.id = addresses.linked_asset_id
    left join public.ipam_reservations as reservations
      on reservations.organization_id = addresses.organization_id
     and reservations.address_id = addresses.id and reservations.deleted_at is null
   where addresses.organization_id = public.current_organization_id()
     and (public.has_permission('ipam.view') or public.has_permission('ipam.manage'))
     and (addresses.deleted_at is null or (p_include_deleted and public.has_permission('ipam.manage')))
   order by addresses.ip_address;
$$;

create or replace function public.save_ipam_address(p_address_id uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_ipam_manage();
  network_row public.ipam_networks;
  subnet_row public.ipam_subnets;
  address_row public.ipam_addresses;
  requested_state text := coalesce(p_input->>'allocation_state', 'free');
  requested_asset uuid := nullif(p_input->>'linked_asset_id', '')::uuid;
  requested_ip inet := host((p_input->>'ip_address')::inet)::inet;
  requested_gateway inet := case when nullif(p_input->>'gateway', '') is null then null
    else host((p_input->>'gateway')::inet)::inet end;
  reservation_name text := nullif(trim(coalesce(p_input->>'reservation_name', '')), '');
begin
  -- Every mutating RPC locks hierarchy rows in network -> subnet -> address
  -- order. Parent locks serialize child creation with lifecycle and gateway
  -- changes; UUID ordering is used below whenever more than one row is locked.
  if requested_state not in ('free', 'allocated', 'reserved') then
    raise exception 'Invalid allocation state' using errcode = '22023';
  end if;
  if requested_state = 'allocated' and requested_asset is null then
    raise exception 'Allocated addresses require a linked asset' using errcode = '22023';
  end if;
  if requested_state = 'reserved' and reservation_name is null then
    raise exception 'Reserved addresses require a reservation name' using errcode = '22023';
  end if;

  select * into network_row from public.ipam_networks
   where organization_id = active_organization
     and cidr = (p_input->>'network_cidr')::cidr and deleted_at is null
   for update;
  if network_row.id is null then
    insert into public.ipam_networks (organization_id, name, cidr)
    values (active_organization, p_input->>'network_name', (p_input->>'network_cidr')::cidr)
    returning * into network_row;
  elsif not ((p_input->>'subnet_cidr')::cidr <<= network_row.cidr) then
    raise exception 'Subnet is outside its network' using errcode = '22023';
  else
    update public.ipam_networks
       set name = p_input->>'network_name'
     where id = network_row.id
    returning * into network_row;
  end if;

  select * into subnet_row from public.ipam_subnets
   where organization_id = active_organization
     and cidr = (p_input->>'subnet_cidr')::cidr and deleted_at is null
   for update;
  if subnet_row.id is null then
    if not ((p_input->>'subnet_cidr')::cidr <<= network_row.cidr) then
      raise exception 'Subnet is outside its network' using errcode = '22023';
    end if;
    insert into public.ipam_subnets (
      organization_id, network_id, cidr, gateway, vlan, location
    ) values (
      active_organization, network_row.id, (p_input->>'subnet_cidr')::cidr,
      requested_gateway, coalesce(p_input->>'vlan', ''),
      coalesce(p_input->>'location', '')
    ) returning * into subnet_row;
  elsif subnet_row.network_id <> network_row.id then
    raise exception 'Subnet already belongs to another network' using errcode = '23505';
  else
    update public.ipam_subnets set
      gateway = requested_gateway,
      vlan = coalesce(p_input->>'vlan', ''),
      location = coalesce(p_input->>'location', '')
    where id = subnet_row.id
    returning * into subnet_row;
  end if;

  if p_address_id is not null then
    select * into address_row from public.ipam_addresses
     where organization_id = active_organization and id = p_address_id and deleted_at is null
     for update;
    if address_row.id is null then
      raise exception 'IPAM address not found' using errcode = 'P0002';
    end if;
  end if;

  if not (requested_ip <<= subnet_row.cidr) then
    raise exception 'IP address is outside its subnet' using errcode = '22023';
  end if;
  if subnet_row.gateway is not null and exists (
    select 1 from public.ipam_addresses
     where organization_id = active_organization and subnet_id = subnet_row.id
       and ip_address = subnet_row.gateway and allocation_state <> 'reserved'
       and deleted_at is null and (p_address_id is null or id <> p_address_id)
  ) then
    raise exception 'Gateway addresses must be reserved' using errcode = '23514';
  end if;
  if subnet_row.gateway is not null
     and requested_ip = subnet_row.gateway
     and requested_state <> 'reserved' then
    raise exception 'Gateway addresses must be reserved' using errcode = '22023';
  end if;
  if requested_asset is not null and not exists (
    select 1 from public.cmdb_assets
     where organization_id = active_organization and id = requested_asset and deleted_at is null
  ) then
    raise exception 'Linked asset must be active in the current organization' using errcode = '42501';
  end if;

  if p_address_id is null then
    insert into public.ipam_addresses (
      organization_id, subnet_id, ip_address, hostname, address_type,
      allocation_state, linked_asset_id, notes
    ) values (
      active_organization, subnet_row.id, requested_ip,
      coalesce(p_input->>'hostname', ''), coalesce(p_input->>'address_type', 'static'),
      requested_state, requested_asset, coalesce(p_input->>'notes', '')
    ) returning * into address_row;
  else
    update public.ipam_addresses set
      subnet_id = subnet_row.id, ip_address = requested_ip,
      hostname = coalesce(p_input->>'hostname', ''),
      address_type = coalesce(p_input->>'address_type', 'static'),
      allocation_state = requested_state, linked_asset_id = requested_asset,
      notes = coalesce(p_input->>'notes', '')
    where organization_id = active_organization and id = p_address_id and deleted_at is null
    returning * into address_row;
  end if;

  update public.ipam_reservations set deleted_at = now(), deleted_by = auth.uid()
   where organization_id = active_organization and address_id = address_row.id and deleted_at is null;
  if requested_state = 'reserved' then
    insert into public.ipam_reservations (
      organization_id, address_id, name, expires_at, notes
    ) values (
      active_organization, address_row.id, reservation_name,
      nullif(p_input->>'reservation_expires_at', '')::timestamptz,
      coalesce(p_input->>'reservation_notes', '')
    );
  end if;
  return address_row.id;
end;
$$;

create or replace function public.set_ipam_allocation_state(p_address_ids uuid[], p_state text)
returns integer language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_ipam_manage(); changed integer;
begin
  if p_state not in ('free', 'reserved') then
    raise exception 'Bulk allocation state must be free or reserved' using errcode = '22023';
  end if;
  if coalesce(array_length(p_address_ids, 1), 0) = 0 or array_length(p_address_ids, 1) > 500 then
    raise exception 'IPAM allocation batch must contain 1 to 500 addresses' using errcode = '22023';
  end if;

  -- Lock all affected hierarchies in deterministic network -> subnet ->
  -- address order before checking gateways or changing allocation state.
  perform 1 from public.ipam_networks networks
   where networks.organization_id = active_organization and networks.id in (
     select subnets.network_id from public.ipam_addresses addresses
     join public.ipam_subnets subnets
       on subnets.organization_id = addresses.organization_id and subnets.id = addresses.subnet_id
     where addresses.organization_id = active_organization and addresses.id = any(p_address_ids)
   )
   order by networks.id for update;
  perform 1 from public.ipam_subnets subnets
   where subnets.organization_id = active_organization and subnets.id in (
     select addresses.subnet_id from public.ipam_addresses addresses
      where addresses.organization_id = active_organization and addresses.id = any(p_address_ids)
   )
   order by subnets.id for update;
  perform 1 from public.ipam_addresses addresses
   where addresses.organization_id = active_organization
     and addresses.id = any(p_address_ids) and addresses.deleted_at is null
   order by addresses.id for update;

  select count(*) into changed from public.ipam_addresses
   where organization_id = active_organization and id = any(p_address_ids) and deleted_at is null;
  if changed <> array_length(p_address_ids, 1) then
    raise exception 'One or more IPAM addresses were not found' using errcode = 'P0002';
  end if;
  if p_state = 'free' and exists (
    select 1 from public.ipam_addresses addresses
    join public.ipam_subnets subnets
      on subnets.organization_id = addresses.organization_id and subnets.id = addresses.subnet_id
    where addresses.organization_id = active_organization
      and addresses.id = any(p_address_ids) and addresses.deleted_at is null
      and subnets.deleted_at is null and subnets.gateway = addresses.ip_address
  ) then
    raise exception 'Gateway addresses must remain reserved' using errcode = '23514';
  end if;
  update public.ipam_addresses set allocation_state = p_state, linked_asset_id = null
   where organization_id = active_organization and id = any(p_address_ids) and deleted_at is null;
  get diagnostics changed = row_count;
  update public.ipam_reservations set deleted_at = now(), deleted_by = auth.uid()
   where organization_id = active_organization and address_id = any(p_address_ids) and deleted_at is null;
  if p_state = 'reserved' then
    insert into public.ipam_reservations (organization_id, address_id, name)
    select active_organization, id, 'Bulk reservation'
      from public.ipam_addresses where organization_id = active_organization and id = any(p_address_ids);
  end if;
  return changed;
end;
$$;

create or replace function public.reserve_next_ipam_address(p_subnet_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_ipam_manage();
  parent_network_id uuid;
  locked_subnet public.ipam_subnets;
  selected public.ipam_addresses;
begin
  select network_id into parent_network_id from public.ipam_subnets
   where organization_id = active_organization and id = p_subnet_id;
  perform 1 from public.ipam_networks
   where organization_id = active_organization and id = parent_network_id and deleted_at is null
   for update;
  if not found then
    raise exception 'The parent network must be active before reserving an address' using errcode = '23514';
  end if;
  select * into locked_subnet from public.ipam_subnets
   where organization_id = active_organization and id = p_subnet_id and deleted_at is null
   for update;
  if locked_subnet.id is null then
    raise exception 'Active IPAM subnet not found' using errcode = 'P0002';
  end if;
  select * into selected from public.ipam_addresses
   where organization_id = active_organization and subnet_id = p_subnet_id
     and allocation_state = 'free' and deleted_at is null
   order by ip_address for update skip locked limit 1;
  if selected.id is null then raise exception 'No free addresses in this subnet' using errcode = 'P0002'; end if;
  update public.ipam_addresses set allocation_state = 'reserved' where id = selected.id;
  insert into public.ipam_reservations (organization_id, address_id, name)
  values (active_organization, selected.id, 'Next available reservation');
  return selected.ip_address::text;
end;
$$;

create or replace function public.soft_delete_ipam_address(p_address_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_ipam_manage();
  parent_network_id uuid;
  parent_subnet_id uuid;
  locked_address public.ipam_addresses;
begin
  select subnets.network_id, addresses.subnet_id into parent_network_id, parent_subnet_id
    from public.ipam_addresses addresses
    join public.ipam_subnets subnets
      on subnets.organization_id = addresses.organization_id and subnets.id = addresses.subnet_id
   where addresses.organization_id = active_organization
     and addresses.id = p_address_id and addresses.deleted_at is null;
  perform 1 from public.ipam_networks
   where organization_id = active_organization and id = parent_network_id for update;
  perform 1 from public.ipam_subnets
   where organization_id = active_organization and id = parent_subnet_id for update;
  select * into locked_address from public.ipam_addresses
   where organization_id = active_organization and id = p_address_id and deleted_at is null
   for update;
  if locked_address.id is null then
    raise exception 'IPAM address not found' using errcode = 'P0002';
  end if;
  update public.ipam_addresses set deleted_at = now(), deleted_by = auth.uid()
   where organization_id = active_organization and id = p_address_id and deleted_at is null;
  update public.ipam_reservations set deleted_at = now(), deleted_by = auth.uid()
   where organization_id = active_organization and address_id = p_address_id and deleted_at is null;
end;
$$;

create or replace function public.restore_ipam_address(p_address_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_ipam_manage();
  parent_network_id uuid;
  parent_subnet_id uuid;
  locked_network public.ipam_networks;
  locked_subnet public.ipam_subnets;
  deleted_address public.ipam_addresses;
begin
  select subnets.network_id, addresses.subnet_id into parent_network_id, parent_subnet_id
    from public.ipam_addresses addresses
    join public.ipam_subnets subnets
      on subnets.organization_id = addresses.organization_id and subnets.id = addresses.subnet_id
   where addresses.organization_id = active_organization
     and addresses.id = p_address_id and addresses.deleted_at is not null;
  select * into locked_network from public.ipam_networks
   where organization_id = active_organization and id = parent_network_id for update;
  if locked_network.id is null or locked_network.deleted_at is not null then
    raise exception 'The parent network must be active before restoring this address' using errcode = '23514';
  end if;
  select * into locked_subnet from public.ipam_subnets
   where organization_id = active_organization and id = parent_subnet_id for update;
  if locked_subnet.id is null or locked_subnet.deleted_at is not null then
    raise exception 'The parent subnet must be active before restoring this address' using errcode = '23514';
  end if;
  select * into deleted_address from public.ipam_addresses
   where organization_id = active_organization and id = p_address_id and deleted_at is not null
   for update;
  if deleted_address.id is null then
    raise exception 'Deleted IPAM address not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.ipam_addresses
     where organization_id = active_organization and ip_address = deleted_address.ip_address
       and deleted_at is null
  ) then
    raise exception 'A live IPAM address already uses this host' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.ipam_subnets
     where organization_id = active_organization and id = deleted_address.subnet_id
       and gateway = deleted_address.ip_address
  ) then
    raise exception 'Gateway addresses cannot be restored as free' using errcode = '23514';
  end if;
  update public.ipam_addresses set deleted_at = null, deleted_by = null,
    allocation_state = 'free', linked_asset_id = null
   where id = deleted_address.id;
end;
$$;

create or replace function public.soft_delete_ipam_network(p_network_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_ipam_manage(); locked_network public.ipam_networks;
begin
  select * into locked_network from public.ipam_networks
   where organization_id = active_organization and id = p_network_id and deleted_at is null
   for update;
  if locked_network.id is null then
    raise exception 'IPAM network not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.ipam_subnets
     where organization_id = active_organization and network_id = p_network_id and deleted_at is null
  ) then
    raise exception 'Active subnets must be deleted before deleting this network' using errcode = '23514';
  end if;
  update public.ipam_networks set deleted_at = now(), deleted_by = auth.uid()
   where organization_id = active_organization and id = p_network_id and deleted_at is null;
end;
$$;

create or replace function public.restore_ipam_network(p_network_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_ipam_manage(); deleted_network public.ipam_networks;
begin
  select * into deleted_network from public.ipam_networks
   where organization_id = active_organization and id = p_network_id and deleted_at is not null
   for update;
  if deleted_network.id is null then
    raise exception 'Deleted IPAM network not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.ipam_networks
     where organization_id = active_organization and deleted_at is null
       and (lower(name) = lower(deleted_network.name) or cidr = deleted_network.cidr)
  ) then
    raise exception 'A live IPAM network conflicts with this restore' using errcode = '23505';
  end if;
  update public.ipam_networks set deleted_at = null, deleted_by = null
   where id = deleted_network.id;
end;
$$;

create or replace function public.soft_delete_ipam_subnet(p_subnet_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_ipam_manage();
  parent_network_id uuid;
  locked_subnet public.ipam_subnets;
begin
  select network_id into parent_network_id from public.ipam_subnets
   where organization_id = active_organization and id = p_subnet_id and deleted_at is null;
  perform 1 from public.ipam_networks
   where organization_id = active_organization and id = parent_network_id for update;
  select * into locked_subnet from public.ipam_subnets
   where organization_id = active_organization and id = p_subnet_id and deleted_at is null
   for update;
  if locked_subnet.id is null then
    raise exception 'IPAM subnet not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.ipam_networks
     where organization_id = active_organization and id = locked_subnet.network_id and deleted_at is null
  ) then
    raise exception 'The parent network must be active before deleting this subnet' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.ipam_addresses
     where organization_id = active_organization and subnet_id = p_subnet_id and deleted_at is null
  ) then
    raise exception 'Active addresses must be deleted before deleting this subnet' using errcode = '23514';
  end if;
  update public.ipam_subnets set deleted_at = now(), deleted_by = auth.uid()
   where organization_id = active_organization and id = p_subnet_id and deleted_at is null;
end;
$$;

create or replace function public.restore_ipam_subnet(p_subnet_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_ipam_manage();
  parent_network_id uuid;
  deleted_subnet public.ipam_subnets;
begin
  select network_id into parent_network_id from public.ipam_subnets
   where organization_id = active_organization and id = p_subnet_id and deleted_at is not null;
  perform 1 from public.ipam_networks
   where organization_id = active_organization and id = parent_network_id
   for update;
  select * into deleted_subnet from public.ipam_subnets
   where organization_id = active_organization and id = p_subnet_id and deleted_at is not null
   for update;
  if deleted_subnet.id is null then
    raise exception 'Deleted IPAM subnet not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.ipam_networks
     where organization_id = active_organization and id = deleted_subnet.network_id and deleted_at is null
  ) then
    raise exception 'The parent network must be active before restoring this subnet' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.ipam_subnets
     where organization_id = active_organization and cidr = deleted_subnet.cidr and deleted_at is null
  ) then
    raise exception 'A live IPAM subnet conflicts with this restore' using errcode = '23505';
  end if;
  update public.ipam_subnets set deleted_at = null, deleted_by = null
   where id = deleted_subnet.id;
end;
$$;

create or replace function public.import_ipam_addresses(p_addresses jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_ipam_manage();
  item jsonb;
  normalized_item jsonb;
  normalized_batch jsonb := '[]'::jsonb;
  row_ordinal bigint;
  network_cidr cidr;
  subnet_cidr cidr;
  host_address inet;
  gateway_address inet;
  requested_state text;
  requested_asset uuid;
  reservation_name text;
  imported integer := 0;
begin
  if jsonb_typeof(p_addresses) <> 'array' or jsonb_array_length(p_addresses) > 500 then
    raise exception 'IPAM import must be an array of at most 500 addresses' using errcode = '22023';
  end if;

  -- Parse, normalize, and validate the complete batch before taking locks or
  -- mutating rows. A bad row therefore fails the whole import atomically.
  for item, row_ordinal in
    select value, ordinality
      from jsonb_array_elements(p_addresses) with ordinality
  loop
    if jsonb_typeof(item) <> 'object'
       or nullif(trim(coalesce(item->>'network_name', '')), '') is null
       or nullif(item->>'network_cidr', '') is null
       or nullif(item->>'subnet_cidr', '') is null
       or nullif(item->>'ip_address', '') is null then
      raise exception 'Each IPAM import row requires a network name, network CIDR, subnet CIDR, and IP address'
        using errcode = '22023';
    end if;

    network_cidr := (item->>'network_cidr')::cidr;
    subnet_cidr := (item->>'subnet_cidr')::cidr;
    host_address := host((item->>'ip_address')::inet)::inet;
    gateway_address := case when nullif(item->>'gateway', '') is null then null
      else host((item->>'gateway')::inet)::inet end;
    requested_state := coalesce(item->>'allocation_state', 'free');
    requested_asset := nullif(item->>'linked_asset_id', '')::uuid;
    reservation_name := nullif(trim(coalesce(item->>'reservation_name', '')), '');

    if not (subnet_cidr <<= network_cidr) then
      raise exception 'Subnet is outside its network' using errcode = '22023';
    end if;
    if not (host_address <<= subnet_cidr) then
      raise exception 'IP address is outside its subnet' using errcode = '22023';
    end if;
    if gateway_address is not null and not (gateway_address <<= subnet_cidr) then
      raise exception 'Gateway is outside its subnet' using errcode = '22023';
    end if;
    if requested_state not in ('free', 'allocated', 'reserved')
       or requested_state = 'allocated' and requested_asset is null
       or requested_state = 'reserved' and reservation_name is null
       or gateway_address is not null and host_address = gateway_address
          and requested_state <> 'reserved' then
      raise exception 'Invalid IPAM import allocation contract' using errcode = '22023';
    end if;
    if requested_asset is not null and not exists (
      select 1 from public.cmdb_assets
       where organization_id = active_organization and id = requested_asset and deleted_at is null
    ) then
      raise exception 'Linked asset must be active in the current organization' using errcode = '42501';
    end if;

    normalized_item := item || jsonb_build_object(
      'network_cidr', network_cidr::text,
      'subnet_cidr', subnet_cidr::text,
      'ip_address', host_address::text,
      'gateway', case when gateway_address is null then '' else gateway_address::text end
    );
    normalized_batch := normalized_batch || jsonb_build_array(jsonb_build_object(
      'item', normalized_item,
      'network_cidr', network_cidr::text,
      'subnet_cidr', subnet_cidr::text,
      'host_address', host_address::text,
      'gateway_address', case when gateway_address is null then null else gateway_address::text end,
      'row_ordinal', row_ordinal
    ));
  end loop;

  if (select count(*) <> count(distinct rows.host_address::inet)
        from jsonb_to_recordset(normalized_batch) as rows(host_address text)) then
    raise exception 'Duplicate IP addresses are not allowed in one import batch' using errcode = '23505';
  end if;

  -- Acquire the global network -> subnet -> address hierarchy before any save.
  -- Existing rows are locked in deterministic UUID order at each level. Caller
  -- CSV order must never control lock acquisition because opposite row orders
  -- across concurrent imports would otherwise deadlock.
  perform 1 from public.ipam_networks networks
   where networks.organization_id = active_organization and networks.cidr in (
     select rows.network_cidr::cidr
       from jsonb_to_recordset(normalized_batch) as rows(network_cidr text)
   ) order by networks.id for update;
  perform 1 from public.ipam_subnets subnets
   where subnets.organization_id = active_organization and subnets.cidr in (
     select rows.subnet_cidr::cidr
       from jsonb_to_recordset(normalized_batch) as rows(subnet_cidr text)
   ) order by subnets.id for update;
  perform 1 from public.ipam_addresses addresses
   where addresses.organization_id = active_organization and addresses.ip_address in (
     select rows.host_address::inet
       from jsonb_to_recordset(normalized_batch) as rows(host_address text)
     union
     select rows.gateway_address::inet
       from jsonb_to_recordset(normalized_batch) as rows(gateway_address text)
      where rows.gateway_address is not null
   ) order by addresses.id for update;

  -- Canonical CIDR and host ordering makes processing independent of caller
  -- order. The original ordinal is used only as a final deterministic tie-breaker.
  for item in
    select rows.item
      from jsonb_to_recordset(normalized_batch) as rows(
        item jsonb, network_cidr text, subnet_cidr text,
        host_address text, gateway_address text, row_ordinal bigint
      )
     order by rows.network_cidr::cidr, rows.subnet_cidr::cidr,
              rows.host_address::inet, rows.row_ordinal
  loop
    perform public.save_ipam_address(null, item);
    imported := imported + 1;
  end loop;
  return imported;
end;
$$;

revoke all privileges on public.ipam_networks, public.ipam_subnets,
  public.ipam_addresses, public.ipam_reservations from anon, authenticated;
grant select on public.ipam_networks, public.ipam_subnets,
  public.ipam_addresses, public.ipam_reservations to authenticated;

revoke all on function public.assert_ipam_manage() from public;
revoke all on function public.list_ipam_addresses(boolean) from public;
revoke all on function public.save_ipam_address(uuid, jsonb) from public;
revoke all on function public.set_ipam_allocation_state(uuid[], text) from public;
revoke all on function public.reserve_next_ipam_address(uuid) from public;
revoke all on function public.soft_delete_ipam_address(uuid) from public;
revoke all on function public.restore_ipam_address(uuid) from public;
revoke all on function public.soft_delete_ipam_network(uuid) from public;
revoke all on function public.restore_ipam_network(uuid) from public;
revoke all on function public.soft_delete_ipam_subnet(uuid) from public;
revoke all on function public.restore_ipam_subnet(uuid) from public;
revoke all on function public.import_ipam_addresses(jsonb) from public;
grant execute on function public.list_ipam_addresses(boolean) to authenticated;
grant execute on function public.save_ipam_address(uuid, jsonb) to authenticated;
grant execute on function public.set_ipam_allocation_state(uuid[], text) to authenticated;
grant execute on function public.reserve_next_ipam_address(uuid) to authenticated;
grant execute on function public.soft_delete_ipam_address(uuid) to authenticated;
grant execute on function public.restore_ipam_address(uuid) to authenticated;
grant execute on function public.soft_delete_ipam_network(uuid) to authenticated;
grant execute on function public.restore_ipam_network(uuid) to authenticated;
grant execute on function public.soft_delete_ipam_subnet(uuid) to authenticated;
grant execute on function public.restore_ipam_subnet(uuid) to authenticated;
grant execute on function public.import_ipam_addresses(jsonb) to authenticated;

commit;
