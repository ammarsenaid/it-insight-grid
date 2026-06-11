/**
 * Service Desk — Ticket comments (public replies + internal notes).
 */
import { getSupabase } from "@/integrations/supabase/client";
import { mapTicketComment } from "./mappers";
import { asRow, asRows, type SbRow } from "./sb";
import type { TicketComment } from "./types";

const COLS = "id, ticket_id, author_id, body, internal, created_at";

export async function listTicketComments(ticketId: string): Promise<TicketComment[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_comments")
    .select(COLS)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return asRows<SbRow>(data).map(mapTicketComment);
}

export interface NewCommentInput {
  ticketId: string;
  authorId: string;
  body: string;
  internal?: boolean;
}

export async function addTicketComment(input: NewCommentInput): Promise<TicketComment> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_comments")
    .insert({
      ticket_id: input.ticketId,
      author_id: input.authorId,
      body: input.body,
      internal: Boolean(input.internal),
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return mapTicketComment(asRow<SbRow>(data));
}
