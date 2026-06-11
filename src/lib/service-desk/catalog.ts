/**
 * Service Desk — Catalog data access.
 * Uses the browser Supabase client; RLS is the security boundary.
 */
import { getSupabase } from "@/integrations/supabase/client";
import { mapCatalogItem } from "./mappers";
import type { CatalogItem, CatalogItemStatus, CatalogItemVisibility } from "./types";

const SELECT_COLS =
  "id, name, category, description, icon, default_priority, default_team, " +
  "estimated_time, visibility, fields_schema, status, created_by, created_at, updated_at";

export async function listPublishedCatalog(): Promise<CatalogItem[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("catalog_items")
    .select(SELECT_COLS)
    .eq("status", "published")
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapCatalogItem);
}

export async function listAllCatalogForManagers(): Promise<CatalogItem[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("catalog_items")
    .select(SELECT_COLS)
    .order("status", { ascending: true })
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapCatalogItem);
}

export async function getCatalogItem(id: string): Promise<CatalogItem | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("catalog_items")
    .select(SELECT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCatalogItem(data) : null;
}

export interface CatalogItemInput {
  name: string;
  category: string;
  description?: string;
  icon?: string;
  defaultPriority?: CatalogItem["defaultPriority"];
  defaultTeam?: string | null;
  estimatedTime?: string | null;
  visibility?: CatalogItemVisibility;
  fieldsSchema?: CatalogItem["fieldsSchema"];
  status?: CatalogItemStatus;
}

function toRow(input: CatalogItemInput): Record<string, unknown> {
  return {
    name: input.name,
    category: input.category,
    description: input.description ?? "",
    icon: input.icon ?? "ShoppingBag",
    default_priority: input.defaultPriority ?? "normal",
    default_team: input.defaultTeam ?? null,
    estimated_time: input.estimatedTime ?? null,
    visibility: input.visibility ?? "internal",
    fields_schema: input.fieldsSchema ?? [],
    status: input.status ?? "draft",
  };
}

export async function createCatalogItem(input: CatalogItemInput): Promise<CatalogItem> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("catalog_items")
    .insert(toRow(input))
    .select(SELECT_COLS)
    .single();
  if (error) throw error;
  return mapCatalogItem(data);
}

export async function updateCatalogItem(
  id: string,
  patch: Partial<CatalogItemInput>,
): Promise<CatalogItem> {
  const sb = getSupabase();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.defaultPriority !== undefined) row.default_priority = patch.defaultPriority;
  if (patch.defaultTeam !== undefined) row.default_team = patch.defaultTeam;
  if (patch.estimatedTime !== undefined) row.estimated_time = patch.estimatedTime;
  if (patch.visibility !== undefined) row.visibility = patch.visibility;
  if (patch.fieldsSchema !== undefined) row.fields_schema = patch.fieldsSchema;
  if (patch.status !== undefined) row.status = patch.status;
  const { data, error } = await sb
    .from("catalog_items")
    .update(row)
    .eq("id", id)
    .select(SELECT_COLS)
    .single();
  if (error) throw error;
  return mapCatalogItem(data);
}

export async function deleteCatalogItem(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("catalog_items").delete().eq("id", id);
  if (error) throw error;
}

export async function setCatalogStatus(
  id: string,
  status: CatalogItemStatus,
): Promise<CatalogItem> {
  return updateCatalogItem(id, { status });
}

/**
 * Atomic catalog submission via the `submit_catalog_request` RPC.
 * Returns the new ticket id. Field validation lives in the database.
 */
export async function submitCatalogRequest(
  catalogItemId: string,
  values: Record<string, unknown>,
): Promise<{ id: string; ticketNumber: string }> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("submit_catalog_request", {
    p_catalog_item_id: catalogItemId,
    p_values: values ?? {},
  });
  if (error) throw error;
  // RPC returns the inserted public.tickets row (composite type).
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new Error("submit_catalog_request returned no row");
  }
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    ticketNumber: String(r.ticket_number ?? ""),
  };
}
