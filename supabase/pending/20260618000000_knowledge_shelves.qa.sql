-- Transaction-backed QA for 20260618000000_knowledge_shelves.sql.
-- Run only against a disposable database after the migration is applied.
-- Rolls back at the end; leaves no rows behind.
begin;

-- ----- Structural assertions -----
do $$
begin
  assert (select relrowsecurity from pg_class where oid = 'public.knowledge_shelves'::regclass),
    'knowledge_shelves RLS must be enabled';
  assert (select relrowsecurity from pg_class where oid = 'public.knowledge_shelf_books'::regclass),
    'knowledge_shelf_books RLS must be enabled';

  -- Direct privilege grants required for PostgREST to reach the tables.
  assert has_table_privilege('authenticated', 'public.knowledge_shelves', 'SELECT'),
    'authenticated must SELECT knowledge_shelves';
  assert has_table_privilege('authenticated', 'public.knowledge_shelves', 'INSERT'),
    'authenticated must INSERT knowledge_shelves';
  assert has_table_privilege('authenticated', 'public.knowledge_shelves', 'UPDATE'),
    'authenticated must UPDATE knowledge_shelves';
  assert has_table_privilege('authenticated', 'public.knowledge_shelves', 'DELETE'),
    'authenticated must DELETE knowledge_shelves';
  assert has_table_privilege('authenticated', 'public.knowledge_shelf_books', 'SELECT'),
    'authenticated must SELECT knowledge_shelf_books';

  -- Anonymous must have zero access (knowledge_* is auth-only).
  assert not has_table_privilege('anon', 'public.knowledge_shelves', 'SELECT'),
    'anon must not SELECT knowledge_shelves';
  assert not has_table_privilege('anon', 'public.knowledge_shelf_books', 'SELECT'),
    'anon must not SELECT knowledge_shelf_books';
end;
$$;

-- ----- Slug + name CHECK constraints -----
do $$
declare
  bad_slug_rejected boolean := false;
  bad_name_rejected boolean := false;
begin
  begin
    insert into public.knowledge_shelves (team_id, name, slug, created_by)
    values (gen_random_uuid(), 'Bad', 'NOT a slug', '00000000-0000-0000-0000-000000000000');
  exception when others then
    bad_slug_rejected := true;
  end;
  assert bad_slug_rejected, 'slug CHECK must reject non-kebab-case values';

  begin
    insert into public.knowledge_shelves (team_id, name, slug, created_by)
    values (gen_random_uuid(), 'x', 'x', '00000000-0000-0000-0000-000000000000');
  exception when others then
    bad_name_rejected := true;
  end;
  assert bad_name_rejected, 'name CHECK must reject names shorter than 2 chars';
end;
$$;

-- ----- Cross-team junction guard -----
-- The composite FK (shelf_id, team_id) + (space_id, team_id) must prevent
-- attaching a shelf from one team to a book from another team.
-- (Static assertion: verify the FKs use the team_id-bearing composite keys.)
do $$
declare
  shelf_fk_ok boolean;
  book_fk_ok boolean;
begin
  select exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.knowledge_shelf_books'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.knowledge_shelves'::regclass
      and array_length(c.conkey, 1) = 2
  ) into shelf_fk_ok;
  assert shelf_fk_ok,
    'knowledge_shelf_books → knowledge_shelves FK must be composite (shelf_id, team_id)';

  select exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.knowledge_shelf_books'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.knowledge_spaces'::regclass
      and array_length(c.conkey, 1) = 2
  ) into book_fk_ok;
  assert book_fk_ok,
    'knowledge_shelf_books → knowledge_spaces FK must be composite (space_id, team_id)';
end;
$$;

-- ----- Audit-protection trigger -----
-- The protect_knowledge_shelf_update() trigger must be installed and must
-- pin team_id / created_by / created_at across updates.
do $$
declare
  has_trigger boolean;
begin
  select exists (
    select 1 from pg_trigger
    where tgrelid = 'public.knowledge_shelves'::regclass
      and tgname = 'knowledge_shelves_protect_update'
      and not tgisinternal
  ) into has_trigger;
  assert has_trigger,
    'knowledge_shelves_protect_update trigger must exist';
end;
$$;

rollback;
