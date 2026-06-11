/**
 * Service Desk — Tickets data access (RLS-gated browser client).
 */
import { getSupabase } from "@/integrations/supabase/client";
import { mapAssignmentEvent, mapStatusEvent, mapTicket } from "./mappers";
import type {
  Ticket,
  TicketAssignmentEvent,
  TicketPriority,
  TicketStatus,
  TicketStatusEvent,
} from "./types";

const T_COLS =
  "id, ticket_number, requester_id, catalog_item_id, subject, description, type, " +
  "category, subcategory, priority, status, source, source_email, affected_service, " +
  "assigned_team, assignee_id, tags, catalog_values, opened_at, resolved_at, closed_at, " +
  "created_at, updated_at";

type Row = Record<string, unknown>;

/** Tickets visible to the current user (RLS filters: own + view_all). */
export async function listTickets(): Promise<Ticket[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("tickets")
    .select(T_COLS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(mapTicket);
}

/** Tickets where the current user is the requester (employee /my-requests). */
export async function listMyTickets(userId: string): Promise<Ticket[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("tickets")
    .select(T_COLS)
    .eq("requester_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(mapTicket);
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("tickets").select(T_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapTicket(data as Row) : null;
}

export interface CreateTicketInput {
  subject: string;
  description?: string;
  type?: Ticket["type"];
  category?: string | null;
  subcategory?: string | null;
  priority?: TicketPriority;
  tags?: string[];
  affectedService?: string | null;
}

/**
 * Manual ticket creation for the current user. The RLS policy
 * `tickets_insert_own` requires requester_id = auth.uid().
 */
export async function createTicket(
  userId: string,
  input: CreateTicketInput,
): Promise<Ticket> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("tickets")
    .insert({
      requester_id: userId,
      subject: input.subject,
      description: input.description ?? "",
      type: input.type ?? "request",
      category: input.category ?? null,
      subcategory: input.subcategory ?? null,
      priority: input.priority ?? "normal",
      tags: input.tags ?? [],
      affected_service: input.affectedService ?? null,
      source: "portal",
    })
    .select(T_COLS)
    .single();
  if (error) throw error;
  return mapTicket(data as Row);
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string | null;
  assignedTeam?: string | null;
  category?: string | null;
  subcategory?: string | null;
  tags?: string[];
  subject?: string;
  description?: string;
}

/**
 * Patch a ticket. RLS (`tickets_update_agents`) enforces that the caller
 * has tickets.view_all + (tickets.assign or tickets.resolve).
 */
export async function updateTicket(id: string, patch: UpdateTicketInput): Promise<Ticket> {
  const sb = getSupabase();
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId;
  if (patch.assignedTeam !== undefined) row.assigned_team = patch.assignedTeam;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.subcategory !== undefined) row.subcategory = patch.subcategory;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.subject !== undefined) row.subject = patch.subject;
  if (patch.description !== undefined) row.description = patch.description;
  const { data, error } = await sb
    .from("tickets")
    .update(row)
    .eq("id", id)
    .select(T_COLS)
    .single();
  if (error) throw error;
  return mapTicket(data as Row);
}

export async function setTicketStatus(id: string, status: TicketStatus): Promise<Ticket> {
  return updateTicket(id, { status });
}

export async function assignTicket(
  id: string,
  assigneeId: string | null,
  assignedTeam: string | null,
): Promise<Ticket> {
  return updateTicket(id, { assigneeId, assignedTeam });
}

export async function listStatusEvents(ticketId: string): Promise<TicketStatusEvent[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_status_events")
    .select("id, ticket_id, from_status, to_status, changed_by, reason, changed_at")
    .eq("ticket_id", ticketId)
    .order("changed_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(mapStatusEvent);
}

export async function listAssignmentHistory(
  ticketId: string,
): Promise<TicketAssignmentEvent[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_assignment_history")
    .select(
      "id, ticket_id, from_team, to_team, from_assignee_id, to_assignee_id, changed_by, reason, changed_at",
    )
    .eq("ticket_id", ticketId)
    .order("changed_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(mapAssignmentEvent);
}
