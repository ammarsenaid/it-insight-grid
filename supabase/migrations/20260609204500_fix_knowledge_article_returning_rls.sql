begin;

-- ============================================================
-- IT KNOWLEDGE CENTER
-- Corrective Migration: Article RETURNING RLS Visibility
-- ============================================================
--
-- Problem:
--   The article SELECT policy called can_read_knowledge_article(id).
--   That helper re-queried knowledge_articles by UUID.
--   During INSERT ... RETURNING, the new article was not visible
--   to the helper lookup yet, causing PostgREST return=representation
--   requests to fail even though the insert itself was permitted.
--
-- Fix:
--   Evaluate visibility directly from the current article row.
--   Keep the UUID-based helper for dependent tables such as tags
--   and revision history.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ROW-BASED ARTICLE READ AUTHORIZATION
-- This function does not re-query knowledge_articles.
-- It is safe for SELECT policies used during INSERT ... RETURNING.
-- ------------------------------------------------------------

create or replace function public.can_read_knowledge_article_row(
  requested_team_id uuid,
  requested_created_by uuid,
  requested_status text,
  requested_visibility text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_platform_admin()

    or requested_created_by = auth.uid()

    or (
      requested_visibility = 'team'
      and public.has_permission(
        'knowledge.read',
        requested_team_id
      )
      and (
        requested_status = 'published'
        or public.has_permission(
          'knowledge.update',
          requested_team_id
        )
      )
    )

    or (
      requested_visibility = 'editors'
      and public.has_permission(
        'knowledge.update',
        requested_team_id
      )
    );
$$;

-- ------------------------------------------------------------
-- 2. UPDATE UUID-BASED HELPER FOR TAGS AND REVISION HISTORY
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
      and public.can_read_knowledge_article_row(
        knowledge_articles.team_id,
        knowledge_articles.created_by,
        knowledge_articles.status,
        knowledge_articles.visibility
      )
  );
$$;

-- ------------------------------------------------------------
-- 3. REPLACE ARTICLE SELECT POLICY
-- Evaluate the article row directly instead of re-querying it.
-- ------------------------------------------------------------

drop policy if exists knowledge_articles_select_visible
  on public.knowledge_articles;

create policy knowledge_articles_select_visible
on public.knowledge_articles
for select
to authenticated
using (
  public.can_read_knowledge_article_row(
    team_id,
    created_by,
    status,
    visibility
  )
);

-- ------------------------------------------------------------
-- 4. FUNCTION PRIVILEGES
-- ------------------------------------------------------------

revoke all
on function public.can_read_knowledge_article_row(
  uuid,
  uuid,
  text,
  text
)
from public;

revoke all
on function public.can_read_knowledge_article(uuid)
from public;

grant execute
on function public.can_read_knowledge_article_row(
  uuid,
  uuid,
  text,
  text
)
to authenticated;

grant execute
on function public.can_read_knowledge_article(uuid)
to authenticated;

commit;
