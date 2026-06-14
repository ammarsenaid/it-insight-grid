-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: CMDB shared backend
-- ------------------------------------------------------------
-- AUTHORITATIVE. Forward-only and additive.
-- Depends on identity RBAC, 20260611010000_service_desk_rbac_expand.sql,
-- and 20260612235900_organization_foundation.sql.
-- CMDB asset types remain global read-only reference data.
-- Customer assets and lifecycle records are organization-scoped.
-- ============================================================

begin;

create table if not exists public.cmdb_asset_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_-]{0,59}$'),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.cmdb_asset_types (key, name, sort_order)
values
  ('server', 'Server', 10), ('vm', 'Virtual machine', 20),
  ('computer', 'Computer', 30), ('network', 'Network device', 40),
  ('application', 'Application', 50), ('storage', 'Storage', 60)
on conflict (key) do nothing;

create table if not exists public.cmdb_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  hostname text not null check (char_length(trim(hostname)) between 1 and 255),
  display_name text not null default '' check (char_length(display_name) <= 255),
  asset_type_id uuid not null references public.cmdb_asset_types(id) on delete restrict,
  ip_address inet,
  operating_system text not null default '' check (char_length(operating_system) <= 255),
  role text not null default '' check (char_length(role) <= 255),
  environment text not null default 'production'
    check (environment in ('production', 'staging', 'development')),
  location text not null default '' check (char_length(location) <= 255),
  owner_name text not null default '' check (char_length(owner_name) <= 255),
  owner_id uuid references public.profiles(id) on delete set null,
  vendor text not null default '' check (char_length(vendor) <= 255),
  model text not null default '' check (char_length(model) <= 255),
  serial_number text not null default '' check (char_length(serial_number) <= 255),
  asset_tag text not null default '' check (char_length(asset_tag) <= 255),
  mac_address text not null default '' check (
    mac_address = '' or mac_address ~* '^([0-9a-f]{2}:){5}[0-9a-f]{2}$'
  ),
  status text not null default 'active'
    check (status in ('active', 'maintenance', 'retired')),
  warranty_expiration date,
  notes text not null default '' check (char_length(notes) <= 20000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  unique (organization_id, id),
  check ((deleted_at is null and deleted_by is null) or deleted_at is not null)
);

create unique index if not exists uq_cmdb_assets_hostname_live
  on public.cmdb_assets (organization_id, lower(hostname))
  where deleted_at is null;
create unique index if not exists uq_cmdb_assets_asset_tag_live
  on public.cmdb_assets (organization_id, lower(asset_tag))
  where deleted_at is null and asset_tag <> '';
create unique index if not exists uq_cmdb_assets_serial_live
  on public.cmdb_assets (organization_id, lower(serial_number))
  where deleted_at is null and serial_number <> '';
create index if not exists idx_cmdb_assets_organization
  on public.cmdb_assets(organization_id)
  where deleted_at is null;
create index if not exists idx_cmdb_assets_type on public.cmdb_assets(asset_type_id) where deleted_at is null;
create index if not exists idx_cmdb_assets_owner on public.cmdb_assets(owner_id) where deleted_at is null;
create index if not exists idx_cmdb_assets_status on public.cmdb_assets(status) where deleted_at is null;
create index if not exists idx_cmdb_assets_environment on public.cmdb_assets(environment) where deleted_at is null;

create table if not exists public.cmdb_asset_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  asset_id uuid not null,
  foreign key (organization_id, asset_id)
    references public.cmdb_assets(organization_id, id)
    on delete cascade,
  event_type text not null check (
    event_type in ('created', 'updated', 'status_changed', 'ownership_changed', 'deleted', 'restored')
  ),
  from_status text check (from_status is null or from_status in ('active', 'maintenance', 'retired')),
  to_status text check (to_status is null or to_status in ('active', 'maintenance', 'retired')),
  from_owner text,
  to_owner text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_cmdb_lifecycle_asset
  on public.cmdb_asset_lifecycle_events(
    organization_id,
    asset_id,
    created_at desc
  );

drop trigger if exists cmdb_asset_types_set_updated_at on public.cmdb_asset_types;
create trigger cmdb_asset_types_set_updated_at before update on public.cmdb_asset_types
for each row execute function public.set_updated_at();

create or replace function public.prepare_cmdb_asset_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  active_organization uuid := public.current_organization_id();
begin
  if tg_op = 'INSERT' then
    new.organization_id := active_organization;
    new.created_by := auth.uid();
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'CMDB asset organization cannot be changed'
      using errcode = '42501';
  else
    new.organization_id := old.organization_id;
  end if;

  if new.owner_id is not null and not exists (
    select 1
      from public.organization_members
     where organization_id = new.organization_id
       and user_id = new.owner_id
       and status = 'active'
  ) then
    raise exception 'CMDB owner must belong to the active organization'
      using errcode = '42501';
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists cmdb_assets_prepare_write on public.cmdb_assets;
create trigger cmdb_assets_prepare_write before insert or update on public.cmdb_assets
for each row execute function public.prepare_cmdb_asset_write();

create or replace function public.record_cmdb_asset_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  kind text;
begin
  if tg_op = 'INSERT' then
    kind := 'created';
  elsif old.deleted_at is null and new.deleted_at is not null then
    kind := 'deleted';
  elsif old.deleted_at is not null and new.deleted_at is null then
    kind := 'restored';
  elsif old.status is distinct from new.status then
    kind := 'status_changed';
  elsif old.owner_id is distinct from new.owner_id or old.owner_name is distinct from new.owner_name then
    kind := 'ownership_changed';
  else
    kind := 'updated';
  end if;

  insert into public.cmdb_asset_lifecycle_events (
    organization_id, asset_id, event_type, from_status, to_status,
    from_owner, to_owner, actor_id
  ) values (
    new.organization_id, new.id, kind,
    case when tg_op = 'INSERT' then null else old.status end, new.status,
    case when tg_op = 'INSERT' then null else old.owner_name end, new.owner_name,
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists cmdb_assets_record_lifecycle on public.cmdb_assets;
create trigger cmdb_assets_record_lifecycle after insert or update on public.cmdb_assets
for each row execute function public.record_cmdb_asset_lifecycle();

alter table public.cmdb_asset_types enable row level security;
alter table public.cmdb_assets enable row level security;
alter table public.cmdb_asset_lifecycle_events enable row level security;

-- Global read-only reference data.
-- Organization-specific asset-type customization is intentionally deferred.
create policy cmdb_asset_types_select on public.cmdb_asset_types
for select to authenticated using (public.has_permission('cmdb.view'));

create policy cmdb_assets_select on public.cmdb_assets
for select to authenticated using (
  organization_id = public.current_organization_id()
  and (
    (deleted_at is null and public.has_permission('cmdb.view'))
    or public.has_permission('cmdb.manage')
  )
);
create policy cmdb_assets_insert on public.cmdb_assets
for insert to authenticated with check (
  organization_id = public.current_organization_id()
  and public.has_permission('cmdb.manage')
  and deleted_at is null
  and deleted_by is null
);
create policy cmdb_assets_update on public.cmdb_assets
for update to authenticated using (
  organization_id = public.current_organization_id()
  and deleted_at is null
  and public.has_permission('cmdb.manage')
)
with check (
  organization_id = public.current_organization_id()
  and deleted_at is null
  and public.has_permission('cmdb.manage')
);

create policy cmdb_lifecycle_select on public.cmdb_asset_lifecycle_events
for select to authenticated using (
  organization_id = public.current_organization_id()
  and public.has_permission('cmdb.view')
  and exists (
    select 1
      from public.cmdb_assets
     where cmdb_assets.organization_id =
           cmdb_asset_lifecycle_events.organization_id
       and cmdb_assets.id = cmdb_asset_lifecycle_events.asset_id
  )
);

create or replace function public.soft_delete_cmdb_asset(p_asset_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_permission('cmdb.manage') then
    raise exception 'CMDB manage permission required' using errcode = '42501';
  end if;
  update public.cmdb_assets
     set deleted_at = now(), deleted_by = auth.uid()
   where id = p_asset_id
     and organization_id = public.current_organization_id()
     and deleted_at is null;
  if not found then raise exception 'CMDB asset not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.restore_cmdb_asset(p_asset_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_permission('cmdb.manage') then
    raise exception 'CMDB manage permission required' using errcode = '42501';
  end if;
  update public.cmdb_assets set deleted_at = null, deleted_by = null
   where id = p_asset_id
     and organization_id = public.current_organization_id()
     and deleted_at is not null;
  if not found then raise exception 'Deleted CMDB asset not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.set_cmdb_asset_statuses(p_asset_ids uuid[], p_status text)
returns integer language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if auth.uid() is null or not public.has_permission('cmdb.manage') then
    raise exception 'CMDB manage permission required' using errcode = '42501';
  end if;
  if p_status not in ('active', 'maintenance', 'retired') then
    raise exception 'Invalid CMDB status' using errcode = '22023';
  end if;
  if coalesce(array_length(p_asset_ids, 1), 0) = 0 or array_length(p_asset_ids, 1) > 500 then
    raise exception 'CMDB status batch must contain 1 to 500 assets' using errcode = '22023';
  end if;
  update public.cmdb_assets set status = p_status
   where id = any(p_asset_ids)
     and organization_id = public.current_organization_id()
     and deleted_at is null;
  get diagnostics changed = row_count;
  if changed <> array_length(p_asset_ids, 1) then
    raise exception 'One or more CMDB assets were not found' using errcode = 'P0002';
  end if;
  return changed;
end;
$$;

create or replace function public.import_cmdb_assets(p_assets jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  imported integer := 0;
  type_id uuid;
begin
  if auth.uid() is null or not public.has_permission('cmdb.manage') then
    raise exception 'CMDB manage permission required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_assets) <> 'array' or jsonb_array_length(p_assets) > 500 then
    raise exception 'CMDB import must be an array of at most 500 assets' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_assets) loop
    select id into type_id from public.cmdb_asset_types
     where id = nullif(item->>'asset_type_id', '')::uuid and is_active;
    if type_id is null then
      raise exception 'Invalid or inactive CMDB asset type' using errcode = '22023';
    end if;
    insert into public.cmdb_assets (
      organization_id, hostname, display_name, asset_type_id, ip_address,
      operating_system, role, environment, location, owner_name, owner_id,
      vendor, model, serial_number, asset_tag, mac_address, status,
      warranty_expiration, notes
    ) values (
      public.current_organization_id(),
      item->>'hostname', coalesce(item->>'display_name', ''), type_id,
      nullif(item->>'ip_address', '')::inet, coalesce(item->>'operating_system', ''),
      coalesce(item->>'role', ''), coalesce(item->>'environment', 'production'),
      coalesce(item->>'location', ''), coalesce(item->>'owner_name', ''),
      nullif(item->>'owner_id', '')::uuid, coalesce(item->>'vendor', ''),
      coalesce(item->>'model', ''), coalesce(item->>'serial_number', ''),
      coalesce(item->>'asset_tag', ''), coalesce(item->>'mac_address', ''),
      coalesce(item->>'status', 'active'), nullif(item->>'warranty_expiration', '')::date,
      coalesce(item->>'notes', '')
    );
    imported := imported + 1;
  end loop;
  return imported;
end;
$$;

revoke all on function public.soft_delete_cmdb_asset(uuid) from public;
revoke all on function public.restore_cmdb_asset(uuid) from public;
revoke all on function public.set_cmdb_asset_statuses(uuid[], text) from public;
revoke all on function public.import_cmdb_assets(jsonb) from public;
grant execute on function public.soft_delete_cmdb_asset(uuid) to authenticated;
grant execute on function public.restore_cmdb_asset(uuid) to authenticated;
grant execute on function public.set_cmdb_asset_statuses(uuid[], text) to authenticated;
grant execute on function public.import_cmdb_assets(jsonb) to authenticated;

revoke insert, update, delete on public.cmdb_asset_lifecycle_events from authenticated;
revoke delete on public.cmdb_assets from authenticated;
revoke update on public.cmdb_assets from authenticated;
grant update (
  hostname, display_name, asset_type_id, ip_address, operating_system, role,
  environment, location, owner_name, owner_id, vendor, model, serial_number,
  asset_tag, mac_address, status, warranty_expiration, notes
) on public.cmdb_assets to authenticated;
revoke insert, update, delete on public.cmdb_asset_types from authenticated;

-- ------------------------------------------------------------
-- 7b. CMDB table privileges required for RLS policy evaluation
-- ------------------------------------------------------------
-- RLS policies are not sufficient by themselves: authenticated needs the
-- minimal table privileges before PostgreSQL can evaluate the policies.
-- Global asset types are read-only. Assets are readable/insertable through RLS.
-- Lifecycle events are read-only through RLS and cannot be forged directly.
grant select on public.cmdb_asset_types to authenticated;
grant select, insert on public.cmdb_assets to authenticated;
grant select on public.cmdb_asset_lifecycle_events to authenticated;

-- CMDB write triggers run as the authenticated caller and use auth.uid().
-- Grant only what is required for auth.uid() lookup; no auth table access is granted.
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

comment on schema auth is
  'ITKC CMDB auth.uid execution grants: authenticated can execute auth.uid() for security-invoker triggers and RLS evaluation; no auth table access is granted.';

comment on table public.cmdb_assets is
  'ITKC CMDB authenticated table grants: authenticated can select/insert assets through RLS and limited column updates only; hard delete remains forbidden.';

commit;
