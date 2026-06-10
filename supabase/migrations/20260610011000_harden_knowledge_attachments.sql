begin;

-- ============================================================
-- IT KNOWLEDGE CENTER — RC1.1 HARDENING
-- Batch 007: Attachment isolation hardening
-- ============================================================

alter table public.knowledge_attachments
  add constraint knowledge_attachments_mime_allowlist
  check (mime_type in (
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ));

create or replace function public.knowledge_attachments_validate_path()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $f$
declare
  parts text[];
  v_team uuid;
  v_article uuid;
begin
  parts := string_to_array(new.storage_path, '/');
  if parts is null or array_length(parts, 1) < 3 then
    raise exception 'Invalid attachment path.' using errcode = '22023';
  end if;
  begin
    v_team    := parts[1]::uuid;
    v_article := parts[2]::uuid;
  exception when others then
    raise exception 'Invalid attachment path.' using errcode = '22023';
  end;
  if v_team is distinct from new.team_id then
    raise exception 'Attachment team mismatch.' using errcode = '22023';
  end if;
  if v_article is distinct from new.article_id then
    raise exception 'Attachment article mismatch.' using errcode = '22023';
  end if;
  return new;
end;
$f$;

drop trigger if exists trg_knowledge_attachments_validate on public.knowledge_attachments;

create trigger trg_knowledge_attachments_validate
before insert on public.knowledge_attachments
for each row execute function public.knowledge_attachments_validate_path();

create or replace function public.kb_storage_path_article(p text)
returns uuid
language plpgsql
stable
set search_path = pg_catalog, public
as $f$
declare
  fn text[];
  v_team uuid;
  v_article uuid;
  v_actual_team uuid;
begin
  fn := storage.foldername(p);
  if fn is null or array_length(fn, 1) < 2 then
    return null;
  end if;
  if fn[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  if fn[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  v_team    := fn[1]::uuid;
  v_article := fn[2]::uuid;
  select team_id into v_actual_team from public.knowledge_articles where id = v_article;
  if v_actual_team is null or v_actual_team <> v_team then
    return null;
  end if;
  return v_article;
end;
$f$;

revoke all on function public.kb_storage_path_article(text) from public;
grant execute on function public.kb_storage_path_article(text) to authenticated;

drop policy if exists "knowledge_attachments_storage_select" on storage.objects;
drop policy if exists "knowledge_attachments_storage_insert" on storage.objects;
drop policy if exists "knowledge_attachments_storage_delete" on storage.objects;

create policy "knowledge_attachments_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'knowledge-attachments'
  and public.kb_storage_path_article(name) is not null
  and public.can_read_knowledge_article(public.kb_storage_path_article(name))
);

create policy "knowledge_attachments_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'knowledge-attachments'
  and owner = (select auth.uid())
  and public.kb_storage_path_article(name) is not null
  and public.has_permission(
    'knowledge.update',
    ((storage.foldername(name))[1])::uuid
  )
);

create policy "knowledge_attachments_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'knowledge-attachments'
  and public.kb_storage_path_article(name) is not null
  and public.has_permission(
    'knowledge.update',
    ((storage.foldername(name))[1])::uuid
  )
);

commit;
