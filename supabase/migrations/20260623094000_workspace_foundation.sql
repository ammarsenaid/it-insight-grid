-- ============================================================
-- IT KNOWLEDGE CENTER
-- Pending Migration: Workspace foundation
-- ------------------------------------------------------------
-- PURPOSE:
-- Add the missing Organization -> Workspace -> Team layer.
--
-- SAFE / ADDITIVE:
-- - Does not remove or rename teams.
-- - Does not change existing has_permission().
-- - Does not migrate tickets or knowledge yet.
-- - Does not weaken existing RLS.
-- - Seeds one workspace per existing team to preserve current separation.
--
-- UI language:
-- - DB/code: workspace
-- - UI label: Department
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Allow workspace-scoped roles without breaking existing roles.
-- Existing roles.role_scope currently supports platform/team.
-- ------------------------------------------------------------

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
    from pg_constraint
   where conrelid = 'public.roles'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%role_scope%'
   limit 1;

  if constraint_name is not null then
    execute format('alter table public.roles drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.roles
  add constraint roles_role_scope_check
  check (role_scope in ('platform', 'workspace', 'team'));

-- ------------------------------------------------------------
-- 2. Workspace tables
-- ------------------------------------------------------------

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  name text not null check (char_length(trim(name)) between 1 and 160),

  slug text not null check (
    slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'
  ),

  description text,

  type text not null default 'department'
    check (type in ('department', 'project', 'service', 'partner', 'management', 'system')),

  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  unique (organization_id, slug),
  unique (organization_id, id)
);

comment on table public.workspaces is
  'Business/security workspaces inside an organization. UI may label these as Departments.';

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,

  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended', 'removed')),

  created_by uuid references auth.users(id) on delete set null,

  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, user_id),

  foreign key (organization_id, workspace_id)
    references public.workspaces(organization_id, id)
    on delete cascade,

  foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id)
    on delete cascade
);

comment on table public.workspace_members is
  'User membership inside a workspace/department.';

create table if not exists public.workspace_member_roles (
  id uuid primary key default gen_random_uuid(),

  workspace_member_id uuid not null
    references public.workspace_members(id) on delete cascade,

  role_id uuid not null references public.roles(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),

  unique (workspace_member_id, role_id)
);

comment on table public.workspace_member_roles is
  'Workspace-scoped role assignments for workspace members.';

-- ------------------------------------------------------------
-- 3. Indexes
-- ------------------------------------------------------------

create index if not exists idx_workspaces_organization_status
  on public.workspaces(organization_id, status)
  where deleted_at is null;

create index if not exists idx_workspaces_slug
  on public.workspaces(organization_id, slug);

create index if not exists idx_workspace_members_user_status
  on public.workspace_members(user_id, organization_id, workspace_id)
  where status = 'active';

create index if not exists idx_workspace_members_workspace_status
  on public.workspace_members(workspace_id, status);

create index if not exists idx_workspace_member_roles_role
  on public.workspace_member_roles(role_id);

-- ------------------------------------------------------------
-- 4. updated_at triggers
-- ------------------------------------------------------------

drop trigger if exists workspaces_set_updated_at
  on public.workspaces;

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists workspace_members_set_updated_at
  on public.workspace_members;

create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 5. Add teams.workspace_id additively.
-- Keep nullable for now so existing frontend/admin team creation does not break.
-- Later migration can make this NOT NULL after frontend supports workspace selection.
-- ------------------------------------------------------------

alter table public.teams
  add column if not exists workspace_id uuid;

alter table public.teams
  drop constraint if exists teams_workspace_fk;

alter table public.teams
  add constraint teams_workspace_fk
  foreign key (organization_id, workspace_id)
  references public.workspaces(organization_id, id)
  on delete restrict;

create index if not exists idx_teams_workspace
  on public.teams(organization_id, workspace_id);

-- ------------------------------------------------------------
-- 6. Seed one workspace per existing team.
-- This preserves current team/department security separation:
-- HR team -> HR workspace
-- IT Knowledge Center team -> IT Knowledge Center workspace
-- ------------------------------------------------------------

insert into public.workspaces (
  organization_id,
  name,
  slug,
  description,
  type,
  status,
  created_by,
  updated_by
)
select
  teams.organization_id,
  teams.name,
  teams.slug,
  nullif(teams.description, ''),
  'department',
  'active',
  teams.created_by,
  teams.created_by
from public.teams
where teams.organization_id is not null
on conflict (organization_id, slug) do update
set
  name = excluded.name,
  description = coalesce(public.workspaces.description, excluded.description),
  updated_by = excluded.updated_by,
  updated_at = now();

update public.teams
   set workspace_id = workspaces.id
  from public.workspaces
 where teams.organization_id = workspaces.organization_id
   and teams.slug = workspaces.slug
   and teams.workspace_id is null;

-- ------------------------------------------------------------
-- 7. Seed workspace members from existing team members.
-- This keeps current users able to access the same department/workspace.
-- ------------------------------------------------------------

insert into public.workspace_members (
  organization_id,
  workspace_id,
  user_id,
  status,
  created_by,
  joined_at
)
select distinct
  teams.organization_id,
  teams.workspace_id,
  team_members.user_id,
  case
    when team_members.membership_status = 'active' then 'active'
    when team_members.membership_status = 'invited' then 'invited'
    when team_members.membership_status = 'suspended' then 'suspended'
    else 'active'
  end,
  team_members.invited_by,
  team_members.joined_at
from public.team_members
join public.teams
  on teams.id = team_members.team_id
where teams.workspace_id is not null
  and teams.organization_id = team_members.organization_id
on conflict (workspace_id, user_id) do update
set
  status = case
    when public.workspace_members.status = 'active' then 'active'
    else excluded.status
  end,
  updated_at = now();

-- ------------------------------------------------------------
-- 8. Workspace permissions and roles.
-- Existing permissions remain unchanged; these are additive.
-- ------------------------------------------------------------

insert into public.permissions (
  permission_key,
  name,
  description
)
values
  (
    'workspace.view',
    'View Workspace',
    'View workspace metadata and access the workspace context.'
  ),
  (
    'workspace.manage',
    'Manage Workspace',
    'Manage workspace metadata and settings.'
  ),
  (
    'workspace.manage_members',
    'Manage Workspace Members',
    'Invite, suspend, remove and manage users inside a workspace.'
  ),
  (
    'workspace.manage_roles',
    'Manage Workspace Roles',
    'Assign and revoke workspace-scoped roles.'
  ),
  (
    'queue.manage',
    'Manage Queues',
    'Manage service queues inside a workspace.'
  ),
  (
    'mailbox.manage',
    'Manage Mailboxes',
    'Manage shared mailbox routing inside a workspace.'
  )
on conflict (permission_key) do update
set
  name = excluded.name,
  description = excluded.description;

insert into public.roles (
  role_key,
  name,
  description,
  role_scope,
  is_system
)
values
  (
    'workspace_owner',
    'Workspace Owner',
    'Owns one workspace and manages members, roles, queues, mailbox routing and content.',
    'workspace',
    true
  ),
  (
    'workspace_admin',
    'Workspace Administrator',
    'Administers one workspace and its operational configuration.',
    'workspace',
    true
  ),
  (
    'workspace_agent',
    'Workspace Agent',
    'Works tickets, tasks, notes and operational content inside one workspace.',
    'workspace',
    true
  ),
  (
    'workspace_viewer',
    'Workspace Viewer',
    'Read-only access to permitted workspace content.',
    'workspace',
    true
  )
on conflict (role_key) do update
set
  name = excluded.name,
  description = excluded.description,
  role_scope = excluded.role_scope,
  is_system = excluded.is_system;

-- workspace_owner: broad workspace administration.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions
  on permissions.permission_key in (
    'workspace.view',
    'workspace.manage',
    'workspace.manage_members',
    'workspace.manage_roles',
    'team.view',
    'team.manage',
    'team.manage_members',
    'team.manage_roles',
    'queue.manage',
    'mailbox.manage',
    'tickets.view_all',
    'tickets.view_internal',
    'tickets.comment_public',
    'tickets.comment_internal',
    'tickets.assign',
    'tickets.resolve',
    'tickets.attachments.view',
    'tickets.attachments.upload',
    'tickets.attachments.manage',
    'catalog.manage',
    'catalog.request',
    'knowledge.read',
    'knowledge.create',
    'knowledge.update',
    'knowledge.delete',
    'tasks.view',
    'tasks.manage',
    'notes.view',
    'notes.manage',
    'protocols.view',
    'protocols.manage'
  )
where roles.role_key = 'workspace_owner'
on conflict do nothing;

-- workspace_admin: same as owner except role assignment can be separated later.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions
  on permissions.permission_key in (
    'workspace.view',
    'workspace.manage',
    'workspace.manage_members',
    'team.view',
    'team.manage',
    'team.manage_members',
    'queue.manage',
    'mailbox.manage',
    'tickets.view_all',
    'tickets.view_internal',
    'tickets.comment_public',
    'tickets.comment_internal',
    'tickets.assign',
    'tickets.resolve',
    'tickets.attachments.view',
    'tickets.attachments.upload',
    'tickets.attachments.manage',
    'catalog.manage',
    'catalog.request',
    'knowledge.read',
    'knowledge.create',
    'knowledge.update',
    'knowledge.delete',
    'tasks.view',
    'tasks.manage',
    'notes.view',
    'notes.manage',
    'protocols.view',
    'protocols.manage'
  )
where roles.role_key = 'workspace_admin'
on conflict do nothing;

-- workspace_agent: operational staff inside a workspace.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions
  on permissions.permission_key in (
    'workspace.view',
    'team.view',
    'tickets.view_all',
    'tickets.view_internal',
    'tickets.comment_public',
    'tickets.comment_internal',
    'tickets.assign',
    'tickets.resolve',
    'tickets.attachments.view',
    'tickets.attachments.upload',
    'catalog.request',
    'knowledge.read',
    'knowledge.create',
    'knowledge.update',
    'tasks.view',
    'tasks.manage',
    'notes.view',
    'notes.manage',
    'protocols.view'
  )
where roles.role_key = 'workspace_agent'
on conflict do nothing;

-- workspace_viewer: read-oriented workspace role.
insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions
  on permissions.permission_key in (
    'workspace.view',
    'team.view',
    'tickets.attachments.view',
    'catalog.request',
    'knowledge.read',
    'tasks.view',
    'notes.view',
    'protocols.view'
  )
where roles.role_key = 'workspace_viewer'
on conflict do nothing;

-- ------------------------------------------------------------
-- 9. Helper functions.
-- Keep public.has_permission() unchanged for compatibility.
-- ------------------------------------------------------------

create or replace function public.is_workspace_member(
  p_workspace_id uuid
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
         from public.workspace_members wm
         join public.workspaces w
           on w.id = wm.workspace_id
          and w.organization_id = wm.organization_id
          and w.status = 'active'
          and w.deleted_at is null
        where wm.workspace_id = p_workspace_id
          and wm.user_id = auth.uid()
          and wm.status = 'active'
          and w.organization_id = public.current_organization_id()
     );
$$;

create or replace function public.has_workspace_role(
  p_workspace_id uuid,
  p_role_keys text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
      or exists (
        select 1
          from public.workspace_members wm
          join public.workspace_member_roles wmr
            on wmr.workspace_member_id = wm.id
          join public.roles r
            on r.id = wmr.role_id
           and r.role_scope = 'workspace'
         where wm.workspace_id = p_workspace_id
           and wm.user_id = auth.uid()
           and wm.status = 'active'
           and r.role_key = any(p_role_keys)
      );
$$;

create or replace function public.has_workspace_permission(
  p_workspace_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
      or exists (
        select 1
          from public.workspace_members wm
          join public.workspace_member_roles wmr
            on wmr.workspace_member_id = wm.id
          join public.roles r
            on r.id = wmr.role_id
           and r.role_scope = 'workspace'
          join public.role_permissions rp
            on rp.role_id = r.id
          join public.permissions p
            on p.id = rp.permission_id
         where wm.workspace_id = p_workspace_id
           and wm.user_id = auth.uid()
           and wm.status = 'active'
           and p.permission_key = p_permission_key
      );
$$;

-- ------------------------------------------------------------
-- 10. RLS on new tables.
-- ------------------------------------------------------------

alter table public.workspaces
  enable row level security;

alter table public.workspace_members
  enable row level security;

alter table public.workspace_member_roles
  enable row level security;

drop policy if exists workspaces_select_member_or_platform_admin
  on public.workspaces;

create policy workspaces_select_member_or_platform_admin
on public.workspaces
for select
to authenticated
using (
  public.is_platform_admin()
  or public.is_workspace_member(id)
);

drop policy if exists workspaces_insert_platform_admin
  on public.workspaces;

create policy workspaces_insert_platform_admin
on public.workspaces
for insert
to authenticated
with check (
  public.is_platform_admin()
  and organization_id = public.current_organization_id()
);

drop policy if exists workspaces_update_manage
  on public.workspaces;

create policy workspaces_update_manage
on public.workspaces
for update
to authenticated
using (
  public.is_platform_admin()
  or public.has_workspace_permission(id, 'workspace.manage')
)
with check (
  organization_id = public.current_organization_id()
  and (
    public.is_platform_admin()
    or public.has_workspace_permission(id, 'workspace.manage')
  )
);

drop policy if exists workspace_members_select_context
  on public.workspace_members;

create policy workspace_members_select_context
on public.workspace_members
for select
to authenticated
using (
  public.is_platform_admin()
  or user_id = auth.uid()
  or public.has_workspace_permission(workspace_id, 'workspace.manage_members')
);

drop policy if exists workspace_members_insert_manage
  on public.workspace_members;

create policy workspace_members_insert_manage
on public.workspace_members
for insert
to authenticated
with check (
  organization_id = public.current_organization_id()
  and (
    public.is_platform_admin()
    or public.has_workspace_permission(workspace_id, 'workspace.manage_members')
  )
);

drop policy if exists workspace_members_update_manage
  on public.workspace_members;

create policy workspace_members_update_manage
on public.workspace_members
for update
to authenticated
using (
  public.is_platform_admin()
  or public.has_workspace_permission(workspace_id, 'workspace.manage_members')
)
with check (
  organization_id = public.current_organization_id()
  and (
    public.is_platform_admin()
    or public.has_workspace_permission(workspace_id, 'workspace.manage_members')
  )
);

drop policy if exists workspace_member_roles_select_context
  on public.workspace_member_roles;

create policy workspace_member_roles_select_context
on public.workspace_member_roles
for select
to authenticated
using (
  public.is_platform_admin()
  or exists (
    select 1
      from public.workspace_members wm
     where wm.id = workspace_member_roles.workspace_member_id
       and (
         wm.user_id = auth.uid()
         or public.has_workspace_permission(wm.workspace_id, 'workspace.manage_roles')
       )
  )
);

drop policy if exists workspace_member_roles_insert_manage
  on public.workspace_member_roles;

create policy workspace_member_roles_insert_manage
on public.workspace_member_roles
for insert
to authenticated
with check (
  public.is_platform_admin()
  or exists (
    select 1
      from public.workspace_members wm
     where wm.id = workspace_member_roles.workspace_member_id
       and public.has_workspace_permission(wm.workspace_id, 'workspace.manage_roles')
  )
);

drop policy if exists workspace_member_roles_delete_manage
  on public.workspace_member_roles;

create policy workspace_member_roles_delete_manage
on public.workspace_member_roles
for delete
to authenticated
using (
  public.is_platform_admin()
  or exists (
    select 1
      from public.workspace_members wm
     where wm.id = workspace_member_roles.workspace_member_id
       and public.has_workspace_permission(wm.workspace_id, 'workspace.manage_roles')
  )
);

-- ------------------------------------------------------------
-- 11. Grants
-- ------------------------------------------------------------

revoke all privileges on table public.workspaces from anon;
revoke all privileges on table public.workspace_members from anon;
revoke all privileges on table public.workspace_member_roles from anon;

revoke all privileges on table public.workspaces from authenticated;
revoke all privileges on table public.workspace_members from authenticated;
revoke all privileges on table public.workspace_member_roles from authenticated;

grant select, insert, update on table public.workspaces to authenticated;
grant select, insert, update on table public.workspace_members to authenticated;
grant select, insert, delete on table public.workspace_member_roles to authenticated;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.has_workspace_role(uuid, text[]) from public;
revoke all on function public.has_workspace_permission(uuid, text) from public;

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;
grant execute on function public.has_workspace_permission(uuid, text) to authenticated;

commit;
