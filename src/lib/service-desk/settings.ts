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

const MAILBOX_CONFIG_COLS =
  "id, name, inbound_address, outbound_from, reply_to, default_category, default_priority, default_team, is_active";

export interface TicketMailboxConfigInput {
  name: string;
  inboundAddress: string;
  outboundFrom?: string | null;
  replyTo?: string | null;
  defaultCategory?: string | null;
  defaultPriority: TicketMailboxConfig["defaultPriority"];
  defaultTeam?: string | null;
  isActive: boolean;
}

function cleanNullable(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function mailboxInputToRow(input: TicketMailboxConfigInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    inbound_address: input.inboundAddress.trim(),
    outbound_from: cleanNullable(input.outboundFrom),
    reply_to: cleanNullable(input.replyTo),
    default_category: cleanNullable(input.defaultCategory),
    default_priority: input.defaultPriority,
    default_team: cleanNullable(input.defaultTeam),
    is_active: input.isActive,
  };
}

export async function listMailboxConfigs(): Promise<TicketMailboxConfig[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_mailbox_configs")
    .select(MAILBOX_CONFIG_COLS)
    .order("name", { ascending: true });
  if (error) throw error;
  return asRows<SbRow>(data).map(mapMailboxConfig);
}

export async function createMailboxConfig(
  input: TicketMailboxConfigInput,
): Promise<TicketMailboxConfig> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_mailbox_configs")
    .insert(mailboxInputToRow(input))
    .select(MAILBOX_CONFIG_COLS)
    .single();
  if (error) throw error;
  return mapMailboxConfig(data as SbRow);
}

export async function updateMailboxConfig(
  id: string,
  patch: Partial<TicketMailboxConfigInput>,
): Promise<TicketMailboxConfig> {
  const row: Record<string, unknown> = {};

  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.inboundAddress !== undefined) row.inbound_address = patch.inboundAddress.trim();
  if (patch.outboundFrom !== undefined) row.outbound_from = cleanNullable(patch.outboundFrom);
  if (patch.replyTo !== undefined) row.reply_to = cleanNullable(patch.replyTo);
  if (patch.defaultCategory !== undefined) row.default_category = cleanNullable(patch.defaultCategory);
  if (patch.defaultPriority !== undefined) row.default_priority = patch.defaultPriority;
  if (patch.defaultTeam !== undefined) row.default_team = cleanNullable(patch.defaultTeam);
  if (patch.isActive !== undefined) row.is_active = patch.isActive;

  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_mailbox_configs")
    .update(row)
    .eq("id", id)
    .select(MAILBOX_CONFIG_COLS)
    .single();
  if (error) throw error;
  return mapMailboxConfig(data as SbRow);
}

export async function deleteMailboxConfig(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("ticket_mailbox_configs").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Canned response CRUD (RLS gates writes to tickets.config) ----------

const CANNED_COLS =
  "id, shortcut, title, body, is_internal, created_by, created_at, updated_at";

export interface CannedResponseInput {
  shortcut: string;
  title: string;
  body: string;
  isInternal: boolean;
}

export async function createCannedResponse(
  userId: string,
  input: CannedResponseInput,
): Promise<TicketCannedResponse> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("ticket_canned_responses")
    .insert({
      shortcut: input.shortcut,
      title: input.title,
      body: input.body,
      is_internal: input.isInternal,
      created_by: userId,
    })
    .select(CANNED_COLS)
    .single();
  if (error) throw error;
  return mapCannedResponse(data as SbRow);
}

export async function updateCannedResponse(
  id: string,
  patch: Partial<CannedResponseInput>,
): Promise<TicketCannedResponse> {
  const sb = getSupabase();
  const row: Record<string, unknown> = {};
  if (patch.shortcut !== undefined) row.shortcut = patch.shortcut;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.body !== undefined) row.body = patch.body;
  if (patch.isInternal !== undefined) row.is_internal = patch.isInternal;
  const { data, error } = await sb
    .from("ticket_canned_responses")
    .update(row)
    .eq("id", id)
    .select(CANNED_COLS)
    .single();
  if (error) throw error;
  return mapCannedResponse(data as SbRow);
}

export async function deleteCannedResponse(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("ticket_canned_responses").delete().eq("id", id);
  if (error) throw error;
}

