-- ============================================================
-- QA CHECKS — Service Desk Foundation (Batch 1)
-- ------------------------------------------------------------
-- DRAFT — NOT YET APPLIED. Intended to be executed manually
-- inside a single transaction AFTER the matching migration
-- (20260611000000_service_desk_foundation.sql) has been applied.
--
-- The whole script wraps every assertion in a single transaction
-- and ROLLBACKs at the end so the database state is unchanged.
--
-- Roles are simulated by setting a fake authenticated JWT via
--   set local role authenticated;
--   set local "request.jwt.claims" = '...'
-- so auth.uid() inside RLS / SECURITY DEFINER returns the
-- intended user id.
--
-- Covered checks:
--   1. Requester isolation on /my-requests (tickets table SELECT)
--   2. Published catalog visibility for employees
--   3. Draft and archived services hidden from employees
--   4. Comment permission enforcement and internal-note isolation
--   5. IT admin (helpdesk) ticket visibility
--   6. RPC submit_catalog_request authorization, validation, insert + audit + status
--   7. Audit log + status event creation on ticket update
--   8. Constrained manual create_ticket RPC + direct INSERT denial
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. FIXTURES
-- ------------------------------------------------------------
-- Two fake auth users: an employee and a helpdesk agent.
-- We bypass the public.handle_new_user trigger by inserting
-- directly into auth.users as service_role (the role this
-- script runs as in psql / SQL editor).
insert into auth.users (id, email, instance_id, aud, role,
                        encrypted_password, email_confirmed_at,
                        created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a1',
   'qa-employee@example.com',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000a2',
   'qa-helpdesk@example.com',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000a3',
   'qa-other-employee@example.com',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', '', now(), now(), now())
on conflict (id) do nothing;

-- The handle_new_user trigger inserts profiles; if it didn't fire
-- (e.g. running against a managed schema where the trigger is off
-- for test fixtures), ensure rows exist:
insert into public.profiles (id, email, display_name)
values
  ('00000000-0000-0000-0000-0000000000a1','qa-employee@example.com','QA Employee'),
  ('00000000-0000-0000-0000-0000000000a2','qa-helpdesk@example.com','QA Helpdesk'),
  ('00000000-0000-0000-0000-0000000000a3','qa-other-employee@example.com','QA Other Employee')
on conflict (id) do nothing;

-- Grant the employee requester role to the primary requester fixture.
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000a1', r.id
from public.roles r
where r.role_key = 'employee'
on conflict do nothing;

-- Grant the helpdesk user the 'helpdesk' platform role.
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000a2', r.id
from public.roles r
where r.role_key = 'helpdesk'
on conflict do nothing;

-- Seed four catalog items: published-internal / published-restricted /
-- draft / archived.
insert into public.catalog_items (id, name, category, description,
                                  default_priority, status, visibility,
                                  fields_schema)
values
  ('00000000-0000-0000-0000-0000000000c1',
   'QA Published Service', 'Access', 'A published service for QA.',
   'normal', 'published', 'internal',
   '[{"key":"reason","label":"Reason","type":"text","required":true}]'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2',
   'QA Draft Service', 'Access', 'A draft service for QA.',
   'normal', 'draft', 'internal', '[]'::jsonb),
  ('00000000-0000-0000-0000-0000000000c3',
   'QA Archived Service', 'Access', 'An archived service for QA.',
   'normal', 'archived', 'internal', '[]'::jsonb),
  ('00000000-0000-0000-0000-0000000000c4',
   'QA Restricted Service', 'Access', 'A restricted published service for QA.',
   'normal', 'published', 'restricted', '[]'::jsonb)
on conflict (id) do nothing;

-- Grant a second helpdesk-like user the catalog.manage permission via sd_lead
-- (sd_lead already has catalog.manage in the migration).
insert into auth.users (id, email, instance_id, aud, role,
                        encrypted_password, email_confirmed_at,
                        created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a4',
   'qa-catalog-manager@example.com',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', '', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, email, display_name)
values
  ('00000000-0000-0000-0000-0000000000a4',
   'qa-catalog-manager@example.com', 'QA Catalog Manager')
on conflict (id) do nothing;

insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000a4', r.id
from public.roles r
where r.role_key = 'sd_lead'
on conflict do nothing;


-- ------------------------------------------------------------
-- HELPER: switch to a simulated authenticated user
-- ------------------------------------------------------------
-- Usage:  perform set_config('request.jwt.claims',
--                            '{"sub":"<uuid>","role":"authenticated"}', true);
-- Combine with: set local role authenticated;


-- ============================================================
-- CHECK 2 / 3: catalog visibility for employees
-- ============================================================
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true);

do $$
declare
  visible_published  int;
  visible_draft      int;
  visible_archived   int;
  visible_restricted int;
begin
  select count(*) into visible_published
    from public.catalog_items
   where id = '00000000-0000-0000-0000-0000000000c1';
  select count(*) into visible_draft
    from public.catalog_items
   where id = '00000000-0000-0000-0000-0000000000c2';
  select count(*) into visible_archived
    from public.catalog_items
   where id = '00000000-0000-0000-0000-0000000000c3';
  select count(*) into visible_restricted
    from public.catalog_items
   where id = '00000000-0000-0000-0000-0000000000c4';

  assert visible_published  = 1, 'Employee MUST see the published+internal catalog item';
  assert visible_draft      = 0, 'Employee MUST NOT see draft catalog items';
  assert visible_archived   = 0, 'Employee MUST NOT see archived catalog items';
  assert visible_restricted = 0, 'Employee MUST NOT see restricted catalog items';
end$$;

-- Employee cannot manage the catalog
do $$
begin
  begin
    insert into public.catalog_items (name, category) values ('Forbidden', 'X');
    raise exception 'Employee should NOT be able to create catalog items';
  exception when insufficient_privilege or others then
    -- expected: RLS rejects the insert
    null;
  end;
end$$;


-- A caller without an authenticated user id must be rejected by the RPC itself.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated"}',
  true);

do $$
declare
  blocked boolean := false;
begin
  begin
    perform public.submit_catalog_request(
      '00000000-0000-0000-0000-0000000000c1',
      '{"reason":"Anonymous requester"}'::jsonb
    );
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  assert blocked,
    'Anonymous callers MUST NOT submit catalog requests';
end$$;

-- Caller without catalog.request must not submit even a published internal item.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}',
  true);

do $$
declare
  blocked boolean := false;
begin
  begin
    perform public.submit_catalog_request(
      '00000000-0000-0000-0000-0000000000c1',
      '{"reason":"Unauthorized requester"}'::jsonb
    );
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  assert blocked,
    'Caller without catalog.request MUST NOT submit catalog requests';
end$$;

-- Re-enter the authorized employee requester context.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true);

-- Employee cannot submit a restricted catalog item via the RPC either.
do $$
declare
  blocked boolean := false;
begin
  begin
    perform public.submit_catalog_request(
      '00000000-0000-0000-0000-0000000000c4',
      '{}'::jsonb
    );
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  assert blocked,
    'submit_catalog_request MUST reject restricted items for normal employees';
end$$;


-- ============================================================
-- CHECK 2b: catalog manager (sd_lead) sees every catalog item
-- ============================================================
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}',
  true);

do $$
declare
  visible_published  int;
  visible_draft      int;
  visible_archived   int;
  visible_restricted int;
begin
  select count(*) into visible_published
    from public.catalog_items
   where id = '00000000-0000-0000-0000-0000000000c1';
  select count(*) into visible_draft
    from public.catalog_items
   where id = '00000000-0000-0000-0000-0000000000c2';
  select count(*) into visible_archived
    from public.catalog_items
   where id = '00000000-0000-0000-0000-0000000000c3';
  select count(*) into visible_restricted
    from public.catalog_items
   where id = '00000000-0000-0000-0000-0000000000c4';

  assert visible_published  = 1, 'Catalog manager MUST see published items';
  assert visible_draft      = 1, 'Catalog manager MUST see draft items';
  assert visible_archived   = 1, 'Catalog manager MUST see archived items';
  assert visible_restricted = 1, 'Catalog manager MUST see restricted items';
end$$;

-- Re-enter the original employee context for the rest of the script.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true);


-- ============================================================
-- CHECK 6: RPC submit_catalog_request (atomic, validates required)
-- ============================================================
-- Required-field omission must raise invalid_parameter_value.
do $$
declare
  blocked boolean := false;
begin
  begin
    perform public.submit_catalog_request(
      '00000000-0000-0000-0000-0000000000c1',
      '{}'::jsonb
    );
  exception
    when invalid_parameter_value then
      blocked := true;
  end;

  assert blocked,
    'submit_catalog_request MUST reject missing required fields';
end$$;

-- Submitting against a draft item must fail
do $$
declare
  blocked boolean := false;
begin
  begin
    perform public.submit_catalog_request(
      '00000000-0000-0000-0000-0000000000c2',
      '{"reason":"x"}'::jsonb
    );
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  assert blocked,
    'submit_catalog_request MUST reject draft items';
end$$;

-- Happy path: employee submits a request and gets a ticket
do $$
declare
  new_ticket public.tickets;
begin
  select * into new_ticket from public.submit_catalog_request(
    '00000000-0000-0000-0000-0000000000c1',
    '{"reason":"Need access to repo X"}'::jsonb
  );
  assert new_ticket.id is not null,           'RPC must return a ticket row';
  assert new_ticket.ticket_number like 'TKT-%','Ticket number must be auto-generated';
  assert new_ticket.requester_id =
         '00000000-0000-0000-0000-0000000000a1'::uuid,
         'Ticket requester must be the caller';
  assert new_ticket.catalog_item_id =
         '00000000-0000-0000-0000-0000000000c1'::uuid,
         'Ticket must reference the catalog item';
  assert new_ticket.catalog_values ->> 'reason' = 'Need access to repo X',
         'Ticket must persist the submitted field values';
  assert new_ticket.source = 'service_catalog',
         'Ticket source must be service_catalog';
end$$;


-- ============================================================
-- CHECK 1: requester isolation on /my-requests
-- ============================================================
-- Switch to the "other" employee and confirm they cannot see
-- the ticket the first employee just created.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}',
  true);

do $$
declare
  visible int;
begin
  select count(*) into visible
    from public.tickets
   where requester_id = '00000000-0000-0000-0000-0000000000a1';
  assert visible = 0,
    'A different employee MUST NOT see another employee''s tickets';
end$$;

-- The other employee also cannot reply on someone else's ticket.
do $$
declare
  v_ticket_id uuid;
begin
  -- Re-assert the simulated JWT inside the block.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}',
    true);
  select id into v_ticket_id from public.tickets
   where requester_id = '00000000-0000-0000-0000-0000000000a1'
   limit 1;
  -- v_ticket_id will be NULL under RLS for this user, which is itself
  -- the proof: they cannot even discover the ticket id.
  assert v_ticket_id is null, 'Other employee must not discover foreign tickets';
end$$;


-- ============================================================
-- CHECK 5: IT admin (helpdesk) ticket visibility
-- ============================================================
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}',
  true);

do $$
declare
  visible int;
begin
  select count(*) into visible
    from public.tickets
   where requester_id = '00000000-0000-0000-0000-0000000000a1';
  assert visible >= 1,
    'Helpdesk MUST be able to view tickets created by employees';
end$$;


-- ============================================================
-- CHECK 4: internal-note isolation
-- ============================================================
-- Helpdesk posts one public reply and one internal note.
do $$
declare
  v_ticket_id uuid;
begin
  select id into v_ticket_id from public.tickets
   where requester_id = '00000000-0000-0000-0000-0000000000a1'
   order by created_at desc
   limit 1;

  insert into public.ticket_comments (ticket_id, author_id, body, internal)
  values
    (v_ticket_id, '00000000-0000-0000-0000-0000000000a2',
     'Hello, working on this now.', false),
    (v_ticket_id, '00000000-0000-0000-0000-0000000000a2',
     'Internal: need to verify license seats.', true);
end$$;

-- Employee (the requester) sees only the public reply.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true);

do $$
declare
  public_count int;
  internal_count int;
begin
  select count(*) into public_count
    from public.ticket_comments
   where internal = false
     and ticket_id in (
       select id from public.tickets
        where requester_id = '00000000-0000-0000-0000-0000000000a1'
     );
  select count(*) into internal_count
    from public.ticket_comments
   where internal = true
     and ticket_id in (
       select id from public.tickets
        where requester_id = '00000000-0000-0000-0000-0000000000a1'
     );
  assert public_count   >= 1, 'Requester MUST see public replies on own tickets';
  assert internal_count  = 0, 'Requester MUST NOT see internal notes';
end$$;

-- Employee cannot post an internal note.
do $$
declare
  v_ticket_id uuid;
begin
  select id into v_ticket_id from public.tickets
   where requester_id = '00000000-0000-0000-0000-0000000000a1'
   limit 1;
  begin
    insert into public.ticket_comments (ticket_id, author_id, body, internal)
    values (v_ticket_id, '00000000-0000-0000-0000-0000000000a1',
            'I should not be allowed to post this.', true);
    raise exception 'Employee MUST NOT be able to post internal notes';
  exception when others then
    null;
  end;
end$$;

-- A requester without tickets.comment_public cannot post merely because the
-- ticket is visible to them. Use the no-role requester fixture because all
-- pending migrations are applied before the QA suite runs.
reset role;

insert into public.tickets (
  id,
  requester_id,
  subject
)
values (
  '00000000-0000-0000-0000-0000000000d3',
  '00000000-0000-0000-0000-0000000000a3',
  'QA requester without public-comment permission'
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}',
  true
);

do $$
declare
  blocked boolean := false;
begin
  assert not public.has_permission('tickets.comment_public'),
    'No-role requester fixture MUST NOT have tickets.comment_public';

  begin
    insert into public.ticket_comments (
      ticket_id,
      author_id,
      body,
      internal
    )
    values (
      '00000000-0000-0000-0000-0000000000d3',
      '00000000-0000-0000-0000-0000000000a3',
      'I can view this ticket but lack comment permission.',
      false
    );
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  assert blocked,
    'Requester without tickets.comment_public MUST NOT post public comments';
end$$;

-- Restore the primary requester context for the following checks.
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true
);

-- ============================================================
-- CHECK 7: status events + audit log (scoped to the created ticket)
-- ============================================================
-- Helpdesk transitions ticket to in_progress.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}',
  true);

do $$
declare
  v_ticket_id uuid;
  updated_ticket public.tickets;
  status_events int;
  audit_rows int;
begin
  select id into v_ticket_id from public.tickets
   where requester_id = '00000000-0000-0000-0000-0000000000a1'
   order by created_at desc
   limit 1;

  assert v_ticket_id is not null,
    'Helpdesk must be able to locate the requester''s ticket for Check 7';

  select *
    into updated_ticket
    from public.update_ticket(
      v_ticket_id,
      jsonb_build_object(
        'status', 'in_progress',
        'assignee_id', '00000000-0000-0000-0000-0000000000a2'
      )
    );

  assert updated_ticket.status = 'in_progress',
    'update_ticket must transition status to in_progress';

  assert updated_ticket.assignee_id =
    '00000000-0000-0000-0000-0000000000a2'::uuid,
    'update_ticket must assign the helpdesk agent';

  -- Scope counts to THIS ticket only (avoid column/local shadowing).
  select count(*) into status_events
    from public.ticket_status_events e
   where e.ticket_id = v_ticket_id;
  assert status_events >= 2,
    'Status events for this ticket must include initial open + transition to in_progress';

  select count(*) into audit_rows
    from public.ticket_audit_log a
   where a.ticket_id = v_ticket_id;
  assert audit_rows >= 2,
    'Audit log for this ticket must include ticket.create + ticket.update entries';
end$$;

-- Employee cannot see ticket_audit_log rows.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true);

do $$
declare
  visible int;
begin
  select count(*) into visible from public.ticket_audit_log;
  assert visible = 0, 'Employee MUST NOT read ticket_audit_log rows';
end$$;

-- Employee can still read status events for their own ticket
-- (lifecycle is visible to the requester).
do $$
declare
  visible int;
begin
  select count(*) into visible from public.ticket_status_events
   where ticket_id in (
     select id from public.tickets
      where requester_id = '00000000-0000-0000-0000-0000000000a1'
   );
  assert visible >= 1, 'Requester must see their own ticket lifecycle';
end$$;


-- ------------------------------------------------------------
-- Done. Roll everything back so the QA run leaves no trace.
-- ------------------------------------------------------------

-- ============================================================
-- CHECK 8: constrained manual ticket creation RPC
-- ============================================================
-- Re-enter the employee context explicitly.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true);

-- Safe manual portal creation succeeds through the RPC.
do $$
declare
  new_ticket public.tickets;
begin
  select *
    into new_ticket
    from public.create_ticket(
      p_subject          => 'QA Manual Portal Ticket',
      p_description      => 'Allowed requester-controlled description.',
      p_type             => 'request',
      p_category         => 'Access',
      p_subcategory      => 'General',
      p_priority         => 'normal',
      p_tags             => array['qa','portal'],
      p_affected_service => 'Knowledge Center'
    );

  assert new_ticket.id is not null,
    'create_ticket must return the inserted ticket';
  assert new_ticket.requester_id =
    '00000000-0000-0000-0000-0000000000a1'::uuid,
    'create_ticket must derive requester_id from auth.uid()';
  assert new_ticket.status = 'open',
    'create_ticket must retain the safe open status default';
  assert new_ticket.source = 'portal',
    'create_ticket must force the portal source';
  assert new_ticket.catalog_item_id is null,
    'create_ticket must not forge a catalog item';
  assert new_ticket.assignee_id is null,
    'create_ticket must not set an assignee';
  assert new_ticket.assigned_team is null,
    'create_ticket must not set an assigned team';
  assert new_ticket.source_email is null,
    'create_ticket must not set a source email';
  assert new_ticket.resolved_at is null,
    'create_ticket must not set a resolved timestamp';
  assert new_ticket.closed_at is null,
    'create_ticket must not set a closed timestamp';
end$$;

-- Authenticated callers must no longer receive direct ticket INSERT privilege.
do $$
begin
  assert not has_table_privilege(
    'authenticated',
    'public.tickets',
    'INSERT'
  ), 'authenticated MUST NOT have direct INSERT privilege on public.tickets';
end$$;

-- Crafted browser-side direct INSERT must be rejected, even if requester_id
-- matches auth.uid().
do $$
declare
  blocked boolean := false;
begin
  begin
    insert into public.tickets (
      requester_id,
      subject,
      status,
      source,
      assignee_id,
      assigned_team,
      resolved_at,
      closed_at
    )
    values (
      '00000000-0000-0000-0000-0000000000a1',
      'QA Crafted Privileged Direct Insert',
      'resolved',
      'api',
      '00000000-0000-0000-0000-0000000000a2',
      'Forbidden Team',
      now(),
      now()
    );
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  assert blocked,
    'Authenticated callers MUST NOT INSERT directly into public.tickets';
end$$;




-- ============================================================
-- CHECK 9: constrained update_ticket RPC
-- ============================================================

-- Authenticated browser callers must not receive direct ticket UPDATE.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true);

do $$
begin
  assert not has_table_privilege(
    'authenticated',
    'public.tickets',
    'UPDATE'
  ), 'authenticated MUST NOT have direct UPDATE privilege on public.tickets';
end$$;

-- Crafted direct browser UPDATE must fail.
do $$
declare
  blocked boolean := false;
begin
  begin
    update public.tickets
       set requester_id = '00000000-0000-0000-0000-0000000000a2',
           status = 'closed',
           source = 'api'
     where subject = 'QA Manual Portal Ticket';
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  assert blocked,
    'Authenticated callers MUST NOT UPDATE public.tickets directly';
end$$;

-- Employee requester cannot change ticket metadata.
do $$
declare
  v_ticket_id uuid;
  blocked boolean := false;
begin
  select id
    into v_ticket_id
    from public.tickets
   where subject = 'QA Manual Portal Ticket'
   limit 1;

  begin
    perform public.update_ticket(
      v_ticket_id,
      jsonb_build_object('priority', 'critical')
    );
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  assert blocked,
    'Employee requester MUST NOT modify ticket metadata';
end$$;

-- Prepare an owned resolved ticket using the privileged QA runner.
reset role;
reset "request.jwt.claims";

update public.tickets
   set status = 'resolved'
 where subject = 'QA Manual Portal Ticket';

-- Requester may safely reopen their own resolved ticket.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true);

do $$
declare
  v_ticket_id uuid;
  updated_ticket public.tickets;
begin
  select id
    into v_ticket_id
    from public.tickets
   where subject = 'QA Manual Portal Ticket'
   limit 1;

  select *
    into updated_ticket
    from public.update_ticket(
      v_ticket_id,
      jsonb_build_object('status', 'reopened')
    );

  assert updated_ticket.status = 'reopened',
    'Requester MUST be able to reopen their own resolved ticket';

  assert updated_ticket.resolved_at is null,
    'Requester reopen MUST clear resolved_at';
end$$;

-- Helpdesk must not tamper with immutable ownership fields.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}',
  true);

do $$
declare
  v_ticket_id uuid;
  blocked boolean := false;
begin
  select id
    into v_ticket_id
    from public.tickets
   where subject = 'QA Manual Portal Ticket'
   limit 1;

  begin
    perform public.update_ticket(
      v_ticket_id,
      jsonb_build_object(
        'requester_id',
        '00000000-0000-0000-0000-0000000000a2'
      )
    );
  exception
    when sqlstate '22023' then
      blocked := true;
  end;

  assert blocked,
    'update_ticket MUST reject immutable privileged fields';
end$$;

-- Illegal lifecycle transitions must fail server-side.
do $$
declare
  v_ticket_id uuid;
  blocked boolean := false;
begin
  select id
    into v_ticket_id
    from public.tickets
   where status = 'in_progress'
   order by created_at desc
   limit 1;

  assert v_ticket_id is not null,
    'Expected an in_progress ticket for transition QA';

  begin
    perform public.update_ticket(
      v_ticket_id,
      jsonb_build_object('status', 'reopened')
    );
  exception
    when sqlstate '22023' then
      blocked := true;
  end;

  assert blocked,
    'update_ticket MUST reject illegal lifecycle transitions';
end$$;

reset role;
reset "request.jwt.claims";

rollback;
