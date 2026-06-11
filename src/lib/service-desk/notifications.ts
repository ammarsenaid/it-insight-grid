/**
 * Service Desk — Notifications (own inbox + mark-read RPC).
 */
import { getSupabase } from "@/integrations/supabase/client";
import { mapNotification } from "./mappers";
import { asRows, type SbRow } from "./sb";
import type { NotificationRow } from "./types";

const COLS = "id, user_id, ticket_id, kind, title, body, payload, read_at, created_at";

export async function listMyNotifications(limit = 100): Promise<NotificationRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("notifications")
    .select(COLS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return asRows<SbRow>(data).map(mapNotification);
}

export async function countUnreadNotifications(): Promise<number> {
  const sb = getSupabase();
  const { count, error } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markAllNotificationsRead(): Promise<number> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("mark_notifications_read", { p_ids: null });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

export async function markNotificationsRead(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const sb = getSupabase();
  const { data, error } = await sb.rpc("mark_notifications_read", { p_ids: ids });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}
