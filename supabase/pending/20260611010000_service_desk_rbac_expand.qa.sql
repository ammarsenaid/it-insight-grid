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
--   * network_admin cannot assign or resolve, alone or combined with auditor
--   * Scoped profile directory role access, minimal fields, and assignee filtering
--   * Public-comment insertion requires tickets.comment_public for every role
--   * Internal-note insertion remains separately protected
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
    'tickets.comment_public','tickets.directory','tickets.attachments.view','tickets.attachments.upload',
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
      'tickets.assign','tickets.resolve','tickets.directory','catalog.manage','tickets.config',
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
      'tickets.comment_public','tickets.directory','catalog.manage','catalog.request',
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
  if exists (
    select 1 from qa_role_perm
    where role_key = 'network_admin'
      and permission_key in ('tickets.assign', 'tickets.resolve')
  ) then
    raise exception 'network_admin must not assign or resolve tickets';
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
  if exists (select 1 from qa_role_perm where role_key='doc_editor' and permission_key='tickets.directory') then
    raise exception 'doc_editor must not read the Service Desk profile directory';
  end if;
end$$;

-- ---- ticket comment authorization fixtures ----
insert into auth.users (id, email, instance_id, aud, role,
                        encrypted_password, email_confirmed_at,
                        created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000b1', 'qa-requester@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b2', 'qa-employee-comment@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b3', 'qa-helpdesk-comment@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b4', 'qa-technician-comment@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b5', 'qa-auditor-comment@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b6', 'qa-lead-comment@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b7', 'qa-admin-comment@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b8', 'qa-network-admin@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b9', 'qa-network-auditor@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, email, display_name)
values
  ('00000000-0000-0000-0000-0000000000b1', 'qa-requester@example.com', 'QA Requester'),
  ('00000000-0000-0000-0000-0000000000b2', 'qa-employee-comment@example.com', 'QA Employee Comment'),
  ('00000000-0000-0000-0000-0000000000b3', 'qa-helpdesk-comment@example.com', 'QA Helpdesk Comment'),
  ('00000000-0000-0000-0000-0000000000b4', 'qa-technician-comment@example.com', 'QA Technician Comment'),
  ('00000000-0000-0000-0000-0000000000b5', 'qa-auditor-comment@example.com', 'QA Auditor Comment'),
  ('00000000-0000-0000-0000-0000000000b6', 'qa-lead-comment@example.com', 'QA Lead Comment'),
  ('00000000-0000-0000-0000-0000000000b7', 'qa-admin-comment@example.com', 'QA Admin Comment'),
  ('00000000-0000-0000-0000-0000000000b8', 'qa-network-admin@example.com', 'QA Network Admin'),
  ('00000000-0000-0000-0000-0000000000b9', 'qa-network-auditor@example.com', 'QA Network Admin Auditor')
on conflict (id) do nothing;

insert into public.user_global_roles (user_id, role_id)
select fixture.user_id, roles.id
from (values
  ('00000000-0000-0000-0000-0000000000b2'::uuid, 'employee'),
  ('00000000-0000-0000-0000-0000000000b3'::uuid, 'helpdesk'),
  ('00000000-0000-0000-0000-0000000000b4'::uuid, 'technician'),
  ('00000000-0000-0000-0000-0000000000b5'::uuid, 'platform_auditor'),
  ('00000000-0000-0000-0000-0000000000b6'::uuid, 'sd_lead'),
  ('00000000-0000-0000-0000-0000000000b7'::uuid, 'it_admin'),
  ('00000000-0000-0000-0000-0000000000b8'::uuid, 'network_admin'),
  ('00000000-0000-0000-0000-0000000000b9'::uuid, 'network_admin'),
  ('00000000-0000-0000-0000-0000000000b9'::uuid, 'platform_auditor')
) as fixture(user_id, role_key)
join public.roles on roles.role_key = fixture.role_key
on conflict do nothing;

-- ---- scoped Service Desk profile directory ----
-- Queue operators may resolve assignment-safe names across users without
-- receiving direct cross-user profile access or private profile columns.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}',
  true);

do $$
declare
  visible_ids uuid[];
  exposed_keys text[];
  direct_cross_user_rows integer;
begin
  select array_agg(directory.id order by directory.id)
    into visible_ids
    from public.list_service_desk_profiles() as directory
   where directory.id between
         '00000000-0000-0000-0000-0000000000b1'::uuid and
         '00000000-0000-0000-0000-0000000000b9'::uuid;

  assert visible_ids = array[
    '00000000-0000-0000-0000-0000000000b3'::uuid,
    '00000000-0000-0000-0000-0000000000b4'::uuid,
    '00000000-0000-0000-0000-0000000000b6'::uuid,
    '00000000-0000-0000-0000-0000000000b7'::uuid
  ], 'Directory MUST return only assignment-capable Service Desk profiles';

  select array_agg(exposed.key_name order by exposed.key_name)
    into exposed_keys
    from (
      select * from public.list_service_desk_profiles() limit 1
    ) as directory
    cross join lateral jsonb_object_keys(to_jsonb(directory)) as exposed(key_name);

  assert exposed_keys = array['display_name', 'id'],
    'Directory MUST expose only id and display_name';

  select count(*)
    into direct_cross_user_rows
    from public.profiles
   where id = '00000000-0000-0000-0000-0000000000b4';

  assert direct_cross_user_rows = 0,
    'Directory permission MUST NOT broaden direct cross-user profile SELECT';
end$$;

-- Every approved directory caller receives the same assignment-safe contract.
do $$
declare
  caller_id uuid;
  visible integer;
begin
  foreach caller_id in array array[
    '00000000-0000-0000-0000-0000000000b4'::uuid,
    '00000000-0000-0000-0000-0000000000b6'::uuid,
    '00000000-0000-0000-0000-0000000000b7'::uuid,
    '00000000-0000-0000-0000-0000000000b8'::uuid
  ] loop
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', caller_id, 'role', 'authenticated')::text,
      true);
    select count(*)
      into visible
      from public.list_service_desk_profiles() as directory
     where directory.id between
           '00000000-0000-0000-0000-0000000000b1'::uuid and
           '00000000-0000-0000-0000-0000000000b9'::uuid;
    assert visible = 4,
      format('Approved directory caller %s received %s rows', caller_id, visible);
  end loop;
end$$;

-- Read-only auditors and requester employees cannot invoke the directory.
do $$
declare
  caller_id uuid;
  blocked boolean;
begin
  foreach caller_id in array array[
    '00000000-0000-0000-0000-0000000000b2'::uuid,
    '00000000-0000-0000-0000-0000000000b5'::uuid
  ] loop
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', caller_id, 'role', 'authenticated')::text,
      true);
    blocked := false;
    begin
      perform public.list_service_desk_profiles();
    exception when insufficient_privilege then
      blocked := true;
    end;
    assert blocked,
      format('Unauthorized directory caller %s MUST be rejected', caller_id);
  end loop;
end$$;

-- network_admin keeps queue visibility but cannot assign or resolve, even when
-- its permissions are combined additively with platform_auditor.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b8","role":"authenticated"}',
  true);

do $$
begin
  assert public.has_permission('tickets.view_all'),
    'network_admin MUST retain ticket queue visibility';
  assert not public.has_permission('tickets.assign'),
    'network_admin MUST NOT assign tickets';
  assert not public.has_permission('tickets.resolve'),
    'network_admin MUST NOT resolve tickets';
end$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b9","role":"authenticated"}',
  true);

do $$
begin
  assert public.has_permission('tickets.view_all'),
    'network_admin + platform_auditor MUST retain ticket queue visibility';
  assert public.has_permission('audit.view'),
    'network_admin + platform_auditor MUST retain auditor read access';
  assert not public.has_permission('tickets.assign'),
    'network_admin + platform_auditor MUST NOT assign tickets';
  assert not public.has_permission('tickets.resolve'),
    'network_admin + platform_auditor MUST NOT resolve tickets';
end$$;

-- Privileged QA fixture setup: browser-side authenticated INSERT is revoked.
reset role;

insert into public.tickets (id, requester_id, subject, description)
values
  ('00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000b1',
   'QA requester comment permission', 'Owned by the unroled requester.'),
  ('00000000-0000-0000-0000-0000000000d2',
   '00000000-0000-0000-0000-0000000000b2',
   'QA employee comment permission', 'Owned by the employee role user.')
on conflict (id) do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b8","role":"authenticated"}',
  true);

do $$
declare
  assignment_blocked boolean := false;
  resolution_blocked boolean := false;
begin
  begin
    perform public.update_ticket(
      '00000000-0000-0000-0000-0000000000d1',
      jsonb_build_object('assignee_id', '00000000-0000-0000-0000-0000000000b8')
    );
  exception when insufficient_privilege then
    assignment_blocked := true;
  end;

  begin
    perform public.update_ticket(
      '00000000-0000-0000-0000-0000000000d1',
      jsonb_build_object('status', 'resolved')
    );
  exception when insufficient_privilege then
    resolution_blocked := true;
  end;

  assert assignment_blocked,
    'network_admin update_ticket assignment MUST be rejected';
  assert resolution_blocked,
    'network_admin update_ticket resolution MUST be rejected';
end$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b9","role":"authenticated"}',
  true);

do $$
declare
  assignment_blocked boolean := false;
  resolution_blocked boolean := false;
begin
  begin
    perform public.update_ticket(
      '00000000-0000-0000-0000-0000000000d1',
      jsonb_build_object('assignee_id', '00000000-0000-0000-0000-0000000000b9')
    );
  exception when insufficient_privilege then
    assignment_blocked := true;
  end;

  begin
    perform public.update_ticket(
      '00000000-0000-0000-0000-0000000000d1',
      jsonb_build_object('status', 'resolved')
    );
  exception when insufficient_privilege then
    resolution_blocked := true;
  end;

  assert assignment_blocked,
    'network_admin + platform_auditor update_ticket assignment MUST be rejected';
  assert resolution_blocked,
    'network_admin + platform_auditor update_ticket resolution MUST be rejected';
end$$;

-- Requester: visibility alone does not authorize a public comment.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}',
  true);

do $$
declare blocked boolean := false;
begin
  assert exists (
    select 1
    from public.tickets
    where id = '00000000-0000-0000-0000-0000000000d1'
  ), 'Requester fixture MUST be visible to its owner';

  begin
    insert into public.ticket_comments (ticket_id, author_id, body, internal)
    values ('00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000b1',
            'Requester without permission', false);
  exception when insufficient_privilege then
    blocked := true;
  end;
  assert blocked,
    'Requester without tickets.comment_public MUST NOT insert a public comment';
end$$;

-- Employee: the explicitly mapped requester role may comment on its own ticket.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}',
  true);

insert into public.ticket_comments (ticket_id, author_id, body, internal)
values ('00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-0000000000b2',
        'Employee public comment', false);

-- Employee permission does not bypass ticket visibility or author binding.
do $$
declare
  foreign_blocked boolean := false;
  spoof_blocked boolean := false;
begin
  begin
    insert into public.ticket_comments (ticket_id, author_id, body, internal)
    values ('00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000b2',
            'Foreign ticket comment', false);
  exception when insufficient_privilege then
    foreign_blocked := true;
  end;

  begin
    insert into public.ticket_comments (ticket_id, author_id, body, internal)
    values ('00000000-0000-0000-0000-0000000000d2',
            '00000000-0000-0000-0000-0000000000b1',
            'Spoofed author comment', false);
  exception when insufficient_privilege then
    spoof_blocked := true;
  end;

  assert foreign_blocked,
    'tickets.comment_public MUST NOT bypass ticket visibility';
  assert spoof_blocked,
    'Public-comment insertion MUST bind author_id to auth.uid()';
end$$;

-- Queue-writing roles may post public comments on visible tickets.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
insert into public.ticket_comments (ticket_id, author_id, body, internal)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000b3', 'Helpdesk public comment', false);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
insert into public.ticket_comments (ticket_id, author_id, body, internal)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000b4', 'Technician public comment', false);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', true);
insert into public.ticket_comments (ticket_id, author_id, body, internal)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000b6', 'Lead public comment', false);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b7","role":"authenticated"}', true);
insert into public.ticket_comments (ticket_id, author_id, body, internal)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000b7', 'Admin public comment', false);

-- Auditor: read-only ticket visibility must not authorize either comment type.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b5","role":"authenticated"}',
  true);

do $$
declare
  public_blocked boolean := false;
  internal_blocked boolean := false;
begin
  assert exists (
    select 1
    from public.tickets
    where id = '00000000-0000-0000-0000-0000000000d1'
  ), 'platform_auditor MUST retain read-only ticket visibility';

  begin
    insert into public.ticket_comments (ticket_id, author_id, body, internal)
    values ('00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000b5',
            'Auditor public comment', false);
  exception when insufficient_privilege then
    public_blocked := true;
  end;

  begin
    insert into public.ticket_comments (ticket_id, author_id, body, internal)
    values ('00000000-0000-0000-0000-0000000000d1',
            '00000000-0000-0000-0000-0000000000b5',
            'Auditor internal note', true);
  exception when insufficient_privilege then
    internal_blocked := true;
  end;

  assert public_blocked,
    'platform_auditor MUST NOT insert public comments';
  assert internal_blocked,
    'platform_auditor MUST NOT insert internal notes';
end$$;

-- Internal notes remain independently authorized by tickets.comment_internal.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
insert into public.ticket_comments (ticket_id, author_id, body, internal)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000b3', 'Helpdesk internal note', true);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}',
  true);

do $$
declare blocked boolean := false;
begin
  begin
    insert into public.ticket_comments (ticket_id, author_id, body, internal)
    values ('00000000-0000-0000-0000-0000000000d2',
            '00000000-0000-0000-0000-0000000000b2',
            'Employee internal note', true);
  exception when insufficient_privilege then
    blocked := true;
  end;
  assert blocked,
    'tickets.comment_public MUST NOT authorize internal notes';
end$$;

-- Anonymous callers have no table privilege regardless of row contents.
reset role;
reset "request.jwt.claims";
set local role anon;

do $$
declare blocked boolean := false;
begin
  begin
    insert into public.ticket_comments (ticket_id, author_id, body, internal)
    values ('00000000-0000-0000-0000-0000000000d1', null,
            'Anonymous public comment', false);
  exception when insufficient_privilege then
    blocked := true;
  end;
  assert blocked,
    'Anonymous callers MUST NOT insert ticket comments';
end$$;

reset role;
reset "request.jwt.claims";

rollback;
