// Read-only client for the knowledge_audit_log table. The table is
// written exclusively by a security-definer trigger in the database;
// every mutation against spaces/categories/articles/tags/article_tags
// produces one row automatically.

import { getSupabase } from "@/integrations/supabase/client";

export type AuditEntityType =
  | "space"
  | "category"
  | "article"
  | "tag"
  | "article_tag";

export type AuditAction = "insert" | "update" | "delete";

export interface KbAuditEntry {
  id: string;
  team_id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  action: AuditAction;
  changes: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
}

export interface FetchAuditOptions {
  teamId: string;
  entityType?: AuditEntityType;
  entityId?: string;
  limit?: number;
}

export async function fetchAuditEntries(
  opts: FetchAuditOptions,
): Promise<{ data: KbAuditEntry[] | null; error: string | null }> {
  try {
    const sb = getSupabase();
    let q = sb
      .from("knowledge_audit_log")
      .select("id, team_id, entity_type, entity_id, action, changes, actor_id, created_at")
      .eq("team_id", opts.teamId)
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? 100);
    if (opts.entityType) q = q.eq("entity_type", opts.entityType);
    if (opts.entityId) q = q.eq("entity_id", opts.entityId);
    const { data, error } = await q;
    if (error) {
      console.error("[knowledge-audit] fetch failed", error);
      return { data: null, error: "Could not load audit log." };
    }
    return { data: (data ?? []) as KbAuditEntry[], error: null };
  } catch (e) {
    console.error("[knowledge-audit] unexpected error", e);
    return { data: null, error: "Unexpected error loading audit log." };
  }
}

export function summarizeAuditChange(entry: KbAuditEntry): string {
  if (entry.action === "insert") return "Created";
  if (entry.action === "delete") return "Deleted";
  const keys = Object.keys(entry.changes ?? {});
  if (keys.length === 0) return "Updated";
  // Render content_markdown as a redacted body change so the panel
  // never implies that the full body is stored.
  const friendly = keys.map((k) => (k === "content_markdown" ? "body (redacted)" : k));
  return `Updated ${friendly.slice(0, 3).join(", ")}${friendly.length > 3 ? "…" : ""}`;
}
