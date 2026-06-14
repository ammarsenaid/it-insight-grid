-- ============================================================
-- QA — Ticket Attachments (Phase A — Batch 3/6)
-- ------------------------------------------------------------
-- DRAFT — NOT YET APPLIED. Single transaction, rolled back.
--
-- Covered:
--   * Bucket exists and is private
--   * Structural path validation accepts only <ticket_uuid>/<filename>
--   * Metadata storage paths must match their ticket_id
--   * Comment attachments bind to a comment on the same ticket
--   * Ticket-only attachments preserve a null comment_id
--   * Ticket authorization, not path parsing, rejects nonexistent tickets
--   * Ticket ownership does not bypass attachment-view permission
--   * Requester sees public metadata and storage objects only
--   * Helpdesk sees public and internal metadata and storage objects
--   * Other employees see neither metadata nor storage objects
--   * Storage DELETE policy is scoped to owners or attachment managers
--   * Metadata uploader can delete; foreign user cannot
-- ============================================================

begin;

-- ---- bucket present and private ----
do $$
declare
  bucket_name text;
  has_public boolean;
  is_pub boolean;
begin
  select name into bucket_name
  from storage.buckets
  where id = 'ticket-attachments';

  if bucket_name is distinct from 'ticket-attachments' then
    raise exception 'Bucket ticket-attachments missing or misnamed';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'public'
  ) into has_public;

  if has_public then
    execute $bucket$
      select public
      from storage.buckets
      where id = 'ticket-attachments'
    $bucket$ into is_pub;

    if is_pub is distinct from false then
      raise exception 'Bucket ticket-attachments must be private';
    end if;
  end if;
end$$;

-- Stored-file deletion must be tested later through the Supabase Storage API
-- in an API or staging integration test. Raw SQL deletion from storage.objects
-- is intentionally unsupported.
-- ---- storage delete policy catalog assertions ----
do $$
declare
  policy_roles name[];
  policy_command text;
  policy_qualification text;
  compact_qualification text;
begin
  if not exists (
    select 1
    from pg_policies
    where policyname = 'ticket_attachments_storage_delete'
      and schemaname = 'storage'
      and tablename = 'objects'
  ) then
    raise exception 'Storage DELETE policy ticket_attachments_storage_delete is missing';
  end if;

  select roles, cmd, qual
    into policy_roles, policy_command, policy_qualification
    from pg_policies
   where policyname = 'ticket_attachments_storage_delete'
     and schemaname = 'storage'
     and tablename = 'objects';

  if policy_command is distinct from 'DELETE' then
    raise exception 'Storage delete policy command must be DELETE';
  end if;
  if not coalesce('authenticated'::name = any(policy_roles), false) then
    raise exception 'Storage delete policy must apply to authenticated';
  end if;

  if policy_qualification is null then
    raise exception 'Storage delete policy qualification is missing';
  end if;
  compact_qualification := regexp_replace(
    lower(policy_qualification),
    '[[:space:]]+',
    '',
    'g'
  );
  if position('bucket_id=''ticket-attachments''' in compact_qualification) = 0 then
    raise exception 'Storage delete policy must target the ticket-attachments bucket';
  end if;
  if position('owner' in compact_qualification) = 0
     or position('uid()' in compact_qualification) = 0 then
    raise exception 'Storage delete policy must authorize the owner through auth.uid()';
  end if;
  if position('has_permission' in compact_qualification) = 0
     or position('tickets.attachments.manage' in compact_qualification) = 0 then
    raise exception 'Storage delete policy must authorize tickets.attachments.manage';
  end if;
  if exists (
    select 1
    from pg_policies
    where policyname = 'ticket_attachments_storage_update'
  ) then
    raise exception 'Storage UPDATE policy ticket_attachments_storage_update must not exist';
  end if;
end$$;

-- ---- path helper is structural only ----
do $$
begin
  if not public.is_valid_ticket_attachment_path(
    '00000000-0000-0000-0000-00000000c999/file.txt'
  ) then
    raise exception 'Path validator rejected a valid structural path';
  end if;
  if public.is_valid_ticket_attachment_path('not-a-uuid/file.txt') then
    raise exception 'Path validator accepted malformed UUID';
  end if;
  if public.is_valid_ticket_attachment_path('/etc/passwd') then
    raise exception 'Path validator accepted absolute path';
  end if;
  if public.is_valid_ticket_attachment_path(
    '00000000-0000-0000-0000-00000000c999/folder/file.txt'
  ) then
    raise exception 'Path validator accepted an extra path segment';
  end if;
  if public.is_valid_ticket_attachment_path(
    '00000000-0000-0000-0000-00000000c999/.'
  ) then
    raise exception 'Path validator accepted dot filename';
  end if;
  if public.is_valid_ticket_attachment_path(
    '00000000-0000-0000-0000-00000000c999/..'
  ) then
    raise exception 'Path validator accepted dot-dot filename';
  end if;
  if not public.is_valid_ticket_attachment_path(
    '00000000-0000-0000-0000-00000000c999/nonexistent.txt'
  ) then
    raise exception 'Structural validator incorrectly queried ticket existence';
  end if;
end$$;

-- ---- fixture users + tickets ----
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

insert into public.tickets (id, requester_id, subject, description)
values
  ('00000000-0000-0000-0000-00000000b101'::uuid,
   '00000000-0000-0000-0000-0000000000b1'::uuid,
   'QA attachment ticket', 'body'),
  ('00000000-0000-0000-0000-00000000b102'::uuid,
   '00000000-0000-0000-0000-0000000000b3'::uuid,
   'QA cross-ticket path', 'body');

insert into public.ticket_comments (id, ticket_id, author_id, body, internal)
values
  ('00000000-0000-0000-0000-00000000b201'::uuid,
   '00000000-0000-0000-0000-00000000b101'::uuid,
   '00000000-0000-0000-0000-0000000000b1'::uuid,
   'QA public attachment comment', false),
  ('00000000-0000-0000-0000-00000000b202'::uuid,
   '00000000-0000-0000-0000-00000000b101'::uuid,
   '00000000-0000-0000-0000-0000000000b2'::uuid,
   'QA internal attachment comment', true),
  ('00000000-0000-0000-0000-00000000b203'::uuid,
   '00000000-0000-0000-0000-00000000b102'::uuid,
   '00000000-0000-0000-0000-0000000000b3'::uuid,
   'QA foreign-ticket comment', false),
  ('00000000-0000-0000-0000-00000000b204'::uuid,
   '00000000-0000-0000-0000-00000000b101'::uuid,
   '00000000-0000-0000-0000-0000000000b2'::uuid,
   'QA comment delete behavior', false);

-- ---- matched metadata paths are accepted ----
insert into public.ticket_attachments
  (id, ticket_id, comment_id, uploaded_by, storage_path, file_name, mime_type, size_bytes, visibility)
values
  ('00000000-0000-0000-0000-00000000b1aa'::uuid,
   '00000000-0000-0000-0000-00000000b101'::uuid,
   '00000000-0000-0000-0000-00000000b201'::uuid,
   '00000000-0000-0000-0000-0000000000b1'::uuid,
   '00000000-0000-0000-0000-00000000b101/screenshot.png',
   'screenshot.png','image/png',1024,'public'),
  ('00000000-0000-0000-0000-00000000b1bb'::uuid,
   '00000000-0000-0000-0000-00000000b101'::uuid,
   '00000000-0000-0000-0000-00000000b202'::uuid,
   '00000000-0000-0000-0000-0000000000b2'::uuid,
   '00000000-0000-0000-0000-00000000b101/internal-log.txt',
   'internal-log.txt','text/plain',512,'internal'),
  ('00000000-0000-0000-0000-00000000b1dd'::uuid,
   '00000000-0000-0000-0000-00000000b101'::uuid,
   null,
   '00000000-0000-0000-0000-0000000000b1'::uuid,
   '00000000-0000-0000-0000-00000000b101/ticket-only.txt',
   'ticket-only.txt','text/plain',64,'public');

do $$
begin
  if not exists (
    select 1
    from public.ticket_attachments
    where id = '00000000-0000-0000-0000-00000000b1aa'::uuid
      and ticket_id::text = split_part(storage_path, '/', 1)
      and comment_id = '00000000-0000-0000-0000-00000000b201'::uuid
  ) then
    raise exception 'Valid same-ticket comment attachment was not accepted';
  end if;
  if not exists (
    select 1
    from public.ticket_attachments
    where id = '00000000-0000-0000-0000-00000000b1dd'::uuid
      and comment_id is null
  ) then
    raise exception 'Ticket-only attachment with null comment_id was not accepted';
  end if;
end$$;

-- ---- cross-ticket comment bindings are rejected on INSERT ----
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.ticket_attachments
      (id, ticket_id, comment_id, uploaded_by, storage_path, file_name, size_bytes, visibility)
    values
      ('00000000-0000-0000-0000-00000000b1ce'::uuid,
       '00000000-0000-0000-0000-00000000b101'::uuid,
       '00000000-0000-0000-0000-00000000b203'::uuid,
       '00000000-0000-0000-0000-0000000000b1'::uuid,
       '00000000-0000-0000-0000-00000000b101/cross-comment.txt',
       'cross-comment.txt',10,'public');
  exception when foreign_key_violation then
    blocked := true;
  end;
  assert blocked,
    'Cross-ticket comment attachment INSERT MUST be rejected';
end$$;

-- ---- existing metadata cannot be rebound to another ticket's comment ----
do $$
declare blocked boolean := false;
begin
  begin
    update public.ticket_attachments
       set comment_id = '00000000-0000-0000-0000-00000000b203'::uuid
     where id = '00000000-0000-0000-0000-00000000b1aa'::uuid;
  exception when foreign_key_violation then
    blocked := true;
  end;
  assert blocked,
    'Cross-ticket comment attachment UPDATE MUST be rejected';
end$$;

-- ---- deleting a comment preserves the attachment as ticket-only ----
insert into public.ticket_attachments
  (id, ticket_id, comment_id, uploaded_by, storage_path, file_name, size_bytes, visibility)
values
  ('00000000-0000-0000-0000-00000000b1ee'::uuid,
   '00000000-0000-0000-0000-00000000b101'::uuid,
   '00000000-0000-0000-0000-00000000b204'::uuid,
   '00000000-0000-0000-0000-0000000000b2'::uuid,
   '00000000-0000-0000-0000-00000000b101/comment-delete.txt',
   'comment-delete.txt',10,'public');

delete from public.ticket_comments
where id = '00000000-0000-0000-0000-00000000b204'::uuid;

do $$
begin
  assert exists (
    select 1
    from public.ticket_attachments
    where id = '00000000-0000-0000-0000-00000000b1ee'::uuid
      and ticket_id = '00000000-0000-0000-0000-00000000b101'::uuid
      and comment_id is null
  ), 'Deleting a comment MUST preserve its attachment with null comment_id';
end$$;

delete from public.ticket_attachments
where id = '00000000-0000-0000-0000-00000000b1ee'::uuid;

-- ---- cross-ticket metadata paths are rejected by the CHECK constraint ----
do $$
begin
  begin
    insert into public.ticket_attachments
      (id, ticket_id, uploaded_by, storage_path, file_name, size_bytes, visibility)
    values
      ('00000000-0000-0000-0000-00000000b1cc'::uuid,
       '00000000-0000-0000-0000-00000000b101'::uuid,
       '00000000-0000-0000-0000-0000000000b1'::uuid,
       '00000000-0000-0000-0000-00000000b102/cross-ticket.txt',
       'cross-ticket.txt',10,'public');
    raise exception 'Cross-ticket metadata storage path was accepted';
  exception when check_violation then
    null;
  end;
end$$;

-- Storage fixtures corresponding to the public and internal metadata rows.
insert into storage.objects (id, bucket_id, name, owner)
values
  ('00000000-0000-0000-0000-00000000b1d1'::uuid,
   'ticket-attachments',
   '00000000-0000-0000-0000-00000000b101/screenshot.png',
   '00000000-0000-0000-0000-0000000000b1'::uuid),
  ('00000000-0000-0000-0000-00000000b1d2'::uuid,
   'ticket-attachments',
   '00000000-0000-0000-0000-00000000b101/internal-log.txt',
   '00000000-0000-0000-0000-0000000000b2'::uuid),
  ('00000000-0000-0000-0000-00000000b1d4'::uuid,
   'ticket-attachments',
   '00000000-0000-0000-0000-00000000b101/ticket-only.txt',
   '00000000-0000-0000-0000-0000000000b1'::uuid);

-- ---- requester without attachment-view permission sees no rows ----
delete from public.user_global_roles
where user_id = '00000000-0000-0000-0000-0000000000b1'::uuid;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
declare metadata_count int; storage_count int;
begin
  select count(*) into metadata_count
    from public.ticket_attachments
   where ticket_id = '00000000-0000-0000-0000-00000000b101'::uuid;
  select count(*) into storage_count
    from storage.objects
   where bucket_id = 'ticket-attachments'
     and name in (
       '00000000-0000-0000-0000-00000000b101/screenshot.png',
       '00000000-0000-0000-0000-00000000b101/internal-log.txt'
     );
  if metadata_count <> 0 then
    raise exception 'Requester without attachment-view permission read metadata';
  end if;
  if storage_count <> 0 then
    raise exception 'Requester without attachment-view permission read storage objects';
  end if;
end$$;
reset role;
reset "request.jwt.claims";

insert into public.user_global_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000b1'::uuid, id
  from public.roles where role_key = 'employee'
on conflict do nothing;

-- ---- nonexistent ticket passes parsing but fails storage authorization ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
begin
  begin
    insert into storage.objects (id, bucket_id, name, owner)
    values (
      '00000000-0000-0000-0000-00000000b1d3'::uuid,
      'ticket-attachments',
      '00000000-0000-0000-0000-00000000c999/nonexistent.txt',
      '00000000-0000-0000-0000-0000000000b1'::uuid
    );
    raise exception 'Storage policy accepted a nonexistent ticket path';
  exception when insufficient_privilege then
    null;
  end;
end$$;
reset role;
reset "request.jwt.claims";

-- ---- requester sees public metadata and public storage object only ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
declare metadata_public int; metadata_internal int; metadata_ticket_only int;
        storage_public int; storage_internal int; storage_ticket_only int;
begin
  select count(*) into metadata_public
    from public.ticket_attachments
   where storage_path = '00000000-0000-0000-0000-00000000b101/screenshot.png';
  select count(*) into metadata_internal
    from public.ticket_attachments
   where storage_path = '00000000-0000-0000-0000-00000000b101/internal-log.txt';
  select count(*) into metadata_ticket_only
    from public.ticket_attachments
   where storage_path = '00000000-0000-0000-0000-00000000b101/ticket-only.txt';
  select count(*) into storage_public
    from storage.objects
   where bucket_id = 'ticket-attachments'
     and name = '00000000-0000-0000-0000-00000000b101/screenshot.png';
  select count(*) into storage_internal
    from storage.objects
   where bucket_id = 'ticket-attachments'
     and name = '00000000-0000-0000-0000-00000000b101/internal-log.txt';
  select count(*) into storage_ticket_only
    from storage.objects
   where bucket_id = 'ticket-attachments'
     and name = '00000000-0000-0000-0000-00000000b101/ticket-only.txt';
  if metadata_public <> 1 then raise exception 'Requester cannot read public metadata'; end if;
  if storage_public <> 1 then raise exception 'Requester cannot read public storage object'; end if;
  if metadata_ticket_only <> 1 then raise exception 'Requester cannot read ticket-only metadata'; end if;
  if storage_ticket_only <> 1 then raise exception 'Requester cannot read ticket-only storage object'; end if;
  if metadata_internal <> 0 then raise exception 'Requester leaked internal metadata'; end if;
  if storage_internal <> 0 then raise exception 'Requester leaked internal storage object'; end if;
end$$;
reset role;
reset "request.jwt.claims";

-- ---- helpdesk sees public and internal metadata and storage objects ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
do $$
declare metadata_count int; storage_count int;
begin
  select count(*) into metadata_count
    from public.ticket_attachments
   where ticket_id = '00000000-0000-0000-0000-00000000b101'::uuid;
  select count(*) into storage_count
    from storage.objects
   where bucket_id = 'ticket-attachments'
     and name in (
       '00000000-0000-0000-0000-00000000b101/screenshot.png',
       '00000000-0000-0000-0000-00000000b101/internal-log.txt',
       '00000000-0000-0000-0000-00000000b101/ticket-only.txt'
     );
  if metadata_count <> 3 then
    raise exception 'Helpdesk should see 3 metadata rows, got %', metadata_count;
  end if;
  if storage_count <> 3 then
    raise exception 'Helpdesk should see 3 storage objects, got %', storage_count;
  end if;
end$$;
reset role;
reset "request.jwt.claims";

-- ---- unrelated employee sees neither metadata nor storage objects ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
do $$
declare metadata_count int; storage_count int;
begin
  select count(*) into metadata_count
    from public.ticket_attachments
   where ticket_id = '00000000-0000-0000-0000-00000000b101'::uuid;
  select count(*) into storage_count
    from storage.objects
   where bucket_id = 'ticket-attachments'
     and name in (
       '00000000-0000-0000-0000-00000000b101/screenshot.png',
       '00000000-0000-0000-0000-00000000b101/internal-log.txt',
       '00000000-0000-0000-0000-00000000b101/ticket-only.txt'
     );
  if metadata_count <> 0 then
    raise exception 'Foreign employee leaked metadata: %', metadata_count;
  end if;
  if storage_count <> 0 then
    raise exception 'Foreign employee leaked storage objects: %', storage_count;
  end if;
end$$;
reset role;
reset "request.jwt.claims";

-- ---- foreign employee cannot delete metadata ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
do $$
declare metadata_deleted int;
begin
  with d as (
    delete from public.ticket_attachments
     where id = '00000000-0000-0000-0000-00000000b1aa'::uuid
     returning 1
  )
  select count(*) into metadata_deleted from d;
  if metadata_deleted <> 0 then
    raise exception 'Foreign employee deleted attachment metadata';
  end if;
end$$;
reset role;
reset "request.jwt.claims";

-- ---- uploader can delete their own attachment metadata ----
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
declare metadata_deleted int;
begin
  with d as (
    delete from public.ticket_attachments
     where id = '00000000-0000-0000-0000-00000000b1aa'::uuid
     returning 1
  )
  select count(*) into metadata_deleted from d;
  if metadata_deleted <> 1 then raise exception 'Uploader could not delete metadata'; end if;
end$$;
reset role;
reset "request.jwt.claims";

rollback;
