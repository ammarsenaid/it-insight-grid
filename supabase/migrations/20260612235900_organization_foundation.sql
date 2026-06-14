-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: organization tenant foundation
-- ------------------------------------------------------------
-- AUTHORITATIVE. Forward-only and additive.
-- One customer company equals one organization.
-- ============================================================

begin;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'removed')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists idx_organization_members_user_active
  on public.organization_members(user_id, organization_id)
  where status = 'active';

drop trigger if exists organizations_set_updated_at
  on public.organizations;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists organization_members_set_updated_at
  on public.organization_members;

create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

create or replace function public.is_active_organization_member(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.organization_members as members
         join public.organizations as organizations
           on organizations.id = members.organization_id
          and organizations.status = 'active'
        where members.organization_id = p_organization_id
          and members.user_id = auth.uid()
          and members.status = 'active'
     );
$$;

create or replace function public.current_organization_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  requested uuid;
  selected_id uuid;
  membership_count integer;
begin
  if caller is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  begin
    requested :=
      nullif(current_setting('request.jwt.claims', true), '')::jsonb
      ->> 'organization_id';
  exception
    when invalid_text_representation then
      raise exception 'Invalid organization claim'
        using errcode = '22023';
  end;

  if requested is not null then
    if not exists (
      select 1
        from public.organization_members as members
        join public.organizations as organizations
          on organizations.id = members.organization_id
         and organizations.status = 'active'
       where members.organization_id = requested
         and members.user_id = caller
         and members.status = 'active'
    ) then
      raise exception 'Active organization membership required'
        using errcode = '42501';
    end if;

    return requested;
  end if;

  select (array_agg(members.organization_id))[1], count(*)
    into selected_id, membership_count
    from public.organization_members as members
    join public.organizations as organizations
      on organizations.id = members.organization_id
     and organizations.status = 'active'
   where members.user_id = caller
     and members.status = 'active';

  if membership_count <> 1 then
    raise exception 'Exactly one active organization context is required'
      using errcode = '42501';
  end if;

  return selected_id;
end;
$$;

alter table public.organizations
  enable row level security;

alter table public.organization_members
  enable row level security;

drop policy if exists organizations_select_active_member
  on public.organizations;

create policy organizations_select_active_member
on public.organizations
for select
to authenticated
using (
  public.is_active_organization_member(id)
  or public.is_platform_admin()
);

drop policy if exists organization_members_select_self
  on public.organization_members;

create policy organization_members_select_self
on public.organization_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_platform_admin()
);

revoke all privileges
  on table public.organizations
  from anon;

revoke all privileges
  on table public.organization_members
  from anon;

revoke all privileges
  on table public.organizations
  from authenticated;

revoke all privileges
  on table public.organization_members
  from authenticated;

grant select
  on table public.organizations
  to authenticated;

grant select
  on table public.organization_members
  to authenticated;

revoke all
  on function public.is_active_organization_member(uuid)
  from public;

revoke all
  on function public.current_organization_id()
  from public;

grant execute
  on function public.is_active_organization_member(uuid)
  to authenticated;

grant execute
  on function public.current_organization_id()
  to authenticated;

commit;
