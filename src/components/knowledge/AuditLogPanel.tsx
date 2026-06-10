import { useEffect, useState } from "react";
import { History, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/components/common/format";
import {
  fetchAuditEntries,
  summarizeAuditChange,
  type AuditEntityType,
  type KbAuditEntry,
} from "@/lib/knowledge/audit";

interface Props {
  teamId: string;
  entityType?: AuditEntityType;
  entityId?: string;
  /** Title override; defaults to "Audit log". */
  title?: string;
  limit?: number;
}

/**
 * Read-only audit trail for a knowledge entity (article/space/category/tag)
 * or — when entityType/entityId are omitted — for the whole team.
 *
 * The underlying table is written only by a database trigger; the client
 * has SELECT-only access via RLS scoped to knowledge.read on the team.
 */
export function AuditLogPanel({ teamId, entityType, entityId, title = "Audit log", limit = 50 }: Props) {
  const [entries, setEntries] = useState<KbAuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetchAuditEntries({ teamId, entityType, entityId, limit });
    setEntries(res.data);
    setError(res.error);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, entityType, entityId, limit]);

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <History className="h-4 w-4 text-muted-foreground" />
          {title}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={"mr-2 h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </div>
      )}

      {!error && entries && entries.length === 0 && (
        <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
          No audit entries yet.
        </div>
      )}

      {entries && entries.length > 0 && (
        <ul className="divide-y divide-border/60">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-xs">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {e.entity_type.replace("_", " ")}
                  </Badge>
                  <span className="text-foreground">{summarizeAuditChange(e)}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {e.actor_id ? `by ${e.actor_id.slice(0, 8)}…` : "by system"}
                </div>
              </div>
              <div className="shrink-0 text-[11px] text-muted-foreground">
                {formatDate(e.created_at)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
