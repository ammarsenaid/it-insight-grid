begin;

-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: Knowledge Shelves (BookStack-parity top-level layer)
-- ============================================================
--
-- Adds the missing 4th hierarchy level so the workspace matches
-- BookStack exactly:
--
--   Shelf  (NEW)  →  Book (knowledge_spaces)
--                 →  Chapter (knowledge_categories)
--                 →  Page (knowledge_articles)
--
-- BookStack's data model: a Shelf groups Books, and a Book may
-- appear in MULTIPLE Shelves. We mirror that with a junction
-- table (knowledge_shelf_books).
--
-- Authorization mirrors the existing knowledge_* tables exactly:
-- RLS via public.has_permission('knowledge.read'/'.create'/
-- '.update'/'.delete', team_id). Anonymous receives no access.
-- ============================================================

-- ------------------------------------------------------------
-- 1. KNOWLEDGE SHELVES
-- ------------------------------------------------------------
create table public.knowledge_shelves (
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
  cover_color text check (
    cover_color is null
    or cover_color ~ '^#[0-9a-fA-F]{6}$'
  ),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_archived boolean not null default false,
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, slug),
  unique (id, team_id)
);

comment on table public.knowledge_shelves is
  'Top-level team-scoped groupings of knowledge books (BookStack shelves).';

-- ------------------------------------------------------------
-- 2. SHELF ↔ BOOK JUNCTION
-- A book (knowledge_spaces) can belong to many shelves.
-- ------------------------------------------------------------
create table public.knowledge_shelf_books (
  shelf_id uuid not null,
  space_id uuid not null,
  team_id uuid not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  added_by uuid default auth.uid()
    references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (shelf_id, space_id),
  foreign key (shelf_id, team_id)
    references public.knowledge_shelves(id, team_id)
    on delete cascade,
  foreign key (space_id, team_id)
    references public.knowledge_spaces(id, team_id)
    on delete cascade
);

comment on table public.knowledge_shelf_books is
  'Many-to-many membership between knowledge shelves and books.';

-- ------------------------------------------------------------
-- 3. INDEXES
-- ------------------------------------------------------------
create index idx_knowledge_shelves_team_archived
  on public.knowledge_shelves(team_id, is_archived);
create index idx_knowledge_shelves_team_sort
  on public.knowledge_shelves(team_id, sort_order);
create index idx_knowledge_shelf_books_team_space
  on public.knowledge_shelf_books(team_id, space_id);
create index idx_knowledge_shelf_books_shelf_sort
  on public.knowledge_shelf_books(shelf_id, sort_order);

-- ------------------------------------------------------------
-- 4. AUDIT-PROTECTION TRIGGER (matches knowledge_spaces)
-- ------------------------------------------------------------
create or replace function public.protect_knowledge_shelf_update()
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

create trigger knowledge_shelves_protect_update
before update on public.knowledge_shelves
for each row
execute function public.protect_knowledge_shelf_update();

-- ------------------------------------------------------------
-- 5. GRANTS (MANDATORY — Data API access)
-- knowledge_* is auth-only; no anon grants.
-- ------------------------------------------------------------
grant select, insert, update, delete on public.knowledge_shelves to authenticated;
grant all on public.knowledge_shelves to service_role;

grant select, insert, delete on public.knowledge_shelf_books to authenticated;
grant all on public.knowledge_shelf_books to service_role;

-- ------------------------------------------------------------
-- 6. RLS
-- ------------------------------------------------------------
alter table public.knowledge_shelves enable row level security;
alter table public.knowledge_shelf_books enable row level security;

-- knowledge_shelves -----------------------------------------------------------
create policy knowledge_shelves_select on public.knowledge_shelves
  for select to authenticated
  using (public.has_permission('knowledge.read', team_id));

create policy knowledge_shelves_insert on public.knowledge_shelves
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.has_permission('knowledge.create', team_id)
  );

create policy knowledge_shelves_update on public.knowledge_shelves
  for update to authenticated
  using (public.has_permission('knowledge.update', team_id))
  with check (public.has_permission('knowledge.update', team_id));

create policy knowledge_shelves_delete on public.knowledge_shelves
  for delete to authenticated
  using (public.has_permission('knowledge.delete', team_id));

-- knowledge_shelf_books -------------------------------------------------------
create policy knowledge_shelf_books_select on public.knowledge_shelf_books
  for select to authenticated
  using (public.has_permission('knowledge.read', team_id));

create policy knowledge_shelf_books_insert on public.knowledge_shelf_books
  for insert to authenticated
  with check (public.has_permission('knowledge.update', team_id));

create policy knowledge_shelf_books_delete on public.knowledge_shelf_books
  for delete to authenticated
  using (public.has_permission('knowledge.update', team_id));

commit;
