import { getSupabase } from "@/integrations/supabase/client";
import type {
  CmdbAsset,
  CmdbAssetInput,
  CmdbAssetType,
  CmdbLifecycleEvent,
} from "./types";

const ASSET_SELECT =
  "id, hostname, display_name, asset_type_id, asset_type:cmdb_asset_types(key), " +
  "ip_address, operating_system, role, environment, location, owner_name, owner_id, " +
  "vendor, model, serial_number, asset_tag, mac_address, status, warranty_expiration, " +
  "notes, created_at, updated_at, deleted_at, deleted_by";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapAsset(value: unknown): CmdbAsset {
  const row = record(value);
  const joinedType = Array.isArray(row.asset_type) ? record(row.asset_type[0]) : record(row.asset_type);
  return {
    id: text(row.id),
    hostname: text(row.hostname),
    displayName: text(row.display_name),
    assetTypeId: text(row.asset_type_id),
    assetType: text(joinedType.key),
    ipAddress: text(row.ip_address),
    os: text(row.operating_system),
    role: text(row.role),
    environment: text(row.environment) as CmdbAsset["environment"],
    location: text(row.location),
    owner: text(row.owner_name),
    ownerId: row.owner_id ? text(row.owner_id) : null,
    vendor: text(row.vendor),
    model: text(row.model),
    serialNumber: text(row.serial_number),
    assetTag: text(row.asset_tag),
    macAddress: text(row.mac_address),
    status: text(row.status) as CmdbAsset["status"],
    warrantyExpiration: row.warranty_expiration ? text(row.warranty_expiration) : undefined,
    notes: text(row.notes),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    deletedAt: row.deleted_at ? text(row.deleted_at) : null,
    deletedBy: row.deleted_by ? text(row.deleted_by) : null,
  };
}

function toRow(input: Partial<CmdbAssetInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const fields: Array<[keyof CmdbAssetInput, string]> = [
    ["hostname", "hostname"], ["displayName", "display_name"], ["assetTypeId", "asset_type_id"],
    ["ipAddress", "ip_address"], ["os", "operating_system"], ["role", "role"],
    ["environment", "environment"], ["location", "location"], ["owner", "owner_name"],
    ["ownerId", "owner_id"], ["vendor", "vendor"], ["model", "model"],
    ["serialNumber", "serial_number"], ["assetTag", "asset_tag"],
    ["macAddress", "mac_address"], ["status", "status"],
    ["warrantyExpiration", "warranty_expiration"], ["notes", "notes"],
  ];
  for (const [source, target] of fields) {
    if (input[source] !== undefined) row[target] = input[source];
  }
  if (input.ipAddress === "") row.ip_address = null;
  if (input.ownerId === "" || input.ownerId === undefined) delete row.owner_id;
  if (input.warrantyExpiration === "") row.warranty_expiration = null;
  return row;
}

export async function listAssetTypes(): Promise<CmdbAssetType[]> {
  const { data, error } = await getSupabase()
    .from("cmdb_asset_types")
    .select("id, key, name, description, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((value) => {
    const row = record(value);
    return {
      id: text(row.id), key: text(row.key), name: text(row.name),
      description: text(row.description), isActive: row.is_active === true,
      sortOrder: Number(row.sort_order ?? 0),
    };
  });
}

export async function listAssets(includeDeleted = false): Promise<CmdbAsset[]> {
  let query = getSupabase().from("cmdb_assets").select(ASSET_SELECT).order("hostname");
  if (!includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapAsset);
}

export async function createAsset(input: CmdbAssetInput): Promise<CmdbAsset> {
  const { data, error } = await getSupabase()
    .from("cmdb_assets").insert(toRow(input)).select(ASSET_SELECT).single();
  if (error) throw error;
  return mapAsset(data);
}

export async function updateAsset(id: string, patch: Partial<CmdbAssetInput>): Promise<CmdbAsset> {
  const { data, error } = await getSupabase()
    .from("cmdb_assets").update(toRow(patch)).eq("id", id).is("deleted_at", null)
    .select(ASSET_SELECT).single();
  if (error) throw error;
  return mapAsset(data);
}

export async function softDeleteAsset(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("soft_delete_cmdb_asset", { p_asset_id: id });
  if (error) throw error;
}

export async function restoreAsset(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("restore_cmdb_asset", { p_asset_id: id });
  if (error) throw error;
}

export async function setAssetStatuses(ids: string[], status: CmdbAsset["status"]): Promise<number> {
  const { data, error } = await getSupabase().rpc("set_cmdb_asset_statuses", {
    p_asset_ids: ids,
    p_status: status,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function importAssets(rows: CmdbAssetInput[]): Promise<number> {
  const { data, error } = await getSupabase().rpc("import_cmdb_assets", {
    p_assets: rows.map(toRow),
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function listAssetLifecycle(assetId: string): Promise<CmdbLifecycleEvent[]> {
  const { data, error } = await getSupabase()
    .from("cmdb_asset_lifecycle_events")
    .select("id, event_type, from_status, to_status, from_owner, to_owner, actor_id, created_at")
    .eq("asset_id", assetId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((value) => {
    const row = record(value);
    return {
      id: text(row.id),
      eventType: text(row.event_type) as CmdbLifecycleEvent["eventType"],
      fromStatus: row.from_status ? text(row.from_status) as CmdbLifecycleEvent["fromStatus"] : null,
      toStatus: row.to_status ? text(row.to_status) as CmdbLifecycleEvent["toStatus"] : null,
      fromOwner: row.from_owner ? text(row.from_owner) : null,
      toOwner: row.to_owner ? text(row.to_owner) : null,
      actorId: row.actor_id ? text(row.actor_id) : null,
      createdAt: text(row.created_at),
    };
  });
}
