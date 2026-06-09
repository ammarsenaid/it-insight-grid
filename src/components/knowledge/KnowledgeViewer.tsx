import { useMemo, useState } from "react";
import { ChevronRight, Star, Link as LinkIcon, Pencil, MoreHorizontal, ThumbsUp, ThumbsDown, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Markdown } from "@/components/common/Markdown";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDate } from "@/components/common/format";
import type { KnowledgeNode } from "@/lib/knowledge/types";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/knowledge/types";
import { cn } from "@/lib/utils";

interface Heading {
  level: number;
  text: string;
  id: string;
}

function extractHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  md.split("\n").forEach((line, idx) => {
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      out.push({
        level: m[1].length,
        text: m[2].trim(),
        id: `h-${idx}-${m[2].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      });
    }
  });
  return out;
}

export function KnowledgeViewer({
  node,
  ancestry,
  prev,
  next,
  onEdit,
  onFavorite,
  onCopyLink,
  onMore,
  onOpen,
  onFeedback,
}: {
  node: KnowledgeNode;
  ancestry: KnowledgeNode[];
  prev: KnowledgeNode | null;
  next: KnowledgeNode | null;
  onEdit: () => void;
  onFavorite: () => void;
  onCopyLink: () => void;
  onMore: () => void;
  onOpen: (id: string) => void;
  onFeedback: (helpful: boolean) => void;
}) {
  const headings = useMemo(() => extractHeadings(node.content ?? ""), [node.content]);
  const [feedback, setFeedback] = useState<"helpful" | "not" | null>(null);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[1fr_220px]">
      <article className="min-h-0 overflow-auto pr-1">
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {ancestry.slice(0, -1).map((a, idx) => (
            <span key={a.id} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="h-3 w-3" />}
              <span>{a.title}</span>
            </span>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{node.title}</h1>
            {node.description && (
              <p className="mt-1 text-sm text-muted-foreground">{node.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge label={STATUS_LABEL[node.status]} tone={STATUS_TONE[node.status]} />
              <span>Owner: <span className="text-foreground/80">{node.ownerId}</span></span>
              <span>· Updated {formatDate(node.updatedAt)}</span>
              <span>· v{node.version}</span>
              {node.reviewDate && <span>· Review {formatDate(node.reviewDate)}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onFavorite} aria-label="Favorite">
              <Star className={cn("h-4 w-4", node.favorite && "fill-amber-400 text-amber-400")} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCopyLink} aria-label="Copy link">
              <LinkIcon className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" className="h-8" onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onMore}>Open details panel</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6">
          <Markdown source={node.content ?? "_This page is empty._"} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
          <div className="flex gap-2">
            {prev && (
              <Button variant="secondary" size="sm" onClick={() => onOpen(prev.id)}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> {prev.title}
              </Button>
            )}
            {next && (
              <Button variant="secondary" size="sm" onClick={() => onOpen(next.id)}>
                {next.title} <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Was this page useful?</span>
            <Button
              size="sm"
              variant={feedback === "helpful" ? "secondary" : "ghost"}
              className="h-7 px-2"
              onClick={() => { setFeedback("helpful"); onFeedback(true); }}
            >
              <ThumbsUp className="mr-1 h-3 w-3" /> Helpful
            </Button>
            <Button
              size="sm"
              variant={feedback === "not" ? "secondary" : "ghost"}
              className="h-7 px-2"
              onClick={() => { setFeedback("not"); onFeedback(false); }}
            >
              <ThumbsDown className="mr-1 h-3 w-3" /> Needs work
            </Button>
          </div>
        </div>
      </article>

      <aside className="hidden xl:block">
        <div className="sticky top-0 rounded-xl border border-border/40 bg-background/40 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            On this page
          </div>
          {headings.length === 0 ? (
            <div className="text-xs text-muted-foreground">No headings.</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {headings.map((h) => (
                <li key={h.id} style={{ paddingLeft: (h.level - 1) * 8 }}>
                  <span className="block truncate text-muted-foreground">{h.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
