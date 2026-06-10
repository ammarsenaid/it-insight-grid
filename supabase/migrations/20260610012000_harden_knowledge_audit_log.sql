begin;

-- ============================================================
-- IT KNOWLEDGE CENTER — RC1.1 HARDENING
-- Batch 008: Audit log content redaction + tighter visibility
-- ============================================================

create or replace function public.knowledge_audit_log_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $f$
declare
  v_entity_type text := tg_argv[0];
  v_action text := lower(tg_op);
  v_team_id uuid;
  v_entity_id uuid;
  v_changes jsonb := '{}'::jsonb;
  v_old jsonb;
  v_new jsonb;
  v_key text;
begin
  if v_action = 'delete' then
    v_old := to_jsonb(old);
    v_team_id   := nullif(v_old ->> 'team_id', '')::uuid;
    v_entity_id := nullif(v_old ->> 'id', '')::uuid;
    if v_entity_type = 'article' then
      v_changes := jsonb_build_object(
        'title',          v_old -> 'title',
        'slug',           v_old -> 'slug',
        'status',         v_old -> 'status',
        'content_length', char_length(coalesce(v_old ->> 'content_markdown', '')),
        'content_hash',   md5(coalesce(v_old ->> 'content_markdown', ''))
      );
    else
      v_changes := v_old - 'content_markdown';
    end if;
  elsif v_action = 'insert' then
    v_new := to_jsonb(new);
    v_team_id   := nullif(v_new ->> 'team_id', '')::uuid;
    v_entity_id := nullif(v_new ->> 'id', '')::uuid;
    if v_entity_type = 'article' then
      v_changes := jsonb_build_object(
        'title',          v_new -> 'title',
        'slug',           v_new -> 'slug',
        'status',         v_new -> 'status',
        'content_length', char_length(coalesce(v_new ->> 'content_markdown', '')),
        'content_hash',   md5(coalesce(v_new ->> 'content_markdown', ''))
      );
    else
      v_changes := v_new - 'content_markdown';
    end if;
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_team_id   := nullif(v_new ->> 'team_id', '')::uuid;
    v_entity_id := nullif(v_new ->> 'id', '')::uuid;
    for v_key in select jsonb_object_keys(v_new) loop
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        if v_key = 'content_markdown' then
          v_changes := v_changes || jsonb_build_object(
            v_key,
            jsonb_build_object(
              'redacted',    true,
              'from_length', char_length(coalesce(v_old ->> v_key, '')),
              'to_length',   char_length(coalesce(v_new ->> v_key, '')),
              'from_hash',   md5(coalesce(v_old ->> v_key, '')),
              'to_hash',     md5(coalesce(v_new ->> v_key, ''))
            )
          );
        else
          v_changes := v_changes || jsonb_build_object(
            v_key,
            jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key)
          );
        end if;
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  if v_entity_id is null and v_entity_type = 'article_tag' then
    if v_action = 'delete' then
      v_entity_id := nullif(to_jsonb(old) ->> 'article_id', '')::uuid;
    else
      v_entity_id := nullif(to_jsonb(new) ->> 'article_id', '')::uuid;
    end if;
  end if;

  insert into public.knowledge_audit_log
    (team_id, entity_type, entity_id, action, changes, actor_id)
  values
    (v_team_id, v_entity_type, v_entity_id, v_action, v_changes, auth.uid());

  return null;
end;
$f$;

drop policy if exists knowledge_audit_log_select_team on public.knowledge_audit_log;

create policy knowledge_audit_log_select_managers
on public.knowledge_audit_log
for select
to authenticated
using (
  public.has_permission('team.manage', team_id)
);

revoke insert, update, delete on table public.knowledge_audit_log from anon, authenticated;

commit;
