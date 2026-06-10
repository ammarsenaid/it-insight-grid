import { useEffect, useState } from "react";
import { CheckCircle2, Send, RotateCcw, XCircle, Upload, ArrowLeftCircle, Archive } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/components/common/format";
import { fetchReviewEvents, type KbReviewEvent, type ReviewAction } from "@/lib/knowledge/review";

const ACTION_LABEL: Record<ReviewAction, string> = {
  submit: "Submitted for review",
  approve: "Approved",
  request_changes: "Changes requested",
  publish: "Published",
  withdraw: "Withdrawn",
  archive: "Archived",
  restore: "Restored to draft",
};

function ActionIcon({ action }: { action: ReviewAction }) {
  const cls = "h-3.5 w-3.5";
  switch (action) {
    case "submit": return <Send className={cls + " text-blue-300"} />;
    case "approve": return <CheckCircle2 className={cls + " text-emerald-300"} />;
    case "request_changes": return <XCircle className={cls + " text-amber-300"} />;
    case "publish": return <Upload className={cls + " text-primary"} />;
    case "withdraw": return <ArrowLeftCircle className={cls + " text-muted-foreground"} />;
    case "archive": return <Archive className={cls + " text-muted-foreground"} />;
    case "restore": return <RotateCcw className={cls + " text-muted-foreground"} />;
    default: return <RotateCcw className={cls} />;
  }
}

interface Props {
  articleId: string;
  teamId: string;
  /** Bump this when the article changes to refetch. */
  refreshKey?: number | string;
}

export function ReviewTimelinePanel({ articleId, teamId, refreshKey }: Props) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; events: KbReviewEvent[] }>({
    loading: true, error: null, events: [],
  });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, events: [] });
    void fetchReviewEvents(articleId, teamId).then((res) => {
      if (cancelled) return;
      if (res.error) setState({ loading: false, error: res.error, events: [] });
      else setState({ loading: false, error: null, events: res.data ?? [] });
    });
    return () => { cancelled = true; };
  }, [articleId, teamId, refreshKey]);

  return (
    <aside className="min-h-0 overflow-y-auto rounded-xl border border-border/40 bg-white/[0.02] p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Review history
      </div>
      {state.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : state.error ? (
        <div className="text-xs text-destructive">{state.error}</div>
      ) : state.events.length === 0 ? (
        <div className="text-xs text-muted-foreground">No review activity yet.</div>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {state.events.map((e) => (
            <li key={e.id} className="rounded-md border border-border/30 p-2">
              <div className="flex items-center gap-1.5">
                <ActionIcon action={e.action} />
                <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span>
                <Badge variant="outline" className="ml-auto h-4 text-[10px]">
                  {e.from_status} → {e.to_status}
                </Badge>
              </div>
              <div className="mt-0.5 text-muted-foreground">{formatDate(e.created_at)}</div>
              {e.comment && (
                <p className="mt-1 whitespace-pre-wrap text-foreground/80">{e.comment}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
