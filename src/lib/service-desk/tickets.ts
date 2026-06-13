/**
 * Service Desk — Tickets data access (RLS-gated browser client).
 */
import { getSupabase } from "@/integrations/supabase/client";
import { mapAssignmentEvent, mapStatusEvent, mapTicket } from "./mappers";
import { asRow, asRows } from "./sb";
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
  return asRows<Row>(data).map(mapTicket);
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
  return asRows<Row>(data).map(mapTicket);
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("tickets").select(T_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapTicket(asRow<Row>(data)) : null;
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
 * Manual portal ticket creation for the current authenticated user.
 *
 * The legacy userId argument remains temporarily for call-site compatibility,
 * but it is deliberately ignored. The backend RPC derives requester_id from
 * auth.uid() and never accepts privileged lifecycle or assignment fields.
 */
export async function createTicket(
  _userId: string,
  input: CreateTicketInput,
): Promise<Ticket> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("create_ticket", {
    p_subject: input.subject,
    p_description: input.description ?? "",
    p_type: input.type ?? "request",
    p_category: input.category ?? null,
    p_subcategory: input.subcategory ?? null,
    p_priority: input.priority ?? "normal",
    p_tags: input.tags ?? [],
    p_affected_service: input.affectedService ?? null,
  });

  if (error) throw error;
  if (!data) throw new Error("create_ticket returned no row");

  return mapTicket(asRow<Row>(data));
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
 * Patch a ticket through the constrained backend update contract.
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

  const { data, error } = await sb.rpc("update_ticket", {
    p_ticket_id: id,
    p_patch: row,
  });

  if (error) throw error;
  if (!data) throw new Error("update_ticket returned no row");

  return mapTicket(asRow<Row>(data));
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
  return asRows<Row>(data).map(mapStatusEvent);
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
  return asRows<Row>(data).map(mapAssignmentEvent);
}
