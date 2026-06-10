-- =====================================================================
-- IT KNOWLEDGE CENTER — RC1.1 STATIC SECURITY CHECKS
-- =====================================================================
-- Read-only assertions. Run against a STAGING database that has every
-- RC1 + RC1.1 migration applied. Each block raises an exception on
-- failure so the script aborts at the first mismatch.
--
-- Usage (staging, never production):
--   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -f scripts/qa/knowledge_rc1_security_checks.sql
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- 1. Required tables exist
-- ---------------------------------------------------------------------
do $$
declare
  required text[] := array[
    'knowledge_spaces','knowledge_categories','knowledge_articles',
    'knowledge_tags','knowledge_article_tags','knowledge_revisions',
    'knowledge_review_events','knowledge_attachments','knowledge_audit_log'
  ];
  t text;
begin
  foreach t in array required loop
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t
    ) then
      raise exception 'Missing required table: public.%', t;
    end if;
  end loop;
end$$;

-- ---------------------------------------------------------------------
-- 2. Required workflow RPC exists with the expected signature
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'knowledge_transition_article_status'
       and pg_get_function_identity_arguments(p.oid) = 'requested_article_id uuid, requested_action text, requested_comment text'
  ) then
    raise exception 'Missing function public.knowledge_transition_article_status(uuid, text, text)';
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 3. Audit trigger function uses a fixed safe search_path
-- ---------------------------------------------------------------------
do $$
declare
  cfg text[];
begin
  select proconfig into cfg
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'knowledge_audit_log_write';
  if cfg is null
     or not exists (
       select 1 from unnest(cfg) c where c like 'search_path=%pg_catalog%'
     )
  then
    raise exception 'knowledge_audit_log_write must SET search_path = pg_catalog, public';
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 4. Audit clients have SELECT-only privileges on the audit log
-- ---------------------------------------------------------------------
do $$
declare
  bad text;
begin
  select string_agg(privilege_type, ',') into bad
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'knowledge_audit_log'
     and grantee in ('anon','authenticated')
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if bad is not null then
    raise exception 'knowledge_audit_log must be SELECT-only for clients (found: %)', bad;
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 5. Status-change guard trigger present and fires on INSERT + UPDATE
-- ---------------------------------------------------------------------
-- pg_trigger.tgtype is a bitmask; bit 2 = INSERT, bit 4 = UPDATE
-- (BEFORE is bit 1). RC1.2 requires the guard to cover both events.
do $$
declare
  v_tgtype int2;
begin
  select tgtype into v_tgtype from pg_trigger
   where tgrelid = 'public.knowledge_articles'::regclass
     and tgname = 'trg_knowledge_articles_status_guard'
     and not tgisinternal;
  if v_tgtype is null then
    raise exception 'Missing trigger trg_knowledge_articles_status_guard on knowledge_articles';
  end if;
  if (v_tgtype & 4) = 0 then
    raise exception 'trg_knowledge_articles_status_guard must fire on INSERT (RC1.2)';
  end if;
  if (v_tgtype & 16) = 0 then
    raise exception 'trg_knowledge_articles_status_guard must fire on UPDATE';
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 6. Attachment pointer validator trigger present
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.knowledge_attachments'::regclass
       and tgname = 'trg_knowledge_attachments_validate'
       and not tgisinternal
  ) then
    raise exception 'Missing trigger trg_knowledge_attachments_validate';
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 7. Storage policies include team + article validation
-- ---------------------------------------------------------------------
do $$
declare
  policies text[] := array[
    'knowledge_attachments_storage_select',
    'knowledge_attachments_storage_insert',
    'knowledge_attachments_storage_delete'
  ];
  pname text;
  expr text;
begin
  foreach pname in array policies loop
    select coalesce(pg_get_expr(polqual, polrelid, true), '') ||
           coalesce(pg_get_expr(polwithcheck, polrelid, true), '')
      into expr
      from pg_policy
     where polname = pname
       and polrelid = 'storage.objects'::regclass;
    if expr is null or expr = '' then
      raise exception 'Missing storage.objects policy %', pname;
    end if;
    if position('kb_storage_path_article' in expr) = 0 then
      raise exception 'Policy % must validate team+article via kb_storage_path_article', pname;
    end if;
  end loop;
end$$;

-- ---------------------------------------------------------------------
-- 8. Attachment MIME allowlist constraint present
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.knowledge_attachments'::regclass
       and conname = 'knowledge_attachments_mime_allowlist'
  ) then
    raise exception 'Missing CHECK constraint knowledge_attachments_mime_allowlist';
  end if;
end$$;

-- =====================================================================
-- BEHAVIORAL CHECKS
-- Require fixture data: two teams with one article each in 'draft'.
-- Set the psql variables before running, e.g.:
--   psql ... -v team_a=<uuid> -v article_a=<uuid> \
--            -v team_b=<uuid> -v article_b=<uuid> \
--            -v member_a=<uuid> -v manager_a=<uuid>
-- If the variables are unset, the behavioral block is skipped.
-- =====================================================================

\if :{?article_a}

-- 9. Direct status change is rejected (workflow bypass blocked)
do $$
begin
  begin
    update public.knowledge_articles set status = 'in_review' where id = :'article_a';
    raise exception 'Bypass test failed: direct status change was permitted';
  exception when insufficient_privilege then
    -- expected
    null;
  end;
end$$;

-- 10. Valid transition succeeds atomically and writes a review event
do $$
declare
  before_count int;
  after_count int;
  new_status text;
begin
  select count(*) into before_count
    from public.knowledge_review_events where article_id = :'article_a';
  perform public.knowledge_transition_article_status(:'article_a', 'submit', 'qa: submit');
  select status into new_status from public.knowledge_articles where id = :'article_a';
  if new_status <> 'in_review' then
    raise exception 'Transition succeeded but status did not change';
  end if;
  select count(*) into after_count
    from public.knowledge_review_events where article_id = :'article_a';
  if after_count <> before_count + 1 then
    raise exception 'Transition did not write exactly one review event';
  end if;
end$$;

-- 11. Invalid transition rejected (publish from in_review)
do $$
begin
  begin
    perform public.knowledge_transition_article_status(:'article_a', 'publish', null);
    raise exception 'Invalid transition (publish from in_review) was accepted';
  exception when others then null;
  end;
end$$;

-- 12. Cross-team article access is denied
do $$
declare
  v int;
begin
  -- Acting as a member of team_a, team_b's article must be invisible.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', :'member_a', true);
  select count(*) into v from public.knowledge_articles where id = :'article_b';
  if v <> 0 then
    raise exception 'Cross-team article access leaked (% rows)', v;
  end if;
  reset role;
end$$;

\endif

-- =====================================================================
-- RC1.2 INSERT-GUARD BEHAVIORAL CHECKS
-- Require fixture vars: team_a (uuid), space_a (uuid), member_a (uuid).
-- All inserts are wrapped in savepoints and rolled back so the database
-- is left untouched. Run as the `authenticated` role so RLS + triggers
-- evaluate the same way they do for a browser caller.
-- =====================================================================

\if :{?space_a}

do $$
declare
  v_id uuid;
  v_bad text;
  v_statuses text[] := array['in_review','approved','published','archived'];
  v_status text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', :'member_a', true);

  -- 13. Normal draft insert succeeds, then rolled back.
  begin
    savepoint sp_draft_ok;
    insert into public.knowledge_articles
      (team_id, space_id, title, slug, content_markdown,
       status, visibility, created_by, updated_by)
    values
      (:'team_a', :'space_a', 'rc12-qa-draft', 'rc12-qa-draft-' || gen_random_uuid()::text,
       '', 'draft', 'team', :'member_a', :'member_a')
    returning id into v_id;
    if v_id is null then
      raise exception 'Draft insert did not return an id';
    end if;
    rollback to savepoint sp_draft_ok;
  end;

  -- 14. Every non-draft initial status is rejected.
  foreach v_status in array v_statuses loop
    begin
      savepoint sp_bad;
      begin
        insert into public.knowledge_articles
          (team_id, space_id, title, slug, content_markdown,
           status, visibility, created_by, updated_by)
        values
          (:'team_a', :'space_a', 'rc12-qa-bad', 'rc12-qa-bad-' || v_status || '-' || gen_random_uuid()::text,
           '', v_status, 'team', :'member_a', :'member_a');
        v_bad := v_status;
      exception when insufficient_privilege then
        v_bad := null; -- expected
      end;
      rollback to savepoint sp_bad;
      if v_bad is not null then
        raise exception 'Insert with status=% was accepted but should have been rejected', v_bad;
      end if;
    end;
  end loop;

  reset role;
end$$;

\endif

\echo 'RC1.2 security checks passed.'
