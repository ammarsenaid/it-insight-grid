-- ============================================================
-- QA — Ticket Configuration (Phase A — Batch 4/6)
-- ------------------------------------------------------------
-- DRAFT — NOT YET APPLIED. Single transaction, rolled back.
-- ============================================================

begin;

-- ---- tables exist ----
do $$
declare missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array[
    'ticket_categories','ticket_priorities','ticket_sla_policies',
    'ticket_routing_rules','ticket_canned_responses','ticket_mailbox_configs'
  ]) as t
  where not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = t
  );
  if missing is not null then
    raise exception 'Missing configuration tables: %', missing;
  end if;
end$$;

-- ---- updated_at triggers wired ----
do $$
declare missing text;
begin
  select string_agg(c.relname, ', ') into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'ticket_categories','ticket_priorities','ticket_sla_policies',
      'ticket_routing_rules','ticket_canned_responses','ticket_mailbox_configs'
    )
    and not exists (
      select 1 from pg_trigger tg
      where tg.tgrelid = c.oid
        and tg.tgname = c.relname || '_set_updated_at'
    );
  if missing is not null then
    raise exception 'Missing updated_at trigger on: %', missing;
  end if;
end$$;

-- ---- fixture users (sd_lead vs employee) ----
insert into auth.users (id, email, instance_id, aud, role,
                        encrypted_password, email_confirmed_at,
                        created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000c1','qa-cfg-sdlead@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now()),
  ('00000000-0000-0000-0000-0000000000c2','qa-cfg-employee@example.com',
   '00000000-0000-0000-0000-000000000000','authenticated','authenticated','',now(),now(),now())
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('00000000-0000-0000-0000-0000000000c1','qa-cfg-sdlead@example.com'),
  ('00000000-0000-0000-0000-0000000000c2','qa-cfg-employee@example.com')
on conflict (id) do nothing;
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000c1'::uuid, id
  from public.roles where role_key='sd_lead' on conflict do nothing;
insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000c2'::uuid, id
  from public.roles where role_key='employee' on conflict do nothing;

-- Seed one category (active) and one SLA policy as service_role.
insert into public.ticket_categories (id, key, name, is_active)
values ('00000000-0000-0000-0000-0000000000d1','qa_hardware','Hardware', true);
insert into public.ticket_categories (id, key, name, is_active)
values ('00000000-0000-0000-0000-0000000000d2','qa_hidden','Hidden', false);

insert into public.ticket_sla_policies (id, name, priority_key, response_minutes, resolution_minutes)
values ('00000000-0000-0000-0000-0000000000d3','QA SLA','high', 60, 480);

-- ---- employee can see active categories, NOT inactive, NOT SLA ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
do $$
declare cnt int;
begin
  select count(*) into cnt from public.ticket_categories where key='qa_hardware';
  if cnt <> 1 then raise exception 'Employee should see active category, got %', cnt; end if;
  select count(*) into cnt from public.ticket_categories where key='qa_hidden';
  if cnt <> 0 then raise exception 'Employee leaked inactive category'; end if;
  select count(*) into cnt from public.ticket_sla_policies;
  if cnt <> 0 then raise exception 'Employee must not read SLA policies, got %', cnt; end if;
end$$;
reset role; reset "request.jwt.claims";

-- ---- employee cannot insert config ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
do $$
declare ok boolean := false;
begin
  begin
    insert into public.ticket_canned_responses (shortcut, title, body)
    values ('qa-bad','x','y');
    ok := true;
  exception when others then
    ok := false;
  end;
  if ok then raise exception 'Employee was able to insert canned response'; end if;
end$$;
reset role; reset "request.jwt.claims";

-- ---- sd_lead can read SLA & insert canned response ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
do $$
declare cnt int;
begin
  select count(*) into cnt from public.ticket_sla_policies;
  if cnt < 1 then raise exception 'sd_lead should read SLA policies'; end if;
  insert into public.ticket_canned_responses (shortcut, title, body)
  values ('qa-greet','QA','Hello');
end$$;
reset role; reset "request.jwt.claims";

rollback;
