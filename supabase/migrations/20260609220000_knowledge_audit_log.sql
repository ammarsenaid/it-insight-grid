begin;

-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration Batch 005: Knowledge Audit Log
-- ============================================================
-- Append-only audit trail for every mutation against the knowledge
-- content tables. Trigger-driven (security definer); clients have
-- SELECT-only access scoped by knowledge.read on the team.
-- ============================================================

create table public.knowledge_audit_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  entity_type text not null check (
    entity_type in ('space', 'category', 'article', 'tag', 'article_tag')
  ),
  entity_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  changes jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.knowledge_audit_log is
  'Append-only audit trail of mutations against knowledge content tables.';

create index idx_knowledge_audit_log_team_created
  on public.knowledge_audit_log(team_id, created_at desc);

create index idx_knowledge_audit_log_entity
  on public.knowledge_audit_log(entity_type, entity_id, created_at desc);

alter table public.knowledge_audit_log enable row level security;

create policy knowledge_audit_log_select_team
on public.knowledge_audit_log
for select
to authenticated
using (
  public.has_permission('knowledge.read', team_id)
);

-- No client INSERT / UPDATE / DELETE policies; writes go through the
-- security-definer trigger below.

create or replace function public.knowledge_audit_log_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_action text;
  v_changes jsonb := '{}'::jsonb;
  v_old jsonb;
  v_new jsonb;
  v_key text;
begin
  v_entity_type := tg_argv[0];
  v_action := lower(tg_op);

  if v_action = 'delete' then
    v_team_id := (to_jsonb(old) ->> 'team_id')::uuid;
    v_entity_id := (to_jsonb(old) ->> 'id')::uuid;
    v_changes := to_jsonb(old);
  elsif v_action = 'insert' then
    v_team_id := (to_jsonb(new) ->> 'team_id')::uuid;
    v_entity_id := (to_jsonb(new) ->> 'id')::uuid;
    v_changes := to_jsonb(new);
  else
    v_team_id := (to_jsonb(new) ->> 'team_id')::uuid;
    v_entity_id := (to_jsonb(new) ->> 'id')::uuid;
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for v_key in select jsonb_object_keys(v_new) loop
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(
          v_key,
          jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key)
        );
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  if v_entity_id is null and v_entity_type = 'article_tag' then
    if v_action = 'delete' then
      v_entity_id := (to_jsonb(old) ->> 'article_id')::uuid;
    else
      v_entity_id := (to_jsonb(new) ->> 'article_id')::uuid;
    end if;
  end if;

  insert into public.knowledge_audit_log
    (team_id, entity_type, entity_id, action, changes, actor_id)
  values
    (v_team_id, v_entity_type, v_entity_id, v_action, v_changes, auth.uid());

  return null;
end;
$$;

revoke all on function public.knowledge_audit_log_write() from public;

create trigger trg_kal_spaces
after insert or update or delete on public.knowledge_spaces
for each row execute function public.knowledge_audit_log_write('space');

create trigger trg_kal_categories
after insert or update or delete on public.knowledge_categories
for each row execute function public.knowledge_audit_log_write('category');

create trigger trg_kal_articles
after insert or update or delete on public.knowledge_articles
for each row execute function public.knowledge_audit_log_write('article');

create trigger trg_kal_tags
after insert or update or delete on public.knowledge_tags
for each row execute function public.knowledge_audit_log_write('tag');

create trigger trg_kal_article_tags
after insert or update or delete on public.knowledge_article_tags
for each row execute function public.knowledge_audit_log_write('article_tag');

revoke all privileges on table public.knowledge_audit_log from anon, authenticated;
grant select on table public.knowledge_audit_log to authenticated;

commit;
