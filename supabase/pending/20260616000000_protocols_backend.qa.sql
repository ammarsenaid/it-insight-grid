-- Transaction-backed QA for 20260616000000_protocols_backend.sql.
-- Run only against a disposable database after all dependencies are applied.
begin;

do $$
begin
  assert (select relrowsecurity from pg_class where oid = 'public.protocol_templates'::regclass),
    'protocol_templates RLS must be enabled';
  assert (select relrowsecurity from pg_class where oid = 'public.protocol_runs'::regclass),
    'protocol_runs RLS must be enabled';
  assert (select relrowsecurity from pg_class where oid = 'public.protocol_run_comments'::regclass),
    'protocol_run_comments RLS must be enabled';
  assert not has_table_privilege('authenticated', 'public.protocol_templates', 'INSERT'),
    'authenticated must not insert protocol_templates directly';
  assert not has_table_privilege('authenticated', 'public.protocol_templates', 'UPDATE'),
    'authenticated must not update protocol_templates directly';
  assert not has_table_privilege('authenticated', 'public.protocol_templates', 'DELETE'),
    'authenticated must not hard-delete protocol_templates';
  assert not has_table_privilege('authenticated', 'public.protocol_runs', 'INSERT'),
    'authenticated must not insert protocol_runs directly';
  assert not has_table_privilege('authenticated', 'public.protocol_runs', 'UPDATE'),
    'authenticated must not update protocol_runs directly';
  assert not has_table_privilege('authenticated', 'public.protocol_runs', 'DELETE'),
    'authenticated must not hard-delete protocol_runs';
  assert not has_table_privilege('authenticated', 'public.protocol_run_comments', 'INSERT'),
    'authenticated must not insert protocol_run_comments directly';
  assert not has_table_privilege('authenticated', 'public.protocol_run_comments', 'UPDATE'),
    'authenticated must not update protocol_run_comments directly';
  assert not has_table_privilege('authenticated', 'public.protocol_run_comments', 'DELETE'),
    'authenticated must not hard-delete protocol_run_comments';
end;
$$;

-- RBAC alignment: sd_lead/helpdesk/technician must match the frontend
-- "tasks.write" capability that gates Protocols writes.
do $$
begin
  assert (
    select count(*) from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.role_key in ('sd_lead', 'helpdesk', 'technician') and p.permission_key = 'protocols.manage'
  ) = 3, 'sd_lead, helpdesk, and technician must each be granted protocols.manage';
end;
$$;

create temporary table qa_protocol_ids (key text primary key, id uuid not null) on commit drop;
grant select, insert on qa_protocol_ids to authenticated;

insert into auth.users (
  id, email, instance_id, aud, role, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-0000000000f1', 'qa-protocols-manager-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000f2', 'qa-protocols-viewer-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000f3', 'qa-protocols-manager-b@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now())
on conflict (id) do nothing;

-- public.handle_new_user() already inserted a profile row for each user above
-- (display_name derived from email), so this must overwrite that placeholder
-- with the QA display name rather than "do nothing".
insert into public.profiles (id, email, display_name) values
  ('00000000-0000-0000-0000-0000000000f1', 'qa-protocols-manager-a@example.com', 'QA Protocols Manager A'),
  ('00000000-0000-0000-0000-0000000000f2', 'qa-protocols-viewer-a@example.com', 'QA Protocols Viewer A'),
  ('00000000-0000-0000-0000-0000000000f3', 'qa-protocols-manager-b@example.com', 'QA Protocols Manager B')
on conflict (id) do update set
  email = excluded.email,
  display_name = excluded.display_name;

insert into public.organizations (id, name, slug) values
  ('20000000-0000-0000-0000-0000000000f1', 'QA Protocols Organization A', 'qa-protocols-org-a'),
  ('20000000-0000-0000-0000-0000000000f2', 'QA Protocols Organization B', 'qa-protocols-org-b')
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id) values
  ('20000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1'),
  ('20000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2'),
  ('20000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3')
on conflict do nothing;

insert into public.user_global_roles (user_id, role_id)
select fixture.user_id, roles.id
from (values
  ('00000000-0000-0000-0000-0000000000f1'::uuid, 'it_admin'),
  ('00000000-0000-0000-0000-0000000000f2'::uuid, 'platform_auditor'),
  ('00000000-0000-0000-0000-0000000000f3'::uuid, 'network_admin')
) as fixture(user_id, role_key)
join public.roles on roles.role_key = fixture.role_key
on conflict do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","organization_id":"20000000-0000-0000-0000-0000000000f1"}',
  true
);

-- ------------------------------------------------------------
-- Manager A: template create / validation / lifecycle
-- ------------------------------------------------------------
do $$
declare
  tmpl_a uuid;
  tmpl_b uuid;
  dup_id uuid;
begin
  tmpl_a := public.save_protocol_template(null, jsonb_build_object(
    'title', 'QA Patch Procedure', 'category', 'Maintenance', 'description', 'Initial description',
    'assignedTeam', 'Infrastructure', 'estimatedMinutes', 60, 'approvalRequired', true,
    'defaultApproverRole', 'it_admin', 'recurrence', 'monthly', 'visibility', 'internal',
    'tags', jsonb_build_array('windows', 'patching'),
    'requiredAssetIds', jsonb_build_array('asset-1'),
    'requiredKnowledgeIds', jsonb_build_array('kb-1'),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'step-1', 'title', 'Announce maintenance', 'instructions', 'Notify users',
        'required', true, 'notesAllowed', true, 'evidenceAllowed', true, 'approvalCheckpoint', false),
      jsonb_build_object('id', 'step-2', 'title', 'Apply updates', 'instructions', 'Install patches',
        'required', true, 'notesAllowed', true, 'evidenceAllowed', true, 'approvalCheckpoint', true)
    )
  ));
  assert tmpl_a is not null, 'manager A must create a protocol template';
  assert exists (
    select 1 from public.protocol_templates
     where id = tmpl_a and organization_id = '20000000-0000-0000-0000-0000000000f1'
       and tags = array['windows','patching'] and required_asset_ids = array['asset-1']
       and jsonb_array_length(steps) = 2
  ), 'save_protocol_template must persist organization, tags, required ids, and steps';
  insert into qa_protocol_ids values ('tmpl_a', tmpl_a);

  begin
    perform public.save_protocol_template(null, jsonb_build_object('title', 'bad steps', 'steps', '{}'::jsonb));
    raise exception 'non-array steps unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.save_protocol_template(null, jsonb_build_object(
      'title', 'bad step item', 'steps', jsonb_build_array(jsonb_build_object('id', 'step-x'))
    ));
    raise exception 'step without a title unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.save_protocol_template(null, jsonb_build_object('title', 'bad recurrence', 'recurrence', 'hourly'));
    raise exception 'invalid recurrence unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.save_protocol_template(null, jsonb_build_object('title', 'bad visibility', 'visibility', 'public'));
    raise exception 'invalid visibility unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  -- Update template A.
  perform public.save_protocol_template(tmpl_a, jsonb_build_object(
    'title', 'QA Patch Procedure Updated', 'category', 'Maintenance', 'description', 'Updated description',
    'assignedTeam', 'Infrastructure', 'estimatedMinutes', 90, 'approvalRequired', true,
    'recurrence', 'monthly', 'visibility', 'internal', 'tags', jsonb_build_array('windows'),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'step-1', 'title', 'Announce maintenance', 'instructions', 'Notify users',
        'required', true, 'notesAllowed', true, 'evidenceAllowed', true, 'approvalCheckpoint', false),
      jsonb_build_object('id', 'step-2', 'title', 'Apply updates', 'instructions', 'Install patches',
        'required', true, 'notesAllowed', true, 'evidenceAllowed', true, 'approvalCheckpoint', true),
      jsonb_build_object('id', 'step-3', 'title', 'Verify services', 'instructions', 'Check services',
        'required', false, 'notesAllowed', true, 'evidenceAllowed', false, 'approvalCheckpoint', false)
    )
  ));
  assert exists (
    select 1 from public.protocol_templates
     where id = tmpl_a and title = 'QA Patch Procedure Updated' and estimated_minutes = 90
       and jsonb_array_length(steps) = 3
  ), 'save_protocol_template update must persist new fields and steps';

  begin
    perform public.save_protocol_template(tmpl_a, jsonb_build_object('title', ''));
    raise exception 'blank title unexpectedly succeeded';
  exception when check_violation then null;
  end;

  -- Archive / unarchive.
  perform public.set_protocol_template_archived(tmpl_a, true);
  assert exists (select 1 from public.protocol_templates where id = tmpl_a and archived = true),
    'set_protocol_template_archived must archive the template';
  perform public.set_protocol_template_archived(tmpl_a, false);
  assert exists (select 1 from public.protocol_templates where id = tmpl_a and archived = false),
    'set_protocol_template_archived must unarchive the template';

  -- Duplicate must append (Copy), regenerate step ids, and reset archived/last_run_at.
  dup_id := public.duplicate_protocol_template(tmpl_a);
  insert into qa_protocol_ids values ('tmpl_a_dup', dup_id);
  assert exists (
    select 1 from public.protocol_templates
     where id = dup_id and title = 'QA Patch Procedure Updated (Copy)' and archived = false
       and last_run_at is null and jsonb_array_length(steps) = 3
       and steps -> 0 ->> 'id' <> 'step-1'
  ), 'duplicate_protocol_template must append (Copy), reset state, and regenerate step ids';

  -- A second template used as the run source (single-step, no approval).
  tmpl_b := public.save_protocol_template(null, jsonb_build_object(
    'title', 'QA Simple Checklist', 'category', 'Operations', 'assignedTeam', 'Service Desk',
    'approvalRequired', false, 'recurrence', 'none', 'visibility', 'internal',
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'sc-1', 'title', 'Check tickets', 'required', true,
        'notesAllowed', true, 'evidenceAllowed', true, 'approvalCheckpoint', false)
    )
  ));
  insert into qa_protocol_ids values ('tmpl_b', tmpl_b);
end;
$$;

-- ------------------------------------------------------------
-- Manager A: run lifecycle
-- ------------------------------------------------------------
do $$
declare
  tmpl_a uuid := (select id from qa_protocol_ids where key = 'tmpl_a');
  tmpl_b uuid := (select id from qa_protocol_ids where key = 'tmpl_b');
  run_a uuid;
  run_b uuid;
  comment_id uuid;
  step_one_id text;
begin
  run_a := public.start_protocol_run(tmpl_a, jsonb_build_object(
    'assignedUser', 'alice.it', 'dueDate', '2026-02-01T00:00:00Z', 'linkedTicketId', 'ticket-1'
  ));
  assert run_a is not null, 'manager A must start a protocol run';
  insert into qa_protocol_ids values ('run_a', run_a);

  assert exists (
    select 1 from public.protocol_runs
     where id = run_a and run_number = 'PR-1001' and status = 'in_progress'
       and assigned_user = 'alice.it' and started_at is not null
       and jsonb_array_length(steps) = 3 and links ->> 'linkedTicketId' = 'ticket-1'
  ), 'start_protocol_run must create a PR-1001 run with copied steps, in_progress status, and links';
  assert exists (
    select 1 from public.protocol_templates where id = tmpl_a and last_run_at is not null
  ), 'start_protocol_run must update the template last_run_at';

  select steps -> 0 ->> 'stepId' into step_one_id from public.protocol_runs where id = run_a;

  -- Toggle step complete with server-derived completedBy/completedAt.
  perform public.update_protocol_run_step(run_a, step_one_id, jsonb_build_object('completed', true, 'notes', 'done'));
  assert exists (
    select 1 from public.protocol_runs r, jsonb_array_elements(r.steps) elem
     where r.id = run_a and elem->>'stepId' = step_one_id
       and elem->>'completed' = 'true' and elem->>'completedBy' = 'QA Protocols Manager A'
       and elem->>'completedAt' is not null and elem->>'notes' = 'done'
  ), 'update_protocol_run_step must set completed, completedBy, completedAt, and notes';

  -- Toggling back to incomplete clears completedBy/completedAt.
  perform public.update_protocol_run_step(run_a, step_one_id, jsonb_build_object('completed', false));
  assert exists (
    select 1 from public.protocol_runs r, jsonb_array_elements(r.steps) elem
     where r.id = run_a and elem->>'stepId' = step_one_id
       and elem->>'completed' = 'false' and elem->'completedBy' = 'null'::jsonb
       and elem->'completedAt' = 'null'::jsonb
  ), 'update_protocol_run_step must clear completedBy/completedAt when uncompleted';

  begin
    perform public.update_protocol_run_step(run_a, 'not-a-real-step', jsonb_build_object('completed', true));
    raise exception 'unknown step id unexpectedly succeeded';
  exception when no_data_found then null;
  end;

  begin
    perform public.update_protocol_run_step(run_a, step_one_id, '[]'::jsonb);
    raise exception 'non-object step patch unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  -- Approval flow: submit for approval, then approve.
  perform public.set_protocol_run_status(run_a, 'waiting_approval');
  assert exists (select 1 from public.protocol_runs where id = run_a and status = 'waiting_approval'),
    'set_protocol_run_status must move the run to waiting_approval';

  perform public.add_protocol_run_approval(run_a, 'approved', 'looks good');
  assert exists (
    select 1 from public.protocol_runs
     where id = run_a and status = 'in_progress' and jsonb_array_length(approvals) = 1
       and approvals -> 0 ->> 'by' = 'QA Protocols Manager A'
       and approvals -> 0 ->> 'decision' = 'approved'
       and approvals -> 0 ->> 'comment' = 'looks good'
  ), 'add_protocol_run_approval(approved) must record the approval and resume the run';

  -- Completion with final summary.
  perform public.set_protocol_run_status(run_a, 'completed', 'All steps verified.');
  assert exists (
    select 1 from public.protocol_runs
     where id = run_a and status = 'completed' and completed_at is not null
       and final_summary = 'All steps verified.'
  ), 'set_protocol_run_status(completed) must set completed_at and final_summary';

  begin
    perform public.set_protocol_run_status(run_a, 'archived');
    raise exception 'invalid run status unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  -- Second run for the rejection path.
  run_b := public.start_protocol_run(tmpl_b, jsonb_build_object('assignedUser', 'bob.admin'));
  insert into qa_protocol_ids values ('run_b', run_b);
  assert exists (select 1 from public.protocol_runs where id = run_b and run_number = 'PR-1002'),
    'start_protocol_run must allocate sequential run numbers within an organization';

  perform public.set_protocol_run_status(run_b, 'waiting_approval');
  perform public.add_protocol_run_approval(run_b, 'rejected', 'missing evidence');
  assert exists (
    select 1 from public.protocol_runs
     where id = run_b and status = 'failed' and jsonb_array_length(approvals) = 1
       and approvals -> 0 ->> 'decision' = 'rejected'
       and approvals -> 0 ->> 'comment' = 'missing evidence'
  ), 'add_protocol_run_approval(rejected) must record the approval and fail the run';

  begin
    perform public.add_protocol_run_approval(run_b, 'maybe');
    raise exception 'invalid approval decision unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  -- Comments surfaced via list_protocol_runs with author display name.
  comment_id := public.add_protocol_run_comment(run_a, 'QA run comment');
  assert comment_id is not null, 'add_protocol_run_comment must create a comment';
  assert exists (
    select 1 from public.list_protocol_runs() r
     where r.id = run_a and jsonb_array_length(r.comments) = 1
       and r.comments -> 0 ->> 'body' = 'QA run comment'
       and r.comments -> 0 ->> 'author' = 'QA Protocols Manager A'
  ), 'list_protocol_runs must surface comments with author display names';

  begin
    perform public.add_protocol_run_comment(run_a, '   ');
    raise exception 'blank comment unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Manager A: soft delete / restore / hard-delete protection
-- ------------------------------------------------------------
do $$
declare
  tmpl_b uuid := (select id from qa_protocol_ids where key = 'tmpl_b');
  run_a uuid := (select id from qa_protocol_ids where key = 'run_a');
begin
  perform public.soft_delete_protocol_template(tmpl_b);
  assert exists (select 1 from public.protocol_templates where id = tmpl_b and deleted_at is not null),
    'soft_delete_protocol_template must mark the template deleted';

  assert not exists (select 1 from public.list_protocol_templates(false) where id = tmpl_b),
    'list_protocol_templates(false) must hide a deleted template';
  assert exists (select 1 from public.list_protocol_templates(true) where id = tmpl_b),
    'list_protocol_templates(true) must surface a deleted template for protocols.manage';

  begin
    perform public.save_protocol_template(tmpl_b, jsonb_build_object('title', 'should not save'));
    raise exception 'saving a deleted template unexpectedly succeeded';
  exception when no_data_found then null;
  end;

  perform public.restore_protocol_template(tmpl_b);
  assert exists (
    select 1 from public.protocol_templates where id = tmpl_b and deleted_at is null and deleted_by is null
  ), 'restore_protocol_template must clear the deletion markers';

  begin
    perform public.restore_protocol_template(tmpl_b);
    raise exception 'restoring a non-deleted template unexpectedly succeeded';
  exception when no_data_found then null;
  end;

  begin
    delete from public.protocol_templates where id = tmpl_b;
    raise exception 'hard-delete of protocol_templates unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.protocol_runs where id = run_a;
    raise exception 'hard-delete of protocol_runs unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.protocol_templates (organization_id, title) values (
      '20000000-0000-0000-0000-0000000000f1', 'forged template'
    );
    raise exception 'direct protocol_templates insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.protocol_runs (organization_id, run_number, template_id, template_title) values (
      '20000000-0000-0000-0000-0000000000f1', 'PR-9999', tmpl_b, 'forged run'
    );
    raise exception 'direct protocol_runs insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.protocol_run_comments (organization_id, run_id, body) values (
      '20000000-0000-0000-0000-0000000000f1', run_a, 'forged comment'
    );
    raise exception 'direct protocol_run_comments insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Viewer A (protocols.view only)
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated","organization_id":"20000000-0000-0000-0000-0000000000f1"}',
  true
);

do $$
declare
  tmpl_a uuid := (select id from qa_protocol_ids where key = 'tmpl_a');
  run_a uuid := (select id from qa_protocol_ids where key = 'run_a');
begin
  assert (select count(*) from public.list_protocol_templates(false)) > 0,
    'protocols.view must read organization A templates';
  assert (select count(*) from public.list_protocol_runs()) > 0,
    'protocols.view must read organization A runs';

  begin
    perform public.save_protocol_template(null, jsonb_build_object('title', 'viewer attempt'));
    raise exception 'protocols.view unexpectedly created a template';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.start_protocol_run(tmpl_a, '{}'::jsonb);
    raise exception 'protocols.view unexpectedly started a run';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.update_protocol_run_step(run_a, 'sc-1', jsonb_build_object('completed', true));
    raise exception 'protocols.view unexpectedly updated a run step';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.soft_delete_protocol_template(tmpl_a);
    raise exception 'protocols.view unexpectedly soft deleted a template';
  exception when insufficient_privilege then null;
  end;

  -- Commenting is allowed for read access.
  perform public.add_protocol_run_comment(run_a, 'viewer comment');
  assert exists (
    select 1 from public.list_protocol_runs() r
     where r.id = run_a and r.comments @> jsonb_build_array(jsonb_build_object('body', 'viewer comment'))
  ), 'protocols.view must be able to add a run comment';
end;
$$;

-- ------------------------------------------------------------
-- Manager B: cross-organization isolation
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated","organization_id":"20000000-0000-0000-0000-0000000000f2"}',
  true
);

do $$
declare
  tmpl_a uuid := (select id from qa_protocol_ids where key = 'tmpl_a');
  run_a uuid := (select id from qa_protocol_ids where key = 'run_a');
  org_b_tmpl uuid;
begin
  assert (select count(*) from public.list_protocol_templates(false) where id = tmpl_a) = 0,
    'organization B must not see organization A templates';
  assert (select count(*) from public.list_protocol_runs() where id = run_a) = 0,
    'organization B must not see organization A runs';

  org_b_tmpl := public.save_protocol_template(null, jsonb_build_object(
    'title', 'QA org B template', 'steps', jsonb_build_array(
      jsonb_build_object('id', 'b-1', 'title', 'Org B step', 'required', true,
        'notesAllowed', true, 'evidenceAllowed', true, 'approvalCheckpoint', false)
    )
  ));
  assert exists (
    select 1 from public.protocol_templates
     where id = org_b_tmpl and organization_id = '20000000-0000-0000-0000-0000000000f2'
  ), 'organization B must create templates scoped to its own organization';

  begin
    perform public.soft_delete_protocol_template(tmpl_a);
    raise exception 'organization B unexpectedly soft deleted organization A template';
  exception when no_data_found then null;
  end;

  begin
    perform public.set_protocol_run_status(run_a, 'cancelled');
    raise exception 'organization B unexpectedly mutated organization A run status';
  exception when no_data_found then null;
  end;

  begin
    perform public.update_protocol_run_step(run_a, 'sc-1', jsonb_build_object('completed', true));
    raise exception 'organization B unexpectedly updated organization A run step';
  exception when no_data_found then null;
  end;

  begin
    perform public.start_protocol_run(tmpl_a, '{}'::jsonb);
    raise exception 'organization B unexpectedly started a run from organization A template';
  exception when no_data_found then null;
  end;
end;
$$;

reset role;
rollback;
