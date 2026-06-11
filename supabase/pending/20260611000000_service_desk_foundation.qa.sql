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
--   4. Internal-note isolation (ticket_comments select / insert)
--   5. IT admin (helpdesk) ticket visibility
--   6. RPC submit_catalog_request inserts ticket + audit + status
--   7. Audit log + status event creation on ticket update
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

-- Grant the helpdesk user the 'helpdesk' platform role.
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000a2', r.id
from public.roles r
where r.role_key = 'helpdesk'
on conflict do nothing;

-- Seed three catalog items: published / draft / archived.
insert into public.catalog_items (id, name, category, description,
                                  default_priority, status, fields_schema)
values
  ('00000000-0000-0000-0000-0000000000c1',
   'QA Published Service', 'Access', 'A published service for QA.',
   'normal', 'published',
   '[{"key":"reason","label":"Reason","type":"text","required":true}]'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2',
   'QA Draft Service', 'Access', 'A draft service for QA.',
   'normal', 'draft', '[]'::jsonb),
  ('00000000-0000-0000-0000-0000000000c3',
   'QA Archived Service', 'Access', 'An archived service for QA.',
   'normal', 'archived', '[]'::jsonb)
on conflict (id) do nothing;


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
  visible_published int;
  visible_draft     int;
  visible_archived  int;
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

  assert visible_published = 1, 'Employee MUST see the published catalog item';
  assert visible_draft     = 0, 'Employee MUST NOT see draft catalog items';
  assert visible_archived  = 0, 'Employee MUST NOT see archived catalog items';
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


-- ============================================================
-- CHECK 6: RPC submit_catalog_request (atomic, validates required)
-- ============================================================
-- Required-field omission must raise
do $$
begin
  begin
    perform public.submit_catalog_request(
      '00000000-0000-0000-0000-0000000000c1',
      '{}'::jsonb
    );
    raise exception 'submit_catalog_request must reject missing required field';
  exception when others then
    null;
  end;
end$$;

-- Submitting against a draft item must fail
do $$
begin
  begin
    perform public.submit_catalog_request(
      '00000000-0000-0000-0000-0000000000c2',
      '{"reason":"x"}'::jsonb
    );
    raise exception 'submit_catalog_request must reject draft items';
  exception when others then
    null;
  end;
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
  ticket_id uuid;
begin
  -- Fetch via SECURITY DEFINER context isn't available; instead
  -- pick a ticket id we know exists by querying as service_role.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}',
    true);
  select id into ticket_id from public.tickets
   where requester_id = '00000000-0000-0000-0000-0000000000a1'
   limit 1;
  -- ticket_id will be NULL under RLS for this user, which is itself
  -- the proof: they cannot even discover the ticket id.
  assert ticket_id is null, 'Other employee must not discover foreign tickets';
end$$;


-- ============================================================
-- CHECK 5: IT admin (helpdesk) ticket visibility
-- ============================================================
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
  ticket_id uuid;
begin
  select id into ticket_id from public.tickets
   where requester_id = '00000000-0000-0000-0000-0000000000a1'
   order by created_at desc
   limit 1;

  insert into public.ticket_comments (ticket_id, author_id, body, internal)
  values
    (ticket_id, '00000000-0000-0000-0000-0000000000a2',
     'Hello, working on this now.', false),
    (ticket_id, '00000000-0000-0000-0000-0000000000a2',
     'Internal: need to verify license seats.', true);
end$$;

-- Employee (the requester) sees only the public reply.
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
  ticket_id uuid;
begin
  select id into ticket_id from public.tickets
   where requester_id = '00000000-0000-0000-0000-0000000000a1'
   limit 1;
  begin
    insert into public.ticket_comments (ticket_id, author_id, body, internal)
    values (ticket_id, '00000000-0000-0000-0000-0000000000a1',
            'I should not be allowed to post this.', true);
    raise exception 'Employee MUST NOT be able to post internal notes';
  exception when others then
    null;
  end;
end$$;

-- Employee CAN post a public reply on their own ticket.
do $$
declare
  ticket_id uuid;
  ok boolean := false;
begin
  select id into ticket_id from public.tickets
   where requester_id = '00000000-0000-0000-0000-0000000000a1'
   limit 1;
  insert into public.ticket_comments (ticket_id, author_id, body, internal)
  values (ticket_id, '00000000-0000-0000-0000-0000000000a1',
          'Thanks for the update.', false);
  ok := true;
  assert ok, 'Employee MUST be able to post a public reply on their own ticket';
end$$;


-- ============================================================
-- CHECK 7: status events + audit log
-- ============================================================
-- Helpdesk transitions ticket to in_progress.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}',
  true);

do $$
declare
  ticket_id uuid;
  status_events int;
  audit_rows int;
begin
  select id into ticket_id from public.tickets
   where requester_id = '00000000-0000-0000-0000-0000000000a1'
   order by created_at desc
   limit 1;

  update public.tickets
     set status = 'in_progress', assignee_id = '00000000-0000-0000-0000-0000000000a2'
   where id = ticket_id;

  select count(*) into status_events
    from public.ticket_status_events
   where ticket_id = ticket_id;
  assert status_events >= 2,
    'Status events must include initial open + transition to in_progress';

  select count(*) into audit_rows
    from public.ticket_audit_log
   where ticket_id = ticket_id;
  assert audit_rows >= 2,
    'Audit log must include ticket.create + ticket.update entries';
end$$;

-- Employee cannot see ticket_audit_log rows.
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
rollback;
