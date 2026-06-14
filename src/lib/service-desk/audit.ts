/**
 * Service Desk audit-log reads. Database RLS limits this append-only log to
 * platform administrators and roles with tickets.view_all.
 */
import { getSupabase } from "@/integrations/supabase/client";
import type { TicketAuditEntry } from "./types";
import { asRows } from "./sb";

type Row = Record<string, unknown>;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" ? value : value == null ? null : String(value);

export async function listTicketAuditEntries(limit = 500): Promise<TicketAuditEntry[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_audit_log")
    .select("id, ticket_id, actor_id, action, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return asRows<Row>(data).map((row) => ({
    id: String(row.id ?? ""),
    ticketId: stringOrNull(row.ticket_id),
    actorId: stringOrNull(row.actor_id),
    action: String(row.action ?? "unknown"),
    payload:
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at ?? ""),
  }));
}

export function describeTicketAuditEntry(entry: TicketAuditEntry): string {
  const ticketNumber =
    typeof entry.payload.ticket_number === "string" ? entry.payload.ticket_number : null;
  const subject = typeof entry.payload.subject === "string" ? entry.payload.subject : null;
  const catalogName = typeof entry.payload.name === "string" ? entry.payload.name : null;

  if (entry.action === "ticket.create") {
    return `Created ticket${ticketNumber ? ` ${ticketNumber}` : ""}${subject ? ` - ${subject}` : ""}`;
  }
  if (entry.action === "ticket.update") return "Updated ticket assignment or lifecycle fields";
  if (entry.action === "comment.internal") return "Added an internal ticket note";
  if (entry.action === "comment.public") return "Added a public ticket reply";
  if (entry.action === "catalog.create")
    return `Created catalog item${catalogName ? ` ${catalogName}` : ""}`;
  if (entry.action === "catalog.update")
    return `Updated catalog item${catalogName ? ` ${catalogName}` : ""}`;
  if (entry.action === "catalog.delete")
    return `Deleted catalog item${catalogName ? ` ${catalogName}` : ""}`;
  return entry.action.replace(/[._]/g, " ");
}
