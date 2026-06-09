begin;

-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration Batch 002: Knowledge Content Foundation
-- ============================================================
--
-- Adds:
--   - Knowledge spaces
--   - Categories
--   - Articles
--   - Tags
--   - Article-tag relations
--   - Immutable article revision history
--   - Team-scoped RLS visibility rules
--   - Full-text search indexes
--
-- Visibility model:
--   team     = published content visible to permitted team readers;
--              drafts and archived entries remain visible to editors.
--   editors  = visible to authors and team editors or administrators.
--   private  = visible only to the author and platform administrators.
--
-- Anonymous visitors receive no access to these tables.
-- ============================================================

-- ------------------------------------------------------------
-- 1. KNOWLEDGE SPACES
-- High-level sections such as Infrastructure, Windows, Linux,
-- Networking, Security, Internal Procedures, and Applications.
-- ------------------------------------------------------------

create table public.knowledge_spaces (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (
    char_length(trim(name)) between 2 and 120
  ),
  slug text not null check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 2 and 100
  ),
  description text,
  is_archived boolean not null default false,
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, slug),
  unique (id, team_id)
);

comment on table public.knowledge_spaces is
  'Top-level team-scoped knowledge sections.';

-- ------------------------------------------------------------
-- 2. KNOWLEDGE CATEGORIES
-- Nested classification inside a knowledge space.
-- ------------------------------------------------------------

create table public.knowledge_categories (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  space_id uuid not null,
  name text not null check (
    char_length(trim(name)) between 2 and 120
  ),
  slug text not null check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 2 and 100
  ),
  description text,
  sort_order integer not null default 0 check (
    sort_order >= 0
  ),
  is_archived boolean not null default false,
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (space_id, team_id)
    references public.knowledge_spaces(id, team_id)
    on delete cascade,
  unique (space_id, slug),
  unique (id, team_id, space_id)
);

comment on table public.knowledge_categories is
  'Team-scoped categories nested inside knowledge spaces.';

-- ------------------------------------------------------------
-- 3. KNOWLEDGE ARTICLES
-- Markdown is the canonical stored content format.
-- ------------------------------------------------------------

create table public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  space_id uuid not null,
  category_id uuid,
  title text not null check (
    char_length(trim(title)) between 3 and 240
  ),
  slug text not null check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 2 and 160
  ),
  excerpt text,
  content_markdown text not null default '',
  status text not null default 'draft' check (
    status in ('draft', 'published', 'archived')
  ),
  visibility text not null default 'team' check (
    visibility in ('team', 'editors', 'private')
  ),
  revision_number integer not null default 1 check (
    revision_number >= 1
  ),
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector(
      'simple'::regconfig,
      coalesce(title, '')
      || ' '
      || coalesce(excerpt, '')
      || ' '
      || coalesce(content_markdown, '')
    )
  ) stored,
  foreign key (space_id, team_id)
    references public.knowledge_spaces(id, team_id)
    on delete cascade,
  foreign key (category_id, team_id, space_id)
    references public.knowledge_categories(id, team_id, space_id)
    on delete restrict,
  unique (space_id, slug),
  unique (id, team_id)
);

comment on table public.knowledge_articles is
  'Team-scoped Markdown knowledge articles with publishing state and visibility controls.';

-- ------------------------------------------------------------
-- 4. KNOWLEDGE TAGS
-- ------------------------------------------------------------

create table public.knowledge_tags (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (
    char_length(trim(name)) between 2 and 80
  ),
  slug text not null check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 2 and 80
  ),
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, slug),
  unique (id, team_id)
);

comment on table public.knowledge_tags is
  'Team-scoped reusable labels for knowledge articles.';

-- ------------------------------------------------------------
-- 5. ARTICLE-TAG RELATIONS
-- ------------------------------------------------------------

create table public.knowledge_article_tags (
  article_id uuid not null,
  tag_id uuid not null,
  team_id uuid not null,
  created_by uuid default auth.uid()
    references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (article_id, tag_id),
  foreign key (article_id, team_id)
    references public.knowledge_articles(id, team_id)
    on delete cascade,
  foreign key (tag_id, team_id)
    references public.knowledge_tags(id, team_id)
    on delete cascade
);

comment on table public.knowledge_article_tags is
  'Many-to-many team-scoped relation between knowledge articles and tags.';

-- ------------------------------------------------------------
-- 6. IMMUTABLE ARTICLE REVISION HISTORY
-- ------------------------------------------------------------

create table public.knowledge_article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  team_id uuid not null,
  version_number integer not null check (
    version_number >= 1
  ),
  space_id uuid not null,
  category_id uuid,
  title text not null,
  slug text not null,
  excerpt text,
  content_markdown text not null,
  status text not null,
  visibility text not null,
  edited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (article_id, team_id)
    references public.knowledge_articles(id, team_id)
    on delete cascade,
  unique (article_id, version_number)
);

comment on table public.knowledge_article_revisions is
  'Immutable snapshots created automatically whenever an article is inserted or updated.';

-- ------------------------------------------------------------
-- 7. PERFORMANCE INDEXES
-- ------------------------------------------------------------

create index idx_knowledge_spaces_team_archived
  on public.knowledge_spaces(team_id, is_archived);

create index idx_knowledge_categories_team_space_sort
  on public.knowledge_categories(team_id, space_id, sort_order);

create index idx_knowledge_articles_team_space_status
  on public.knowledge_articles(team_id, space_id, status);

create index idx_knowledge_articles_team_category
  on public.knowledge_articles(team_id, category_id);

create index idx_knowledge_articles_created_by
  on public.knowledge_articles(created_by);

create index idx_knowledge_articles_updated_at
  on public.knowledge_articles(updated_at desc);

create index idx_knowledge_articles_search_vector
  on public.knowledge_articles
  using gin(search_vector);

create index idx_knowledge_tags_team_name
  on public.knowledge_tags(team_id, name);

create index idx_knowledge_article_tags_team_tag
  on public.knowledge_article_tags(team_id, tag_id);

create index idx_knowledge_article_revisions_article_version
  on public.knowledge_article_revisions(article_id, version_number desc);

-- ------------------------------------------------------------
-- 8. AUDIT-PROTECTION TRIGGERS FOR SPACES, CATEGORIES AND TAGS
-- Prevent team ownership and creator attribution from being
-- rewritten through normal Data API updates.
-- ------------------------------------------------------------

create or replace function public.protect_knowledge_space_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.team_id = old.team_id;
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  new.updated_at = now();

  return new;
end;
$$;

create or replace function public.protect_knowledge_category_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.team_id = old.team_id;
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  new.updated_at = now();

  return new;
end;
$$;

create or replace function public.protect_knowledge_tag_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.team_id = old.team_id;
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  new.updated_at = now();

  return new;
end;
$$;

create trigger knowledge_spaces_protect_update
before update on public.knowledge_spaces
for each row
execute function public.protect_knowledge_space_update();

create trigger knowledge_categories_protect_update
before update on public.knowledge_categories
for each row
execute function public.protect_knowledge_category_update();

create trigger knowledge_tags_protect_update
before update on public.knowledge_tags
for each row
execute function public.protect_knowledge_tag_update();

-- ------------------------------------------------------------
-- 9. ARTICLE WRITE PREPARATION
-- Protect creator attribution and team ownership.
-- Increment revision numbers automatically.
-- Stamp the authenticated updater automatically.
-- ------------------------------------------------------------

create or replace function public.prepare_knowledge_article_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by = auth.uid();
    end if;

    if new.updated_by is null then
      new.updated_by = coalesce(auth.uid(), new.created_by);
    end if;

    if new.status = 'published'
       and new.published_at is null then
      new.published_at = now();
    end if;

    return new;
  end if;

  new.team_id = old.team_id;
  new.created_by = old.created_by;
  new.created_at = old.created_at;
  new.revision_number = old.revision_number + 1;
  new.updated_at = now();

  if auth.uid() is not null then
    new.updated_by = auth.uid();
  elsif new.updated_by is null then
    new.updated_by = old.updated_by;
  end if;

  if new.status = 'published'
     and new.published_at is null then
    new.published_at = now();
  end if;

  return new;
end;
$$;

create trigger knowledge_articles_prepare_write
before insert or update on public.knowledge_articles
for each row
execute function public.prepare_knowledge_article_write();

-- ------------------------------------------------------------
-- 10. AUTOMATIC ARTICLE REVISION SNAPSHOTS
-- ------------------------------------------------------------

create or replace function public.capture_knowledge_article_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.knowledge_article_revisions (
    article_id,
    team_id,
    version_number,
    space_id,
    category_id,
    title,
    slug,
    excerpt,
    content_markdown,
    status,
    visibility,
    edited_by
  )
  values (
    new.id,
    new.team_id,
    new.revision_number,
    new.space_id,
    new.category_id,
    new.title,
    new.slug,
    new.excerpt,
    new.content_markdown,
    new.status,
    new.visibility,
    new.updated_by
  );

  return new;
end;
$$;

create trigger knowledge_articles_capture_revision
after insert or update on public.knowledge_articles
for each row
execute function public.capture_knowledge_article_revision();

-- ------------------------------------------------------------
-- 11. ARTICLE READ-AUTHORIZATION HELPER
--
-- team:
--   Published entries are readable by team readers.
--   Drafts and archived entries are readable by editors.
--
-- editors:
--   Readable by author, team editors/admins, and platform admins.
--
-- private:
--   Readable only by author and platform admins.
-- ------------------------------------------------------------

create or replace function public.can_read_knowledge_article(
  requested_article_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.knowledge_articles
    where knowledge_articles.id = requested_article_id
      and (
        public.is_platform_admin()

        or knowledge_articles.created_by = auth.uid()

        or (
          knowledge_articles.visibility = 'team'
          and public.has_permission(
            'knowledge.read',
            knowledge_articles.team_id
          )
          and (
            knowledge_articles.status = 'published'
            or public.has_permission(
              'knowledge.update',
              knowledge_articles.team_id
            )
          )
        )

        or (
          knowledge_articles.visibility = 'editors'
          and public.has_permission(
            'knowledge.update',
            knowledge_articles.team_id
          )
        )
      )
  );
$$;

-- ------------------------------------------------------------
-- 12. ENABLE ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.knowledge_spaces
  enable row level security;

alter table public.knowledge_categories
  enable row level security;

alter table public.knowledge_articles
  enable row level security;

alter table public.knowledge_tags
  enable row level security;

alter table public.knowledge_article_tags
  enable row level security;

alter table public.knowledge_article_revisions
  enable row level security;

-- ------------------------------------------------------------
-- 13. RLS POLICIES: KNOWLEDGE SPACES
-- ------------------------------------------------------------

create policy knowledge_spaces_select_permitted_team
on public.knowledge_spaces
for select
to authenticated
using (
  public.has_permission('knowledge.read', team_id)
);

create policy knowledge_spaces_insert_team_managers
on public.knowledge_spaces
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_permission('team.manage', team_id)
);

create policy knowledge_spaces_update_team_managers
on public.knowledge_spaces
for update
to authenticated
using (
  public.has_permission('team.manage', team_id)
)
with check (
  public.has_permission('team.manage', team_id)
);

create policy knowledge_spaces_delete_team_managers
on public.knowledge_spaces
for delete
to authenticated
using (
  public.has_permission('team.manage', team_id)
);

-- ------------------------------------------------------------
-- 14. RLS POLICIES: KNOWLEDGE CATEGORIES
-- ------------------------------------------------------------

create policy knowledge_categories_select_permitted_team
on public.knowledge_categories
for select
to authenticated
using (
  public.has_permission('knowledge.read', team_id)
);

create policy knowledge_categories_insert_editors
on public.knowledge_categories
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_permission('knowledge.update', team_id)
);

create policy knowledge_categories_update_editors
on public.knowledge_categories
for update
to authenticated
using (
  public.has_permission('knowledge.update', team_id)
)
with check (
  public.has_permission('knowledge.update', team_id)
);

create policy knowledge_categories_delete_permitted
on public.knowledge_categories
for delete
to authenticated
using (
  public.has_permission('knowledge.delete', team_id)
);

-- ------------------------------------------------------------
-- 15. RLS POLICIES: KNOWLEDGE ARTICLES
-- ------------------------------------------------------------

create policy knowledge_articles_select_visible
on public.knowledge_articles
for select
to authenticated
using (
  public.can_read_knowledge_article(id)
);

create policy knowledge_articles_insert_creators
on public.knowledge_articles
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and public.has_permission('knowledge.create', team_id)
);

create policy knowledge_articles_update_editors
on public.knowledge_articles
for update
to authenticated
using (
  public.has_permission('knowledge.update', team_id)
)
with check (
  public.has_permission('knowledge.update', team_id)
);

create policy knowledge_articles_delete_permitted
on public.knowledge_articles
for delete
to authenticated
using (
  public.has_permission('knowledge.delete', team_id)
);

-- ------------------------------------------------------------
-- 16. RLS POLICIES: KNOWLEDGE TAGS
-- ------------------------------------------------------------

create policy knowledge_tags_select_permitted_team
on public.knowledge_tags
for select
to authenticated
using (
  public.has_permission('knowledge.read', team_id)
);

create policy knowledge_tags_insert_editors
on public.knowledge_tags
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_permission('knowledge.update', team_id)
);

create policy knowledge_tags_update_editors
on public.knowledge_tags
for update
to authenticated
using (
  public.has_permission('knowledge.update', team_id)
)
with check (
  public.has_permission('knowledge.update', team_id)
);

create policy knowledge_tags_delete_permitted
on public.knowledge_tags
for delete
to authenticated
using (
  public.has_permission('knowledge.delete', team_id)
);

-- ------------------------------------------------------------
-- 17. RLS POLICIES: ARTICLE-TAG RELATIONS
-- ------------------------------------------------------------

create policy knowledge_article_tags_select_visible_article
on public.knowledge_article_tags
for select
to authenticated
using (
  public.can_read_knowledge_article(article_id)
);

create policy knowledge_article_tags_insert_editors
on public.knowledge_article_tags
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_permission('knowledge.update', team_id)
);

create policy knowledge_article_tags_delete_editors
on public.knowledge_article_tags
for delete
to authenticated
using (
  public.has_permission('knowledge.update', team_id)
);

-- ------------------------------------------------------------
-- 18. RLS POLICIES: ARTICLE REVISION HISTORY
-- Revision rows are immutable through the Data API.
-- ------------------------------------------------------------

create policy knowledge_article_revisions_select_visible_article
on public.knowledge_article_revisions
for select
to authenticated
using (
  public.can_read_knowledge_article(article_id)
);

-- ------------------------------------------------------------
-- 19. DATA API PRIVILEGES
-- Anonymous visitors receive no access.
-- ------------------------------------------------------------

revoke all privileges
on table public.knowledge_spaces
from anon, authenticated;

revoke all privileges
on table public.knowledge_categories
from anon, authenticated;

revoke all privileges
on table public.knowledge_articles
from anon, authenticated;

revoke all privileges
on table public.knowledge_tags
from anon, authenticated;

revoke all privileges
on table public.knowledge_article_tags
from anon, authenticated;

revoke all privileges
on table public.knowledge_article_revisions
from anon, authenticated;

grant select, insert, update, delete
on table public.knowledge_spaces
to authenticated;

grant select, insert, update, delete
on table public.knowledge_categories
to authenticated;

grant select, insert, update, delete
on table public.knowledge_articles
to authenticated;

grant select, insert, update, delete
on table public.knowledge_tags
to authenticated;

grant select, insert, delete
on table public.knowledge_article_tags
to authenticated;

grant select
on table public.knowledge_article_revisions
to authenticated;

-- ------------------------------------------------------------
-- 20. FUNCTION EXECUTION PRIVILEGES
-- ------------------------------------------------------------

revoke all
on function public.protect_knowledge_space_update()
from public;

revoke all
on function public.protect_knowledge_category_update()
from public;

revoke all
on function public.protect_knowledge_tag_update()
from public;

revoke all
on function public.prepare_knowledge_article_write()
from public;

revoke all
on function public.capture_knowledge_article_revision()
from public;

revoke all
on function public.can_read_knowledge_article(uuid)
from public;

grant execute
on function public.can_read_knowledge_article(uuid)
to authenticated;

commit;
