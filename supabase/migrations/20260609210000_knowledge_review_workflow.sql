begin;

-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration Batch 003: Review Workflow
-- ============================================================
--
-- Adds:
--   - Extended article status: in_review, approved
--   - knowledge_review_events: immutable per-article workflow audit log
--
-- Workflow:
--   draft        -- submit          -->  in_review
--   in_review    -- approve         -->  approved
--   in_review    -- request_changes -->  draft
--   in_review    -- withdraw        -->  draft        (author/editor)
--   approved     -- publish         -->  published
--   approved     -- request_changes -->  draft
--
-- Authority:
--   submit, withdraw, publish  -> knowledge.update on team
--   approve, request_changes   -> team.manage on team   (reviewers)
--
-- This migration is additive only. Existing article rows (status in
-- 'draft', 'published', 'archived') remain valid against the new check
-- constraint.
-- ============================================================

-- ------------------------------------------------------------
-- 1. EXTEND ARTICLE STATUS CHECK CONSTRAINT
-- ------------------------------------------------------------

alter table public.knowledge_articles
  drop constraint knowledge_articles_status_check;

alter table public.knowledge_articles
  add constraint knowledge_articles_status_check
  check (status in ('draft', 'in_review', 'approved', 'published', 'archived'));

-- ------------------------------------------------------------
-- 2. KNOWLEDGE REVIEW EVENTS
-- Append-only audit log for the review workflow.
-- ------------------------------------------------------------

create table public.knowledge_review_events (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  team_id uuid not null,
  action text not null check (
    action in ('submit', 'approve', 'request_changes', 'publish', 'withdraw')
  ),
  from_status text not null,
  to_status text not null,
  comment text check (
    comment is null or char_length(comment) <= 2000
  ),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (article_id, team_id)
    references public.knowledge_articles(id, team_id)
    on delete cascade
);

comment on table public.knowledge_review_events is
  'Immutable per-article review workflow audit log.';

create index idx_knowledge_review_events_article_created
  on public.knowledge_review_events(article_id, created_at desc);

create index idx_knowledge_review_events_team_created
  on public.knowledge_review_events(team_id, created_at desc);

-- ------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.knowledge_review_events
  enable row level security;

create policy knowledge_review_events_select_visible_article
on public.knowledge_review_events
for select
to authenticated
using (
  public.can_read_knowledge_article(article_id)
);

create policy knowledge_review_events_insert_editors
on public.knowledge_review_events
for insert
to authenticated
with check (
  actor_id = (select auth.uid())
  and public.has_permission('knowledge.update', team_id)
  and (
    action in ('submit', 'withdraw', 'publish')
    or (
      action in ('approve', 'request_changes')
      and public.has_permission('team.manage', team_id)
    )
  )
);

-- No update / delete policies: events are immutable.

-- ------------------------------------------------------------
-- 4. DATA API PRIVILEGES
-- ------------------------------------------------------------

revoke all privileges
on table public.knowledge_review_events
from anon, authenticated;

grant select, insert
on table public.knowledge_review_events
to authenticated;

commit;
