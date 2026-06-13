import { Link } from "@tanstack/react-router";
import { BookOpen, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTeamArticles } from "@/lib/knowledge/useTeamArticles";

/**
 * Dashboard panel — lists the most recently updated published articles
 * from the user's active team's real backend knowledge base.
 */
export function BackendKnowledgePanel() {
  const { teamId, articles, loading, error } = useTeamArticles();

  if (!teamId) return null;

  const published = articles
    .filter((a) => a.status === "published")
    .slice(0, 6);

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" /> Knowledge — Recently Published
        </h2>
        <Badge variant="outline" className="text-[10px]">{published.length}</Badge>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : published.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No published articles yet in your team's knowledge base.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {published.map((a) => (
            <li key={a.id}>
              <Link
                to="/documents"
                search={{ article: a.id }}
                className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/[0.04]"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.title}</div>
                  {a.excerpt && (
                    <div className="truncate text-[11px] text-muted-foreground">{a.excerpt}</div>
                  )}
                </div>
                <ArrowUpRight className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-border/40 pt-3">
        <Link
          to="/documents"
          search={{ article: undefined }}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Open knowledge base <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
