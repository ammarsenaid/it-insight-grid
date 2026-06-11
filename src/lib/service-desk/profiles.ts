/**
 * Service Desk — Profile lookups.
 * Used to render requester / assignee identities without hard-coding
 * usernames. Reads from the public `profiles` view (RLS-gated).
 */
import { getSupabase } from "@/integrations/supabase/client";
import { asRows, type SbRow } from "./sb";

export interface SdProfile {
  id: string;
  displayName: string;
  email: string | null;
}

const COLS = "id, display_name, email";

function mapProfile(row: SbRow): SdProfile {
  const id = String(row.id ?? "");
  const display = typeof row.display_name === "string" && row.display_name.trim()
    ? row.display_name.trim()
    : typeof row.email === "string" && row.email
      ? row.email
      : id.slice(0, 8);
  return {
    id,
    displayName: display,
    email: typeof row.email === "string" ? row.email : null,
  };
}

/** All profiles visible to the current user (RLS scopes). */
export async function listProfiles(): Promise<SdProfile[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("profiles")
    .select(COLS)
    .order("display_name", { ascending: true });
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
