-- =====================================================================
-- IT KNOWLEDGE CENTER — RC1.2 FIXTURE-BACKED SECURITY CHECKS
-- =====================================================================
-- STAGING ONLY.
-- Creates two isolated non-admin users and team fixtures, executes the
-- RC1.2 checks, then rolls back every temporary row.
-- =====================================================================

\set ON_ERROR_STOP on

begin;

select id as editor_role_id
from public.roles
where role_key = 'team_editor'
  and role_scope = 'team'
\gset

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'rc12-qa-member-a-' || gen_random_uuid()::text || '@example.invalid',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"RC1.2 QA Member A"}'::jsonb,
  now(),
  now()
)
returning id as member_a
\gset

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'rc12-qa-member-b-' || gen_random_uuid()::text || '@example.invalid',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"RC1.2 QA Member B"}'::jsonb,
  now(),
  now()
)
returning id as member_b
\gset

insert into public.teams (
  name,
  slug,
  description,
  created_by
)
values (
  'RC1.2 QA Team A',
  'rc12-qa-team-a-' || gen_random_uuid()::text,
  'Temporary rollback-only QA team.',
  :'member_a'
)
returning id as team_a
\gset

insert into public.teams (
  name,
  slug,
  description,
  created_by
)
values (
  'RC1.2 QA Team B',
  'rc12-qa-team-b-' || gen_random_uuid()::text,
  'Temporary rollback-only QA team.',
  :'member_b'
)
returning id as team_b
\gset

insert into public.team_members (
  team_id,
  user_id,
  membership_status,
  invited_by
)
values
  (:'team_a', :'member_a', 'active', :'member_a'),
  (:'team_b', :'member_b', 'active', :'member_b');

insert into public.team_member_roles (
  team_id,
  user_id,
  role_id,
  granted_by
)
values
  (:'team_a', :'member_a', :'editor_role_id', :'member_a'),
  (:'team_b', :'member_b', :'editor_role_id', :'member_b');

insert into public.knowledge_spaces (
  team_id,
  name,
  slug,
  description,
  created_by
)
values (
  :'team_a',
  'RC1.2 QA Space A',
  'rc12-qa-space-a-' || gen_random_uuid()::text,
  'Temporary rollback-only QA space.',
  :'member_a'
)
returning id as space_a
\gset

insert into public.knowledge_spaces (
  team_id,
  name,
  slug,
  description,
  created_by
)
values (
  :'team_b',
  'RC1.2 QA Space B',
  'rc12-qa-space-b-' || gen_random_uuid()::text,
  'Temporary rollback-only QA space.',
  :'member_b'
)
returning id as space_b
\gset

insert into public.knowledge_articles (
  team_id,
  space_id,
  title,
  slug,
  content_markdown,
  status,
  visibility,
  created_by,
  updated_by
)
values (
  :'team_a',
  :'space_a',
  'RC1.2 QA Article A',
  'rc12-qa-article-a-' || gen_random_uuid()::text,
  '',
  'draft',
  'team',
  :'member_a',
  :'member_a'
)
returning id as article_a
\gset

insert into public.knowledge_articles (
  team_id,
  space_id,
  title,
  slug,
  content_markdown,
  status,
  visibility,
  created_by,
  updated_by
)
values (
  :'team_b',
  :'space_b',
  'RC1.2 QA Article B',
  'rc12-qa-article-b-' || gen_random_uuid()::text,
  '',
  'draft',
  'team',
  :'member_b',
  :'member_b'
)
returning id as article_b
\gset

select set_config(
  'request.jwt.claim.sub',
  :'member_a',
  true
);

\ir knowledge_rc1_security_checks.sql

rollback;

\echo 'RC1.2 fixture-backed security checks passed and rolled back.'
