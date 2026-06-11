/**
 * Service Desk — Ticket settings (categories, priorities, SLAs,
 * routing rules, canned responses, mailbox configs).
 *
 * Reads: any signed-in user can read active categories/priorities;
 *        agents/admins see the rest (RLS enforced).
 * Writes: require tickets.config (RLS enforced).
 */
import { getSupabase } from "@/integrations/supabase/client";
import {
  mapCannedResponse,
  mapCategory,
  mapMailboxConfig,
  mapPriorityConfig,
  mapRoutingRule,
  mapSlaPolicy,
} from "./mappers";
import { asRows, type SbRow } from "./sb";
import type {
  TicketCannedResponse,
  TicketCategory,
  TicketMailboxConfig,
  TicketPriorityConfig,
  TicketRoutingRule,
  TicketSlaPolicy,
} from "./types";

export async function listCategories(): Promise<TicketCategory[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_categories")
    .select("id, key, name, description, parent_id, sort_order, is_active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return asRows<SbRow>(data).map(mapCategory);
}

export async function listPriorityConfigs(): Promise<TicketPriorityConfig[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_priorities")
    .select(
      "id, key, name, color, response_target_minutes, resolution_target_minutes, sort_order, is_active",
    )
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return asRows<SbRow>(data).map(mapPriorityConfig);
}

export async function listSlaPolicies(): Promise<TicketSlaPolicy[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_sla_policies")
    .select(
      "id, name, description, priority_key, response_minutes, resolution_minutes, business_hours_only, is_active",
    )
    .order("priority_key", { ascending: true });
  if (error) throw error;
  return asRows<SbRow>(data).map(mapSlaPolicy);
}

export async function listRoutingRules(): Promise<TicketRoutingRule[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_routing_rules")
    .select("id, name, description, match_when, action, priority_order, is_active")
    .order("priority_order", { ascending: true });
  if (error) throw error;
  return asRows<SbRow>(data).map(mapRoutingRule);
}

export async function listCannedResponses(): Promise<TicketCannedResponse[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_canned_responses")
    .select("id, shortcut, title, body, is_internal, created_by, created_at, updated_at")
    .order("shortcut", { ascending: true });
  if (error) throw error;
  return asRows<SbRow>(data).map(mapCannedResponse);
}

export async function listMailboxConfigs(): Promise<TicketMailboxConfig[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_mailbox_configs")
    .select(
      "id, name, inbound_address, outbound_from, reply_to, default_category, default_priority, default_team, is_active",
    )
    .order("name", { ascending: true });
  if (error) throw error;
  return asRows<SbRow>(data).map(mapMailboxConfig);
}
