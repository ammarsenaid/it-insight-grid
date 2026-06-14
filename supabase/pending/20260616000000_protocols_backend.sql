-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: organization-scoped Protocols backend
-- ------------------------------------------------------------
-- DRAFT - NOT APPLIED. Forward-only and additive.
-- Depends on 20260612235900_organization_foundation.sql and
-- Service Desk RBAC expansion (protocols.view / protocols.manage).
-- ============================================================

begin;

create table if not exists public.protocol_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 300),
  category text not null default 'General' check (char_length(category) <= 120),
  description text not null default '' check (char_length(description) <= 20000),
  purpose text not null default '' check (char_length(purpose) <= 5000),
  scope text not null default '' check (char_length(scope) <= 5000),
  preconditions text not null default '' check (char_length(preconditions) <= 5000),
  assigned_team text not null default '' check (char_length(assigned_team) <= 160),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes between 0 and 100000),
  approval_required boolean not null default false,
  default_approver_role text not null default '' check (char_length(default_approver_role) <= 60),
  recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'quarterly')),
  required_asset_ids text[] not null default '{}',
  required_knowledge_ids text[] not null default '{}',
  related_task_template text not null default '' check (char_length(related_task_template) <= 200),
  tags text[] not null default '{}',
  visibility text not null default 'internal' check (visibility in ('internal', 'restricted')),
  steps jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  last_run_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  unique (organization_id, id),
  check ((deleted_at is null and deleted_by is null) or deleted_at is not null),
  check (jsonb_typeof(steps) = 'array')
);

create index if not exists idx_protocol_templates_org_category
  on public.protocol_templates(organization_id, category) where deleted_at is null;
create index if not exists idx_protocol_templates_org_archived
  on public.protocol_templates(organization_id, archived) where deleted_at is null;

create table if not exists public.protocol_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  run_number text not null check (char_length(run_number) <= 20),
  template_id uuid not null,
  template_title text not null check (char_length(template_title) <= 300),
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'waiting', 'waiting_approval', 'completed',
                       'completed_with_issues', 'failed', 'cancelled')),
  assigned_user text not null default '' check (char_length(assigned_user) <= 160),
  team text not null default '' check (char_length(team) <= 160),
  started_at timestamptz,
  due_date timestamptz,
  completed_at timestamptz,
  final_summary text not null default '' check (char_length(final_summary) <= 20000),
  steps jsonb not null default '[]'::jsonb,
  approvals jsonb not null default '[]'::jsonb,
  links jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, run_number),
  foreign key (organization_id, template_id) references public.protocol_templates(organization_id, id) on delete restrict,
  check (jsonb_typeof(steps) = 'array'),
  check (jsonb_typeof(approvals) = 'array'),
  check (jsonb_typeof(links) = 'object')
);

create index if not exists idx_protocol_runs_org_status
  on public.protocol_runs(organization_id, status);
create index if not exists idx_protocol_runs_org_template
  on public.protocol_runs(organization_id, template_id);
create index if not exists idx_protocol_runs_org_assignee
  on public.protocol_runs(organization_id, assigned_user);

create table if not exists public.protocol_run_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  run_id uuid not null,
  author uuid references auth.users(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, run_id) references public.protocol_runs(organization_id, id) on delete cascade
);

create index if not exists idx_protocol_run_comments_run
  on public.protocol_run_comments(organization_id, run_id, created_at);

-- ------------------------------------------------------------
-- TRIGGERS
-- ------------------------------------------------------------

create or replace function public.prepare_protocol_templates_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare active_organization uuid := public.current_organization_id();
begin
  if tg_op = 'INSERT' then
    new.organization_id := active_organization;
    new.created_by := auth.uid();
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'Protocol template organization cannot be changed' using errcode = '42501';
  else
    new.organization_id := old.organization_id;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protocol_templates_prepare_write on public.protocol_templates;
create trigger protocol_templates_prepare_write before insert or update on public.protocol_templates
for each row execute function public.prepare_protocol_templates_write();

create or replace function public.prepare_protocol_runs_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare active_organization uuid := public.current_organization_id();
begin
  if tg_op = 'INSERT' then
    new.organization_id := active_organization;
    new.created_by := auth.uid();
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'Protocol run organization cannot be changed' using errcode = '42501';
  else
    new.organization_id := old.organization_id;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protocol_runs_prepare_write on public.protocol_runs;
create trigger protocol_runs_prepare_write before insert or update on public.protocol_runs
for each row execute function public.prepare_protocol_runs_write();

create or replace function public.prepare_protocol_run_comments_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare active_organization uuid := public.current_organization_id();
begin
  new.organization_id := active_organization;
  new.author := auth.uid();
  return new;
end;
$$;

drop trigger if exists protocol_run_comments_prepare_write on public.protocol_run_comments;
create trigger protocol_run_comments_prepare_write before insert on public.protocol_run_comments
for each row execute function public.prepare_protocol_run_comments_write();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.protocol_templates enable row level security;
alter table public.protocol_runs enable row level security;
alter table public.protocol_run_comments enable row level security;

create policy protocol_templates_select on public.protocol_templates for select to authenticated
using (organization_id = public.current_organization_id() and (
  (deleted_at is null and public.has_permission('protocols.view')) or public.has_permission('protocols.manage')
));

create policy protocol_runs_select on public.protocol_runs for select to authenticated
using (organization_id = public.current_organization_id() and (
  public.has_permission('protocols.view') or public.has_permission('protocols.manage')
));

create policy protocol_run_comments_select on public.protocol_run_comments for select to authenticated
using (
  organization_id = public.current_organization_id()
  and (public.has_permission('protocols.view') or public.has_permission('protocols.manage'))
  and exists (
    select 1 from public.protocol_runs
     where protocol_runs.organization_id = protocol_run_comments.organization_id
       and protocol_runs.id = protocol_run_comments.run_id
  )
);

-- ------------------------------------------------------------
-- HELPERS
-- ------------------------------------------------------------

create or replace function public.assert_protocols_manage()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_permission('protocols.manage') then
    raise exception 'Protocols manage permission required' using errcode = '42501';
  end if;
  return public.current_organization_id();
end;
$$;

-- ------------------------------------------------------------
-- READ
-- ------------------------------------------------------------

create or replace function public.list_protocol_templates(p_include_deleted boolean default false)
returns table (
  id uuid, title text, category text, description text, purpose text, scope text, preconditions text,
  assigned_team text, estimated_minutes integer, approval_required boolean, default_approver_role text,
  recurrence text, required_asset_ids text[], required_knowledge_ids text[], related_task_template text,
  tags text[], visibility text, steps jsonb, archived boolean, last_run_at timestamptz,
  created_at timestamptz, updated_at timestamptz, deleted_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.title, t.category, t.description, t.purpose, t.scope, t.preconditions,
         t.assigned_team, t.estimated_minutes, t.approval_required, t.default_approver_role,
         t.recurrence, t.required_asset_ids, t.required_knowledge_ids, t.related_task_template,
         t.tags, t.visibility, t.steps, t.archived, t.last_run_at,
         t.created_at, t.updated_at, t.deleted_at
    from public.protocol_templates t
   where t.organization_id = public.current_organization_id()
     and (public.has_permission('protocols.view') or public.has_permission('protocols.manage'))
     and (t.deleted_at is null or (p_include_deleted and public.has_permission('protocols.manage')))
   order by t.created_at desc;
$$;

create or replace function public.list_protocol_runs()
returns table (
  id uuid, run_number text, template_id uuid, template_title text, status text,
  assigned_user text, team text, started_at timestamptz, due_date timestamptz, completed_at timestamptz,
  final_summary text, steps jsonb, approvals jsonb, links jsonb,
  created_at timestamptz, updated_at timestamptz, comments jsonb
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.run_number, r.template_id, r.template_title, r.status,
         r.assigned_user, r.team, r.started_at, r.due_date, r.completed_at,
         r.final_summary, r.steps, r.approvals, r.links,
         r.created_at, r.updated_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', c.id,
                    'author', coalesce(nullif(trim(p.display_name), ''), p.email, ''),
                    'body', c.body,
                    'at', c.created_at
                  ) order by c.created_at)
             from public.protocol_run_comments c
             left join public.profiles p on p.id = c.author
            where c.organization_id = r.organization_id and c.run_id = r.id
         ), '[]'::jsonb) as comments
    from public.protocol_runs r
   where r.organization_id = public.current_organization_id()
     and (public.has_permission('protocols.view') or public.has_permission('protocols.manage'))
   order by r.created_at desc;
$$;

-- ------------------------------------------------------------
-- WRITE: TEMPLATES - CREATE / UPDATE
-- ------------------------------------------------------------

create or replace function public.save_protocol_template(p_template_id uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_protocols_manage();
  existing public.protocol_templates;
  result_id uuid;
  steps_input jsonb := coalesce(p_input->'steps', '[]'::jsonb);
  item jsonb;
  required_asset_ids_input text[];
  required_knowledge_ids_input text[];
  tags_input text[];
begin
  if jsonb_typeof(steps_input) <> 'array' then
    raise exception 'Steps must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(steps_input) > 100 then
    raise exception 'Templates support at most 100 steps' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(steps_input) loop
    if jsonb_typeof(item) <> 'object'
       or nullif(trim(coalesce(item->>'id', '')), '') is null
       or nullif(trim(coalesce(item->>'title', '')), '') is null
       or char_length(item->>'title') > 300 then
      raise exception 'Each step requires an id and a title' using errcode = '22023';
    end if;
  end loop;

  if p_input ? 'recurrence' and (p_input->>'recurrence') not in ('none', 'daily', 'weekly', 'monthly', 'quarterly') then
    raise exception 'Invalid recurrence' using errcode = '22023';
  end if;
  if p_input ? 'visibility' and (p_input->>'visibility') not in ('internal', 'restricted') then
    raise exception 'Invalid visibility' using errcode = '22023';
  end if;

  select coalesce(array_agg(value), '{}') into required_asset_ids_input
    from jsonb_array_elements_text(coalesce(p_input->'requiredAssetIds', '[]'::jsonb)) value;
  select coalesce(array_agg(value), '{}') into required_knowledge_ids_input
    from jsonb_array_elements_text(coalesce(p_input->'requiredKnowledgeIds', '[]'::jsonb)) value;
  select coalesce(array_agg(value), '{}') into tags_input
    from jsonb_array_elements_text(coalesce(p_input->'tags', '[]'::jsonb)) value;

  if p_template_id is null then
    insert into public.protocol_templates (
      title, category, description, purpose, scope, preconditions, assigned_team,
      estimated_minutes, approval_required, default_approver_role, recurrence,
      required_asset_ids, required_knowledge_ids, related_task_template, tags,
      visibility, steps
    ) values (
      trim(p_input->>'title'),
      coalesce(nullif(p_input->>'category', ''), 'General'),
      coalesce(p_input->>'description', ''),
      coalesce(p_input->>'purpose', ''),
      coalesce(p_input->>'scope', ''),
      coalesce(p_input->>'preconditions', ''),
      coalesce(p_input->>'assignedTeam', ''),
      case when nullif(p_input->>'estimatedMinutes', '') is null then null else (p_input->>'estimatedMinutes')::integer end,
      coalesce((p_input->>'approvalRequired')::boolean, false),
      coalesce(p_input->>'defaultApproverRole', ''),
      coalesce(p_input->>'recurrence', 'none'),
      required_asset_ids_input,
      required_knowledge_ids_input,
      coalesce(p_input->>'relatedTaskTemplate', ''),
      tags_input,
      coalesce(p_input->>'visibility', 'internal'),
      steps_input
    ) returning id into result_id;
  else
    select * into existing from public.protocol_templates
     where organization_id = active_organization and id = p_template_id and deleted_at is null
     for update;
    if existing.id is null then
      raise exception 'Protocol template not found' using errcode = 'P0002';
    end if;

    update public.protocol_templates set
      title = trim(p_input->>'title'),
      category = coalesce(nullif(p_input->>'category', ''), 'General'),
      description = coalesce(p_input->>'description', ''),
      purpose = coalesce(p_input->>'purpose', ''),
      scope = coalesce(p_input->>'scope', ''),
      preconditions = coalesce(p_input->>'preconditions', ''),
      assigned_team = coalesce(p_input->>'assignedTeam', ''),
      estimated_minutes = case when nullif(p_input->>'estimatedMinutes', '') is null then null else (p_input->>'estimatedMinutes')::integer end,
      approval_required = coalesce((p_input->>'approvalRequired')::boolean, existing.approval_required),
      default_approver_role = coalesce(p_input->>'defaultApproverRole', ''),
      recurrence = coalesce(p_input->>'recurrence', existing.recurrence),
      required_asset_ids = required_asset_ids_input,
      required_knowledge_ids = required_knowledge_ids_input,
      related_task_template = coalesce(p_input->>'relatedTaskTemplate', ''),
      tags = tags_input,
      visibility = coalesce(p_input->>'visibility', existing.visibility),
      steps = steps_input
    where organization_id = active_organization and id = p_template_id and deleted_at is null
    returning id into result_id;
  end if;
  return result_id;
end;
$$;

-- ------------------------------------------------------------
-- WRITE: TEMPLATES - LIFECYCLE
-- ------------------------------------------------------------

create or replace function public.set_protocol_template_archived(p_template_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_protocols_manage();
begin
  update public.protocol_templates set archived = p_archived
   where organization_id = active_organization and id = p_template_id and deleted_at is null;
  if not found then
    raise exception 'Protocol template not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.duplicate_protocol_template(p_template_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_protocols_manage();
  src public.protocol_templates;
  new_id uuid;
  copied_steps jsonb;
begin
  select * into src from public.protocol_templates
   where organization_id = active_organization and id = p_template_id and deleted_at is null;
  if src.id is null then
    raise exception 'Protocol template not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg((elem || jsonb_build_object('id', gen_random_uuid()::text)) order by ord), '[]'::jsonb)
    into copied_steps
    from jsonb_array_elements(src.steps) with ordinality as t(elem, ord);

  insert into public.protocol_templates (
    title, category, description, purpose, scope, preconditions, assigned_team,
    estimated_minutes, approval_required, default_approver_role, recurrence,
    required_asset_ids, required_knowledge_ids, related_task_template, tags,
    visibility, steps, archived
  ) values (
    src.title || ' (Copy)', src.category, src.description, src.purpose, src.scope, src.preconditions,
    src.assigned_team, src.estimated_minutes, src.approval_required, src.default_approver_role, src.recurrence,
    src.required_asset_ids, src.required_knowledge_ids, src.related_task_template, src.tags,
    src.visibility, copied_steps, false
  ) returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.soft_delete_protocol_template(p_template_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_protocols_manage();
begin
  update public.protocol_templates set deleted_at = now(), deleted_by = auth.uid()
   where organization_id = active_organization and id = p_template_id and deleted_at is null;
  if not found then
    raise exception 'Protocol template not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.restore_protocol_template(p_template_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_protocols_manage();
begin
  update public.protocol_templates set deleted_at = null, deleted_by = null
   where organization_id = active_organization and id = p_template_id and deleted_at is not null;
  if not found then
    raise exception 'Deleted protocol template not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- WRITE: RUNS - LIFECYCLE
-- ------------------------------------------------------------

create or replace function public.start_protocol_run(p_template_id uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_protocols_manage();
  tmpl public.protocol_templates;
  run_id uuid;
  next_num integer;
  generated_run_number text;
  run_steps jsonb;
  links_value jsonb;
begin
  select * into tmpl from public.protocol_templates
   where organization_id = active_organization and id = p_template_id and deleted_at is null;
  if tmpl.id is null then
    raise exception 'Protocol template not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('stepId', elem->>'id', 'completed', false) order by ord), '[]'::jsonb)
    into run_steps
    from jsonb_array_elements(tmpl.steps) with ordinality as t(elem, ord);

  links_value := jsonb_strip_nulls(jsonb_build_object(
    'linkedTicketId', nullif(p_input->>'linkedTicketId', ''),
    'linkedAssetId', nullif(p_input->>'linkedAssetId', ''),
    'linkedTaskId', nullif(p_input->>'linkedTaskId', '')
  ));

  select coalesce(max(substring(run_number from 4)::int), 1000) + 1
    into next_num
    from public.protocol_runs
   where organization_id = active_organization;
  generated_run_number := 'PR-' || lpad(next_num::text, 4, '0');

  insert into public.protocol_runs (
    run_number, template_id, template_title, status, assigned_user, team,
    started_at, due_date, steps, links
  ) values (
    generated_run_number, tmpl.id, tmpl.title, 'in_progress',
    coalesce(p_input->>'assignedUser', ''), tmpl.assigned_team,
    now(),
    case when nullif(p_input->>'dueDate', '') is null then null else (p_input->>'dueDate')::timestamptz end,
    run_steps, links_value
  ) returning id into run_id;

  update public.protocol_templates set last_run_at = now()
   where organization_id = active_organization and id = tmpl.id;

  return run_id;
end;
$$;

create or replace function public.set_protocol_run_status(p_run_id uuid, p_status text, p_summary text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_protocols_manage();
  existing public.protocol_runs;
begin
  if p_status not in ('planned', 'in_progress', 'waiting', 'waiting_approval', 'completed',
                       'completed_with_issues', 'failed', 'cancelled') then
    raise exception 'Invalid protocol run status' using errcode = '22023';
  end if;

  select * into existing from public.protocol_runs
   where organization_id = active_organization and id = p_run_id
   for update;
  if existing.id is null then
    raise exception 'Protocol run not found' using errcode = 'P0002';
  end if;

  update public.protocol_runs set
    status = p_status,
    completed_at = case
      when p_status in ('completed', 'completed_with_issues', 'failed', 'cancelled') then now()
      else existing.completed_at
    end,
    final_summary = coalesce(p_summary, existing.final_summary)
  where id = p_run_id;
end;
$$;

create or replace function public.update_protocol_run_step(p_run_id uuid, p_step_id text, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_protocols_manage();
  existing public.protocol_runs;
  effective_patch jsonb := p_patch;
  caller_name text;
  new_steps jsonb;
  step_found boolean;
begin
  if jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Step patch must be a JSON object' using errcode = '22023';
  end if;

  select * into existing from public.protocol_runs
   where organization_id = active_organization and id = p_run_id
   for update;
  if existing.id is null then
    raise exception 'Protocol run not found' using errcode = 'P0002';
  end if;

  if p_patch ? 'completed' then
    select coalesce(nullif(trim(profiles.display_name), ''), profiles.email, '')
      into caller_name
      from public.profiles where profiles.id = auth.uid();
    if (p_patch->>'completed')::boolean then
      effective_patch := effective_patch || jsonb_build_object(
        'completedBy', coalesce(caller_name, ''), 'completedAt', to_jsonb(now())
      );
    else
      effective_patch := effective_patch || jsonb_build_object('completedBy', null, 'completedAt', null);
    end if;
  end if;

  select
    coalesce(jsonb_agg(
      (case when elem->>'stepId' = p_step_id then elem || effective_patch else elem end)
      order by ord
    ), '[]'::jsonb),
    bool_or(elem->>'stepId' = p_step_id)
    into new_steps, step_found
    from jsonb_array_elements(existing.steps) with ordinality as t(elem, ord);

  if not coalesce(step_found, false) then
    raise exception 'Protocol run step not found' using errcode = 'P0002';
  end if;

  update public.protocol_runs set steps = new_steps where id = p_run_id;
end;
$$;

create or replace function public.add_protocol_run_approval(p_run_id uuid, p_decision text, p_comment text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_protocols_manage();
  existing public.protocol_runs;
  caller_name text;
  approval_id uuid := gen_random_uuid();
  new_approval jsonb;
  new_status text;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid approval decision' using errcode = '22023';
  end if;

  select * into existing from public.protocol_runs
   where organization_id = active_organization and id = p_run_id
   for update;
  if existing.id is null then
    raise exception 'Protocol run not found' using errcode = 'P0002';
  end if;

  select coalesce(nullif(trim(profiles.display_name), ''), profiles.email, '')
    into caller_name
    from public.profiles where profiles.id = auth.uid();
  caller_name := coalesce(caller_name, '');

  new_approval := jsonb_build_object(
    'id', approval_id::text,
    'by', caller_name,
    'decision', p_decision,
    'comment', nullif(p_comment, ''),
    'at', to_jsonb(now())
  );
  new_status := case when p_decision = 'approved' then 'in_progress' else 'failed' end;

  update public.protocol_runs set
    approvals = existing.approvals || jsonb_build_array(new_approval),
    status = new_status
  where id = p_run_id;

  return approval_id;
end;
$$;

create or replace function public.add_protocol_run_comment(p_run_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid;
  comment_body text := trim(p_body);
  comment_id uuid;
begin
  if auth.uid() is null or not (public.has_permission('protocols.view') or public.has_permission('protocols.manage')) then
    raise exception 'Protocols permission required' using errcode = '42501';
  end if;
  active_organization := public.current_organization_id();

  if comment_body = '' or char_length(comment_body) > 5000 then
    raise exception 'Comment body must be 1 to 5000 characters' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.protocol_runs
     where organization_id = active_organization and id = p_run_id
  ) then
    raise exception 'Protocol run not found' using errcode = 'P0002';
  end if;

  insert into public.protocol_run_comments (organization_id, run_id, body)
  values (active_organization, p_run_id, comment_body)
  returning id into comment_id;

  return comment_id;
end;
$$;

-- ------------------------------------------------------------
-- GRANTS
-- ------------------------------------------------------------

revoke all privileges on public.protocol_templates, public.protocol_runs, public.protocol_run_comments
  from anon, authenticated;
grant select on public.protocol_templates, public.protocol_runs, public.protocol_run_comments to authenticated;

revoke all on function public.assert_protocols_manage() from public;
revoke all on function public.list_protocol_templates(boolean) from public;
revoke all on function public.list_protocol_runs() from public;
revoke all on function public.save_protocol_template(uuid, jsonb) from public;
revoke all on function public.set_protocol_template_archived(uuid, boolean) from public;
revoke all on function public.duplicate_protocol_template(uuid) from public;
revoke all on function public.soft_delete_protocol_template(uuid) from public;
revoke all on function public.restore_protocol_template(uuid) from public;
revoke all on function public.start_protocol_run(uuid, jsonb) from public;
revoke all on function public.set_protocol_run_status(uuid, text, text) from public;
revoke all on function public.update_protocol_run_step(uuid, text, jsonb) from public;
revoke all on function public.add_protocol_run_approval(uuid, text, text) from public;
revoke all on function public.add_protocol_run_comment(uuid, text) from public;

grant execute on function public.list_protocol_templates(boolean) to authenticated;
grant execute on function public.list_protocol_runs() to authenticated;
grant execute on function public.save_protocol_template(uuid, jsonb) to authenticated;
grant execute on function public.set_protocol_template_archived(uuid, boolean) to authenticated;
grant execute on function public.duplicate_protocol_template(uuid) to authenticated;
grant execute on function public.soft_delete_protocol_template(uuid) to authenticated;
grant execute on function public.restore_protocol_template(uuid) to authenticated;
grant execute on function public.start_protocol_run(uuid, jsonb) to authenticated;
grant execute on function public.set_protocol_run_status(uuid, text, text) to authenticated;
grant execute on function public.update_protocol_run_step(uuid, text, jsonb) to authenticated;
grant execute on function public.add_protocol_run_approval(uuid, text, text) to authenticated;
grant execute on function public.add_protocol_run_comment(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- RBAC ALIGNMENT
-- ------------------------------------------------------------
-- Frontend CAPS (src/lib/permissions.tsx) gates Protocols writes
-- behind "tasks.write", which includes sd_lead, helpdesk, and
-- technician. Align the database catalog with the same capability
-- so those roles can call the protocols.manage-gated RPCs above.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.permission_key = 'protocols.manage'
 where r.role_key in ('sd_lead', 'helpdesk', 'technician')
on conflict do nothing;

commit;
