-- ============================================================
-- IT KNOWLEDGE CENTER
-- Migration: Ticket Assignment History (Phase A — Batch 5/6)
-- ------------------------------------------------------------
-- AUTHORITATIVE. Forward-only and additive.
--
-- Adds:
--   * public.ticket_assignment_history
--   * trigger function tickets_capture_assignment(): fires on
--     INSERT and on UPDATE when assignee_id or assigned_team changes.
--   * RLS so anyone who can view the ticket can view its history.
-- ============================================================

begin;

create table if not exists public.ticket_assignment_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  from_team text,
  to_team text,
  from_assignee_id uuid references auth.users(id) on delete set null,
  to_assignee_id   uuid references auth.users(id) on delete set null,
  changed_by uuid references auth.users(id) on delete set null,
  reason text check (char_length(reason) <= 1000),
  changed_at timestamptz not null default now()
);

comment on table public.ticket_assignment_history is
  'Immutable log of (team, assignee) changes for a ticket.';

create index if not exists idx_ticket_assignment_history_ticket
  on public.ticket_assignment_history(ticket_id, changed_at);


-- ------------------------------------------------------------
-- Trigger
-- ------------------------------------------------------------
create or replace function public.tickets_capture_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.assignee_id is not null or new.assigned_team is not null then
      insert into public.ticket_assignment_history (
        ticket_id, from_team, to_team,
        from_assignee_id, to_assignee_id, changed_by
      )
      values (new.id, null, new.assigned_team, null, new.assignee_id, auth.uid());
    end if;
    return new;
  end if;

  if (new.assignee_id   is distinct from old.assignee_id)
  or (new.assigned_team is distinct from old.assigned_team) then
    insert into public.ticket_assignment_history (
      ticket_id, from_team, to_team,
      from_assignee_id, to_assignee_id, changed_by
    )
    values (new.id, old.assigned_team, new.assigned_team,
            old.assignee_id, new.assignee_id, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_assignment_insert on public.tickets;
create trigger tickets_assignment_insert
after insert on public.tickets
for each row execute function public.tickets_capture_assignment();

drop trigger if exists tickets_assignment_update on public.tickets;
create trigger tickets_assignment_update
after update of assignee_id, assigned_team on public.tickets
for each row execute function public.tickets_capture_assignment();


-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.ticket_assignment_history enable row level security;

drop policy if exists ticket_assignment_history_select_visible
  on public.ticket_assignment_history;
create policy ticket_assignment_history_select_visible
on public.ticket_assignment_history for select to authenticated
using (public.can_view_ticket(ticket_id));


-- ------------------------------------------------------------
-- Data API privileges
-- ------------------------------------------------------------
revoke all on table public.ticket_assignment_history from anon, authenticated;
grant select on table public.ticket_assignment_history to authenticated;
grant all on table public.ticket_assignment_history to service_role;

revoke all on function public.tickets_capture_assignment() from public;

commit;
