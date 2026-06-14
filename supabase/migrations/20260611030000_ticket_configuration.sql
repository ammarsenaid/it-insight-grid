-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: Ticket Configuration (Phase A — Batch 4/6)
-- ------------------------------------------------------------
-- AUTHORITATIVE. Forward-only and additive.
--
-- Adds (all in public schema):
--   * ticket_categories
--   * ticket_priorities
--   * ticket_sla_policies
--   * ticket_routing_rules
--   * ticket_canned_responses
--   * ticket_mailbox_configs
--   * updated_at triggers on each
--   * RLS gated by has_permission('tickets.config') for writes,
--     has_permission('tickets.view_all') for reads (plus
--     is_platform_admin override).
--
-- Depends on:
--   20260611000000_service_desk_foundation.sql
--   20260611010000_service_desk_rbac_expand.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. CATEGORIES
-- ------------------------------------------------------------
create table if not exists public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_-]*$' and char_length(key) <= 60),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  parent_id uuid references public.ticket_categories(id) on delete set null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ticket_categories_parent on public.ticket_categories(parent_id);

drop trigger if exists ticket_categories_set_updated_at on public.ticket_categories;
create trigger ticket_categories_set_updated_at
before update on public.ticket_categories
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 2. PRIORITIES (configurable display layer; the tickets.priority
--    column enum stays the source of truth for state)
-- ------------------------------------------------------------
create table if not exists public.ticket_priorities (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('low','normal','high','critical')),
  name text not null check (char_length(trim(name)) between 1 and 60),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  response_target_minutes int check (response_target_minutes is null or response_target_minutes > 0),
  resolution_target_minutes int check (resolution_target_minutes is null or resolution_target_minutes > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ticket_priorities_set_updated_at on public.ticket_priorities;
create trigger ticket_priorities_set_updated_at
before update on public.ticket_priorities
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. SLA POLICIES
-- ------------------------------------------------------------
create table if not exists public.ticket_sla_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  priority_key text not null check (priority_key in ('low','normal','high','critical')),
  response_minutes int not null check (response_minutes > 0),
  resolution_minutes int not null check (resolution_minutes > 0),
  business_hours_only boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ticket_sla_policies_priority
  on public.ticket_sla_policies(priority_key, is_active);

drop trigger if exists ticket_sla_policies_set_updated_at on public.ticket_sla_policies;
create trigger ticket_sla_policies_set_updated_at
before update on public.ticket_sla_policies
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 4. ROUTING RULES
-- ------------------------------------------------------------
create table if not exists public.ticket_routing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  -- match_when is JSON: { "category":"...", "priority":"...", "tags":["..."], "source":"..." }
  match_when jsonb not null default '{}'::jsonb,
  -- action is JSON: { "assigned_team":"...", "assignee_id":"<uuid>", "priority":"high" }
  action jsonb not null default '{}'::jsonb,
  priority_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ticket_routing_rules_order
  on public.ticket_routing_rules(is_active, priority_order);

drop trigger if exists ticket_routing_rules_set_updated_at on public.ticket_routing_rules;
create trigger ticket_routing_rules_set_updated_at
before update on public.ticket_routing_rules
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 5. CANNED RESPONSES
-- ------------------------------------------------------------
create table if not exists public.ticket_canned_responses (
  id uuid primary key default gen_random_uuid(),
  shortcut text not null unique
    check (shortcut ~ '^[a-z][a-z0-9_-]*$' and char_length(shortcut) <= 60),
  title text not null check (char_length(trim(title)) between 1 and 200),
  body text not null check (char_length(trim(body)) between 1 and 10000),
  is_internal boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ticket_canned_responses_set_updated_at on public.ticket_canned_responses;
create trigger ticket_canned_responses_set_updated_at
before update on public.ticket_canned_responses
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 6. MAILBOX CONFIG
-- ------------------------------------------------------------
create table if not exists public.ticket_mailbox_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  inbound_address text not null check (char_length(inbound_address) between 3 and 320),
  outbound_from text check (char_length(outbound_from) <= 320),
  reply_to text check (char_length(reply_to) <= 320),
  default_category text check (char_length(default_category) <= 120),
  default_priority text not null default 'normal'
    check (default_priority in ('low','normal','high','critical')),
  default_team text check (char_length(default_team) <= 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ticket_mailbox_configs_set_updated_at on public.ticket_mailbox_configs;
create trigger ticket_mailbox_configs_set_updated_at
before update on public.ticket_mailbox_configs
for each row execute function public.set_updated_at();


-- ------------------------------------------------------------
-- 7. RLS — read = view_all, create/update = tickets.config,
--          destructive delete = platform admin only
-- ------------------------------------------------------------
alter table public.ticket_categories       enable row level security;
alter table public.ticket_priorities       enable row level security;
alter table public.ticket_sla_policies     enable row level security;
alter table public.ticket_routing_rules    enable row level security;
alter table public.ticket_canned_responses enable row level security;
alter table public.ticket_mailbox_configs  enable row level security;

-- Helper macro pattern: same shape repeated per table.
do $$
declare
  tbl text;
  tbls text[] := array[
    'ticket_categories','ticket_priorities','ticket_sla_policies',
    'ticket_routing_rules','ticket_canned_responses','ticket_mailbox_configs'
  ];
begin
  foreach tbl in array tbls loop
    execute format(
      'drop policy if exists %I on public.%I',
      tbl || '_select_agents', tbl);
    execute format($f$
      create policy %I on public.%I
      for select to authenticated
      using (
        public.is_platform_admin()
        or public.has_permission('tickets.view_all')
        or public.has_permission('tickets.config')
      )
    $f$, tbl || '_select_agents', tbl);

    execute format('drop policy if exists %I on public.%I',
      tbl || '_insert_config', tbl);
    execute format($f$
      create policy %I on public.%I
      for insert to authenticated
      with check (public.has_permission('tickets.config'))
    $f$, tbl || '_insert_config', tbl);

    execute format('drop policy if exists %I on public.%I',
      tbl || '_update_config', tbl);
    execute format($f$
      create policy %I on public.%I
      for update to authenticated
      using       (public.has_permission('tickets.config'))
      with check  (public.has_permission('tickets.config'))
    $f$, tbl || '_update_config', tbl);

    execute format('drop policy if exists %I on public.%I',
      tbl || '_delete_admin', tbl);
    execute format($f$
      create policy %I on public.%I
      for delete to authenticated
      using (public.is_platform_admin())
    $f$, tbl || '_delete_admin', tbl);
  end loop;
end$$;

-- Published-category reads are also allowed for any authenticated user
-- so the catalog/ticket form can list active categories without leaking
-- routing/SLA details.
drop policy if exists ticket_categories_select_active on public.ticket_categories;
create policy ticket_categories_select_active
on public.ticket_categories for select to authenticated
using (is_active = true);

drop policy if exists ticket_priorities_select_active on public.ticket_priorities;
create policy ticket_priorities_select_active
on public.ticket_priorities for select to authenticated
using (is_active = true);


-- ------------------------------------------------------------
-- 8. DATA-API PRIVILEGES
-- ------------------------------------------------------------
revoke all on table
  public.ticket_categories, public.ticket_priorities,
  public.ticket_sla_policies, public.ticket_routing_rules,
  public.ticket_canned_responses, public.ticket_mailbox_configs
from anon, authenticated;

grant select, insert, update, delete on table
  public.ticket_categories, public.ticket_priorities,
  public.ticket_sla_policies, public.ticket_routing_rules,
  public.ticket_canned_responses, public.ticket_mailbox_configs
to authenticated;

grant all on table
  public.ticket_categories, public.ticket_priorities,
  public.ticket_sla_policies, public.ticket_routing_rules,
  public.ticket_canned_responses, public.ticket_mailbox_configs
to service_role;

commit;
