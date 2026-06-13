-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: Service Desk RBAC Expansion (Phase A — Batch 2/6)
-- ------------------------------------------------------------
-- DRAFT — NOT YET APPLIED.
-- Forward-only and additive. No existing object is dropped or
-- altered in a destructive way (only ON CONFLICT upserts on the
-- roles / permissions / role_permissions catalog tables).
--
-- Adds:
--   * Roles: employee, technician, network_admin, doc_editor
--   * Permission keys for:
--       tickets         (tickets.comment_public, tickets.attachments.view,
--                        tickets.attachments.upload, tickets.attachments.manage)
--       catalog         (catalog.request)
--       notifications   (notifications.view_own)
--       cmdb            (cmdb.view, cmdb.manage)
--       ipam            (ipam.view, ipam.manage)
--       tasks           (tasks.view, tasks.manage)
--       notes           (notes.view, notes.manage)
--       protocols       (protocols.view, protocols.manage)
--       audit           (audit.view)
--       reports         (reports.view)
--   * Role -> Permission mappings consistent with the frontend
--     CAPS matrix in src/lib/permissions.tsx.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. NEW PLATFORM ROLES
-- ------------------------------------------------------------
insert into public.roles (role_key, name, description, role_scope, is_system)
values
  ('employee',
   'Employee / Requester',
   'Submits requests and reads approved documentation. No access to the IT queue.',
   'platform', true),
  ('technician',
   'Technician',
   'Field/desk technician. Works tickets, CMDB and tasks.',
   'platform', true),
  ('network_admin',
   'Network Administrator',
   'Owns IPAM and network assets in the CMDB.',
   'platform', true),
  ('doc_editor',
   'Documentation Editor',
   'Authors and curates the knowledge base. Limited service desk access.',
   'platform', true)
on conflict (role_key) do update
  set name = excluded.name,
      description = excluded.description,
      role_scope = excluded.role_scope,
      is_system = excluded.is_system;

-- ------------------------------------------------------------
-- 2. NEW PERMISSIONS
-- ------------------------------------------------------------
insert into public.permissions (permission_key, name, description)
values
  -- Tickets
  ('tickets.comment_public',      'Reply on Tickets',
   'Post a public reply (visible to the requester) on a ticket.'),
  ('tickets.directory',           'View Service Desk Profile Directory',
   'Read assignment-safe names for Service Desk queue identities.'),
  ('tickets.attachments.view',    'View Ticket Attachments',
   'Read attachments on tickets the user is allowed to see.'),
  ('tickets.attachments.upload',  'Upload Ticket Attachments',
   'Upload a file attached to a ticket the user is allowed to comment on.'),
  ('tickets.attachments.manage',  'Manage Ticket Attachments',
   'Delete any attachment on any visible ticket.'),
  ('tickets.config',              'Configure Ticket Settings',
   'Manage categories, priorities, SLA policies, routing rules, '
   'canned responses and mailbox configuration.'),

  -- Catalog
  ('catalog.request',             'Submit Catalog Requests',
   'Submit a request from a published catalog service.'),

  -- Notifications
  ('notifications.view_own',      'View Own Notifications',
   'Read the user''s own notifications inbox.'),

  -- CMDB / IPAM / Tasks / Notes / Protocols
  ('cmdb.view',       'View CMDB',     'Read configuration items.'),
  ('cmdb.manage',     'Manage CMDB',   'Create, edit and retire configuration items.'),
  ('ipam.view',       'View IPAM',     'Read IP, subnet and VLAN records.'),
  ('ipam.manage',     'Manage IPAM',   'Create and edit IP, subnet and VLAN records.'),
  ('tasks.view',      'View Tasks',    'Read tasks across the platform.'),
  ('tasks.manage',    'Manage Tasks',  'Create, edit and complete tasks.'),
  ('notes.view',      'View Notes',    'Read internal notes / scratchpad.'),
  ('notes.manage',    'Manage Notes',  'Create and edit internal notes.'),
  ('protocols.view',  'View Protocols','Read operational protocols.'),
  ('protocols.manage','Manage Protocols','Create and edit operational protocols.'),

  -- Read-only / cross-cutting
  ('audit.view',      'View Audit Log','Read the platform-wide audit log.'),
  ('reports.view',    'View Reports',  'Read aggregated dashboards and reports.')
on conflict (permission_key) do update
  set name = excluded.name,
      description = excluded.description;


-- ------------------------------------------------------------
-- 3. ROLE -> PERMISSION MAPPINGS
-- ------------------------------------------------------------
-- platform_admin: full set (additive; existing seed already gives it
-- every permission via the foundation migration).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_key = 'platform_admin'
  and p.permission_key in (
    'tickets.comment_public','tickets.directory','tickets.attachments.view','tickets.attachments.upload',
    'tickets.attachments.manage','tickets.config','catalog.request',
    'notifications.view_own',
    'cmdb.view','cmdb.manage','ipam.view','ipam.manage',
    'tasks.view','tasks.manage','notes.view','notes.manage',
    'protocols.view','protocols.manage','audit.view','reports.view'
  )
on conflict do nothing;

-- it_admin: full IT scope, no tenant settings.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_key in (
    'tickets.comment_public','tickets.directory','tickets.attachments.view','tickets.attachments.upload',
    'tickets.attachments.manage','tickets.config','catalog.request',
    'notifications.view_own',
    'cmdb.view','cmdb.manage','ipam.view','ipam.manage',
    'tasks.view','tasks.manage','notes.view','notes.manage',
    'protocols.view','protocols.manage','audit.view','reports.view'
  )
where r.role_key = 'it_admin'
on conflict do nothing;

-- sd_lead: full service desk + read of ops/audit/reports.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_key in (
    'tickets.comment_public','tickets.directory','tickets.attachments.view','tickets.attachments.upload',
    'tickets.attachments.manage','tickets.config','catalog.request',
    'notifications.view_own',
    'cmdb.view','ipam.view','tasks.view','tasks.manage','notes.view','notes.manage',
    'protocols.view','reports.view'
  )
where r.role_key = 'sd_lead'
on conflict do nothing;

-- helpdesk: works the queue. Reads CMDB/IPAM/notes/protocols. No catalog mgmt.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_key in (
    'tickets.comment_public','tickets.directory','tickets.attachments.view','tickets.attachments.upload',
    'catalog.request','notifications.view_own',
    'cmdb.view','ipam.view','tasks.view','tasks.manage','notes.view','notes.manage',
    'protocols.view'
  )
where r.role_key = 'helpdesk'
on conflict do nothing;

-- technician: ops + tickets they're assigned to.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_key in (
    'tickets.comment_public','tickets.directory','tickets.attachments.view','tickets.attachments.upload',
    'tickets.view_all','tickets.view_internal','tickets.comment_internal',
    'tickets.resolve','tickets.assign',
    'catalog.request','notifications.view_own',
    'cmdb.view','cmdb.manage','ipam.view',
    'tasks.view','tasks.manage','notes.view','notes.manage','protocols.view'
  )
where r.role_key = 'technician'
on conflict do nothing;

-- network_admin: infra-focused. Full IPAM and CMDB; ticket queue access without
-- assignment or lifecycle permissions.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_key in (
    'tickets.comment_public','tickets.directory','tickets.attachments.view','tickets.attachments.upload',
    'tickets.view_all','tickets.view_internal','tickets.comment_internal',
    'catalog.request','notifications.view_own',
    'cmdb.view','cmdb.manage','ipam.view','ipam.manage',
    'tasks.view','tasks.manage','notes.view','notes.manage',
    'protocols.view','protocols.manage'
  )
where r.role_key = 'network_admin'
on conflict do nothing;

-- doc_editor: KB owner. Reads service desk, writes protocols/notes.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_key in (
    'tickets.comment_public','tickets.attachments.view','tickets.attachments.upload',
    'catalog.request','notifications.view_own',
    'cmdb.view','ipam.view','tasks.view',
    'notes.view','notes.manage','protocols.view','protocols.manage'
  )
where r.role_key = 'doc_editor'
on conflict do nothing;

-- employee: requester only. Catalog request + own notifications.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_key in (
    'catalog.request','notifications.view_own','tickets.comment_public',
    'tickets.attachments.view','tickets.attachments.upload'
  )
where r.role_key = 'employee'
on conflict do nothing;

-- platform_auditor: read-only platform coverage.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_key in (
    'notifications.view_own','tickets.attachments.view',
    'cmdb.view','ipam.view','tasks.view','notes.view','protocols.view',
    'audit.view','reports.view'
  )
where r.role_key = 'platform_auditor'
on conflict do nothing;


-- ------------------------------------------------------------
-- 4. SCOPED SERVICE DESK PROFILE DIRECTORY
-- ------------------------------------------------------------
-- Bypasses profile RLS only after an explicit Service Desk permission check.
-- The returned rows contain no email or other private profile attributes, and
-- only users who hold tickets.assign are exposed as assignment candidates.
create or replace function public.list_service_desk_profiles()
returns table (
  id uuid,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.has_permission('tickets.directory') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  return query
  select profiles.id,
         coalesce(nullif(btrim(profiles.display_name), ''), left(profiles.id::text, 8))
    from public.profiles
   where exists (
     select 1
       from public.user_global_roles
       join public.roles
         on roles.id = user_global_roles.role_id
       join public.role_permissions
         on role_permissions.role_id = roles.id
       join public.permissions
         on permissions.id = role_permissions.permission_id
      where user_global_roles.user_id = profiles.id
        and roles.role_scope = 'platform'
        and permissions.permission_key = 'tickets.assign'
   )
   order by 2, 1;
end;
$$;

revoke all on function public.list_service_desk_profiles() from public;
grant execute on function public.list_service_desk_profiles() to authenticated;

commit;
