-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: Ticket Attachments (Phase A — Batch 3/6)
-- ------------------------------------------------------------
-- DRAFT — NOT YET APPLIED. Forward-only and additive.
--
-- Adds:
--   * Table public.ticket_attachments
--   * Private storage bucket 'ticket-attachments'
--   * Path-format helper public.is_valid_ticket_attachment_path(text)
--     enforcing  <ticket_uuid>/<filename>
--   * Storage RLS on storage.objects for the bucket
--   * Public-schema RLS for the metadata table
--
-- Depends on:
--   20260611000000_service_desk_foundation.sql   (tickets, can_view_ticket)
--   20260611010000_service_desk_rbac_expand.sql  (attachment perms)
--
-- NOTE on storage.buckets:
--   Supabase's preferred path is the storage tool. This migration
--   is intentionally raw SQL because the whole Service Desk package
--   is being staged for manual apply on the test VPS. The
--   `insert into storage.buckets ... on conflict do nothing` is
--   idempotent and matches existing knowledge-attachments setup.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. METADATA TABLE
-- ------------------------------------------------------------
create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  comment_id uuid references public.ticket_comments(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  storage_path text not null unique,
  file_name text not null check (char_length(trim(file_name)) between 1 and 255),
  mime_type text not null default 'application/octet-stream'
    check (char_length(mime_type) <= 200),
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 50 * 1024 * 1024),
  -- 'public' attachments are visible to the requester; 'internal' are
  -- only visible to agents with tickets.view_internal.
  visibility text not null default 'public' check (visibility in ('public','internal')),
  created_at timestamptz not null default now()
);

comment on table public.ticket_attachments is
  'Attachments on tickets. Files live in the private "ticket-attachments" bucket.';

create index if not exists idx_ticket_attachments_ticket
  on public.ticket_attachments(ticket_id, created_at);
create index if not exists idx_ticket_attachments_comment
  on public.ticket_attachments(comment_id);

-- ------------------------------------------------------------
-- 2. PATH HELPER
-- ------------------------------------------------------------
-- Storage object name must be <ticket_uuid>/<filename> where:
--   * <ticket_uuid> is a real ticket the caller can view
--   * <filename>    is a single path segment (no '/'), 1..255 chars,
--                   no NUL, no '..'
create or replace function public.is_valid_ticket_attachment_path(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[];
  ticket_uuid uuid;
  fname text;
begin
  if p_object_name is null then
    return false;
  end if;
  parts := string_to_array(p_object_name, '/');
  if array_length(parts, 1) is distinct from 2 then
    return false;
  end if;

  begin
    ticket_uuid := parts[1]::uuid;
  exception when others then
    return false;
  end;

  fname := parts[2];
  if fname is null
     or length(fname) < 1
     or length(fname) > 255
     or position(E'\u0000' in fname) > 0
     or fname = '..' or fname = '.' then
    return false;
  end if;

  return exists (
    select 1 from public.tickets t where t.id = ticket_uuid
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. STORAGE BUCKET
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do update set public = false;

-- ------------------------------------------------------------
-- 4. RLS — public.ticket_attachments
-- ------------------------------------------------------------
alter table public.ticket_attachments enable row level security;

-- Select: ticket must be visible AND (visibility=public OR caller can read internal)
drop policy if exists ticket_attachments_select_visible on public.ticket_attachments;
create policy ticket_attachments_select_visible
on public.ticket_attachments for select to authenticated
using (
  public.can_view_ticket(ticket_id)
  and (
    visibility = 'public'
    or public.has_permission('tickets.view_internal')
  )
);

-- Insert: caller must own the row, be able to view the ticket, and have upload perm.
-- Internal-visibility attachments additionally require comment_internal perm.
drop policy if exists ticket_attachments_insert_authorized on public.ticket_attachments;
create policy ticket_attachments_insert_authorized
on public.ticket_attachments for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and public.can_view_ticket(ticket_id)
  and public.has_permission('tickets.attachments.upload')
  and (
    visibility = 'public'
    or public.has_permission('tickets.comment_internal')
  )
);

-- Delete: uploader or attachment manager.
drop policy if exists ticket_attachments_delete_authorized on public.ticket_attachments;
create policy ticket_attachments_delete_authorized
on public.ticket_attachments for delete to authenticated
using (
  uploaded_by = (select auth.uid())
  or public.has_permission('tickets.attachments.manage')
);

-- ------------------------------------------------------------
-- 5. RLS — storage.objects for 'ticket-attachments'
-- ------------------------------------------------------------
-- Read: ticket must be visible to caller, path must be well-formed.
drop policy if exists ticket_attachments_storage_select on storage.objects;
create policy ticket_attachments_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'ticket-attachments'
  and public.is_valid_ticket_attachment_path(name)
  and public.can_view_ticket((split_part(name, '/', 1))::uuid)
);

-- Upload: caller must own object, path must validate, and have upload perm.
drop policy if exists ticket_attachments_storage_insert on storage.objects;
create policy ticket_attachments_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'ticket-attachments'
  and owner = (select auth.uid())
  and public.is_valid_ticket_attachment_path(name)
  and public.has_permission('tickets.attachments.upload')
  and public.can_view_ticket((split_part(name, '/', 1))::uuid)
);

-- Delete: uploader or attachment manager.
drop policy if exists ticket_attachments_storage_delete on storage.objects;
create policy ticket_attachments_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'ticket-attachments'
  and (
    owner = (select auth.uid())
    or public.has_permission('tickets.attachments.manage')
  )
);

-- No update policy: attachments are immutable.

-- ------------------------------------------------------------
-- 6. DATA-API PRIVILEGES
-- ------------------------------------------------------------
revoke all privileges on table public.ticket_attachments from anon, authenticated;
grant select, insert, delete on table public.ticket_attachments to authenticated;
grant all on table public.ticket_attachments to service_role;

revoke all on function public.is_valid_ticket_attachment_path(text) from public;
grant execute on function public.is_valid_ticket_attachment_path(text) to authenticated;

commit;
