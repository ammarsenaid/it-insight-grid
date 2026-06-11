-- ============================================================
-- QA — Ticket Assignment History (Phase A — Batch 5/6)
-- ------------------------------------------------------------
-- DRAFT — NOT YET APPLIED. Single transaction, rolled back.
-- ============================================================

begin;

insert into auth.users (id, email, instance_id, aud, role,
                        encrypted_password, email_confirmed_at,
                        created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000e1','qa-as-employee@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now()),
  ('00000000-0000-0000-0000-0000000000e2','qa-as-helpdesk@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now()),
  ('00000000-0000-0000-0000-0000000000e3','qa-as-tech@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now())
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('00000000-0000-0000-0000-0000000000e1','qa-as-employee@example.com'),
  ('00000000-0000-0000-0000-0000000000e2','qa-as-helpdesk@example.com'),
  ('00000000-0000-0000-0000-0000000000e3','qa-as-tech@example.com')
on conflict (id) do nothing;
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000e1'::uuid, id
  from public.roles where role_key='employee' on conflict do nothing;
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000e2'::uuid, id
  from public.roles where role_key='helpdesk' on conflict do nothing;

-- Insert ticket initially assigned to helpdesk team.
insert into public.tickets (id, requester_id, subject, assigned_team, assignee_id)
values ('00000000-0000-0000-0000-00000000e101'::uuid,
        '00000000-0000-0000-0000-0000000000e1'::uuid,
        'QA assignment ticket', 'helpdesk-team',
        '00000000-0000-0000-0000-0000000000e2'::uuid);

do $$
declare cnt int;
begin
  select count(*) into cnt from public.ticket_assignment_history
   where ticket_id='00000000-0000-0000-0000-00000000e101';
  if cnt <> 1 then raise exception 'Expected 1 history row on insert, got %', cnt; end if;
end$$;

-- Reassign to a different agent — should produce a 2nd history row.
update public.tickets
   set assignee_id = '00000000-0000-0000-0000-0000000000e3'::uuid
 where id = '00000000-0000-0000-0000-00000000e101';

do $$
declare cnt int; latest_to uuid;
begin
  select count(*) into cnt from public.ticket_assignment_history
   where ticket_id='00000000-0000-0000-0000-00000000e101';
  if cnt <> 2 then raise exception 'Expected 2 history rows after reassign, got %', cnt; end if;

  select to_assignee_id into latest_to from public.ticket_assignment_history
   where ticket_id='00000000-0000-0000-0000-00000000e101'
   order by changed_at desc limit 1;
  if latest_to <> '00000000-0000-0000-0000-0000000000e3' then
    raise exception 'Latest history row has wrong to_assignee_id: %', latest_to;
  end if;
end$$;

-- Updating a non-assignment column must NOT add a row.
update public.tickets set priority='high'
 where id='00000000-0000-0000-0000-00000000e101';
do $$
declare cnt int;
begin
  select count(*) into cnt from public.ticket_assignment_history
   where ticket_id='00000000-0000-0000-0000-00000000e101';
  if cnt <> 2 then raise exception 'Non-assignment update created history row, count=%', cnt; end if;
end$$;

-- Employee (requester) can read their own ticket's history.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
do $$
declare cnt int;
begin
  select count(*) into cnt from public.ticket_assignment_history
   where ticket_id='00000000-0000-0000-0000-00000000e101';
  if cnt <> 2 then raise exception 'Requester should see own ticket history, got %', cnt; end if;
end$$;
reset role; reset "request.jwt.claims";

rollback;
