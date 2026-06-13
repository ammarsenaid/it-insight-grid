/**
 * Service Desk — Profile lookups.
 * Used to render requester / assignee identities without hard-coding
 * usernames. Reads through the scoped Service Desk directory RPC.
 */
import { getSupabase } from "@/integrations/supabase/client";
import { asRows, type SbRow } from "./sb";

export interface SdProfile {
  id: string;
  displayName: string;
}

function mapProfile(row: SbRow): SdProfile {
  const id = String(row.id ?? "");
  const display = typeof row.display_name === "string" && row.display_name.trim()
    ? row.display_name.trim()
    : id.slice(0, 8);
  return {
    id,
    displayName: display,
  };
}

/** Assignment-safe profiles visible through the Service Desk directory. */
export async function listProfiles(): Promise<SdProfile[]> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("list_service_desk_profiles");
  if (error) throw error;
  return asRows<SbRow>(data).map(mapProfile);
}

/** Build an id -> SdProfile map for quick lookups in lists. */
export function profileMap(list: SdProfile[]): Map<string, SdProfile> {
  return new Map(list.map((p) => [p.id, p]));
}

export function nameOf(
  id: string | null | undefined,
  map: Map<string, SdProfile> | undefined,
  fallback = "Unknown",
): string {
  if (!id) return fallback;
  const p = map?.get(id);
  return p?.displayName ?? id.slice(0, 8);
}
