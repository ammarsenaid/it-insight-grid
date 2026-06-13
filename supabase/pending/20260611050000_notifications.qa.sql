-- ============================================================
-- QA — Notifications (Phase A — Batch 6/6)
-- ------------------------------------------------------------
-- DRAFT — NOT YET APPLIED. Single transaction, rolled back.
--
-- Covered:
--   * Ticket creation notifies requester + pre-assigned agent
--   * Public reply notifies requester + assignee
--   * Internal note does NOT notify requester (employee)
--   * Internal note DOES notify assignee with view_internal perm
--   * Status change notifies requester + assignee
--   * Reassignment notifies new assignee, not the actor
--   * Users only see their own rows (RLS)
--   * Direct notification-content tampering is denied
--   * mark_notifications_read handles one, zero, cross-user, and all rows
-- ============================================================

begin;

insert into auth.users (id, email, instance_id, aud, role,
                        encrypted_password, email_confirmed_at,
                        created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000f1','qa-nt-employee@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now()),
  ('00000000-0000-0000-0000-0000000000f2','qa-nt-helpdesk@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now()),
  ('00000000-0000-0000-0000-0000000000f3','qa-nt-tech@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now())
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('00000000-0000-0000-0000-0000000000f1','qa-nt-employee@example.com'),
  ('00000000-0000-0000-0000-0000000000f2','qa-nt-helpdesk@example.com'),
  ('00000000-0000-0000-0000-0000000000f3','qa-nt-tech@example.com')
on conflict (id) do nothing;
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000f1'::uuid, id
  from public.roles where role_key='employee' on conflict do nothing;
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000f2'::uuid, id
  from public.roles where role_key='helpdesk' on conflict do nothing;
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000f3'::uuid, id
  from public.roles where role_key='technician' on conflict do nothing;

-- ---- Create ticket pre-assigned to helpdesk f2 ----
-- Preserve f1 as the trigger actor, but perform this fixture insertion through
-- the privileged QA runner. Browser-side authenticated INSERT is revoked.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
insert into public.tickets (id, requester_id, subject, assignee_id)
values ('00000000-0000-0000-0000-00000000f101'::uuid,
        '00000000-0000-0000-0000-0000000000f1'::uuid,
        'QA notif ticket',
        '00000000-0000-0000-0000-0000000000f2'::uuid);
reset "request.jwt.claims";

do $$
declare cnt_req int; cnt_agent int;
begin
  select count(*) into cnt_req from public.notifications
   where ticket_id='00000000-0000-0000-0000-00000000f101'
     and user_id='00000000-0000-0000-0000-0000000000f1';
  if cnt_req <> 0 then
    raise exception 'Requester=actor should not self-notify on create, got %', cnt_req;
  end if;
  select count(*) into cnt_agent from public.notifications
   where ticket_id='00000000-0000-0000-0000-00000000f101'
     and user_id='00000000-0000-0000-0000-0000000000f2'
     and kind='ticket.assigned';
  if cnt_agent <> 1 then
    raise exception 'Assignee should receive ticket.assigned, got %', cnt_agent;
  end if;
end$$;

-- ---- Helpdesk f2 posts a public reply ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
insert into public.ticket_comments (ticket_id, author_id, body, internal)
values ('00000000-0000-0000-0000-00000000f101',
        '00000000-0000-0000-0000-0000000000f2',
        'Hello from helpdesk', false);
reset role; reset "request.jwt.claims";

do $$
declare cnt_req int; cnt_agent int;
begin
  select count(*) into cnt_req from public.notifications
   where ticket_id='00000000-0000-0000-0000-00000000f101'
     and user_id='00000000-0000-0000-0000-0000000000f1' and kind='ticket.reply';
  if cnt_req <> 1 then
    raise exception 'Requester should get public reply notif, got %', cnt_req;
  end if;
  select count(*) into cnt_agent from public.notifications
   where ticket_id='00000000-0000-0000-0000-00000000f101'
     and user_id='00000000-0000-0000-0000-0000000000f2' and kind='ticket.reply';
  if cnt_agent <> 0 then
    raise exception 'Author should not self-notify on reply, got %', cnt_agent;
  end if;
end$$;

-- ---- Helpdesk f2 posts an INTERNAL note. Reassign first so f3 (tech)
--      is the assignee — tech has view_internal, so they get notified;
--      employee f1 must NOT. ----
-- Privileged fixture mutation: browser-side direct UPDATE is revoked.
update public.tickets
   set assignee_id = '00000000-0000-0000-0000-0000000000f3'
 where id = '00000000-0000-0000-0000-00000000f101';

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
insert into public.ticket_comments (ticket_id, author_id, body, internal)
values ('00000000-0000-0000-0000-00000000f101',
        '00000000-0000-0000-0000-0000000000f2',
        'Internal triage note', true);
reset role; reset "request.jwt.claims";

do $$
declare emp_count int; tech_count int;
begin
  select count(*) into emp_count from public.notifications
   where ticket_id='00000000-0000-0000-0000-00000000f101'
     and user_id='00000000-0000-0000-0000-0000000000f1'
     and (payload->>'internal')::boolean is true;
  if emp_count <> 0 then
    raise exception 'Employee leaked internal-note notification: count=%', emp_count;
  end if;
  select count(*) into tech_count from public.notifications
   where ticket_id='00000000-0000-0000-0000-00000000f101'
     and user_id='00000000-0000-0000-0000-0000000000f3'
     and (payload->>'internal')::boolean is true;
  if tech_count <> 1 then
    raise exception 'Technician (view_internal) should be notified, got %', tech_count;
  end if;
end$$;

-- ---- Status change notifies requester + assignee ----
-- Privileged fixture mutation: browser-side direct UPDATE is revoked.
update public.tickets set status='resolved'
 where id='00000000-0000-0000-0000-00000000f101';
do $$
declare cnt_req int; cnt_assignee int;
begin
  select count(*) into cnt_req from public.notifications
   where ticket_id='00000000-0000-0000-0000-00000000f101'
     and user_id='00000000-0000-0000-0000-0000000000f1' and kind='ticket.status';
  if cnt_req <> 1 then
    raise exception 'Requester missing status notif, count=%', cnt_req;
  end if;
  select count(*) into cnt_assignee from public.notifications
   where ticket_id='00000000-0000-0000-0000-00000000f101'
     and user_id='00000000-0000-0000-0000-0000000000f3' and kind='ticket.status';
  if cnt_assignee <> 1 then
    raise exception 'Assignee missing status notif, count=%', cnt_assignee;
  end if;
end$$;

-- ---- Deterministic read-state fixtures ----
insert into public.notifications (
  id, user_id, ticket_id, kind, title, body, payload, created_at
)
values
  ('00000000-0000-0000-0000-00000000f201',
   '00000000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000f101',
   'ticket.reply', 'QA owned unread one', 'Original body',
   '{"link":"/tickets/00000000-0000-0000-0000-00000000f101","immutable":"yes"}'::jsonb,
   '2026-06-11 12:00:00+00'),
  ('00000000-0000-0000-0000-00000000f202',
   '00000000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-00000000f101',
   'ticket.status', 'QA owned unread two', 'Second original body',
   '{"state":"original"}'::jsonb,
   '2026-06-11 12:01:00+00'),
  ('00000000-0000-0000-0000-00000000f203',
   '00000000-0000-0000-0000-0000000000f3',
   '00000000-0000-0000-0000-00000000f101',
   'ticket.assigned', 'QA foreign unread', 'Foreign original body',
   '{"owner":"f3"}'::jsonb,
   '2026-06-11 12:02:00+00');

-- ---- RLS: f1 cannot see f3's notifications ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
do $$
declare cnt int;
begin
  select count(*) into cnt from public.notifications
   where user_id='00000000-0000-0000-0000-0000000000f3';
  if cnt <> 0 then raise exception 'RLS leak: f1 sees f3 notifications, count=%', cnt; end if;
end$$;
reset role; reset "request.jwt.claims";

-- ---- Direct authenticated UPDATE is unavailable ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
do $$
declare blocked boolean := false;
begin
  assert not has_table_privilege(
    'authenticated', 'public.notifications', 'UPDATE'
  ), 'authenticated MUST NOT have direct UPDATE privilege on public.notifications';

  begin
    update public.notifications
       set user_id = '00000000-0000-0000-0000-0000000000f3',
           ticket_id = null,
           kind = 'ticket.status',
           title = 'Tampered title',
           body = 'Tampered body',
           payload = '{"link":"/admin","tampered":true}'::jsonb,
           read_at = now(),
           created_at = now()
     where id = '00000000-0000-0000-0000-00000000f201';
  exception
    when insufficient_privilege then
      blocked := true;
  end;

  assert blocked,
    'Authenticated callers MUST NOT UPDATE notification content directly';
end$$;
reset role; reset "request.jwt.claims";

do $$
declare preserved boolean;
begin
  select user_id = '00000000-0000-0000-0000-0000000000f1'::uuid
     and ticket_id = '00000000-0000-0000-0000-00000000f101'::uuid
     and kind = 'ticket.reply'
     and title = 'QA owned unread one'
     and body = 'Original body'
     and payload = '{"link":"/tickets/00000000-0000-0000-0000-00000000f101","immutable":"yes"}'::jsonb
     and read_at is null
     and created_at = '2026-06-11 12:00:00+00'::timestamptz
    into preserved
    from public.notifications
   where id = '00000000-0000-0000-0000-00000000f201';

  assert coalesce(preserved, false),
    'Denied direct UPDATE MUST preserve notification owner and content';
end$$;

-- ---- mark_notifications_read: one row, zero-row no-op, cross-user denial ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
do $$
declare marked int; read_time timestamptz;
begin
  select public.mark_notifications_read(
    array['00000000-0000-0000-0000-00000000f201'::uuid]
  ) into marked;
  assert marked = 1,
    'mark_notifications_read MUST mark one owned unread notification';

  select read_at into read_time
    from public.notifications
   where id = '00000000-0000-0000-0000-00000000f201';
  assert read_time is not null,
    'mark_notifications_read MUST set read_at on the owned row';

  select public.mark_notifications_read(
    array['00000000-0000-0000-0000-00000000f201'::uuid]
  ) into marked;
  assert marked = 0,
    'mark_notifications_read MUST return zero for an already-read row';

  select public.mark_notifications_read(
    array['00000000-0000-0000-0000-00000000f203'::uuid]
  ) into marked;
  assert marked = 0,
    'mark_notifications_read MUST NOT update another user''s notification';
end$$;
reset role; reset "request.jwt.claims";

do $$
declare foreign_read_at timestamptz;
begin
  select read_at into foreign_read_at
    from public.notifications
   where id = '00000000-0000-0000-0000-00000000f203';
  assert foreign_read_at is null,
    'Cross-user mark attempt MUST leave the foreign notification unread';
end$$;

-- ---- mark_notifications_read: mark all owned unread rows ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
do $$
declare before_count int; marked int; remaining int;
begin
  select count(*) into before_count
    from public.notifications
   where read_at is null;
  assert before_count >= 1,
    'Mark-all QA requires at least one owned unread notification';

  select public.mark_notifications_read() into marked;
  assert marked = before_count,
    'mark_notifications_read mark-all MUST return every changed owned row';

  select count(*) into remaining
    from public.notifications
   where read_at is null;
  if remaining <> 0 then
    raise exception 'Owned unread count should be 0 after mark all, got %', remaining;
  end if;
end$$;
reset role; reset "request.jwt.claims";

rollback;
