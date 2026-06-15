-- Transaction-backed QA for 20260617000000_teams_admin_management.sql.
-- Run only against a disposable database after all dependencies are applied.
begin;

-- ------------------------------------------------------------
-- Function privilege sanity checks
-- ------------------------------------------------------------
do $$
begin
  assert not has_function_privilege('anon', 'public.update_team(uuid, text, text, text)', 'execute'),
    'anon must not execute update_team';
  assert not has_function_privilege('anon', 'public.delete_team(uuid)', 'execute'),
    'anon must not execute delete_team';
  assert not has_function_privilege('anon', 'public.add_team_member(uuid, uuid, text)', 'execute'),
    'anon must not execute add_team_member';
  assert not has_function_privilege('anon', 'public.remove_team_member(uuid, uuid)', 'execute'),
    'anon must not execute remove_team_member';
  assert not has_function_privilege('anon', 'public.set_team_member_role(uuid, uuid, text)', 'execute'),
    'anon must not execute set_team_member_role';

  assert has_function_privilege('authenticated', 'public.update_team(uuid, text, text, text)', 'execute'),
    'authenticated must execute update_team';
  assert has_function_privilege('authenticated', 'public.delete_team(uuid)', 'execute'),
    'authenticated must execute delete_team';
  assert has_function_privilege('authenticated', 'public.add_team_member(uuid, uuid, text)', 'execute'),
    'authenticated must execute add_team_member';
  assert has_function_privilege('authenticated', 'public.remove_team_member(uuid, uuid)', 'execute'),
    'authenticated must execute remove_team_member';
  assert has_function_privilege('authenticated', 'public.set_team_member_role(uuid, uuid, text)', 'execute'),
    'authenticated must execute set_team_member_role';

  assert not has_table_privilege('authenticated', 'public.teams', 'INSERT'),
    'authenticated must not insert teams directly';
  assert not has_table_privilege('authenticated', 'public.teams', 'UPDATE'),
    'authenticated must not update teams directly';
  assert not has_table_privilege('authenticated', 'public.teams', 'DELETE'),
    'authenticated must not delete teams directly';
  assert not has_table_privilege('authenticated', 'public.team_members', 'INSERT'),
    'authenticated must not insert team_members directly';
  assert not has_table_privilege('authenticated', 'public.team_member_roles', 'INSERT'),
    'authenticated must not insert team_member_roles directly';
end;
$$;

create temporary table qa_team_ids (key text primary key, id uuid not null) on commit drop;
grant select, insert on qa_team_ids to authenticated;

-- ------------------------------------------------------------
-- Fixtures
-- ------------------------------------------------------------
insert into auth.users (
  id, email, instance_id, aud, role, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-0000000000a1', 'qa-teams-owner-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000a2', 'qa-teams-admin-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000a3', 'qa-teams-editor-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000a4', 'qa-teams-viewer-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000a5', 'qa-teams-owner-b@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000a6', 'qa-teams-newmember@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000a7', 'qa-teams-platform-admin@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now())
on conflict (id) do nothing;

-- public.handle_new_user() already inserted a profile row for each user above
-- (display_name derived from email), so this must overwrite that placeholder
-- with the QA display name rather than "do nothing".
insert into public.profiles (id, email, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'qa-teams-owner-a@example.com', 'QA Teams Owner A'),
  ('00000000-0000-0000-0000-0000000000a2', 'qa-teams-admin-a@example.com', 'QA Teams Admin A'),
  ('00000000-0000-0000-0000-0000000000a3', 'qa-teams-editor-a@example.com', 'QA Teams Editor A'),
  ('00000000-0000-0000-0000-0000000000a4', 'qa-teams-viewer-a@example.com', 'QA Teams Viewer A'),
  ('00000000-0000-0000-0000-0000000000a5', 'qa-teams-owner-b@example.com', 'QA Teams Owner B'),
  ('00000000-0000-0000-0000-0000000000a6', 'qa-teams-newmember@example.com', 'QA Teams New Member'),
  ('00000000-0000-0000-0000-0000000000a7', 'qa-teams-platform-admin@example.com', 'QA Teams Platform Admin')
on conflict (id) do update set
  email = excluded.email,
  display_name = excluded.display_name;

insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000a7'::uuid, roles.id
from public.roles
where roles.role_key = 'platform_admin'
on conflict do nothing;

-- ------------------------------------------------------------
-- Owner A: create team, populate membership
-- ------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true
);

do $$
declare
  team_a uuid;
  team_b uuid;
begin
  select t.id into team_a
  from public.create_team('  QA Team A  ', '  QA-Team-A  ', '  Team A description  ') as t;
  insert into qa_team_ids values ('team_a', team_a);

  assert exists (
    select 1 from public.teams
     where id = team_a and name = 'QA Team A' and slug = 'qa-team-a'
       and description = 'Team A description' and created_by = '00000000-0000-0000-0000-0000000000a1'
  ), 'create_team must trim name/description and lower the slug';

  assert exists (
    select 1 from public.team_member_roles tmr
    join public.roles r on r.id = tmr.role_id
    where tmr.team_id = team_a and tmr.user_id = '00000000-0000-0000-0000-0000000000a1'
      and r.role_key = 'team_owner'
  ), 'create_team must grant team_owner to the creator';

  -- Owner A populates membership.
  perform public.add_team_member(team_a, '00000000-0000-0000-0000-0000000000a2', 'team_admin');
  perform public.add_team_member(team_a, '00000000-0000-0000-0000-0000000000a3', 'team_editor');
  perform public.add_team_member(team_a, '00000000-0000-0000-0000-0000000000a4', 'team_viewer');

  assert (
    select count(*) from public.team_members where team_id = team_a and membership_status = 'active'
  ) = 4, 'team A must have four active members after setup';

  -- Re-adding an existing member with the same role must be idempotent.
  perform public.add_team_member(team_a, '00000000-0000-0000-0000-0000000000a2', 'team_admin');
  assert (
    select count(*) from public.team_member_roles tmr
    join public.roles r on r.id = tmr.role_id
    where tmr.team_id = team_a and tmr.user_id = '00000000-0000-0000-0000-0000000000a2'
      and r.role_key = 'team_admin'
  ) = 1, 're-adding a member with the same role must not duplicate the role row';

  -- Default role (team_viewer) applies when p_role_key is omitted.
  perform public.add_team_member(team_a, '00000000-0000-0000-0000-0000000000a6');
  assert exists (
    select 1 from public.team_member_roles tmr
    join public.roles r on r.id = tmr.role_id
    where tmr.team_id = team_a and tmr.user_id = '00000000-0000-0000-0000-0000000000a6'
      and r.role_key = 'team_viewer'
  ), 'add_team_member must default to team_viewer';

  -- Remove the temporary member added above so later counts are predictable.
  perform public.remove_team_member(team_a, '00000000-0000-0000-0000-0000000000a6');
  assert not exists (
    select 1 from public.team_members where team_id = team_a and user_id = '00000000-0000-0000-0000-0000000000a6'
  ), 'remove_team_member must remove the membership row';

  -- update_team trims/normalizes and clears a blank description.
  perform public.update_team(team_a, '  QA Team A Updated  ', '  QA-TEAM-A  ', '   ');
  assert exists (
    select 1 from public.teams
     where id = team_a and name = 'QA Team A Updated' and slug = 'qa-team-a' and description is null
  ), 'update_team must trim the name, lower the slug, and null out a blank description';

  -- update_team on a nonexistent team must fail.
  begin
    perform public.update_team(gen_random_uuid(), 'Nope', 'nope-team', null);
    raise exception 'update_team on a nonexistent team unexpectedly succeeded';
  exception when raise_exception then null;
  end;

  -- Unknown role keys must be rejected.
  begin
    perform public.add_team_member(team_a, '00000000-0000-0000-0000-0000000000a6', 'not_a_role');
    raise exception 'add_team_member with an unknown role unexpectedly succeeded';
  exception when raise_exception then null;
  end;

  begin
    perform public.set_team_member_role(team_a, '00000000-0000-0000-0000-0000000000a4', 'not_a_role');
    raise exception 'set_team_member_role with an unknown role unexpectedly succeeded';
  exception when raise_exception then null;
  end;

  -- The only remaining team_owner cannot be removed or demoted.
  begin
    perform public.remove_team_member(team_a, '00000000-0000-0000-0000-0000000000a1');
    raise exception 'removing the only remaining team owner unexpectedly succeeded';
  exception when raise_exception then null;
  end;

  begin
    perform public.set_team_member_role(team_a, '00000000-0000-0000-0000-0000000000a1', 'team_viewer');
    raise exception 'demoting the only remaining team owner unexpectedly succeeded';
  exception when raise_exception then null;
  end;

  -- Direct table writes must remain blocked even for a member with team.manage_roles.
  begin
    insert into public.teams (name, slug) values ('Forged team', 'forged-team');
    raise exception 'direct team insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.teams set name = 'Forged name' where id = team_a;
    raise exception 'direct team update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.team_members (team_id, user_id) values (team_a, '00000000-0000-0000-0000-0000000000a6');
    raise exception 'direct team_members insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Owner B: independent team for cross-team isolation checks
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}',
  true
);

do $$
declare
  team_b uuid;
begin
  select t.id into team_b
  from public.create_team('QA Team B', 'qa-team-b', null) as t;
  insert into qa_team_ids values ('team_b', team_b);
end;
$$;

-- ------------------------------------------------------------
-- Admin A (team_admin): same authority as the owner except deletion
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}',
  true
);

do $$
declare
  team_a uuid := (select id from qa_team_ids where key = 'team_a');
begin
  -- team.manage
  perform public.update_team(team_a, 'QA Team A', 'qa-team-a', 'Restored description');
  assert exists (
    select 1 from public.teams where id = team_a and description = 'Restored description'
  ), 'team_admin must be able to update the team via team.manage';

  -- team.manage_members / team.manage_roles
  perform public.add_team_member(team_a, '00000000-0000-0000-0000-0000000000a6', 'team_viewer');
  perform public.set_team_member_role(team_a, '00000000-0000-0000-0000-0000000000a6', 'team_editor');
  perform public.remove_team_member(team_a, '00000000-0000-0000-0000-0000000000a6');

  -- team_admin is not team_owner and is not a platform admin.
  begin
    perform public.delete_team(team_a);
    raise exception 'team_admin unexpectedly deleted the team';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Editor A (team_editor): read-oriented, no team/member management
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}',
  true
);

do $$
declare
  team_a uuid := (select id from qa_team_ids where key = 'team_a');
begin
  begin
    perform public.update_team(team_a, 'QA Team A', 'qa-team-a', 'Editor attempt');
    raise exception 'team_editor unexpectedly updated the team';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.add_team_member(team_a, '00000000-0000-0000-0000-0000000000a6', 'team_viewer');
    raise exception 'team_editor unexpectedly added a member';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.set_team_member_role(team_a, '00000000-0000-0000-0000-0000000000a4', 'team_editor');
    raise exception 'team_editor unexpectedly changed a member role';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.remove_team_member(team_a, '00000000-0000-0000-0000-0000000000a4');
    raise exception 'team_editor unexpectedly removed a member';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.delete_team(team_a);
    raise exception 'team_editor unexpectedly deleted the team';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Viewer A (team_viewer): same denials as editor
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}',
  true
);

do $$
declare
  team_a uuid := (select id from qa_team_ids where key = 'team_a');
begin
  begin
    perform public.update_team(team_a, 'QA Team A', 'qa-team-a', 'Viewer attempt');
    raise exception 'team_viewer unexpectedly updated the team';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.add_team_member(team_a, '00000000-0000-0000-0000-0000000000a6', 'team_viewer');
    raise exception 'team_viewer unexpectedly added a member';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.delete_team(team_a);
    raise exception 'team_viewer unexpectedly deleted the team';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Owner B: cross-team isolation against team A
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}',
  true
);

do $$
declare
  team_a uuid := (select id from qa_team_ids where key = 'team_a');
begin
  begin
    perform public.update_team(team_a, 'QA Team A', 'qa-team-a', 'Owner B attempt');
    raise exception 'owner of team B unexpectedly updated team A';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.add_team_member(team_a, '00000000-0000-0000-0000-0000000000a6', 'team_viewer');
    raise exception 'owner of team B unexpectedly added a member to team A';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.set_team_member_role(team_a, '00000000-0000-0000-0000-0000000000a4', 'team_editor');
    raise exception 'owner of team B unexpectedly changed a team A member role';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.remove_team_member(team_a, '00000000-0000-0000-0000-0000000000a4');
    raise exception 'owner of team B unexpectedly removed a team A member';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.delete_team(team_a);
    raise exception 'owner of team B unexpectedly deleted team A';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Unauthenticated session: every RPC requires auth.uid()
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

do $$
declare
  team_a uuid := (select id from qa_team_ids where key = 'team_a');
begin
  begin
    perform public.update_team(team_a, 'QA Team A', 'qa-team-a', 'Anon attempt');
    raise exception 'unauthenticated update_team unexpectedly succeeded';
  exception when raise_exception then null;
  end;

  begin
    perform public.delete_team(team_a);
    raise exception 'unauthenticated delete_team unexpectedly succeeded';
  exception when raise_exception then null;
  end;

  begin
    perform public.add_team_member(team_a, '00000000-0000-0000-0000-0000000000a6', 'team_viewer');
    raise exception 'unauthenticated add_team_member unexpectedly succeeded';
  exception when raise_exception then null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Owner A: promote a successor, then step down
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true
);

do $$
declare
  team_a uuid := (select id from qa_team_ids where key = 'team_a');
begin
  -- Promote admin A to team_owner alongside owner A.
  perform public.set_team_member_role(team_a, '00000000-0000-0000-0000-0000000000a2', 'team_owner');
  assert exists (
    select 1 from public.team_member_roles tmr
    join public.roles r on r.id = tmr.role_id
    where tmr.team_id = team_a and tmr.user_id = '00000000-0000-0000-0000-0000000000a2'
      and r.role_key = 'team_owner'
  ), 'set_team_member_role must grant team_owner to admin A';
  assert not exists (
    select 1 from public.team_member_roles tmr
    join public.roles r on r.id = tmr.role_id
    where tmr.team_id = team_a and tmr.user_id = '00000000-0000-0000-0000-0000000000a2'
      and r.role_key = 'team_admin'
  ), 'set_team_member_role must replace the previous team-scoped role';

  -- With a second owner present, owner A can now be demoted and removed.
  perform public.set_team_member_role(team_a, '00000000-0000-0000-0000-0000000000a1', 'team_viewer');
  perform public.remove_team_member(team_a, '00000000-0000-0000-0000-0000000000a1');
  assert not exists (
    select 1 from public.team_members where team_id = team_a and user_id = '00000000-0000-0000-0000-0000000000a1'
  ), 'owner A must be removable once a second owner exists';
end;
$$;

-- ------------------------------------------------------------
-- Platform admin: may delete any team regardless of membership
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}',
  true
);

do $$
declare
  team_b uuid := (select id from qa_team_ids where key = 'team_b');
begin
  assert not exists (
    select 1 from public.team_members where team_id = team_b and user_id = '00000000-0000-0000-0000-0000000000a7'
  ), 'platform admin must not be a member of team B';

  perform public.delete_team(team_b);
  assert not exists (select 1 from public.teams where id = team_b),
    'platform admin must be able to delete team B';
  assert not exists (select 1 from public.team_members where team_id = team_b),
    'deleting a team must cascade-delete its memberships';
  assert not exists (select 1 from public.team_member_roles where team_id = team_b),
    'deleting a team must cascade-delete its member role assignments';
end;
$$;

-- ------------------------------------------------------------
-- Surviving owner (admin A, now team_owner): final deletion of team A
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}',
  true
);

do $$
declare
  team_a uuid := (select id from qa_team_ids where key = 'team_a');
begin
  perform public.delete_team(team_a);
  assert not exists (select 1 from public.teams where id = team_a),
    'sole remaining team_owner must be able to delete the team';
  assert not exists (select 1 from public.team_members where team_id = team_a),
    'deleting team A must cascade-delete its memberships';
  assert not exists (select 1 from public.team_member_roles where team_id = team_a),
    'deleting team A must cascade-delete its member role assignments';
end;
$$;

reset role;
rollback;
