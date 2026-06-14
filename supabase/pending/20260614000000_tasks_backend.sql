-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: organization-scoped Tasks backend
-- ------------------------------------------------------------
-- DRAFT - NOT APPLIED. Forward-only and additive.
-- Depends on 20260612235900_organization_foundation.sql and
-- Service Desk RBAC expansion (tasks.view / tasks.manage).
-- ============================================================

begin;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 300),
  description text not null default '' check (char_length(description) <= 20000),
  category text not null default 'General' check (char_length(category) <= 120),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'blocked', 'done')),
  scope text not null default 'personal'
    check (scope in ('personal', 'team', 'shared')),
  source text not null default 'manual'
    check (source in ('manual', 'ticket', 'protocol', 'note', 'template', 'maintenance')),
  due_date timestamptz,
  reminder_at timestamptz,
  assigned_to text not null default '' check (char_length(assigned_to) <= 160),
  owner text not null default '' check (char_length(owner) <= 160),
  team text not null default '' check (char_length(team) <= 160),
  tags text[] not null default '{}',
  watchers text[] not null default '{}',
  recurring jsonb,
  escalated boolean not null default false,
  archived boolean not null default false,
  checklist jsonb not null default '[]'::jsonb,
  links jsonb not null default '{}'::jsonb,
  notes text not null default '' check (char_length(notes) <= 20000),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  unique (organization_id, id),
  check ((deleted_at is null and deleted_by is null) or deleted_at is not null),
  check (recurring is null or jsonb_typeof(recurring) = 'object'),
  check (jsonb_typeof(checklist) = 'array'),
  check (jsonb_typeof(links) = 'object')
);

create index if not exists idx_tasks_org_status
  on public.tasks(organization_id, status) where deleted_at is null;
create index if not exists idx_tasks_org_assignee
  on public.tasks(organization_id, assigned_to) where deleted_at is null;
create index if not exists idx_tasks_org_due_date
  on public.tasks(organization_id, due_date) where deleted_at is null;

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  task_id uuid not null,
  author uuid references auth.users(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id) on delete cascade
);

create index if not exists idx_task_comments_task
  on public.task_comments(organization_id, task_id, created_at);

-- ------------------------------------------------------------
-- TRIGGERS
-- ------------------------------------------------------------

create or replace function public.prepare_tasks_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare active_organization uuid := public.current_organization_id();
begin
  if tg_op = 'INSERT' then
    new.organization_id := active_organization;
    new.created_by := auth.uid();
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'Task organization cannot be changed' using errcode = '42501';
  else
    new.organization_id := old.organization_id;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tasks_prepare_write on public.tasks;
create trigger tasks_prepare_write before insert or update on public.tasks
for each row execute function public.prepare_tasks_write();

create or replace function public.prepare_task_comments_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare active_organization uuid := public.current_organization_id();
begin
  new.organization_id := active_organization;
  new.author := auth.uid();
  return new;
end;
$$;

drop trigger if exists task_comments_prepare_write on public.task_comments;
create trigger task_comments_prepare_write before insert on public.task_comments
for each row execute function public.prepare_task_comments_write();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;

create policy tasks_select on public.tasks for select to authenticated
using (organization_id = public.current_organization_id() and (
  (deleted_at is null and public.has_permission('tasks.view')) or public.has_permission('tasks.manage')
));

create policy task_comments_select on public.task_comments for select to authenticated
using (
  organization_id = public.current_organization_id()
  and (public.has_permission('tasks.view') or public.has_permission('tasks.manage'))
  and exists (
    select 1 from public.tasks
     where tasks.organization_id = task_comments.organization_id
       and tasks.id = task_comments.task_id
       and (tasks.deleted_at is null or public.has_permission('tasks.manage'))
  )
);

-- ------------------------------------------------------------
-- HELPERS
-- ------------------------------------------------------------

create or replace function public.assert_tasks_manage()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_permission('tasks.manage') then
    raise exception 'Tasks manage permission required' using errcode = '42501';
  end if;
  return public.current_organization_id();
end;
$$;

create or replace function public.next_task_occurrence(p_at timestamptz, p_recurring jsonb)
returns timestamptz language sql immutable security invoker set search_path = '' as $$
  select case p_recurring->>'freq'
    when 'daily' then p_at + (greatest(1, coalesce((p_recurring->>'interval')::int, 1)) || ' days')::interval
    when 'weekly' then p_at + (7 * greatest(1, coalesce((p_recurring->>'interval')::int, 1)) || ' days')::interval
    when 'monthly' then p_at + (greatest(1, coalesce((p_recurring->>'interval')::int, 1)) || ' months')::interval
    when 'quarterly' then p_at + (3 * greatest(1, coalesce((p_recurring->>'interval')::int, 1)) || ' months')::interval
    else p_at
  end;
$$;

create or replace function public.duplicate_task_checklist(p_checklist jsonb)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', gen_random_uuid()::text,
           'title', elem->>'title',
           'completed', false,
           'required', coalesce((elem->>'required')::boolean, false),
           'notes', coalesce(elem->>'notes', '')
         )), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_checklist, '[]'::jsonb)) elem;
$$;

-- ------------------------------------------------------------
-- READ
-- ------------------------------------------------------------

create or replace function public.list_tasks(p_include_deleted boolean default false)
returns table (
  id uuid, title text, description text, category text, priority text, status text,
  scope text, source text, due_date timestamptz, reminder_at timestamptz,
  assigned_to text, owner text, team text, tags text[], watchers text[],
  recurring jsonb, escalated boolean, archived boolean, checklist jsonb, links jsonb,
  notes text, completed_at timestamptz, created_at timestamptz, updated_at timestamptz,
  deleted_at timestamptz, comments jsonb
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.title, t.description, t.category, t.priority, t.status, t.scope, t.source,
         t.due_date, t.reminder_at, t.assigned_to, t.owner, t.team, t.tags, t.watchers,
         t.recurring, t.escalated, t.archived, t.checklist, t.links, t.notes, t.completed_at,
         t.created_at, t.updated_at, t.deleted_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', c.id,
                    'author', c.author,
                    'authorName', coalesce(nullif(trim(p.display_name), ''), p.email, ''),
                    'body', c.body,
                    'at', c.created_at
                  ) order by c.created_at)
             from public.task_comments c
             left join public.profiles p on p.id = c.author
            where c.organization_id = t.organization_id and c.task_id = t.id
         ), '[]'::jsonb) as comments
    from public.tasks t
   where t.organization_id = public.current_organization_id()
     and (public.has_permission('tasks.view') or public.has_permission('tasks.manage'))
     and (t.deleted_at is null or (p_include_deleted and public.has_permission('tasks.manage')))
   order by t.created_at desc;
$$;

-- ------------------------------------------------------------
-- WRITE: CREATE / UPDATE
-- ------------------------------------------------------------

create or replace function public.save_task(p_task_id uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_tasks_manage();
  existing public.tasks;
  result_id uuid;
  checklist_input jsonb := coalesce(p_input->'checklist', '[]'::jsonb);
  recurring_input jsonb := p_input->'recurring';
  item jsonb;
  caller_name text;
  tags_input text[];
  watchers_input text[];
begin
  if jsonb_typeof(checklist_input) <> 'array' then
    raise exception 'Checklist must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(checklist_input) > 100 then
    raise exception 'Checklist supports at most 100 items' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(checklist_input) loop
    if jsonb_typeof(item) <> 'object'
       or nullif(trim(coalesce(item->>'title', '')), '') is null
       or char_length(item->>'title') > 300 then
      raise exception 'Each checklist item requires a title' using errcode = '22023';
    end if;
  end loop;

  if recurring_input is null or recurring_input = 'null'::jsonb then
    recurring_input := null;
  elsif jsonb_typeof(recurring_input) <> 'object'
        or not (recurring_input ? 'freq')
        or not (recurring_input ? 'interval')
        or (recurring_input->>'freq') not in ('daily', 'weekly', 'monthly', 'quarterly') then
    raise exception 'Invalid recurrence' using errcode = '22023';
  end if;

  if p_input ? 'priority' and (p_input->>'priority') not in ('low', 'normal', 'high', 'critical') then
    raise exception 'Invalid priority' using errcode = '22023';
  end if;
  if p_input ? 'status' and (p_input->>'status') not in ('open', 'in_progress', 'blocked', 'done') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  if p_input ? 'scope' and (p_input->>'scope') not in ('personal', 'team', 'shared') then
    raise exception 'Invalid scope' using errcode = '22023';
  end if;
  if p_input ? 'source'
     and (p_input->>'source') not in ('manual', 'ticket', 'protocol', 'note', 'template', 'maintenance') then
    raise exception 'Invalid source' using errcode = '22023';
  end if;

  select coalesce(nullif(trim(profiles.display_name), ''), profiles.email, '')
    into caller_name
    from public.profiles where profiles.id = auth.uid();
  caller_name := coalesce(caller_name, '');

  select coalesce(array_agg(value), '{}')
    into tags_input
    from jsonb_array_elements_text(coalesce(p_input->'tags', '[]'::jsonb)) value;
  select coalesce(array_agg(value), '{}')
    into watchers_input
    from jsonb_array_elements_text(coalesce(p_input->'watchers', '[]'::jsonb)) value;

  if p_task_id is null then
    insert into public.tasks (
      title, description, category, priority, status, scope, source,
      due_date, reminder_at, assigned_to, owner, team, tags, watchers,
      recurring, notes, checklist
    ) values (
      trim(p_input->>'title'),
      coalesce(p_input->>'description', ''),
      coalesce(p_input->>'category', 'General'),
      coalesce(p_input->>'priority', 'normal'),
      coalesce(p_input->>'status', 'open'),
      coalesce(p_input->>'scope', 'personal'),
      coalesce(p_input->>'source', 'manual'),
      case when nullif(p_input->>'due_date', '') is null then null else (p_input->>'due_date')::timestamptz end,
      case when nullif(p_input->>'reminder_at', '') is null then null else (p_input->>'reminder_at')::timestamptz end,
      coalesce(nullif(p_input->>'assigned_to', ''), caller_name),
      coalesce(nullif(p_input->>'owner', ''), caller_name),
      coalesce(p_input->>'team', ''),
      tags_input,
      watchers_input,
      recurring_input,
      coalesce(p_input->>'notes', ''),
      checklist_input
    ) returning id into result_id;
  else
    select * into existing from public.tasks
     where organization_id = active_organization and id = p_task_id and deleted_at is null
     for update;
    if existing.id is null then
      raise exception 'Task not found' using errcode = 'P0002';
    end if;

    update public.tasks set
      title = trim(p_input->>'title'),
      description = coalesce(p_input->>'description', ''),
      category = coalesce(p_input->>'category', 'General'),
      priority = coalesce(p_input->>'priority', existing.priority),
      scope = coalesce(p_input->>'scope', existing.scope),
      source = coalesce(p_input->>'source', existing.source),
      due_date = case when nullif(p_input->>'due_date', '') is null then null else (p_input->>'due_date')::timestamptz end,
      reminder_at = case when nullif(p_input->>'reminder_at', '') is null then null else (p_input->>'reminder_at')::timestamptz end,
      assigned_to = coalesce(nullif(p_input->>'assigned_to', ''), existing.assigned_to),
      owner = coalesce(nullif(p_input->>'owner', ''), existing.owner),
      team = coalesce(nullif(p_input->>'team', ''), existing.team),
      tags = tags_input,
      watchers = watchers_input,
      recurring = recurring_input,
      notes = coalesce(p_input->>'notes', ''),
      checklist = checklist_input
    where organization_id = active_organization and id = p_task_id and deleted_at is null
    returning id into result_id;
  end if;
  return result_id;
end;
$$;

-- ------------------------------------------------------------
-- WRITE: STATUS / LIFECYCLE
-- ------------------------------------------------------------

create or replace function public.set_task_status(p_task_id uuid, p_status text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_tasks_manage();
  current_task public.tasks;
  follow_up_id uuid;
  next_due timestamptz;
  next_reminder timestamptz;
begin
  if p_status not in ('open', 'in_progress', 'blocked', 'done') then
    raise exception 'Invalid task status' using errcode = '22023';
  end if;

  select * into current_task from public.tasks
   where organization_id = active_organization and id = p_task_id and deleted_at is null
   for update;
  if current_task.id is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if p_status = 'done' then
    update public.tasks set status = 'done', completed_at = now() where id = p_task_id;

    if current_task.recurring is not null and current_task.due_date is not null then
      next_due := public.next_task_occurrence(current_task.due_date, current_task.recurring);
      next_reminder := case when current_task.reminder_at is not null
        then public.next_task_occurrence(current_task.reminder_at, current_task.recurring) else null end;

      insert into public.tasks (
        title, description, category, priority, status, scope, source,
        due_date, reminder_at, assigned_to, owner, team, tags, watchers,
        recurring, notes, checklist, links
      ) values (
        current_task.title, current_task.description, current_task.category,
        current_task.priority, 'open', current_task.scope, current_task.source,
        next_due, next_reminder, current_task.assigned_to, current_task.owner,
        current_task.team, current_task.tags, current_task.watchers,
        current_task.recurring, current_task.notes,
        public.duplicate_task_checklist(current_task.checklist), current_task.links
      ) returning id into follow_up_id;
    end if;
  elsif current_task.status = 'done' then
    update public.tasks set status = p_status, completed_at = null where id = p_task_id;
  else
    update public.tasks set status = p_status where id = p_task_id;
  end if;

  return follow_up_id;
end;
$$;

create or replace function public.escalate_task(p_task_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_tasks_manage();
  current_task public.tasks;
  next_priority text;
begin
  select * into current_task from public.tasks
   where organization_id = active_organization and id = p_task_id and deleted_at is null
   for update;
  if current_task.id is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  next_priority := case current_task.priority
    when 'low' then 'normal'
    when 'normal' then 'high'
    else 'critical'
  end;
  update public.tasks set priority = next_priority, escalated = true where id = p_task_id;
  return next_priority;
end;
$$;

create or replace function public.set_task_archived(p_task_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_tasks_manage();
begin
  update public.tasks set archived = p_archived
   where organization_id = active_organization and id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.duplicate_task(p_task_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_tasks_manage();
  src public.tasks;
  new_id uuid;
begin
  select * into src from public.tasks
   where organization_id = active_organization and id = p_task_id and deleted_at is null;
  if src.id is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  insert into public.tasks (
    title, description, category, priority, status, scope, source,
    due_date, reminder_at, assigned_to, owner, team, tags, watchers,
    recurring, escalated, archived, checklist, links, notes
  ) values (
    src.title || ' (copy)', src.description, src.category, src.priority,
    'open', src.scope, src.source, src.due_date, src.reminder_at,
    src.assigned_to, src.owner, src.team, src.tags, src.watchers,
    src.recurring, false, false, public.duplicate_task_checklist(src.checklist), src.links, src.notes
  ) returning id into new_id;

  return new_id;
end;
$$;

-- ------------------------------------------------------------
-- WRITE: LINKS / REMINDER / COMMENTS
-- ------------------------------------------------------------

create or replace function public.save_task_links(p_task_id uuid, p_links jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_tasks_manage();
begin
  if jsonb_typeof(p_links) <> 'object' then
    raise exception 'Links must be a JSON object' using errcode = '22023';
  end if;
  if octet_length(p_links::text) > 20000 then
    raise exception 'Links payload is too large' using errcode = '22023';
  end if;
  update public.tasks set links = p_links
   where organization_id = active_organization and id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.set_task_reminder(p_task_id uuid, p_reminder_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_tasks_manage();
begin
  update public.tasks set reminder_at = p_reminder_at
   where organization_id = active_organization and id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.add_task_comment(p_task_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid;
  comment_body text := trim(p_body);
  comment_id uuid;
begin
  if auth.uid() is null or not (public.has_permission('tasks.view') or public.has_permission('tasks.manage')) then
    raise exception 'Tasks permission required' using errcode = '42501';
  end if;
  active_organization := public.current_organization_id();

  if comment_body = '' or char_length(comment_body) > 5000 then
    raise exception 'Comment body must be 1 to 5000 characters' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.tasks
     where organization_id = active_organization and id = p_task_id and deleted_at is null
  ) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  insert into public.task_comments (organization_id, task_id, body)
  values (active_organization, p_task_id, comment_body)
  returning id into comment_id;

  return comment_id;
end;
$$;

-- ------------------------------------------------------------
-- WRITE: SOFT DELETE / RESTORE
-- ------------------------------------------------------------

create or replace function public.soft_delete_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_tasks_manage();
begin
  update public.tasks set deleted_at = now(), deleted_by = auth.uid()
   where organization_id = active_organization and id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.restore_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_tasks_manage();
begin
  update public.tasks set deleted_at = null, deleted_by = null
   where organization_id = active_organization and id = p_task_id and deleted_at is not null;
  if not found then
    raise exception 'Deleted task not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- WRITE: BULK ACTIONS
-- ------------------------------------------------------------

create or replace function public.bulk_update_tasks(p_task_ids uuid[], p_patch jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_tasks_manage();
  changed integer;
begin
  if coalesce(array_length(p_task_ids, 1), 0) = 0 or array_length(p_task_ids, 1) > 200 then
    raise exception 'Bulk task update batch must contain 1 to 200 tasks' using errcode = '22023';
  end if;
  if p_patch ? 'priority' and (p_patch->>'priority') not in ('low', 'normal', 'high', 'critical') then
    raise exception 'Invalid priority' using errcode = '22023';
  end if;
  if p_patch ? 'status' and (p_patch->>'status') not in ('open', 'in_progress', 'blocked', 'done') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  perform 1 from public.tasks
   where organization_id = active_organization and id = any(p_task_ids) and deleted_at is null
   order by id for update;

  update public.tasks set
    assigned_to = case when p_patch ? 'assigned_to' then p_patch->>'assigned_to' else assigned_to end,
    team = case when p_patch ? 'team' then p_patch->>'team' else team end,
    status = case when p_patch ? 'status' then p_patch->>'status' else status end,
    priority = case when p_patch ? 'priority' then p_patch->>'priority' else priority end,
    due_date = case when p_patch ? 'due_date'
                 then (case when nullif(p_patch->>'due_date', '') is null then null else (p_patch->>'due_date')::timestamptz end)
                 else due_date end,
    completed_at = case
      when p_patch ? 'status' and p_patch->>'status' = 'done' and status <> 'done' then now()
      when p_patch ? 'status' and p_patch->>'status' <> 'done' and status = 'done' then null
      else completed_at
    end
  where organization_id = active_organization and id = any(p_task_ids) and deleted_at is null;

  get diagnostics changed = row_count;
  if changed <> array_length(p_task_ids, 1) then
    raise exception 'One or more tasks were not found' using errcode = 'P0002';
  end if;
  return changed;
end;
$$;

create or replace function public.bulk_add_task_tag(p_task_ids uuid[], p_tag text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_tasks_manage();
  changed integer;
  tag text := trim(p_tag);
begin
  if tag = '' or char_length(tag) > 60 then
    raise exception 'Invalid tag' using errcode = '22023';
  end if;
  if coalesce(array_length(p_task_ids, 1), 0) = 0 or array_length(p_task_ids, 1) > 200 then
    raise exception 'Bulk tag batch must contain 1 to 200 tasks' using errcode = '22023';
  end if;

  perform 1 from public.tasks
   where organization_id = active_organization and id = any(p_task_ids) and deleted_at is null
   order by id for update;

  update public.tasks set tags = (
    select coalesce(array_agg(distinct x), '{}') from unnest(tags || array[tag]) as x
  ) where organization_id = active_organization and id = any(p_task_ids) and deleted_at is null;

  get diagnostics changed = row_count;
  if changed <> array_length(p_task_ids, 1) then
    raise exception 'One or more tasks were not found' using errcode = 'P0002';
  end if;
  return changed;
end;
$$;

create or replace function public.bulk_set_tasks_archived(p_task_ids uuid[], p_archived boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_tasks_manage();
  changed integer;
begin
  if coalesce(array_length(p_task_ids, 1), 0) = 0 or array_length(p_task_ids, 1) > 200 then
    raise exception 'Bulk archive batch must contain 1 to 200 tasks' using errcode = '22023';
  end if;

  update public.tasks set archived = p_archived
   where organization_id = active_organization and id = any(p_task_ids) and deleted_at is null;

  get diagnostics changed = row_count;
  if changed <> array_length(p_task_ids, 1) then
    raise exception 'One or more tasks were not found' using errcode = 'P0002';
  end if;
  return changed;
end;
$$;

create or replace function public.bulk_soft_delete_tasks(p_task_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_tasks_manage();
  changed integer;
begin
  if coalesce(array_length(p_task_ids, 1), 0) = 0 or array_length(p_task_ids, 1) > 200 then
    raise exception 'Bulk delete batch must contain 1 to 200 tasks' using errcode = '22023';
  end if;

  update public.tasks set deleted_at = now(), deleted_by = auth.uid()
   where organization_id = active_organization and id = any(p_task_ids) and deleted_at is null;

  get diagnostics changed = row_count;
  if changed <> array_length(p_task_ids, 1) then
    raise exception 'One or more tasks were not found' using errcode = 'P0002';
  end if;
  return changed;
end;
$$;

-- ------------------------------------------------------------
-- GRANTS
-- ------------------------------------------------------------

revoke all privileges on public.tasks, public.task_comments from anon, authenticated;
grant select on public.tasks, public.task_comments to authenticated;

revoke all on function public.assert_tasks_manage() from public;
revoke all on function public.list_tasks(boolean) from public;
revoke all on function public.save_task(uuid, jsonb) from public;
revoke all on function public.set_task_status(uuid, text) from public;
revoke all on function public.escalate_task(uuid) from public;
revoke all on function public.set_task_archived(uuid, boolean) from public;
revoke all on function public.duplicate_task(uuid) from public;
revoke all on function public.save_task_links(uuid, jsonb) from public;
revoke all on function public.set_task_reminder(uuid, timestamptz) from public;
revoke all on function public.add_task_comment(uuid, text) from public;
revoke all on function public.soft_delete_task(uuid) from public;
revoke all on function public.restore_task(uuid) from public;
revoke all on function public.bulk_update_tasks(uuid[], jsonb) from public;
revoke all on function public.bulk_add_task_tag(uuid[], text) from public;
revoke all on function public.bulk_set_tasks_archived(uuid[], boolean) from public;
revoke all on function public.bulk_soft_delete_tasks(uuid[]) from public;

grant execute on function public.list_tasks(boolean) to authenticated;
grant execute on function public.save_task(uuid, jsonb) to authenticated;
grant execute on function public.set_task_status(uuid, text) to authenticated;
grant execute on function public.escalate_task(uuid) to authenticated;
grant execute on function public.set_task_archived(uuid, boolean) to authenticated;
grant execute on function public.duplicate_task(uuid) to authenticated;
grant execute on function public.save_task_links(uuid, jsonb) to authenticated;
grant execute on function public.set_task_reminder(uuid, timestamptz) to authenticated;
grant execute on function public.add_task_comment(uuid, text) to authenticated;
grant execute on function public.soft_delete_task(uuid) to authenticated;
grant execute on function public.restore_task(uuid) to authenticated;
grant execute on function public.bulk_update_tasks(uuid[], jsonb) to authenticated;
grant execute on function public.bulk_add_task_tag(uuid[], text) to authenticated;
grant execute on function public.bulk_set_tasks_archived(uuid[], boolean) to authenticated;
grant execute on function public.bulk_soft_delete_tasks(uuid[]) to authenticated;

-- ------------------------------------------------------------
-- RBAC ALIGNMENT
-- ------------------------------------------------------------
-- Frontend CAPS (src/lib/permissions.tsx) grants "tasks.write" to
-- doc_editor; align the database catalog with the same capability.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.permission_key = 'tasks.manage'
 where r.role_key = 'doc_editor'
on conflict do nothing;

commit;
