-- Transaction-backed QA for 20260615000000_notes_backend.sql.
-- Run only against a disposable database after all dependencies are applied.
begin;

do $$
begin
  assert (select relrowsecurity from pg_class where oid = 'public.notes'::regclass),
    'notes RLS must be enabled';
  assert (select relrowsecurity from pg_class where oid = 'public.note_templates'::regclass),
    'note_templates RLS must be enabled';
  assert not has_table_privilege('authenticated', 'public.notes', 'INSERT'),
    'authenticated must not insert notes directly';
  assert not has_table_privilege('authenticated', 'public.notes', 'UPDATE'),
    'authenticated must not update notes directly';
  assert not has_table_privilege('authenticated', 'public.notes', 'DELETE'),
    'authenticated must not hard-delete notes';
  assert not has_table_privilege('authenticated', 'public.note_templates', 'INSERT'),
    'authenticated must not insert note templates directly';
  assert not has_table_privilege('authenticated', 'public.note_templates', 'UPDATE'),
    'authenticated must not update note templates directly';
  assert not has_table_privilege('authenticated', 'public.note_templates', 'DELETE'),
    'authenticated must not hard-delete note templates';
end;
$$;

create temporary table qa_note_ids (key text primary key, id uuid not null) on commit drop;
grant select, insert on qa_note_ids to authenticated;

insert into auth.users (
  id, email, instance_id, aud, role, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-0000000000f1', 'qa-notes-manager-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000f2', 'qa-notes-viewer-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000f3', 'qa-notes-manager-b@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now())
on conflict (id) do nothing;

-- public.handle_new_user() already inserted a profile row for each user above
-- (display_name derived from email), so this must overwrite that placeholder
-- with the QA display name rather than "do nothing".
insert into public.profiles (id, email, display_name) values
  ('00000000-0000-0000-0000-0000000000f1', 'qa-notes-manager-a@example.com', 'QA Notes Manager A'),
  ('00000000-0000-0000-0000-0000000000f2', 'qa-notes-viewer-a@example.com', 'QA Notes Viewer A'),
  ('00000000-0000-0000-0000-0000000000f3', 'qa-notes-manager-b@example.com', 'QA Notes Manager B')
on conflict (id) do update set
  email = excluded.email,
  display_name = excluded.display_name;

insert into public.organizations (id, name, slug) values
  ('20000000-0000-0000-0000-0000000000f1', 'QA Notes Organization A', 'qa-notes-org-a'),
  ('20000000-0000-0000-0000-0000000000f2', 'QA Notes Organization B', 'qa-notes-org-b')
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
-- Manager A: create, validation, lifecycle
-- ------------------------------------------------------------
do $$
declare
  note_a uuid;
  note_b uuid;
  dup uuid;
  pin_state boolean;
begin
  note_a := public.save_note(null, jsonb_build_object(
    'title', 'QA note A', 'category', 'Network', 'content', '# Hello',
    'tags', jsonb_build_array('alpha', 'beta'), 'pinned', false, 'isTemplate', false,
    'linkedDocumentId', 'doc-123'
  ));
  assert note_a is not null, 'manager A must create a note';
  assert exists (
    select 1 from public.notes
     where id = note_a and organization_id = '20000000-0000-0000-0000-0000000000f1'
       and tags = array['alpha','beta'] and owner = 'QA Notes Manager A'
       and links ->> 'linkedDocumentId' = 'doc-123'
  ), 'save_note must persist organization, tags, owner, and linked document id';
  insert into qa_note_ids values ('note_a', note_a);

  begin
    perform public.save_note(null, jsonb_build_object('title', '   '));
    raise exception 'blank title unexpectedly succeeded';
  exception when check_violation then null;
  end;

  -- Update note A: category/content/tags change, owner unaffected.
  perform public.save_note(note_a, jsonb_build_object(
    'title', 'QA note A updated', 'category', 'Security', 'content', '# Updated',
    'tags', jsonb_build_array('gamma'), 'pinned', false, 'isTemplate', false,
    'linkedDocumentId', 'doc-123'
  ));
  assert exists (
    select 1 from public.notes
     where id = note_a and title = 'QA note A updated' and category = 'Security'
       and content = '# Updated' and tags = array['gamma'] and owner = 'QA Notes Manager A'
  ), 'save_note update must persist new fields without changing owner';

  -- Pin toggling.
  pin_state := public.toggle_note_pin(note_a);
  assert pin_state = true, 'toggle_note_pin must pin an unpinned note';
  assert exists (select 1 from public.notes where id = note_a and pinned = true),
    'toggle_note_pin must persist the pinned flag';
  pin_state := public.toggle_note_pin(note_a);
  assert pin_state = false, 'toggle_note_pin must unpin a pinned note';

  -- Archive toggling.
  perform public.set_note_archived(note_a, true);
  assert exists (select 1 from public.notes where id = note_a and archived = true),
    'set_note_archived must archive the note';

  -- Links payload (RelationPicker) merges with existing linkedDocumentId.
  perform public.save_note_links(note_a, jsonb_build_object(
    'linkedTicketIds', jsonb_build_array('ticket-1'),
    'linkedAssetIds', jsonb_build_array('asset-1'),
    'linkedIpamIds', jsonb_build_array('ip-1'),
    'linkedTaskIds', jsonb_build_array('task-1'),
    'linkedUserIds', jsonb_build_array('user-1')
  ));
  assert exists (
    select 1 from public.notes
     where id = note_a
       and links ->> 'linkedDocumentId' = 'doc-123'
       and links -> 'linkedTicketIds' = jsonb_build_array('ticket-1')
       and links -> 'linkedAssetIds' = jsonb_build_array('asset-1')
       and links -> 'linkedIpamIds' = jsonb_build_array('ip-1')
       and links -> 'linkedTaskIds' = jsonb_build_array('task-1')
       and links -> 'linkedUserIds' = jsonb_build_array('user-1')
  ), 'save_note_links must merge link arrays while preserving linkedDocumentId';

  begin
    perform public.save_note_links(note_a, '[]'::jsonb);
    raise exception 'non-object links payload unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  -- A subsequent save_note must preserve the link arrays set above.
  perform public.save_note(note_a, jsonb_build_object(
    'title', 'QA note A updated again', 'category', 'Security', 'content', '# Updated',
    'tags', jsonb_build_array('gamma'), 'pinned', false, 'isTemplate', false,
    'linkedDocumentId', 'doc-456'
  ));
  assert exists (
    select 1 from public.notes
     where id = note_a
       and links ->> 'linkedDocumentId' = 'doc-456'
       and links -> 'linkedTicketIds' = jsonb_build_array('ticket-1')
  ), 'save_note must update linkedDocumentId without wiping previously linked records';

  -- Duplicate resets pinned/archived and appends (copy).
  perform public.set_note_archived(note_a, true);
  dup := public.duplicate_note(note_a);
  insert into qa_note_ids values ('note_a_dup', dup);
  assert exists (
    select 1 from public.notes
     where id = dup and title = 'QA note A updated again (copy)'
       and pinned = false and archived = false
       and links -> 'linkedTicketIds' = jsonb_build_array('ticket-1')
  ), 'duplicate_note must reset pinned/archived, append (copy), and carry links';

  -- Second note for soft delete / restore coverage.
  note_b := public.save_note(null, jsonb_build_object('title', 'QA note B', 'category', 'General', 'content', ''));
  insert into qa_note_ids values ('note_b', note_b);
end;
$$;

-- ------------------------------------------------------------
-- Manager A: note templates
-- ------------------------------------------------------------
do $$
declare
  tpl uuid;
begin
  tpl := public.save_note_template(null, jsonb_build_object(
    'name', 'QA template', 'category', 'General', 'content', '# Template body'
  ));
  assert tpl is not null, 'manager A must create a note template';
  insert into qa_note_ids values ('tpl', tpl);
  assert exists (
    select 1 from public.note_templates
     where id = tpl and organization_id = '20000000-0000-0000-0000-0000000000f1'
       and name = 'QA template' and content = '# Template body'
  ), 'save_note_template must persist organization, name, and content';

  perform public.save_note_template(tpl, jsonb_build_object(
    'name', 'QA template updated', 'category', 'Network', 'content', '# Updated body'
  ));
  assert exists (
    select 1 from public.note_templates
     where id = tpl and name = 'QA template updated' and category = 'Network'
       and content = '# Updated body'
  ), 'save_note_template must update an existing template';

  assert (select count(*) from public.list_note_templates() where id = tpl) = 1,
    'list_note_templates must include the template';

  perform public.soft_delete_note_template(tpl);
  assert exists (select 1 from public.note_templates where id = tpl and deleted_at is not null),
    'soft_delete_note_template must mark the template deleted';
  assert (select count(*) from public.list_note_templates() where id = tpl) = 0,
    'list_note_templates must exclude a deleted template';

  perform public.restore_note_template(tpl);
  assert exists (select 1 from public.note_templates where id = tpl and deleted_at is null and deleted_by is null),
    'restore_note_template must clear the deletion markers';
  assert (select count(*) from public.list_note_templates() where id = tpl) = 1,
    'list_note_templates must include a restored template';

  begin
    perform public.restore_note_template(tpl);
    raise exception 'restoring a non-deleted template unexpectedly succeeded';
  exception when no_data_found then null;
  end;
end;
$$;

-- ------------------------------------------------------------
-- Manager A: soft delete / restore / hard-delete protection
-- ------------------------------------------------------------
do $$
declare
  note_b uuid := (select id from qa_note_ids where key = 'note_b');
  tpl uuid := (select id from qa_note_ids where key = 'tpl');
begin
  perform public.soft_delete_note(note_b);
  assert exists (select 1 from public.notes where id = note_b and deleted_at is not null),
    'soft_delete_note must mark the note deleted';
  assert (select count(*) from public.list_notes(false) where id = note_b) = 0,
    'list_notes without include_deleted must exclude a deleted note';
  assert (select count(*) from public.list_notes(true) where id = note_b) = 1,
    'list_notes with include_deleted must surface a deleted note for notes.manage';

  begin
    perform public.save_note(note_b, jsonb_build_object('title', 'should not save'));
    raise exception 'saving a deleted note unexpectedly succeeded';
  exception when no_data_found then null;
  end;

  perform public.restore_note(note_b);
  assert exists (select 1 from public.notes where id = note_b and deleted_at is null and deleted_by is null),
    'restore_note must clear the deletion markers';

  begin
    perform public.restore_note(note_b);
    raise exception 'restoring a non-deleted note unexpectedly succeeded';
  exception when no_data_found then null;
  end;

  begin
    delete from public.notes where id = note_b;
    raise exception 'hard-delete attempt unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.notes (organization_id, title) values (
      '20000000-0000-0000-0000-0000000000f1', 'forged note'
    );
    raise exception 'direct note insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.note_templates (organization_id, name) values (
      '20000000-0000-0000-0000-0000000000f1', 'forged template'
    );
    raise exception 'direct note template insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  -- cleanup so tpl is not left dangling for later assertions
  perform tpl;
end;
$$;

-- ------------------------------------------------------------
-- Viewer A (notes.view only)
-- ------------------------------------------------------------
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated","organization_id":"20000000-0000-0000-0000-0000000000f1"}',
  true
);

do $$
declare note_a uuid := (select id from qa_note_ids where key = 'note_a');
begin
  assert (select count(*) from public.list_notes(false)) > 0,
    'notes.view must read organization A notes';

  begin
    perform public.save_note(null, jsonb_build_object('title', 'viewer attempt'));
    raise exception 'notes.view unexpectedly created a note';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.toggle_note_pin(note_a);
    raise exception 'notes.view unexpectedly toggled a note pin';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.set_note_archived(note_a, true);
    raise exception 'notes.view unexpectedly archived a note';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.soft_delete_note(note_a);
    raise exception 'notes.view unexpectedly soft deleted a note';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.save_note_template(null, jsonb_build_object('name', 'viewer template'));
    raise exception 'notes.view unexpectedly created a note template';
  exception when insufficient_privilege then null;
  end;
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
  note_a uuid := (select id from qa_note_ids where key = 'note_a');
  org_b_note uuid;
begin
  assert (select count(*) from public.list_notes(true) where id = note_a) = 0,
    'organization B must not see organization A notes';

  org_b_note := public.save_note(null, jsonb_build_object('title', 'QA org B note'));
  assert exists (
    select 1 from public.notes where id = org_b_note and organization_id = '20000000-0000-0000-0000-0000000000f2'
  ), 'organization B must create notes scoped to its own organization';

  begin
    perform public.toggle_note_pin(note_a);
    raise exception 'organization B unexpectedly toggled organization A note pin';
  exception when no_data_found then null;
  end;

  begin
    perform public.set_note_archived(note_a, true);
    raise exception 'organization B unexpectedly archived organization A note';
  exception when no_data_found then null;
  end;

  begin
    perform public.soft_delete_note(note_a);
    raise exception 'organization B unexpectedly soft deleted organization A note';
  exception when no_data_found then null;
  end;

  begin
    perform public.save_note_links(note_a, '{}'::jsonb);
    raise exception 'organization B unexpectedly updated organization A note links';
  exception when no_data_found then null;
  end;

  begin
    perform public.duplicate_note(note_a);
    raise exception 'organization B unexpectedly duplicated organization A note';
  exception when no_data_found then null;
  end;
end;
$$;

reset role;
rollback;
