begin;

-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration Batch 004: Article Attachments
-- ============================================================
--
-- Adds:
--   - public.knowledge_attachments — pointer rows linking storage
--     objects to articles, with team scoping and RLS.
--   - storage.objects RLS policies for the 'knowledge-attachments'
--     bucket.
--
-- Storage bucket (must be created out-of-band, manually or via the
-- Lovable Cloud / Supabase storage tool — buckets cannot be created
-- through migrations):
--
--     name   : knowledge-attachments
--     public : false
--
-- Object path convention (enforced by the client):
--
--     {team_id}/{article_id}/{attachment_id}-{file_name}
--
-- Per-team RLS keys off the first path segment (team_id).
-- ============================================================

-- ------------------------------------------------------------
-- 1. ATTACHMENT POINTERS
-- ------------------------------------------------------------

create table public.knowledge_attachments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  team_id uuid not null,
  storage_path text not null unique check (
    char_length(storage_path) between 5 and 1024
  ),
  file_name text not null check (
    char_length(trim(file_name)) between 1 and 255
  ),
  mime_type text not null check (
    char_length(mime_type) between 1 and 255
  ),
  size_bytes bigint not null check (
    size_bytes >= 0 and size_bytes <= 26214400  -- 25 MiB cap
  ),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (article_id, team_id)
    references public.knowledge_articles(id, team_id)
    on delete cascade
);

comment on table public.knowledge_attachments is
  'Pointers from knowledge articles to objects in the knowledge-attachments storage bucket.';

create index idx_knowledge_attachments_article_created
  on public.knowledge_attachments(article_id, created_at desc);

create index idx_knowledge_attachments_team
  on public.knowledge_attachments(team_id);

-- ------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.knowledge_attachments
  enable row level security;

create policy knowledge_attachments_select_visible_article
on public.knowledge_attachments
for select
to authenticated
using (
  public.can_read_knowledge_article(article_id)
);

create policy knowledge_attachments_insert_editors
on public.knowledge_attachments
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and public.has_permission('knowledge.update', team_id)
);

create policy knowledge_attachments_delete_editors
on public.knowledge_attachments
for delete
to authenticated
using (
  public.has_permission('knowledge.update', team_id)
);

-- Pointer rows are immutable once inserted (no update policy).

-- ------------------------------------------------------------
-- 3. DATA API PRIVILEGES
-- ------------------------------------------------------------

revoke all privileges
on table public.knowledge_attachments
from anon, authenticated;

grant select, insert, delete
on table public.knowledge_attachments
to authenticated;

-- ------------------------------------------------------------
-- 4. STORAGE OBJECT POLICIES
--
-- Bucket id must equal 'knowledge-attachments'. The first path
-- segment is the team uuid. We require it to look like a uuid before
-- casting to avoid type-cast exceptions inside the policy expression.
-- ------------------------------------------------------------

create policy "knowledge_attachments_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'knowledge-attachments'
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.has_permission(
    'knowledge.read',
    ((storage.foldername(name))[1])::uuid
  )
);

create policy "knowledge_attachments_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'knowledge-attachments'
  and owner = (select auth.uid())
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
  and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.has_permission(
    'knowledge.update',
    ((storage.foldername(name))[1])::uuid
  )
);

commit;
