begin;

-- ============================================================
-- IT KNOWLEDGE CENTER — RC1.2 HARDENING
-- Batch 007: Block arbitrary initial article status on INSERT
-- ============================================================
--
-- RC1.1 added trg_knowledge_articles_status_guard as a BEFORE UPDATE
-- trigger, which correctly forces status changes through the
-- transactional RPC public.knowledge_transition_article_status. However,
-- the guard did not fire on INSERT, so a crafted browser request could
-- still create an article directly with status in
-- ('in_review','approved','published','archived'), bypassing the
-- workflow entirely.
--
-- This migration extends the existing guard function to handle INSERT
-- as well: every newly inserted article must start as 'draft'. The
-- trigger is recreated as BEFORE INSERT OR UPDATE. The safe fixed
-- search_path (pg_catalog, public) and the RPC-only update gate
-- (current_setting('app.kb_workflow') = 'on') are preserved.

create or replace function public.knowledge_articles_block_status_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $f$
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' then
      raise exception
        'New articles must start as draft; use knowledge_transition_article_status to change status.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and coalesce(current_setting('app.kb_workflow', true), '') <> 'on'
  then
    raise exception
      'Article status changes must go through knowledge_transition_article_status.'
      using errcode = '42501';
  end if;

  return new;
end;
$f$;

drop trigger if exists trg_knowledge_articles_status_guard on public.knowledge_articles;

create trigger trg_knowledge_articles_status_guard
before insert or update on public.knowledge_articles
for each row execute function public.knowledge_articles_block_status_change();

comment on function public.knowledge_articles_block_status_change() is
  'Guards public.knowledge_articles: forces new rows to status=draft on INSERT and blocks direct status updates outside the knowledge_transition_article_status RPC.';

commit;
