-- ============================================================
-- QA — Service Desk RBAC Expansion (Phase A — Batch 2/6)
-- ------------------------------------------------------------
-- DRAFT — NOT YET APPLIED. Runs in a single transaction and
-- ROLLBACKs at the end so the database state is unchanged.
--
-- Covered:
--   * All new roles exist with role_scope='platform'
--   * All new permission keys exist
--   * Role -> permission mappings match the IT-only V1 matrix
--   * Employee role is strictly limited to requester scope
--   * platform_auditor remains read-only (no .manage / .resolve / .assign)
-- ============================================================

begin;

-- ---- Roles exist ----
do $$
declare missing text;
begin
  select string_agg(rk, ', ') into missing
  from unnest(array['employee','technician','network_admin','doc_editor']) as rk
  where not exists (
    select 1 from public.roles
    where role_key = rk and role_scope = 'platform'
  );
  if missing is not null then
    raise exception 'Missing platform roles: %', missing;
  end if;
end$$;

-- ---- Permissions exist ----
do $$
declare missing text;
begin
  select string_agg(pk, ', ') into missing
  from unnest(array[
    'tickets.comment_public','tickets.attachments.view','tickets.attachments.upload',
    'tickets.attachments.manage','tickets.config','catalog.request',
    'notifications.view_own',
    'cmdb.view','cmdb.manage','ipam.view','ipam.manage',
    'tasks.view','tasks.manage','notes.view','notes.manage',
    'protocols.view','protocols.manage','audit.view','reports.view'
  ]) as pk
  where not exists (
    select 1 from public.permissions where permission_key = pk
  );
  if missing is not null then
    raise exception 'Missing permission keys: %', missing;
  end if;
end$$;

-- ---- Helper view for assertions ----
create temporary view qa_role_perm as
select r.role_key, p.permission_key
from public.role_permissions rp
join public.roles r       on r.id = rp.role_id
join public.permissions p on p.id = rp.permission_id;

-- ---- employee: must NOT have any agent permissions ----
do $$
declare bad text;
begin
  select string_agg(permission_key, ', ') into bad
  from qa_role_perm
  where role_key = 'employee'
    and permission_key in (
      'tickets.view_all','tickets.view_internal','tickets.comment_internal',
      'tickets.assign','tickets.resolve','catalog.manage','tickets.config',
      'cmdb.manage','ipam.manage','audit.view','reports.view'
    );
  if bad is not null then
    raise exception 'Employee role unexpectedly has agent perms: %', bad;
  end if;
end$$;

-- ---- employee: must HAVE requester permissions ----
do $$
declare missing text;
begin
  select string_agg(pk, ', ') into missing
  from unnest(array[
    'catalog.request','notifications.view_own','tickets.comment_public',
    'tickets.attachments.view','tickets.attachments.upload'
  ]) as pk
  where not exists (
    select 1 from qa_role_perm
    where role_key = 'employee' and permission_key = pk
  );
  if missing is not null then
    raise exception 'Employee missing required perms: %', missing;
  end if;
end$$;

-- ---- platform_auditor stays read-only ----
do $$
declare bad text;
begin
  select string_agg(permission_key, ', ') into bad
  from qa_role_perm
  where role_key = 'platform_auditor'
    and permission_key in (
      'tickets.assign','tickets.resolve','tickets.comment_internal',
      'tickets.comment_public','catalog.manage','catalog.request',
      'cmdb.manage','ipam.manage','tasks.manage','notes.manage','protocols.manage',
      'tickets.config','tickets.attachments.upload','tickets.attachments.manage'
    );
  if bad is not null then
    raise exception 'platform_auditor must stay read-only, has: %', bad;
  end if;
end$$;

-- ---- it_admin / sd_lead get tickets.config ----
do $$
begin
  if not exists (select 1 from qa_role_perm where role_key='it_admin'   and permission_key='tickets.config')
  or not exists (select 1 from qa_role_perm where role_key='sd_lead'    and permission_key='tickets.config') then
    raise exception 'tickets.config missing on it_admin or sd_lead';
  end if;
end$$;

-- ---- network_admin owns IPAM ----
do $$
begin
  if not exists (select 1 from qa_role_perm where role_key='network_admin' and permission_key='ipam.manage') then
    raise exception 'network_admin missing ipam.manage';
  end if;
end$$;

-- ---- doc_editor: no ticket internal, has protocols.manage ----
do $$
begin
  if exists (select 1 from qa_role_perm where role_key='doc_editor' and permission_key='tickets.view_internal') then
    raise exception 'doc_editor must not see ticket internal notes';
  end if;
  if not exists (select 1 from qa_role_perm where role_key='doc_editor' and permission_key='protocols.manage') then
    raise exception 'doc_editor missing protocols.manage';
  end if;
end$$;

rollback;
