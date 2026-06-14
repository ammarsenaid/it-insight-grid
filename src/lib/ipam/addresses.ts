import { getSupabase } from "@/integrations/supabase/client";
import type { IpamAddress, IpamAddressInput, IpamNetwork, IpamSubnet } from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function mapAddress(value: unknown): IpamAddress {
  const row = record(value);
  return {
    id: text(row.id),
    subnetId: text(row.subnet_id),
    subnet: text(row.subnet_cidr),
    networkId: text(row.network_id),
    networkName: text(row.network_name),
    networkCidr: text(row.network_cidr),
    ipAddress: text(row.ip_address),
    hostname: text(row.hostname),
    type: text(row.address_type) as IpamAddress["type"],
    allocationState: text(row.allocation_state) as IpamAddress["allocationState"],
    gateway: text(row.gateway),
    vlan: text(row.vlan),
    location: text(row.location),
    linkedAssetId: nullableText(row.linked_asset_id),
    linkedAssetHostname: text(row.linked_asset_hostname),
    reservationId: nullableText(row.reservation_id),
    reservationName: text(row.reservation_name),
    reservationExpiresAt: nullableText(row.reservation_expires_at),
    reservationNotes: text(row.reservation_notes),
    notes: text(row.notes),
    conflictReason: nullableText(row.conflict_reason),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    deletedAt: nullableText(row.deleted_at),
  };
}

function toPayload(input: IpamAddressInput): Record<string, unknown> {
  return {
    network_name: input.networkName,
    network_cidr: input.networkCidr,
    subnet_cidr: input.subnet,
    gateway: input.gateway || null,
    vlan: input.vlan,
    location: input.location,
    ip_address: input.ipAddress,
    hostname: input.hostname,
    address_type: input.type,
    allocation_state: input.allocationState,
    linked_asset_id: input.linkedAssetId || null,
    reservation_name: input.reservationName || "",
    reservation_expires_at: input.reservationExpiresAt || null,
    reservation_notes: input.reservationNotes || "",
    notes: input.notes,
  };
}

export async function listIpamAddresses(includeDeleted = false): Promise<IpamAddress[]> {
  const { data, error } = await getSupabase().rpc("list_ipam_addresses", {
    p_include_deleted: includeDeleted,
  });
  if (error) throw error;
  return (data ?? []).map(mapAddress);
}

export async function listIpamNetworks(includeDeleted = false): Promise<IpamNetwork[]> {
  let query = getSupabase().from("ipam_networks")
    .select("id, name, cidr, description, created_at, updated_at, deleted_at")
    .order("name");
  if (!includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((value) => {
    const row = record(value);
    return {
      id: text(row.id), name: text(row.name), cidr: text(row.cidr),
      description: text(row.description), createdAt: text(row.created_at),
      updatedAt: text(row.updated_at), deletedAt: nullableText(row.deleted_at),
    };
  });
}

export async function listIpamSubnets(includeDeleted = false): Promise<IpamSubnet[]> {
  let query = getSupabase().from("ipam_subnets")
    .select("id, network_id, network:ipam_networks(name), cidr, gateway, vlan, location, description, created_at, updated_at, deleted_at")
    .order("cidr");
  if (!includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((value) => {
    const row = record(value);
    const network = Array.isArray(row.network) ? record(row.network[0]) : record(row.network);
    return {
      id: text(row.id), networkId: text(row.network_id), networkName: text(network.name),
      cidr: text(row.cidr), gateway: text(row.gateway), vlan: text(row.vlan),
      location: text(row.location), description: text(row.description),
      createdAt: text(row.created_at), updatedAt: text(row.updated_at),
      deletedAt: nullableText(row.deleted_at),
    };
  });
}

export async function saveIpamAddress(id: string | null, input: IpamAddressInput): Promise<string> {
  const { data, error } = await getSupabase().rpc("save_ipam_address", {
    p_address_id: id,
    p_input: toPayload(input),
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function importIpamAddresses(rows: IpamAddressInput[]): Promise<number> {
  const { data, error } = await getSupabase().rpc("import_ipam_addresses", {
    p_addresses: rows.map(toPayload),
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function setIpamAllocation(
  ids: string[],
  state: IpamAddress["allocationState"],
): Promise<number> {
  const { data, error } = await getSupabase().rpc("set_ipam_allocation_state", {
    p_address_ids: ids,
    p_state: state,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function reserveNextIpamAddress(subnetId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("reserve_next_ipam_address", {
    p_subnet_id: subnetId,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function softDeleteIpamAddress(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("soft_delete_ipam_address", { p_address_id: id });
  if (error) throw error;
}

export async function restoreIpamAddress(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("restore_ipam_address", { p_address_id: id });
  if (error) throw error;
}

export async function softDeleteIpamNetwork(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("soft_delete_ipam_network", { p_network_id: id });
  if (error) throw error;
}

export async function restoreIpamNetwork(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("restore_ipam_network", { p_network_id: id });
  if (error) throw error;
}

export async function softDeleteIpamSubnet(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("soft_delete_ipam_subnet", { p_subnet_id: id });
  if (error) throw error;
}

export async function restoreIpamSubnet(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("restore_ipam_subnet", { p_subnet_id: id });
  if (error) throw error;
}
