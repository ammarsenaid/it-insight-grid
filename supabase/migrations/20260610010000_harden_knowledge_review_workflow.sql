begin;

-- ============================================================
-- IT KNOWLEDGE CENTER — RC1.1 HARDENING
-- Batch 006: Transactional review workflow
-- ============================================================

alter table public.knowledge_review_events
  drop constraint knowledge_review_events_action_check;

alter table public.knowledge_review_events
  add constraint knowledge_review_events_action_check
  check (action in (
    'submit', 'approve', 'request_changes', 'publish',
    'withdraw', 'archive', 'restore'
  ));

create or replace function public.knowledge_articles_block_status_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $f$
begin
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
before update on public.knowledge_articles
for each row execute function public.knowledge_articles_block_status_change();

create or replace function public.knowledge_transition_article_status(
  requested_article_id uuid,
  requested_action text,
  requested_comment text default null
)
returns public.knowledge_articles
language plpgsql
security definer
set search_path = pg_catalog, public
as $f$
declare
  v_article public.knowledge_articles;
  v_uid uuid := auth.uid();
  v_old text;
  v_new text;
  v_required_perm text;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if requested_article_id is null or requested_action is null then
    raise exception 'Invalid workflow request.' using errcode = '22023';
  end if;
  if requested_comment is not null and char_length(requested_comment) > 2000 then
    raise exception 'Comment is too long.' using errcode = '22001';
  end if;

  select * into v_article
  from public.knowledge_articles
  where id = requested_article_id
  for update;
  if not found then
    raise exception 'Article not found.' using errcode = 'P0002';
  end if;

  v_old := v_article.status;

  if    requested_action = 'submit'          and v_old = 'draft'                   then v_new := 'in_review';
  elsif requested_action = 'withdraw'        and v_old = 'in_review'               then v_new := 'draft';
  elsif requested_action = 'approve'         and v_old = 'in_review'               then v_new := 'approved';
  elsif requested_action = 'request_changes' and v_old in ('in_review','approved') then v_new := 'draft';
  elsif requested_action = 'publish'         and v_old = 'approved'                then v_new := 'published';
  elsif requested_action = 'archive'         and v_old = 'published'               then v_new := 'archived';
  elsif requested_action = 'restore'         and v_old = 'archived'                then v_new := 'draft';
  else
    raise exception 'Invalid workflow transition.' using errcode = '22023';
  end if;

  if requested_action in ('approve', 'request_changes') then
    v_required_perm := 'team.manage';
  else
    v_required_perm := 'knowledge.update';
  end if;

  if not public.has_permission(v_required_perm, v_article.team_id) then
    raise exception 'Permission denied.' using errcode = '42501';
  end if;

  perform set_config('app.kb_workflow', 'on', true);

  update public.knowledge_articles
     set status       = v_new,
         updated_by   = v_uid,
         published_at = case when v_new = 'published' then now() else published_at end
   where id = v_article.id
   returning * into v_article;

  insert into public.knowledge_review_events
    (article_id, team_id, action, from_status, to_status, comment, actor_id)
  values
    (v_article.id, v_article.team_id, requested_action,
     v_old, v_new, nullif(btrim(coalesce(requested_comment, '')), ''), v_uid);

  return v_article;
end;
$f$;

revoke all on function public.knowledge_transition_article_status(uuid, text, text) from public;
grant execute on function public.knowledge_transition_article_status(uuid, text, text) to authenticated;

comment on function public.knowledge_transition_article_status(uuid, text, text) is
  'Atomic article workflow transition: validates state + permissions, updates status, and writes an immutable review event in one transaction.';

commit;
