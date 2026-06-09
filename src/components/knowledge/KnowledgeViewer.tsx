import { useMemo, useState } from "react";
import {
  ChevronRight,
  Star,
  Link as LinkIcon,
  Pencil,
  MoreHorizontal,
  ThumbsUp,
  ThumbsDown,
  ArrowLeft,
  ArrowRight,
  BookOpen,
} from "lucide-react";
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
  const [activeHeading, setActiveHeading] = useState<string | null>(null);

  // Find the closest chapter/book for the eyebrow label
  const chapter = [...ancestry].reverse().find((a) => a.type === "chapter");
  const book = [...ancestry].reverse().find((a) => a.type === "book");
  const eyebrow = chapter ?? book;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_220px]">
      <article className="min-h-0 overflow-auto pr-1">
        {/* Breadcrumb */}
        <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide">
          {ancestry.map((a, idx) => {
            const last = idx === ancestry.length - 1;
            return (
              <span key={a.id} className="flex items-center gap-1.5">
                {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/60" strokeWidth={2.5} />}
                <button
                  onClick={() => !last && onOpen(a.id)}
                  className={cn(
                    last ? "text-primary" : "text-muted-foreground hover:text-foreground",
                    !last && "cursor-pointer",
                  )}
                  disabled={last}
                >
                  {a.title}
                </button>
              </span>
            );
          })}
        </nav>

        {/* Title block */}
        <header className="mb-10 max-w-3xl">
          {eyebrow && (
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
              <BookOpen className="h-4 w-4" />
              <span>
                {eyebrow.type === "chapter" ? "Chapter" : "Book"}: {eyebrow.title}
              </span>
            </div>
          )}
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {node.title}
            </h1>
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
          {node.description && (
            <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
              {node.description}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge label={STATUS_LABEL[node.status]} tone={STATUS_TONE[node.status]} />
            <span>Owner: <span className="text-foreground/80">{node.ownerId}</span></span>
            <span>· Updated {formatDate(node.updatedAt)}</span>
            <span>· v{node.version}</span>
            {node.reviewDate && <span>· Review {formatDate(node.reviewDate)}</span>}
          </div>
        </header>

        {/* Body — no enclosing card, manuscript reading column */}
        <div className="kb-manuscript max-w-3xl">
          <Markdown source={node.content ?? "_This page is empty._"} />
        </div>

        {/* Prev / next, full-width minimal */}
        <div className="mt-16 max-w-3xl border-t border-border/40 pt-8">
          <div className="flex items-start justify-between gap-6">
            {prev ? (
              <button
                onClick={() => onOpen(prev.id)}
                className="group flex flex-col items-start text-left"
              >
                <span className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Previous
                </span>
                <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                  {prev.title}
                </span>
              </button>
            ) : <span />}
            {next ? (
              <button
                onClick={() => onOpen(next.id)}
                className="group flex flex-col items-end text-right"
              >
                <span className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Next
                </span>
                <span className="flex items-center gap-2 text-sm font-semibold text-primary transition-colors group-hover:text-primary/80">
                  {next.title}
                  <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            ) : <span />}
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
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

      {/* Right outline rail */}
      <aside className="hidden xl:block">
        <div className="sticky top-0 pt-1">
          <div className="mb-5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            On this page
          </div>
          {headings.length === 0 ? (
            <div className="text-xs text-muted-foreground">No headings.</div>
          ) : (
            <nav className="relative">
              <div className="absolute bottom-0 left-0 top-0 w-px bg-border/50" />
              <ul className="space-y-3 text-xs">
                {headings.map((h, i) => {
                  const isActive = activeHeading ? activeHeading === h.id : i === 0;
                  return (
                    <li key={h.id} className="relative" style={{ paddingLeft: 16 + (h.level - 1) * 10 }}>
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                      )}
                      <button
                        onClick={() => setActiveHeading(h.id)}
                        className={cn(
                          "block w-full truncate text-left transition-colors",
                          isActive ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {h.text}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          {/* Reading progress card */}
          {(prev || next) && (
            <div className="mt-10 rounded-xl border border-border/40 bg-background/40 p-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Reading progress
              </div>
              <ReadingProgress prev={prev} next={next} title={node.title} />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function ReadingProgress({
  prev,
  next,
  title,
}: {
  prev: KnowledgeNode | null;
  next: KnowledgeNode | null;
  title: string;
}) {
  // Crude indicator: 1 of N within siblings; we don't have full sibling list here, so
  // approximate with prev/next presence.
  const position = prev && next ? 50 : prev ? 90 : next ? 15 : 50;
  return (
    <>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-primary" style={{ width: `${position}%` }} />
      </div>
      <div className="mt-2 truncate text-[11px] text-muted-foreground">
        Reading: <span className="text-foreground/80">{title}</span>
      </div>
    </>
  );
}
