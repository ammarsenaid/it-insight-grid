-- Transaction-backed QA for 20260614000000_tasks_backend.sql.
-- Run only against a disposable database after all dependencies are applied.
begin;

do $$
begin
  assert (select relrowsecurity from pg_class where oid = 'public.tasks'::regclass),
    'tasks RLS must be enabled';
  assert (select relrowsecurity from pg_class where oid = 'public.task_comments'::regclass),
    'task_comments RLS must be enabled';
  assert not has_table_privilege('authenticated', 'public.tasks', 'INSERT'),
    'authenticated must not insert tasks directly';
  assert not has_table_privilege('authenticated', 'public.tasks', 'UPDATE'),
    'authenticated must not update tasks directly';
  assert not has_table_privilege('authenticated', 'public.tasks', 'DELETE'),
    'authenticated must not hard-delete tasks';
  assert not has_table_privilege('authenticated', 'public.task_comments', 'INSERT'),
    'authenticated must not insert task comments directly';
  assert not has_table_privilege('authenticated', 'public.task_comments', 'UPDATE'),
    'authenticated must not update task comments directly';
  assert not has_table_privilege('authenticated', 'public.task_comments', 'DELETE'),
    'authenticated must not hard-delete task comments';
end;
$$;

-- RBAC alignment: doc_editor must match the frontend "tasks.write" capability.
do $$
begin
  assert exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.role_key = 'doc_editor' and p.permission_key = 'tasks.manage'
  ), 'doc_editor must be granted tasks.manage to match the frontend tasks.write capability';
end;
$$;

create temporary table qa_task_ids (key text primary key, id uuid not null) on commit drop;
grant select, insert on qa_task_ids to authenticated;

insert into auth.users (
  id, email, instance_id, aud, role, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-0000000000e1', 'qa-tasks-manager-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000e2', 'qa-tasks-viewer-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000e3', 'qa-tasks-manager-b@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now())
on conflict (id) do nothing;

-- public.handle_new_user() already inserted a profile row for each user above
-- (display_name derived from email), so this must overwrite that placeholder
-- with the QA display name rather than "do nothing".
insert into public.profiles (id, email, display_name) values
  ('00000000-0000-0000-0000-0000000000e1', 'qa-tasks-manager-a@example.com', 'QA Tasks Manager A'),
  ('00000000-0000-0000-0000-0000000000e2', 'qa-tasks-viewer-a@example.com', 'QA Tasks Viewer A'),
  ('00000000-0000-0000-0000-0000000000e3', 'qa-tasks-manager-b@example.com', 'QA Tasks Manager B')
on conflict (id) do update set
  email = excluded.email,
  display_name = excluded.display_name;

insert into public.organizations (id, name, slug) values
  ('20000000-0000-0000-0000-0000000000e1', 'QA Tasks Organization A', 'qa-tasks-org-a'),
  ('20000000-0000-0000-0000-0000000000e2', 'QA Tasks Organization B', 'qa-tasks-org-b')
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id) values
  ('20000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1'),
  ('20000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2'),
  ('20000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3')
on conflict do nothing;

insert into public.user_global_roles (user_id, role_id)
select fixture.user_id, roles.id
from (values
  ('00000000-0000-0000-0000-0000000000e1'::uuid, 'it_admin'),
  ('00000000-0000-0000-0000-0000000000e2'::uuid, 'platform_auditor'),
  ('00000000-0000-0000-0000-0000000000e3'::uuid, 'network_admin')
) as fixture(user_id, role_key)
join public.roles on roles.role_key = fixture.role_key
on conflict do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","organization_id":"20000000-0000-0000-0000-0000000000e1"}',
  true
);

-- ------------------------------------------------------------
-- Manager A: create, validation, lifecycle
-- ------------------------------------------------------------
do $$
declare
  task_a uuid;
  task_b uuid;
  follow_up uuid;
  comment_id uuid;
begin
  task_a := public.save_task(null, jsonb_build_object(
    'title', 'QA task A', 'description', 'Initial description',
    'category', 'Maintenance', 'priority', 'normal', 'status', 'open',
    'scope', 'team', 'source', 'manual', 'team', 'Infrastructure',
    'tags', jsonb_build_array('alpha', 'beta'),
    'watchers', jsonb_build_array('qa-watcher@example.com'),
    'notes', 'qa notes'
  ));
  assert task_a is not null, 'manager A must create a task';
  assert exists (
    select 1 from public.tasks
     where id = task_a and organization_id = '20000000-0000-0000-0000-0000000000e1'
       and tags = array['alpha','beta'] and watchers = array['qa-watcher@example.com']
  ), 'save_task must persist organization, tags, and watchers';
  insert into qa_task_ids values ('task_a', task_a);

  begin
    perform public.save_task(null, jsonb_build_object(
      'title', 'invalid checklist',
      'checklist', jsonb_build_array(jsonb_build_object('completed', false))
    ));
    raise exception 'checklist item without a title unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.save_task(null, jsonb_build_object(
      'title', 'invalid recurring', 'recurring', jsonb_build_object('freq', 'hourly', 'interval', 1)
    ));
    raise exception 'invalid recurrence frequency unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.save_task(null, jsonb_build_object('title', 'invalid priority', 'priority', 'urgent'));
    raise exception 'invalid priority unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.save_task(null, jsonb_build_object('title', 'invalid status', 'status', 'closed'));
    raise exception 'invalid status unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  -- Recurring task with a due date and a checklist, used for the follow-up test.
  task_b := public.save_task(null, jsonb_build_object(
    'title', 'QA recurring task', 'priority', 'low', 'status', 'open',
    'due_date', '2026-01-01T00:00:00Z', 'reminder_at', '2025-12-31T00:00:00Z',
    'recurring', jsonb_build_object('freq', 'weekly', 'interval', 1),
    'checklist', jsonb_build_array(
      jsonb_build_object('title', 'Step one', 'completed', true, 'required', true),
      jsonb_build_object('title', 'Step two', 'completed', false, 'required', false)
    )
  ));
  insert into qa_task_ids values ('task_b', task_b);

  -- Update task A.
  perform public.save_task(task_a, jsonb_build_object(
    'title', 'QA task A updated', 'description', 'Updated description',
    'category', 'Maintenance', 'priority', 'high', 'scope', 'team', 'source', 'manual',
    'assigned_to', 'qa.assignee', 'owner', '', 'team', 'Infrastructure', 'notes', 'updated notes'
  ));
  assert exists (
    select 1 from public.tasks
     where id = task_a and title = 'QA task A updated' and priority = 'high'
       and assigned_to = 'qa.assignee' and status = 'open'
       and owner <> '' and owner is not null
  ), 'save_task update must persist new fields without changing status, and an empty owner must not wipe the existing owner';

  begin
    perform public.save_task(task_a, jsonb_build_object('title', ''));
    raise exception 'blank title unexpectedly succeeded';
  exception when check_violation then null;
  end;

  -- Completing the recurring task creates a follow-up with the next occurrence.
  follow_up := public.set_task_status(task_b, 'done');
  assert follow_up is not null, 'completing a recurring task must create a follow-up';
  insert into qa_task_ids values ('task_b_followup', follow_up);
  assert exists (
    select 1 from public.tasks where id = task_b and status = 'done' and completed_at is not null
  ), 'completed task must record completed_at';
  assert exists (
    select 1 from public.tasks
     where id = follow_up and status = 'open'
       and due_date = '2026-01-08T00:00:00Z'::timestamptz
       and reminder_at = '2026-01-07T00:00:00Z'::timestamptz
  ), 'follow-up task must carry the next weekly occurrence';
  assert exists (
    select 1 from public.tasks t
     where t.id = follow_up
       and t.checklist -> 0 ->> 'completed' = 'false'
       and t.checklist -> 1 ->> 'completed' = 'false'
       and t.checklist -> 0 ->> 'id' is not null
  ), 'follow-up checklist must be reset with completed=false and new item ids';

  -- Reopening a done task clears completed_at.
  perform public.set_task_status(task_b, 'in_progress');
  assert exists (
    select 1 from public.tasks where id = task_b and status = 'in_progress' and completed_at is null
  ), 'reopening a completed task must clear completed_at';

  begin
    perform public.set_task_status(task_b, 'urgent');
    raise exception 'invalid status transition unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  -- Escalation steps priority and marks escalated.
  assert public.escalate_task(task_a) = 'critical', 'escalating a high-priority task must reach critical';
  assert public.escalate_task(task_a) = 'critical', 'escalating a critical task must remain critical';
  assert exists (
    select 1 from public.tasks where id = task_a and escalated = true
  ), 'escalation must set the escalated flag';

  -- Archive toggling.
  perform public.set_task_archived(task_a, true);
  assert exists (select 1 from public.tasks where id = task_a and archived = true),
    'set_task_archived must archive the task';
  perform public.set_task_archived(task_a, false);
  assert exists (select 1 from public.tasks where id = task_a and archived = false),
    'set_task_archived must unarchive the task';

  -- Duplicate resets status and checklist.
  declare dup uuid;
  begin
    dup := public.duplicate_task(task_b);
    insert into qa_task_ids values ('task_b_dup', dup);
    assert exists (
      select 1 from public.tasks
       where id = dup and title = 'QA recurring task (copy)' and status = 'open'
         and escalated = false and archived = false
         and checklist -> 0 ->> 'completed' = 'false'
    ), 'duplicate_task must reset status, checklist completion, and append (copy)';
  end;

  -- Links payload.
  perform public.save_task_links(task_a, jsonb_build_object(
    'linkedAssetId', 'asset-1', 'linkedTicketIds', jsonb_build_array('ticket-1'),
    'dependencyIds', jsonb_build_array(task_b::text)
  ));
  assert exists (
    select 1 from public.tasks where id = task_a and links ->> 'linkedAssetId' = 'asset-1'
  ), 'save_task_links must persist the links payload';
  begin
    perform public.save_task_links(task_a, '[]'::jsonb);
    raise exception 'non-object links payload unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  -- Reminder.
  perform public.set_task_reminder(task_a, '2026-02-01T08:00:00Z');
  assert exists (
    select 1 from public.tasks where id = task_a and reminder_at = '2026-02-01T08:00:00Z'::timestamptz
  ), 'set_task_reminder must persist the reminder time';

  -- Comments.
  comment_id := public.add_task_comment(task_a, 'QA comment body');
  assert comment_id is not null, 'add_task_comment must create a comment';
  assert exists (
    select 1 from public.list_tasks(false) t
     where t.id = task_a and jsonb_array_length(t.comments) = 1
       and t.comments -> 0 ->> 'body' = 'QA comment body'
       and t.comments -> 0 ->> 'authorName' = 'QA Tasks Manager A'
  ), 'list_tasks must surface comments with author display names';

  begin
    perform public.add_task_comment(task_a, '   ');
    raise exception 'blank comment unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Manager A: bulk operations
-- ------------------------------------------------------------
do $$
declare
  bulk_a uuid;
  bulk_b uuid;
  changed integer;
begin
  bulk_a := public.save_task(null, jsonb_build_object('title', 'QA bulk task A', 'status', 'open', 'priority', 'low'));
  bulk_b := public.save_task(null, jsonb_build_object('title', 'QA bulk task B', 'status', 'open', 'priority', 'low'));
  insert into qa_task_ids values ('bulk_a', bulk_a), ('bulk_b', bulk_b);

  changed := public.bulk_update_tasks(array[bulk_a, bulk_b], jsonb_build_object(
    'status', 'done', 'priority', 'high', 'assigned_to', 'qa.bulk', 'team', 'Infrastructure'
  ));
  assert changed = 2, 'bulk_update_tasks must report two updated rows';
  assert (select count(*) from public.tasks
           where id in (bulk_a, bulk_b) and status = 'done' and priority = 'high'
             and assigned_to = 'qa.bulk' and completed_at is not null) = 2,
    'bulk_update_tasks must apply status, priority, assignee, and completed_at';

  changed := public.bulk_update_tasks(array[bulk_a, bulk_b], jsonb_build_object('status', 'open', 'due_date', ''));
  assert (select count(*) from public.tasks
           where id in (bulk_a, bulk_b) and status = 'open' and completed_at is null and due_date is null) = 2,
    'bulk_update_tasks must clear completed_at and due_date on reopen';

  changed := public.bulk_add_task_tag(array[bulk_a, bulk_b], 'qa-bulk-tag');
  assert changed = 2, 'bulk_add_task_tag must report two updated rows';
  assert (select count(*) from public.tasks
           where id in (bulk_a, bulk_b) and 'qa-bulk-tag' = any(tags)) = 2,
    'bulk_add_task_tag must add the tag to each task';
  perform public.bulk_add_task_tag(array[bulk_a], 'qa-bulk-tag');
  assert (select array_length(tags, 1) from public.tasks where id = bulk_a)
       = (select array_length(array(select distinct unnest(tags)) , 1) from public.tasks where id = bulk_a),
    'bulk_add_task_tag must not duplicate an existing tag';

  changed := public.bulk_set_tasks_archived(array[bulk_a, bulk_b], true);
  assert changed = 2, 'bulk_set_tasks_archived must report two updated rows';
  assert (select count(*) from public.tasks where id in (bulk_a, bulk_b) and archived = true) = 2,
    'bulk_set_tasks_archived must archive both tasks';

  changed := public.bulk_soft_delete_tasks(array[bulk_a, bulk_b]);
  assert changed = 2, 'bulk_soft_delete_tasks must report two updated rows';
  assert (select count(*) from public.tasks where id in (bulk_a, bulk_b) and deleted_at is not null) = 2,
    'bulk_soft_delete_tasks must soft delete both tasks';

  begin
    perform public.bulk_update_tasks(array[]::uuid[], jsonb_build_object('status', 'open'));
    raise exception 'empty bulk batch unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.bulk_update_tasks(array[bulk_a], jsonb_build_object('status', 'open'));
    raise exception 'bulk update of a deleted task unexpectedly succeeded';
  exception when no_data_found then null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Manager A: soft delete / restore / hard-delete protection
-- ------------------------------------------------------------
do $$
declare
  task_a uuid := (select id from qa_task_ids where key = 'task_a');
begin
  perform public.soft_delete_task(task_a);
  assert exists (select 1 from public.tasks where id = task_a and deleted_at is not null),
    'soft_delete_task must mark the task deleted';

  begin
    perform public.save_task(task_a, jsonb_build_object('title', 'should not save'));
    raise exception 'saving a deleted task unexpectedly succeeded';
  exception when no_data_found then null;
  end;

  perform public.restore_task(task_a);
  assert exists (select 1 from public.tasks where id = task_a and deleted_at is null and deleted_by is null),
    'restore_task must clear the deletion markers';

  begin
    perform public.restore_task(task_a);
    raise exception 'restoring a non-deleted task unexpectedly succeeded';
  exception when no_data_found then null;
  end;

  begin
    delete from public.tasks where id = task_a;
    raise exception 'hard-delete attempt unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.tasks (organization_id, title) values (
      '20000000-0000-0000-0000-0000000000e1', 'forged task'
    );
    raise exception 'direct insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.task_comments (organization_id, task_id, body) values (
      '20000000-0000-0000-0000-0000000000e1', task_a, 'forged comment'
    );
    raise exception 'direct comment insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Viewer A (tasks.view only)
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated","organization_id":"20000000-0000-0000-0000-0000000000e1"}',
  true
);

do $$
declare task_a uuid := (select id from qa_task_ids where key = 'task_a');
begin
  assert (select count(*) from public.list_tasks(false)) > 0,
    'tasks.view must read organization A tasks';

  begin
    perform public.save_task(null, jsonb_build_object('title', 'viewer attempt'));
    raise exception 'tasks.view unexpectedly created a task';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.set_task_status(task_a, 'done');
    raise exception 'tasks.view unexpectedly changed task status';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.soft_delete_task(task_a);
    raise exception 'tasks.view unexpectedly soft deleted a task';
  exception when insufficient_privilege then null;
  end;

  -- Commenting is allowed for read access.
  perform public.add_task_comment(task_a, 'viewer comment');
  assert exists (
    select 1 from public.list_tasks(false) t
     where t.id = task_a and t.comments @> jsonb_build_array(jsonb_build_object('body', 'viewer comment'))
  ), 'tasks.view must be able to add a comment';
end;
$$;

-- ------------------------------------------------------------
-- Manager B: cross-organization isolation
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated","organization_id":"20000000-0000-0000-0000-0000000000e2"}',
  true
);

do $$
declare
  task_a uuid := (select id from qa_task_ids where key = 'task_a');
  org_b_task uuid;
begin
  assert (select count(*) from public.list_tasks(false)
           where id = task_a) = 0,
    'organization B must not see organization A tasks';

  org_b_task := public.save_task(null, jsonb_build_object('title', 'QA org B task'));
  assert exists (
    select 1 from public.tasks where id = org_b_task and organization_id = '20000000-0000-0000-0000-0000000000e2'
  ), 'organization B must create tasks scoped to its own organization';

  begin
    perform public.set_task_status(task_a, 'done');
    raise exception 'organization B unexpectedly mutated organization A task status';
  exception when no_data_found then null;
  end;

  begin
    perform public.soft_delete_task(task_a);
    raise exception 'organization B unexpectedly soft deleted organization A task';
  exception when no_data_found then null;
  end;

  begin
    perform public.save_task_links(task_a, '{}'::jsonb);
    raise exception 'organization B unexpectedly updated organization A task links';
  exception when no_data_found then null;
  end;

  begin
    perform public.bulk_soft_delete_tasks(array[task_a]);
    raise exception 'organization B unexpectedly bulk-deleted organization A task';
  exception when no_data_found then null;
  end;
end;
$$;

reset role;
rollback;
