-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: organization-scoped Notes backend
-- ------------------------------------------------------------
-- DRAFT - NOT APPLIED. Forward-only and additive.
-- Depends on 20260612235900_organization_foundation.sql and
-- Service Desk RBAC expansion (notes.view / notes.manage).
-- ============================================================

begin;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 300),
  category text not null default 'General' check (char_length(category) <= 120),
  content text not null default '' check (char_length(content) <= 100000),
  tags text[] not null default '{}',
  pinned boolean not null default false,
  archived boolean not null default false,
  is_template boolean not null default false,
  owner text not null default '' check (char_length(owner) <= 160),
  links jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  check ((deleted_at is null and deleted_by is null) or deleted_at is not null),
  check (jsonb_typeof(links) = 'object')
);

create index if not exists idx_notes_org_category
  on public.notes(organization_id, category) where deleted_at is null;
create index if not exists idx_notes_org_pinned
  on public.notes(organization_id, pinned) where deleted_at is null;
create index if not exists idx_notes_org_archived
  on public.notes(organization_id, archived) where deleted_at is null;

create table if not exists public.note_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 200),
  category text not null default 'General' check (char_length(category) <= 120),
  content text not null default '' check (char_length(content) <= 100000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  check ((deleted_at is null and deleted_by is null) or deleted_at is not null)
);

create index if not exists idx_note_templates_org
  on public.note_templates(organization_id) where deleted_at is null;

-- ------------------------------------------------------------
-- TRIGGERS
-- ------------------------------------------------------------

create or replace function public.prepare_notes_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare active_organization uuid := public.current_organization_id();
begin
  if tg_op = 'INSERT' then
    new.organization_id := active_organization;
    new.created_by := auth.uid();
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'Note organization cannot be changed' using errcode = '42501';
  else
    new.organization_id := old.organization_id;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists notes_prepare_write on public.notes;
create trigger notes_prepare_write before insert or update on public.notes
for each row execute function public.prepare_notes_write();

create or replace function public.prepare_note_templates_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare active_organization uuid := public.current_organization_id();
begin
  if tg_op = 'INSERT' then
    new.organization_id := active_organization;
    new.created_by := auth.uid();
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'Note template organization cannot be changed' using errcode = '42501';
  else
    new.organization_id := old.organization_id;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists note_templates_prepare_write on public.note_templates;
create trigger note_templates_prepare_write before insert or update on public.note_templates
for each row execute function public.prepare_note_templates_write();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.notes enable row level security;
alter table public.note_templates enable row level security;

create policy notes_select on public.notes for select to authenticated
using (organization_id = public.current_organization_id() and (
  (deleted_at is null and public.has_permission('notes.view')) or public.has_permission('notes.manage')
));

create policy note_templates_select on public.note_templates for select to authenticated
using (organization_id = public.current_organization_id() and (
  (deleted_at is null and public.has_permission('notes.view')) or public.has_permission('notes.manage')
));

-- ------------------------------------------------------------
-- HELPERS
-- ------------------------------------------------------------

create or replace function public.assert_notes_manage()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_permission('notes.manage') then
    raise exception 'Notes manage permission required' using errcode = '42501';
  end if;
  return public.current_organization_id();
end;
$$;

-- ------------------------------------------------------------
-- READ
-- ------------------------------------------------------------

create or replace function public.list_notes(p_include_deleted boolean default false)
returns table (
  id uuid, title text, category text, content text, tags text[], pinned boolean,
  archived boolean, is_template boolean, owner text, links jsonb,
  created_at timestamptz, updated_at timestamptz, deleted_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.title, n.category, n.content, n.tags, n.pinned, n.archived,
         n.is_template, n.owner, n.links, n.created_at, n.updated_at, n.deleted_at
    from public.notes n
   where n.organization_id = public.current_organization_id()
     and (public.has_permission('notes.view') or public.has_permission('notes.manage'))
     and (n.deleted_at is null or (p_include_deleted and public.has_permission('notes.manage')))
   order by n.pinned desc, n.created_at desc;
$$;

create or replace function public.list_note_templates()
returns table (
  id uuid, name text, category text, content text,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.category, t.content, t.created_at, t.updated_at
    from public.note_templates t
   where t.organization_id = public.current_organization_id()
     and (public.has_permission('notes.view') or public.has_permission('notes.manage'))
     and t.deleted_at is null
   order by t.created_at desc;
$$;

-- ------------------------------------------------------------
-- WRITE: CREATE / UPDATE
-- ------------------------------------------------------------

create or replace function public.save_note(p_note_id uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_notes_manage();
  existing public.notes;
  result_id uuid;
  tags_input text[];
  caller_name text;
  linked_document text := nullif(p_input->>'linkedDocumentId', '');
begin
  select coalesce(array_agg(value), '{}')
    into tags_input
    from jsonb_array_elements_text(coalesce(p_input->'tags', '[]'::jsonb)) value;

  select coalesce(nullif(trim(profiles.display_name), ''), profiles.email, '')
    into caller_name
    from public.profiles where profiles.id = auth.uid();
  caller_name := coalesce(caller_name, '');

  if p_note_id is null then
    insert into public.notes (
      title, category, content, tags, pinned, is_template, owner, links
    ) values (
      trim(p_input->>'title'),
      coalesce(nullif(p_input->>'category', ''), 'General'),
      coalesce(p_input->>'content', ''),
      tags_input,
      coalesce((p_input->>'pinned')::boolean, false),
      coalesce((p_input->>'isTemplate')::boolean, false),
      caller_name,
      jsonb_build_object('linkedDocumentId', linked_document)
    ) returning id into result_id;
  else
    select * into existing from public.notes
     where organization_id = active_organization and id = p_note_id and deleted_at is null
     for update;
    if existing.id is null then
      raise exception 'Note not found' using errcode = 'P0002';
    end if;

    update public.notes set
      title = trim(p_input->>'title'),
      category = coalesce(nullif(p_input->>'category', ''), 'General'),
      content = coalesce(p_input->>'content', ''),
      tags = tags_input,
      pinned = coalesce((p_input->>'pinned')::boolean, existing.pinned),
      is_template = coalesce((p_input->>'isTemplate')::boolean, existing.is_template),
      links = existing.links || jsonb_build_object('linkedDocumentId', linked_document)
    where organization_id = active_organization and id = p_note_id and deleted_at is null
    returning id into result_id;
  end if;
  return result_id;
end;
$$;

create or replace function public.save_note_template(p_template_id uuid, p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_notes_manage();
  result_id uuid;
begin
  if p_template_id is null then
    insert into public.note_templates (name, category, content) values (
      trim(p_input->>'name'),
      coalesce(nullif(p_input->>'category', ''), 'General'),
      coalesce(p_input->>'content', '')
    ) returning id into result_id;
  else
    update public.note_templates set
      name = trim(p_input->>'name'),
      category = coalesce(nullif(p_input->>'category', ''), 'General'),
      content = coalesce(p_input->>'content', '')
    where organization_id = active_organization and id = p_template_id and deleted_at is null
    returning id into result_id;
    if result_id is null then
      raise exception 'Note template not found' using errcode = 'P0002';
    end if;
  end if;
  return result_id;
end;
$$;

-- ------------------------------------------------------------
-- WRITE: LIFECYCLE (pin / archive / duplicate / links)
-- ------------------------------------------------------------

create or replace function public.toggle_note_pin(p_note_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_notes_manage();
  new_state boolean;
begin
  update public.notes set pinned = not pinned
   where organization_id = active_organization and id = p_note_id and deleted_at is null
   returning pinned into new_state;
  if new_state is null then
    raise exception 'Note not found' using errcode = 'P0002';
  end if;
  return new_state;
end;
$$;

create or replace function public.set_note_archived(p_note_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_notes_manage();
begin
  update public.notes set archived = p_archived
   where organization_id = active_organization and id = p_note_id and deleted_at is null;
  if not found then
    raise exception 'Note not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.duplicate_note(p_note_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_notes_manage();
  src public.notes;
  new_id uuid;
begin
  select * into src from public.notes
   where organization_id = active_organization and id = p_note_id and deleted_at is null;
  if src.id is null then
    raise exception 'Note not found' using errcode = 'P0002';
  end if;

  insert into public.notes (
    title, category, content, tags, pinned, archived, is_template, owner, links
  ) values (
    src.title || ' (copy)', src.category, src.content, src.tags,
    false, false, src.is_template, src.owner, src.links
  ) returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.save_note_links(p_note_id uuid, p_links jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  active_organization uuid := public.assert_notes_manage();
  existing public.notes;
  ticket_ids text[];
  asset_ids text[];
  ipam_ids text[];
  task_ids text[];
  user_ids text[];
begin
  if jsonb_typeof(p_links) <> 'object' then
    raise exception 'Links must be a JSON object' using errcode = '22023';
  end if;

  select * into existing from public.notes
   where organization_id = active_organization and id = p_note_id and deleted_at is null
   for update;
  if existing.id is null then
    raise exception 'Note not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(value), '{}') into ticket_ids
    from jsonb_array_elements_text(coalesce(p_links->'linkedTicketIds', '[]'::jsonb)) value;
  select coalesce(array_agg(value), '{}') into asset_ids
    from jsonb_array_elements_text(coalesce(p_links->'linkedAssetIds', '[]'::jsonb)) value;
  select coalesce(array_agg(value), '{}') into ipam_ids
    from jsonb_array_elements_text(coalesce(p_links->'linkedIpamIds', '[]'::jsonb)) value;
  select coalesce(array_agg(value), '{}') into task_ids
    from jsonb_array_elements_text(coalesce(p_links->'linkedTaskIds', '[]'::jsonb)) value;
  select coalesce(array_agg(value), '{}') into user_ids
    from jsonb_array_elements_text(coalesce(p_links->'linkedUserIds', '[]'::jsonb)) value;

  update public.notes set links = existing.links || jsonb_build_object(
    'linkedTicketIds', to_jsonb(ticket_ids),
    'linkedAssetIds', to_jsonb(asset_ids),
    'linkedIpamIds', to_jsonb(ipam_ids),
    'linkedTaskIds', to_jsonb(task_ids),
    'linkedUserIds', to_jsonb(user_ids)
  ) where organization_id = active_organization and id = p_note_id and deleted_at is null;
end;
$$;

-- ------------------------------------------------------------
-- WRITE: SOFT DELETE / RESTORE
-- ------------------------------------------------------------

create or replace function public.soft_delete_note(p_note_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_notes_manage();
begin
  update public.notes set deleted_at = now(), deleted_by = auth.uid()
   where organization_id = active_organization and id = p_note_id and deleted_at is null;
  if not found then
    raise exception 'Note not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.restore_note(p_note_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_notes_manage();
begin
  update public.notes set deleted_at = null, deleted_by = null
   where organization_id = active_organization and id = p_note_id and deleted_at is not null;
  if not found then
    raise exception 'Deleted note not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.soft_delete_note_template(p_template_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_notes_manage();
begin
  update public.note_templates set deleted_at = now(), deleted_by = auth.uid()
   where organization_id = active_organization and id = p_template_id and deleted_at is null;
  if not found then
    raise exception 'Note template not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.restore_note_template(p_template_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare active_organization uuid := public.assert_notes_manage();
begin
  update public.note_templates set deleted_at = null, deleted_by = null
   where organization_id = active_organization and id = p_template_id and deleted_at is not null;
  if not found then
    raise exception 'Deleted note template not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- GRANTS
-- ------------------------------------------------------------

revoke all privileges on public.notes, public.note_templates from anon, authenticated;
grant select on public.notes, public.note_templates to authenticated;

revoke all on function public.assert_notes_manage() from public;
revoke all on function public.list_notes(boolean) from public;
revoke all on function public.list_note_templates() from public;
revoke all on function public.save_note(uuid, jsonb) from public;
revoke all on function public.save_note_template(uuid, jsonb) from public;
revoke all on function public.toggle_note_pin(uuid) from public;
revoke all on function public.set_note_archived(uuid, boolean) from public;
revoke all on function public.duplicate_note(uuid) from public;
revoke all on function public.save_note_links(uuid, jsonb) from public;
revoke all on function public.soft_delete_note(uuid) from public;
revoke all on function public.restore_note(uuid) from public;
revoke all on function public.soft_delete_note_template(uuid) from public;
revoke all on function public.restore_note_template(uuid) from public;

grant execute on function public.list_notes(boolean) to authenticated;
grant execute on function public.list_note_templates() to authenticated;
grant execute on function public.save_note(uuid, jsonb) to authenticated;
grant execute on function public.save_note_template(uuid, jsonb) to authenticated;
grant execute on function public.toggle_note_pin(uuid) to authenticated;
grant execute on function public.set_note_archived(uuid, boolean) to authenticated;
grant execute on function public.duplicate_note(uuid) to authenticated;
grant execute on function public.save_note_links(uuid, jsonb) to authenticated;
grant execute on function public.soft_delete_note(uuid) to authenticated;
grant execute on function public.restore_note(uuid) to authenticated;
grant execute on function public.soft_delete_note_template(uuid) to authenticated;
grant execute on function public.restore_note_template(uuid) to authenticated;

commit;
