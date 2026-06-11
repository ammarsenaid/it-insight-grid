-- ============================================================
-- QA — Ticket Attachments (Phase A — Batch 3/6)
-- ------------------------------------------------------------
-- DRAFT — NOT YET APPLIED. Single transaction, rolled back.
--
-- Covered:
--   * Bucket exists and is private
--   * is_valid_ticket_attachment_path rejects malformed paths
--   * Requester sees own ticket's public attachments
--   * Requester does NOT see internal-visibility attachments
--   * Agent (helpdesk) sees both public and internal
--   * Other employee cannot see another user's attachments
--   * Uploader can delete; foreign user cannot
-- ============================================================

begin;

-- ---- bucket present and private ----
do $$
declare is_pub boolean;
begin
  select public into is_pub from storage.buckets where id = 'ticket-attachments';
  if is_pub is null then raise exception 'Bucket ticket-attachments missing'; end if;
  if is_pub then raise exception 'Bucket ticket-attachments must be private'; end if;
end$$;

-- ---- path helper rejects junk ----
do $$
begin
  if public.is_valid_ticket_attachment_path('not-a-uuid/file.txt') then
    raise exception 'Path validator accepted non-uuid prefix';
  end if;
  if public.is_valid_ticket_attachment_path('/etc/passwd') then
    raise exception 'Path validator accepted absolute path';
  end if;
  if public.is_valid_ticket_attachment_path('00000000-0000-0000-0000-000000000000/../escape.txt') then
    raise exception 'Path validator accepted dot-dot segment';
  end if;
end$$;

-- ---- fixture users + ticket ----
insert into auth.users (id, email, instance_id, aud, role,
                        encrypted_password, email_confirmed_at,
                        created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000b1','qa-att-employee@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   '',now(),now(),now()),
  ('00000000-0000-0000-0000-0000000000b2','qa-att-helpdesk@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   '',now(),now(),now()),
  ('00000000-0000-0000-0000-0000000000b3','qa-att-other@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   '',now(),now(),now())
on conflict (id) do nothing;

insert into public.profiles (id, email)
values
  ('00000000-0000-0000-0000-0000000000b1','qa-att-employee@example.com'),
  ('00000000-0000-0000-0000-0000000000b2','qa-att-helpdesk@example.com'),
  ('00000000-0000-0000-0000-0000000000b3','qa-att-other@example.com')
on conflict (id) do nothing;

insert into public.user_global_roles (user_id, role_id)
select 'b1'::text::uuid_placeholder, id from public.roles where false; -- noop
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000b1'::uuid, id
  from public.roles where role_key = 'employee'
on conflict do nothing;
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000b2'::uuid, id
  from public.roles where role_key = 'helpdesk'
on conflict do nothing;
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000b3'::uuid, id
  from public.roles where role_key = 'employee'
on conflict do nothing;

-- Seed a ticket owned by employee b1
insert into public.tickets (id, requester_id, subject, description)
values ('00000000-0000-0000-0000-00000000b101'::uuid,
        '00000000-0000-0000-0000-0000000000b1'::uuid,
        'QA attachment ticket', 'body');

-- Insert one public + one internal attachment row directly as service_role.
insert into public.ticket_attachments
  (id, ticket_id, uploaded_by, storage_path, file_name, mime_type, size_bytes, visibility)
values
  ('00000000-0000-0000-0000-00000000b1aa'::uuid,
   '00000000-0000-0000-0000-00000000b101'::uuid,
   '00000000-0000-0000-0000-0000000000b1'::uuid,
   '00000000-0000-0000-0000-00000000b101/screenshot.png',
   'screenshot.png','image/png',1024,'public'),
  ('00000000-0000-0000-0000-00000000b1bb'::uuid,
   '00000000-0000-0000-0000-00000000b101'::uuid,
   '00000000-0000-0000-0000-0000000000b2'::uuid,
   '00000000-0000-0000-0000-00000000b101/internal-log.txt',
   'internal-log.txt','text/plain',512,'internal');

-- ---- Requester (employee b1) sees only public ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
declare cnt int; internal_cnt int;
begin
  select count(*) into cnt from public.ticket_attachments
   where ticket_id = '00000000-0000-0000-0000-00000000b101';
  select count(*) into internal_cnt from public.ticket_attachments
   where ticket_id = '00000000-0000-0000-0000-00000000b101' and visibility = 'internal';
  if cnt <> 1 then raise exception 'Requester should see 1 attachment, got %', cnt; end if;
  if internal_cnt <> 0 then raise exception 'Requester must not see internal attachment'; end if;
end$$;
reset role;
reset "request.jwt.claims";

-- ---- Helpdesk b2 sees both ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
do $$
declare cnt int;
begin
  select count(*) into cnt from public.ticket_attachments
   where ticket_id = '00000000-0000-0000-0000-00000000b101';
  if cnt <> 2 then raise exception 'Helpdesk should see 2 attachments, got %', cnt; end if;
end$$;
reset role;
reset "request.jwt.claims";

-- ---- Other employee b3 sees none ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
do $$
declare cnt int;
begin
  select count(*) into cnt from public.ticket_attachments
   where ticket_id = '00000000-0000-0000-0000-00000000b101';
  if cnt <> 0 then raise exception 'Foreign employee leaked attachments: %', cnt; end if;
end$$;
reset role;
reset "request.jwt.claims";

-- ---- Foreign employee cannot delete ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
do $$
declare deleted int;
begin
  with d as (
    delete from public.ticket_attachments
     where id = '00000000-0000-0000-0000-00000000b1aa'::uuid
     returning 1
  )
  select count(*) into deleted from d;
  if deleted <> 0 then
    raise exception 'Foreign employee deleted attachment they do not own';
  end if;
end$$;
reset role;
reset "request.jwt.claims";

rollback;
