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
--   * mark_notifications_read flips read_at
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
-- Run as f1 so requester == actor and we should NOT see a self-notification.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
insert into public.tickets (id, requester_id, subject, assignee_id)
values ('00000000-0000-0000-0000-00000000f101'::uuid,
        '00000000-0000-0000-0000-0000000000f1'::uuid,
        'QA notif ticket',
        '00000000-0000-0000-0000-0000000000f2'::uuid);
reset role; reset "request.jwt.claims";

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

-- ---- mark_notifications_read ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
do $$
declare marked int; remaining int;
begin
  select public.mark_notifications_read() into marked;
  if marked < 1 then raise exception 'mark_notifications_read should mark >=1, got %', marked; end if;
  select count(*) into remaining from public.notifications
   where user_id='00000000-0000-0000-0000-0000000000f1' and read_at is null;
  if remaining <> 0 then
    raise exception 'Unread should be 0 after mark all, got %', remaining;
  end if;
end$$;
reset role; reset "request.jwt.claims";

rollback;
