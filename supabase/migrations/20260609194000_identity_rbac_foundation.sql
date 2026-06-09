begin;

-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration Batch 001: Authentication, Profiles, Teams and RBAC
-- ============================================================

-- ------------------------------------------------------------
-- 1. APPLICATION USER PROFILES
-- Authentication secrets remain exclusively inside auth.users.
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile metadata linked one-to-one with Supabase Auth users.';

-- ------------------------------------------------------------
-- 2. TEAMS
-- ------------------------------------------------------------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 2 and 80
  ),
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.teams is
  'Organizational teams used to isolate access to knowledge-center content.';

-- ------------------------------------------------------------
-- 3. ROLE AND PERMISSION CATALOG
-- ------------------------------------------------------------

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique check (
    role_key ~ '^[a-z][a-z0-9_]*$'
  ),
  name text not null,
  description text,
  role_scope text not null check (
    role_scope in ('platform', 'team')
  ),
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique check (
    permission_key ~ '^[a-z][a-z0-9_.]*$'
  ),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

-- ------------------------------------------------------------
-- 4. TEAM MEMBERSHIP AND ROLE ASSIGNMENTS
-- ------------------------------------------------------------

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_status text not null default 'active' check (
    membership_status in ('active', 'invited', 'suspended')
  ),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.user_global_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table if not exists public.team_member_roles (
  team_id uuid not null,
  user_id uuid not null,
  role_id uuid not null references public.roles(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id, role_id),
  foreign key (team_id, user_id)
    references public.team_members(team_id, user_id)
    on delete cascade
);

-- ------------------------------------------------------------
-- 5. PERFORMANCE INDEXES FOR MEMBERSHIP AND RLS LOOKUPS
-- ------------------------------------------------------------

create index if not exists idx_teams_created_by
  on public.teams(created_by);

create index if not exists idx_team_members_user_status
  on public.team_members(user_id, membership_status);

create index if not exists idx_team_member_roles_user_team
  on public.team_member_roles(user_id, team_id);

create index if not exists idx_team_member_roles_role
  on public.team_member_roles(role_id);

create index if not exists idx_user_global_roles_role
  on public.user_global_roles(role_id);

create index if not exists idx_role_permissions_permission
  on public.role_permissions(permission_id);

-- ------------------------------------------------------------
-- 6. UPDATED-AT TRIGGER
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists teams_set_updated_at on public.teams;
create trigger teams_set_updated_at
before update on public.teams
for each row
execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 7. AUTHENTICATION PROFILE SYNCHRONIZATION
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    display_name
  )
  values (
    new.id,
    new.email,
    nullif(
      coalesce(
        new.raw_user_meta_data ->> 'display_name',
        new.raw_user_meta_data ->> 'full_name',
        split_part(coalesce(new.email, ''), '@', 1)
      ),
      ''
    )
  )
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.handle_auth_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email,
      updated_at = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.handle_auth_user_email_update();

-- ------------------------------------------------------------
-- 8. RBAC ROLE-SCOPE VALIDATION
-- ------------------------------------------------------------

create or replace function public.validate_role_assignment_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_scope text;
begin
  select role_scope
  into selected_scope
  from public.roles
  where id = new.role_id;

  if selected_scope is null then
    raise exception 'Unknown role identifier';
  end if;

  if tg_table_name = 'user_global_roles'
     and selected_scope <> 'platform' then
    raise exception 'Only platform roles may be assigned globally';
  end if;

  if tg_table_name = 'team_member_roles'
     and selected_scope <> 'team' then
    raise exception 'Only team roles may be assigned to team members';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_user_global_role_scope
  on public.user_global_roles;

create trigger validate_user_global_role_scope
before insert or update on public.user_global_roles
for each row
execute function public.validate_role_assignment_scope();

drop trigger if exists validate_team_member_role_scope
  on public.team_member_roles;

create trigger validate_team_member_role_scope
before insert or update on public.team_member_roles
for each row
execute function public.validate_role_assignment_scope();

-- ------------------------------------------------------------
-- 9. SEEDED SYSTEM ROLES
-- ------------------------------------------------------------

insert into public.roles (
  role_key,
  name,
  description,
  role_scope,
  is_system
)
values
  (
    'platform_admin',
    'Platform Administrator',
    'Full administrative access across the entire platform.',
    'platform',
    true
  ),
  (
    'platform_auditor',
    'Platform Auditor',
    'Read-only platform oversight and audit visibility.',
    'platform',
    true
  ),
  (
    'team_owner',
    'Team Owner',
    'Full administrative authority inside one team.',
    'team',
    true
  ),
  (
    'team_admin',
    'Team Administrator',
    'Manages members and knowledge content inside one team.',
    'team',
    true
  ),
  (
    'team_editor',
    'Team Editor',
    'Creates and edits knowledge content inside one team.',
    'team',
    true
  ),
  (
    'team_viewer',
    'Team Viewer',
    'Reads knowledge content inside one team.',
    'team',
    true
  )
on conflict (role_key) do update
set
  name = excluded.name,
  description = excluded.description,
  role_scope = excluded.role_scope,
  is_system = excluded.is_system;

-- ------------------------------------------------------------
-- 10. SEEDED PERMISSIONS
-- ------------------------------------------------------------

insert into public.permissions (
  permission_key,
  name,
  description
)
values
  (
    'platform.manage_users',
    'Manage Platform Users',
    'Manage application users across the entire platform.'
  ),
  (
    'platform.manage_teams',
    'Manage Platform Teams',
    'Manage teams across the entire platform.'
  ),
  (
    'platform.view_audit',
    'View Platform Audit Data',
    'Read platform-wide audit information.'
  ),
  (
    'team.view',
    'View Team',
    'View a team and its basic metadata.'
  ),
  (
    'team.manage',
    'Manage Team',
    'Edit team metadata and settings.'
  ),
  (
    'team.manage_members',
    'Manage Team Members',
    'Invite, suspend, remove, and manage team members.'
  ),
  (
    'team.manage_roles',
    'Manage Team Roles',
    'Assign and revoke team-scoped roles.'
  ),
  (
    'knowledge.read',
    'Read Knowledge Content',
    'Read permitted knowledge-center content.'
  ),
  (
    'knowledge.create',
    'Create Knowledge Content',
    'Create knowledge-center content.'
  ),
  (
    'knowledge.update',
    'Update Knowledge Content',
    'Edit knowledge-center content.'
  ),
  (
    'knowledge.delete',
    'Delete Knowledge Content',
    'Delete knowledge-center content.'
  )
on conflict (permission_key) do update
set
  name = excluded.name,
  description = excluded.description;

-- ------------------------------------------------------------
-- 11. SEEDED ROLE-PERMISSION MAPPINGS
-- ------------------------------------------------------------

-- Platform administrators receive every current permission.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
cross join public.permissions
where roles.role_key = 'platform_admin'
on conflict do nothing;

-- Platform auditors receive read-oriented permissions only.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions
  on permissions.permission_key in (
    'platform.view_audit',
    'team.view',
    'knowledge.read'
  )
where roles.role_key = 'platform_auditor'
on conflict do nothing;

-- Team owners receive every team-scoped content permission.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions
  on permissions.permission_key in (
    'team.view',
    'team.manage',
    'team.manage_members',
    'team.manage_roles',
    'knowledge.read',
    'knowledge.create',
    'knowledge.update',
    'knowledge.delete'
  )
where roles.role_key = 'team_owner'
on conflict do nothing;

-- Team administrators manage membership and content.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions
  on permissions.permission_key in (
    'team.view',
    'team.manage',
    'team.manage_members',
    'team.manage_roles',
    'knowledge.read',
    'knowledge.create',
    'knowledge.update',
    'knowledge.delete'
  )
where roles.role_key = 'team_admin'
on conflict do nothing;

-- Team editors create and update content without deleting it.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions
  on permissions.permission_key in (
    'team.view',
    'knowledge.read',
    'knowledge.create',
    'knowledge.update'
  )
where roles.role_key = 'team_editor'
on conflict do nothing;

-- Team viewers receive read-only access.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions
  on permissions.permission_key in (
    'team.view',
    'knowledge.read'
  )
where roles.role_key = 'team_viewer'
on conflict do nothing;

-- ------------------------------------------------------------
-- 12. RLS HELPER FUNCTIONS
-- These run as their owner to prevent recursive RLS evaluation.
-- ------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_global_roles
    join public.roles
      on roles.id = user_global_roles.role_id
    where user_global_roles.user_id = auth.uid()
      and roles.role_key = 'platform_admin'
      and roles.role_scope = 'platform'
  );
$$;

create or replace function public.is_team_member(
  requested_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members
    where team_members.team_id = requested_team_id
      and team_members.user_id = auth.uid()
      and team_members.membership_status = 'active'
  );
$$;

create or replace function public.has_team_role(
  requested_team_id uuid,
  requested_role_keys text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_member_roles
    join public.team_members
      on team_members.team_id = team_member_roles.team_id
     and team_members.user_id = team_member_roles.user_id
    join public.roles
      on roles.id = team_member_roles.role_id
    where team_member_roles.team_id = requested_team_id
      and team_member_roles.user_id = auth.uid()
      and team_members.membership_status = 'active'
      and roles.role_scope = 'team'
      and roles.role_key = any(requested_role_keys)
  );
$$;

create or replace function public.has_permission(
  requested_permission_key text,
  requested_team_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.user_global_roles
      join public.role_permissions
        on role_permissions.role_id = user_global_roles.role_id
      join public.permissions
        on permissions.id = role_permissions.permission_id
      join public.roles
        on roles.id = user_global_roles.role_id
      where user_global_roles.user_id = auth.uid()
        and roles.role_scope = 'platform'
        and permissions.permission_key = requested_permission_key
    )
    or (
      requested_team_id is not null
      and exists (
        select 1
        from public.team_member_roles
        join public.team_members
          on team_members.team_id = team_member_roles.team_id
         and team_members.user_id = team_member_roles.user_id
        join public.role_permissions
          on role_permissions.role_id = team_member_roles.role_id
        join public.permissions
          on permissions.id = role_permissions.permission_id
        join public.roles
          on roles.id = team_member_roles.role_id
        where team_member_roles.team_id = requested_team_id
          and team_member_roles.user_id = auth.uid()
          and team_members.membership_status = 'active'
          and roles.role_scope = 'team'
          and permissions.permission_key = requested_permission_key
      )
    );
$$;

-- ------------------------------------------------------------
-- 13. SAFE TEAM-CREATION RPC
-- A logged-in user may create a team and becomes its owner.
-- ------------------------------------------------------------

create or replace function public.create_team(
  requested_name text,
  requested_slug text,
  requested_description text default null
)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_team public.teams;
  owner_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id
  into owner_role_id
  from public.roles
  where role_key = 'team_owner'
    and role_scope = 'team';

  if owner_role_id is null then
    raise exception 'Required team_owner role is missing';
  end if;

  insert into public.teams (
    name,
    slug,
    description,
    created_by
  )
  values (
    trim(requested_name),
    lower(trim(requested_slug)),
    nullif(trim(requested_description), ''),
    auth.uid()
  )
  returning *
  into created_team;

  insert into public.team_members (
    team_id,
    user_id,
    membership_status,
    invited_by
  )
  values (
    created_team.id,
    auth.uid(),
    'active',
    auth.uid()
  );

  insert into public.team_member_roles (
    team_id,
    user_id,
    role_id,
    granted_by
  )
  values (
    created_team.id,
    auth.uid(),
    owner_role_id,
    auth.uid()
  );

  return created_team;
end;
$$;

-- ------------------------------------------------------------
-- 14. ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.team_members enable row level security;
alter table public.user_global_roles enable row level security;
alter table public.team_member_roles enable row level security;

drop policy if exists profiles_select_self_or_platform_admin
  on public.profiles;

create policy profiles_select_self_or_platform_admin
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or public.is_platform_admin()
);

drop policy if exists profiles_update_self
  on public.profiles;

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
)
with check (
  (select auth.uid()) = id
);

drop policy if exists teams_select_member_or_platform_admin
  on public.teams;

create policy teams_select_member_or_platform_admin
on public.teams
for select
to authenticated
using (
  public.is_team_member(id)
  or public.is_platform_admin()
);

drop policy if exists team_members_select_team_context
  on public.team_members;

create policy team_members_select_team_context
on public.team_members
for select
to authenticated
using (
  public.is_team_member(team_id)
  or public.is_platform_admin()
);

drop policy if exists roles_select_authenticated
  on public.roles;

create policy roles_select_authenticated
on public.roles
for select
to authenticated
using (true);

drop policy if exists permissions_select_authenticated
  on public.permissions;

create policy permissions_select_authenticated
on public.permissions
for select
to authenticated
using (true);

drop policy if exists role_permissions_select_authenticated
  on public.role_permissions;

create policy role_permissions_select_authenticated
on public.role_permissions
for select
to authenticated
using (true);

drop policy if exists user_global_roles_select_self_or_platform_admin
  on public.user_global_roles;

create policy user_global_roles_select_self_or_platform_admin
on public.user_global_roles
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or public.is_platform_admin()
);

drop policy if exists team_member_roles_select_team_context
  on public.team_member_roles;

create policy team_member_roles_select_team_context
on public.team_member_roles
for select
to authenticated
using (
  public.is_team_member(team_id)
  or public.is_platform_admin()
);

-- ------------------------------------------------------------
-- 15. DATA-API PRIVILEGES
-- Anonymous visitors receive no direct access to these tables.
-- ------------------------------------------------------------

revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.teams from anon;
revoke all privileges on table public.roles from anon;
revoke all privileges on table public.permissions from anon;
revoke all privileges on table public.role_permissions from anon;
revoke all privileges on table public.team_members from anon;
revoke all privileges on table public.user_global_roles from anon;
revoke all privileges on table public.team_member_roles from anon;

revoke all privileges on table public.profiles from authenticated;
revoke all privileges on table public.teams from authenticated;
revoke all privileges on table public.roles from authenticated;
revoke all privileges on table public.permissions from authenticated;
revoke all privileges on table public.role_permissions from authenticated;
revoke all privileges on table public.team_members from authenticated;
revoke all privileges on table public.user_global_roles from authenticated;
revoke all privileges on table public.team_member_roles from authenticated;

grant usage on schema public to authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;

grant select on table public.teams to authenticated;
grant select on table public.roles to authenticated;
grant select on table public.permissions to authenticated;
grant select on table public.role_permissions to authenticated;
grant select on table public.team_members to authenticated;
grant select on table public.user_global_roles to authenticated;
grant select on table public.team_member_roles to authenticated;

-- ------------------------------------------------------------
-- 16. FUNCTION EXECUTION PRIVILEGES
-- ------------------------------------------------------------

revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_auth_user_email_update() from public;
revoke all on function public.validate_role_assignment_scope() from public;
revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_team_member(uuid) from public;
revoke all on function public.has_team_role(uuid, text[]) from public;
revoke all on function public.has_permission(text, uuid) from public;
revoke all on function public.create_team(text, text, text) from public;

grant execute on function public.is_platform_admin()
  to authenticated;

grant execute on function public.is_team_member(uuid)
  to authenticated;

grant execute on function public.has_team_role(uuid, text[])
  to authenticated;

grant execute on function public.has_permission(text, uuid)
  to authenticated;

grant execute on function public.create_team(text, text, text)
  to authenticated;

commit;
