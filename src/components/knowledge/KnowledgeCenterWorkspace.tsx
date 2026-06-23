/**
 * Knowledge Center — BookStack-style three-column workspace (Phase 1, frontend only).
 *
 * Hierarchy:
 *   Department (team) → Book (knowledge_space) → Chapter (knowledge_category) → Page (knowledge_article)
 *
 * Backend data is read-only here. Mutating actions are intentionally disabled
 * with an honest tooltip — the per-resource ACL backend lands in Phase 2.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Book,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Folder,
  Globe2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Sparkles,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { PageContainer } from "@/components/common/PageContainer";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Markdown } from "@/components/common/Markdown";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useKnowledgeBackend } from "@/lib/knowledge/useKnowledgeBackend";
import type {
  KbArticle,
  KbCategory,
  KbSpace,
} from "@/lib/knowledge/backend-types";
import {
  EditPageDialog,
  InheritancePreview,
  ManagePermissionsDialog,
  NewBookDialog,
  NewChapterDialog,
  NewPageDialog,
  visFromString,
} from "./KnowledgeCenterDialogs";

// ---------------------------------------------------------------------------
// Visibility model (frontend-only; mapped from KbArticle.visibility string)
// ---------------------------------------------------------------------------

type VisibilityKey =
  | "all_employees"
  | "it_only"
  | "specific_teams"
  | "assigned"
  | "confidential"
  | "unknown";

interface VisibilityMeta {
  key: VisibilityKey;
  label: string;
  short: string;
  description: string;
  audience: string;
  icon: typeof Globe2;
  /** badge / chip classes */
  tone: string;
  /** strong card classes used on the right-panel hero card */
  strong: string;
  /** color used for spines, bars and accents (tailwind base color name) */
  accent: string;
  dot: string;
}

const VISIBILITY: Record<VisibilityKey, VisibilityMeta> = {
  all_employees: {
    key: "all_employees",
    label: "All Employees",
    short: "All Employees",
    description: "Readable by every authenticated employee.",
    audience: "Every employee with Knowledge Center access can read this.",
    icon: Globe2,
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    strong:
      "border-emerald-400/40 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent text-emerald-100",
    accent: "emerald",
    dot: "bg-emerald-400",
  },
  it_only: {
    key: "it_only",
    label: "IT Team Only",
    short: "IT Only",
    description: "Restricted to the IT department.",
    audience: "Only members of the IT department.",
    icon: Shield,
    tone: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    strong:
      "border-sky-400/40 bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-transparent text-sky-100",
    accent: "sky",
    dot: "bg-sky-400",
  },
  specific_teams: {
    key: "specific_teams",
    label: "Specific Teams",
    short: "Teams",
    description: "Visible only to selected teams.",
    audience: "Selected teams only (Helpdesk, Network, Security, …).",
    icon: Users,
    tone: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    strong:
      "border-violet-400/40 bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent text-violet-100",
    accent: "violet",
    dot: "bg-violet-400",
  },
  assigned: {
    key: "assigned",
    label: "Private / Assigned",
    short: "Assigned",
    description: "Only users explicitly assigned to this content.",
    audience: "Only users explicitly assigned to this resource.",
    icon: UserIcon,
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    strong:
      "border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent text-amber-100",
    accent: "amber",
    dot: "bg-amber-400",
  },
  confidential: {
    key: "confidential",
    label: "Confidential",
    short: "Confidential",
    description: "Restricted security content — explicit grant required.",
    audience: "Restricted. Access requires an explicit security grant.",
    icon: Lock,
    tone: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    strong:
      "border-rose-400/40 bg-gradient-to-br from-rose-500/15 via-rose-500/5 to-transparent text-rose-100",
    accent: "rose",
    dot: "bg-rose-400",
  },
  unknown: {
    key: "unknown",
    label: "Unspecified",
    short: "Unset",
    description: "Visibility has not been set for this page.",
    audience: "No visibility rule defined yet.",
    icon: Lock,
    tone: "border-border/50 bg-muted/30 text-muted-foreground",
    strong:
      "border-border/50 bg-muted/20 text-muted-foreground",
    accent: "slate",
    dot: "bg-muted-foreground/60",
  },
};

const VISIBILITY_FILTERS: { value: "all" | VisibilityKey; label: string }[] = [
  { value: "all", label: "All visibilities" },
  { value: "all_employees", label: "All Employees" },
  { value: "it_only", label: "IT Team Only" },
  { value: "specific_teams", label: "Specific Teams" },
  { value: "assigned", label: "Private / Assigned" },
  { value: "confidential", label: "Confidential" },
];

function resolveVisibility(raw: string | null | undefined): VisibilityMeta {
  const v = (raw ?? "").toLowerCase();
  if (["public", "all", "all_employees", "everyone"].includes(v))
    return VISIBILITY.all_employees;
  if (["internal", "it", "it_only", "organization"].includes(v))
    return VISIBILITY.it_only;
  if (["team", "teams", "specific_teams"].includes(v))
    return VISIBILITY.specific_teams;
  if (["private", "assigned", "user"].includes(v)) return VISIBILITY.assigned;
  if (["confidential", "restricted", "secret"].includes(v))
    return VISIBILITY.confidential;
  return VISIBILITY.unknown;
}

const SPINE_TONES: Record<string, string> = {
  emerald: "bg-emerald-500/70",
  sky: "bg-sky-500/70",
  violet: "bg-violet-500/70",
  amber: "bg-amber-500/70",
  rose: "bg-rose-500/70",
  slate: "bg-slate-500/60",
};

/** Choose a spine color for a book based on its most-restrictive page. */
function bookSpineAccent(pages: KbArticle[]): string {
  const order: VisibilityKey[] = [
    "confidential",
    "assigned",
    "specific_teams",
    "it_only",
    "all_employees",
    "unknown",
  ];
  for (const k of order) {
    if (pages.some((p) => resolveVisibility(p.visibility).key === k)) {
      return VISIBILITY[k].accent;
    }
  }
  return "slate";
}

function VisibilityBadge({
  visibility,
  size = "sm",
}: {
  visibility: string | null;
  size?: "sm" | "xs";
}) {
  const meta = resolveVisibility(visibility);
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        meta.tone,
        size === "xs"
          ? "px-1.5 py-0.5 text-[10px]"
          : "px-2 py-0.5 text-[11px]",
      )}
    >
      <Icon className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden />
      {meta.short}
    </span>
  );
}

function fallback(value: string | null | undefined, fb: string) {
  const t = (value ?? "").trim();
  return t.length > 0 ? t : fb;
}

// ---------------------------------------------------------------------------
// Selection model
// ---------------------------------------------------------------------------

type Selection =
  | { kind: "home" }
  | { kind: "book"; bookId: string }
  | { kind: "chapter"; bookId: string; chapterId: string }
  | { kind: "page"; bookId: string; chapterId: string | null; pageId: string };

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export function KnowledgeCenterWorkspace() {
  const { teams, loading: authLoading } = useAuth();
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (teams.length === 0) {
      setActiveTeamId(null);
      return;
    }
    if (!activeTeamId || !teams.find((t) => t.id === activeTeamId)) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams, activeTeamId]);

  const { data, loading, error, reload } = useKnowledgeBackend(activeTeamId);
  const [selection, setSelection] = useState<Selection>({ kind: "home" });
  const [query, setQuery] = useState("");
  const [bookQuery, setBookQuery] = useState("");
  const [visFilter, setVisFilter] = useState<"all" | VisibilityKey>("all");
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    setSelection({ kind: "home" });
    setExpandedBooks(new Set());
    setCollapsedChapters(new Set());
    setQuery("");
    setBookQuery("");
  }, [activeTeamId]);

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;

  // ------------------- Derived indexes -----------------------------------
  const books = useMemo<KbSpace[]>(
    () => (data?.spaces ?? []).filter((s) => !s.is_archived),
    [data],
  );

  const chaptersByBook = useMemo(() => {
    const m = new Map<string, KbCategory[]>();
    for (const c of data?.categories ?? []) {
      if (c.is_archived) continue;
      const arr = m.get(c.space_id) ?? [];
      arr.push(c);
      m.set(c.space_id, arr);
    }
    return m;
  }, [data]);

  const pagesByBook = useMemo(() => {
    const m = new Map<string, KbArticle[]>();
    for (const a of data?.articles ?? []) {
      const arr = m.get(a.space_id) ?? [];
      arr.push(a);
      m.set(a.space_id, arr);
    }
    return m;
  }, [data]);

  const pagesByChapter = useMemo(() => {
    const m = new Map<string, KbArticle[]>();
    for (const a of data?.articles ?? []) {
      if (!a.category_id) continue;
      const arr = m.get(a.category_id) ?? [];
      arr.push(a);
      m.set(a.category_id, arr);
    }
    return m;
  }, [data]);

  const pageById = useMemo(() => {
    const m = new Map<string, KbArticle>();
    for (const a of data?.articles ?? []) m.set(a.id, a);
    return m;
  }, [data]);

  const bookById = useMemo(() => {
    const m = new Map<string, KbSpace>();
    for (const b of books) m.set(b.id, b);
    return m;
  }, [books]);

  const chapterById = useMemo(() => {
    const m = new Map<string, KbCategory>();
    for (const c of data?.categories ?? []) m.set(c.id, c);
    return m;
  }, [data]);

  const stats = useMemo(() => {
    const totalBooks = books.length;
    const totalChapters = (data?.categories ?? []).filter(
      (c) => !c.is_archived,
    ).length;
    const totalPages = data?.articles.length ?? 0;
    const restricted = (data?.articles ?? []).filter((a) => {
      const k = resolveVisibility(a.visibility).key;
      return k === "specific_teams" || k === "assigned" || k === "confidential";
    }).length;
    return { totalBooks, totalChapters, totalPages, restricted };
  }, [books, data]);

  const filteredBooks = useMemo(() => {
    const bq = bookQuery.trim().toLowerCase();
    return books.filter((b) => {
      if (bq && !b.name.toLowerCase().includes(bq)) return false;
      if (visFilter !== "all") {
        const pages = pagesByBook.get(b.id) ?? [];
        const hasMatch = pages.some(
          (a) => resolveVisibility(a.visibility).key === visFilter,
        );
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [books, bookQuery, visFilter, pagesByBook]);

  // Global content search
  const q = query.trim().toLowerCase();
  const searchHits = useMemo<KbArticle[]>(() => {
    if (!q || !data) return [];
    return data.articles
      .filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.excerpt ?? "").toLowerCase().includes(q) ||
          (a.content_markdown ?? "").toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [q, data]);

  const toggleBook = (id: string) =>
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleChapter = (id: string) =>
    setCollapsedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ------------------- Render --------------------------------------------
  return (
    <TooltipProvider delayDuration={150}>
      <PageContainer variant="wide" className="space-y-5 pb-10 pt-2">
        {/* Hero / header */}
        <header className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/[0.08] via-card/60 to-card/30 p-6 shadow-sm">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground backdrop-blur">
                <Sparkles className="h-3 w-3 text-primary/80" />
                IT Knowledge Center
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.7rem]">
                {fallback(activeTeam?.name, "Departments")}
                <span className="text-muted-foreground">
                  {" "}
                  · Documentation
                </span>
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Organised by{" "}
                <span className="text-foreground/85">Department</span> →{" "}
                <span className="text-foreground/85">Book</span> →{" "}
                <span className="text-foreground/85">Chapter</span> →{" "}
                <span className="text-foreground/85">Page</span>. Visibility
                badges show exactly who can read every page.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {teams.length > 1 && (
                <Select
                  value={activeTeamId ?? undefined}
                  onValueChange={(v) => setActiveTeamId(v)}
                >
                  <SelectTrigger
                    className="h-9 w-[220px] text-sm"
                    aria-label="Select department"
                  >
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => reload()}
                disabled={loading}
                aria-label="Refresh knowledge data"
                className="h-9"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin")}
                />
                <span className="ml-1.5 hidden sm:inline">Refresh</span>
              </Button>
              <NewBookDialog
                teams={teams.map((t) => ({ id: t.id, name: t.name }))}
                defaultTeamId={activeTeamId}
              />
            </div>
          </div>

          {/* Search + stat strip */}
          <div className="relative mt-6 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search every book, chapter and page in this department…"
                className="h-11 pl-9 pr-9 text-sm shadow-sm"
                aria-label="Search knowledge center"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Books" value={stats.totalBooks} icon={Book} />
              <StatCard
                label="Chapters"
                value={stats.totalChapters}
                icon={Folder}
              />
              <StatCard
                label="Pages"
                value={stats.totalPages}
                icon={FileText}
              />
              <StatCard
                label="Restricted"
                value={stats.restricted}
                icon={Lock}
                tone="warning"
              />
            </div>
          </div>

          {q && (
            <GlobalSearchResults
              hits={searchHits}
              bookById={bookById}
              chapterById={chapterById}
              onPick={(a) => {
                setSelection({
                  kind: "page",
                  bookId: a.space_id,
                  chapterId: a.category_id,
                  pageId: a.id,
                });
                setQuery("");
                setExpandedBooks((p) => new Set(p).add(a.space_id));
              }}
              onClear={() => setQuery("")}
            />
          )}
        </header>

        {authLoading ? (
          <WorkspaceSkeleton />
        ) : teams.length === 0 ? (
          <EmptyState
            icon={Book}
            title="No departments available"
            description="You are not a member of any team yet. Knowledge Center content is organised per department — ask an administrator to add you to a team."
          />
        ) : error ? (
          <EmptyState
            icon={Book}
            title="Could not load Knowledge Center"
            description={error}
            actionLabel="Retry"
            onAction={() => reload()}
          />
        ) : loading || !data ? (
          <WorkspaceSkeleton />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
            {/* COLUMN 1 — Department + Books */}
            <aside className="flex max-h-[calc(100dvh-13rem)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/40 shadow-sm">
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Department
                  </p>
                  <p className="truncate text-sm font-semibold">
                    {fallback(activeTeam?.name, "—")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-border/50 bg-background/50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                  {books.length} book{books.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="space-y-2 border-b border-border/40 px-3 py-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={bookQuery}
                    onChange={(e) => setBookQuery(e.target.value)}
                    placeholder="Filter books…"
                    className="h-8 pl-7 text-xs"
                    aria-label="Filter books"
                  />
                </div>
                <Select
                  value={visFilter}
                  onValueChange={(v) =>
                    setVisFilter(v as "all" | VisibilityKey)
                  }
                >
                  <SelectTrigger
                    className="h-8 text-xs"
                    aria-label="Filter by visibility"
                  >
                    <Filter className="mr-1.5 h-3 w-3" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIBILITY_FILTERS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5">
                {filteredBooks.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
                    <div className="mb-3 grid h-10 w-10 place-items-center rounded-full border border-border/50 bg-background/40">
                      <BookOpen className="h-5 w-5 text-muted-foreground/70" />
                    </div>
                    <p className="text-xs font-medium">
                      {books.length === 0
                        ? "No books yet"
                        : "No matching books"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {books.length === 0
                        ? "This department doesn't have any books."
                        : "Try a different search or visibility filter."}
                    </p>
                  </div>
                ) : (
                  <nav aria-label="Books in this department" className="space-y-2">
                    {filteredBooks.map((book) => {
                      const isOpen = expandedBooks.has(book.id);
                      const pages = pagesByBook.get(book.id) ?? [];
                      const chapters = chaptersByBook.get(book.id) ?? [];
                      const looseArticles = pages.filter((a) => !a.category_id);
                      const totalPages = pages.length;
                      const isActiveBook =
                        (selection.kind === "book" &&
                          selection.bookId === book.id) ||
                        (selection.kind === "chapter" &&
                          selection.bookId === book.id) ||
                        (selection.kind === "page" &&
                          selection.bookId === book.id);
                      const spine = bookSpineAccent(pages);
                      return (
                        <div
                          key={book.id}
                          className={cn(
                            "group relative overflow-hidden rounded-xl border transition",
                            isActiveBook
                              ? "border-primary/50 bg-primary/[0.07] shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]"
                              : "border-border/40 bg-background/40 hover:border-border/70 hover:bg-background/60",
                          )}
                        >
                          {/* book spine accent */}
                          <span
                            aria-hidden
                            className={cn(
                              "absolute inset-y-0 left-0 w-[3px]",
                              SPINE_TONES[spine] ?? SPINE_TONES.slate,
                            )}
                          />
                          <div className="flex items-stretch pl-[3px]">
                            <button
                              type="button"
                              onClick={() => toggleBook(book.id)}
                              className="grid w-7 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
                              aria-label={isOpen ? "Collapse book" : "Expand book"}
                              aria-expanded={isOpen}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSelection({ kind: "book", bookId: book.id })
                              }
                              aria-current={isActiveBook ? "true" : undefined}
                              className="flex min-w-0 flex-1 items-start gap-2.5 py-2.5 pl-1 pr-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                            >
                              <div
                                className={cn(
                                  "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border",
                                  isActiveBook
                                    ? "border-primary/40 bg-primary/15 text-primary"
                                    : "border-border/40 bg-background/60 text-muted-foreground",
                                )}
                              >
                                <Book className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium leading-tight">
                                  {fallback(book.name, "Untitled book")}
                                </p>
                                <p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground tabular-nums">
                                  <span>
                                    {chapters.length} ch
                                  </span>
                                  <span className="opacity-50">·</span>
                                  <span>
                                    {totalPages} pg
                                  </span>
                                </p>
                              </div>
                            </button>
                          </div>

                          {isOpen && (
                            <div className="border-t border-border/40 bg-background/40 px-2 py-1.5">
                              {chapters.length === 0 &&
                              looseArticles.length === 0 ? (
                                <p className="px-2 py-2 text-[11px] italic text-muted-foreground">
                                  No chapters or pages yet
                                </p>
                              ) : (
                                <ul className="space-y-0.5">
                                  {chapters.map((ch) => {
                                    const chPages =
                                      pagesByChapter.get(ch.id) ?? [];
                                    const active =
                                      (selection.kind === "chapter" &&
                                        selection.chapterId === ch.id) ||
                                      (selection.kind === "page" &&
                                        selection.chapterId === ch.id);
                                    return (
                                      <li key={ch.id}>
                                        <button
                                          type="button"
                                          aria-current={
                                            active ? "true" : undefined
                                          }
                                          className={cn(
                                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-white/[0.06]",
                                            active &&
                                              "bg-primary/10 text-foreground",
                                          )}
                                          onClick={() =>
                                            setSelection({
                                              kind: "chapter",
                                              bookId: book.id,
                                              chapterId: ch.id,
                                            })
                                          }
                                        >
                                          <Folder
                                            className={cn(
                                              "h-3.5 w-3.5 shrink-0",
                                              active
                                                ? "text-primary"
                                                : "text-muted-foreground",
                                            )}
                                          />
                                          <span className="truncate">
                                            {fallback(ch.name, "Untitled chapter")}
                                          </span>
                                          <span className="ml-auto rounded bg-background/60 px-1.5 py-0.5 text-[9px] text-muted-foreground tabular-nums">
                                            {chPages.length}
                                          </span>
                                        </button>
                                      </li>
                                    );
                                  })}
                                  {looseArticles.length > 0 && chapters.length > 0 && (
                                    <li className="px-2 pt-1.5">
                                      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                        Uncategorised
                                      </p>
                                    </li>
                                  )}
                                  {looseArticles.map((a) => (
                                    <li key={a.id}>
                                      <button
                                        type="button"
                                        aria-current={
                                          selection.kind === "page" &&
                                          selection.pageId === a.id
                                            ? "true"
                                            : undefined
                                        }
                                        className={cn(
                                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-white/[0.06]",
                                          selection.kind === "page" &&
                                            selection.pageId === a.id &&
                                            "bg-primary/10 text-foreground",
                                        )}
                                        onClick={() =>
                                          setSelection({
                                            kind: "page",
                                            bookId: book.id,
                                            chapterId: null,
                                            pageId: a.id,
                                          })
                                        }
                                      >
                                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        <span className="truncate">
                                          {fallback(a.title, "Untitled page")}
                                        </span>
                                        <span
                                          aria-hidden
                                          className={cn(
                                            "ml-auto h-1.5 w-1.5 rounded-full",
                                            resolveVisibility(a.visibility).dot,
                                          )}
                                        />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </nav>
                )}
              </div>
            </aside>

            {/* COLUMN 2 — Workspace */}
            <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/40 shadow-sm">
              <CenterColumn
                selection={selection}
                activeTeamName={fallback(activeTeam?.name, "Department")}
                bookById={bookById}
                chapterById={chapterById}
                pageById={pageById}
                chaptersByBook={chaptersByBook}
                pagesByBook={pagesByBook}
                pagesByChapter={pagesByChapter}
                collapsedChapters={collapsedChapters}
                onToggleChapter={toggleChapter}
                onSelect={setSelection}
              />
            </section>

            {/* COLUMN 3 — Details & Permissions */}
            <aside className="flex max-h-[calc(100dvh-13rem)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/40 shadow-sm">
              <RightColumn
                selection={selection}
                activeTeamName={fallback(activeTeam?.name, "Department")}
                bookById={bookById}
                chapterById={chapterById}
                pageById={pageById}
              />
            </aside>
          </div>
        )}
      </PageContainer>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Book;
  tone?: "warning";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 backdrop-blur transition",
        tone === "warning"
          ? "border-amber-500/30 bg-amber-500/[0.07]"
          : "border-border/50 bg-background/40",
      )}
    >
      <div
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg border",
          tone === "warning"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
            : "border-border/50 bg-background/50 text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none tabular-nums">
          {value}
        </p>
        <p className="mt-1 truncate text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}

function DisabledActionButton({
  label,
  icon,
  variant = "default",
  size = "sm",
  iconOnly = false,
  ariaLabel,
}: {
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "xs";
  iconOnly?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex" aria-label={ariaLabel ?? label}>
          <Button
            size="sm"
            variant={variant}
            disabled
            aria-disabled="true"
            className={cn(
              "pointer-events-none opacity-60",
              size === "xs" && "h-7 px-2 text-xs",
              iconOnly && "px-2",
            )}
          >
            {icon}
            {!iconOnly && label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[260px] text-xs">
        <span className="font-semibold">Phase 2</span> — available when the ACL
        & write engine ships. Read-only for now.
      </TooltipContent>
    </Tooltip>
  );
}

function GlobalSearchResults({
  hits,
  bookById,
  chapterById,
  onPick,
  onClear,
}: {
  hits: KbArticle[];
  bookById: Map<string, KbSpace>;
  chapterById: Map<string, KbCategory>;
  onPick: (a: KbArticle) => void;
  onClear: () => void;
}) {
  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border border-border/60 bg-background/80 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {hits.length} search result{hits.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          Clear
        </button>
      </div>
      {hits.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          No pages match this search.
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-border/30 overflow-y-auto">
          {hits.map((a) => {
            const book = bookById.get(a.space_id);
            const chapter = a.category_id
              ? chapterById.get(a.category_id)
              : null;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onPick(a)}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition hover:bg-white/[0.04]"
                >
                  <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded border border-border/50 bg-background/60 text-muted-foreground">
                    <FileText className="h-3 w-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-xs font-medium">
                      {fallback(a.title, "Untitled page")}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                      <span className="rounded bg-background/60 px-1 py-px text-[9px] uppercase tracking-wider">
                        Page
                      </span>{" "}
                      · {fallback(book?.name, "Unknown book")}
                      {chapter ? ` › ${chapter.name}` : ""}
                    </p>
                  </div>
                  <VisibilityBadge visibility={a.visibility} size="xs" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CenterColumn({
  selection,
  activeTeamName,
  bookById,
  chapterById,
  pageById,
  chaptersByBook,
  pagesByBook,
  pagesByChapter,
  collapsedChapters,
  onToggleChapter,
  onSelect,
}: {
  selection: Selection;
  activeTeamName: string;
  bookById: Map<string, KbSpace>;
  chapterById: Map<string, KbCategory>;
  pageById: Map<string, KbArticle>;
  chaptersByBook: Map<string, KbCategory[]>;
  pagesByBook: Map<string, KbArticle[]>;
  pagesByChapter: Map<string, KbArticle[]>;
  collapsedChapters: Set<string>;
  onToggleChapter: (id: string) => void;
  onSelect: (s: Selection) => void;
}) {
  if (selection.kind === "home") {
    return (
      <div className="flex h-full min-h-[460px] flex-col items-center justify-center gap-4 p-10 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl border border-border/50 bg-gradient-to-br from-primary/15 via-card/60 to-transparent text-primary">
          <BookOpen className="h-8 w-8" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight">
            Pick a book to start reading
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Choose a book from the left panel to browse its chapters and pages.
            Every page shows a visibility badge so you always know who can read
            it.
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded-full border border-border/50 bg-background/50 px-2 py-0.5">
            Department
          </span>
          <ChevronRight className="h-3 w-3 opacity-50" />
          <span className="rounded-full border border-border/50 bg-background/50 px-2 py-0.5">
            Book
          </span>
          <ChevronRight className="h-3 w-3 opacity-50" />
          <span className="rounded-full border border-border/50 bg-background/50 px-2 py-0.5">
            Chapter
          </span>
          <ChevronRight className="h-3 w-3 opacity-50" />
          <span className="rounded-full border border-border/50 bg-background/50 px-2 py-0.5">
            Page
          </span>
        </div>
      </div>
    );
  }

  if (selection.kind === "book") {
    const book = bookById.get(selection.bookId);
    if (!book) return <NotFound label="Book not found" />;
    const chapters = chaptersByBook.get(book.id) ?? [];
    const pages = pagesByBook.get(book.id) ?? [];
    const looseArticles = pages.filter((a) => !a.category_id);
    const totalPages = pages.length;
    const restricted = pages.filter((a) => {
      const k = resolveVisibility(a.visibility).key;
      return k === "specific_teams" || k === "assigned" || k === "confidential";
    }).length;

    return (
      <div className="flex h-full max-h-[calc(100dvh-13rem)] flex-col">
        {/* Book header */}
        <div className="border-b border-border/40 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent px-6 py-5">
          <Breadcrumbs
            items={[{ label: activeTeamName }, { label: fallback(book.name, "Untitled book") }]}
          />
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-primary/30 bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-sm">
              <Book className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[1.35rem] font-semibold tracking-tight">
                {fallback(book.name, "Untitled book")}
              </h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {fallback(book.description, "No description yet for this book.")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                <StatPill icon={Folder} label={`${chapters.length} chapters`} />
                <StatPill icon={FileText} label={`${totalPages} pages`} />
                {restricted > 0 && (
                  <StatPill
                    icon={Lock}
                    label={`${restricted} restricted`}
                    tone="warning"
                  />
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <NewChapterDialog book={book} bookVis="all_employees" />
              <NewPageDialog
                book={book}
                bookVis="all_employees"
                chapters={chapters}
              />
            </div>
          </div>
        </div>

        {/* Chapter list */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {chapters.length === 0 && looseArticles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 bg-background/30 px-6 py-12 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl border border-border/50 bg-background/50">
                <Folder className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">This book is empty</p>
              <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
                Chapters and pages added to this book will appear here. Creation
                is read-only in the current phase.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {chapters.map((ch) => {
                const chPages = pagesByChapter.get(ch.id) ?? [];
                const collapsed = collapsedChapters.has(ch.id);
                return (
                  <section
                    key={ch.id}
                    className="overflow-hidden rounded-xl border border-border/50 bg-background/30 transition hover:border-border/70"
                  >
                    <header className="flex items-center gap-2 border-b border-border/40 bg-background/40 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onToggleChapter(ch.id)}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
                        aria-label={
                          collapsed ? "Expand chapter" : "Collapse chapter"
                        }
                        aria-expanded={!collapsed}
                      >
                        {collapsed ? (
                          <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border/50 bg-background/60 text-muted-foreground">
                        <Folder className="h-3.5 w-3.5" />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onSelect({
                            kind: "chapter",
                            bookId: ch.space_id,
                            chapterId: ch.id,
                          })
                        }
                        className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:text-primary"
                      >
                        {fallback(ch.name, "Untitled chapter")}
                      </button>
                      <span className="rounded-full border border-border/50 bg-background/60 px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                        {chPages.length} page{chPages.length === 1 ? "" : "s"}
                      </span>
                    </header>
                    {!collapsed && (
                      <div>
                        {ch.description && (
                          <p className="border-b border-border/30 px-4 py-2.5 text-xs text-muted-foreground">
                            {ch.description}
                          </p>
                        )}
                        {chPages.length === 0 ? (
                          <p className="px-4 py-5 text-center text-xs italic text-muted-foreground">
                            No pages in this chapter yet
                          </p>
                        ) : (
                          <ul className="divide-y divide-border/30">
                            {chPages.map((a) => (
                              <li key={a.id}>
                                <PageListItem
                                  article={a}
                                  active={false}
                                  onPick={() =>
                                    onSelect({
                                      kind: "page",
                                      bookId: a.space_id,
                                      chapterId: a.category_id,
                                      pageId: a.id,
                                    })
                                  }
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}

              {looseArticles.length > 0 && (
                <section className="overflow-hidden rounded-xl border border-dashed border-border/50 bg-background/30">
                  <header className="flex items-center gap-2 border-b border-border/30 bg-background/40 px-3 py-2.5">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border/50 bg-background/60 text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                      Uncategorised pages
                    </p>
                    <span className="rounded-full border border-border/50 bg-background/60 px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                      {looseArticles.length}
                    </span>
                  </header>
                  <ul className="divide-y divide-border/30">
                    {looseArticles.map((a) => (
                      <li key={a.id}>
                        <PageListItem
                          article={a}
                          active={false}
                          onPick={() =>
                            onSelect({
                              kind: "page",
                              bookId: a.space_id,
                              chapterId: null,
                              pageId: a.id,
                            })
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (selection.kind === "chapter") {
    const book = bookById.get(selection.bookId);
    const chapter = chapterById.get(selection.chapterId);
    if (!book || !chapter) return <NotFound label="Chapter not found" />;
    const pages = pagesByChapter.get(chapter.id) ?? [];

    return (
      <div className="flex h-full max-h-[calc(100dvh-13rem)] flex-col">
        <div className="border-b border-border/40 px-6 py-5">
          <Breadcrumbs
            items={[
              { label: activeTeamName },
              {
                label: fallback(book.name, "Untitled book"),
                onClick: () => onSelect({ kind: "book", bookId: book.id }),
              },
              { label: fallback(chapter.name, "Untitled chapter") },
            ]}
          />
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-border/50 bg-background/60 text-muted-foreground">
              <Folder className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[1.25rem] font-semibold tracking-tight">
                {fallback(chapter.name, "Untitled chapter")}
              </h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {fallback(
                  chapter.description,
                  "No description yet for this chapter.",
                )}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
                <StatPill icon={FileText} label={`${pages.length} pages`} />
                <StatPill
                  icon={Book}
                  label={fallback(book.name, "Untitled book")}
                />
              </div>
            </div>
            <NewPageDialog
              book={book}
              bookVis="all_employees"
              chapters={chaptersByBook.get(book.id) ?? []}
              defaultChapterId={chapter.id}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {pages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 bg-background/30 px-6 py-12 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl border border-border/50 bg-background/50">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No pages in this chapter</p>
              <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
                Pages added to this chapter will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/50 bg-background/30">
              <ul className="divide-y divide-border/30">
                {pages.map((a) => (
                  <li key={a.id}>
                    <PageListItem
                      article={a}
                      active={false}
                      onPick={() =>
                        onSelect({
                          kind: "page",
                          bookId: book.id,
                          chapterId: chapter.id,
                          pageId: a.id,
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // page
  const article = pageById.get(selection.pageId);
  if (!article) return <NotFound label="Page not found" />;
  const book = bookById.get(article.space_id);
  const chapter = article.category_id
    ? chapterById.get(article.category_id)
    : null;

  return (
    <article className="flex h-full max-h-[calc(100dvh-13rem)] flex-col">
      <div className="border-b border-border/40 px-6 py-5">
        <Breadcrumbs
          items={[
            { label: activeTeamName },
            book
              ? {
                  label: fallback(book.name, "Untitled book"),
                  onClick: () => onSelect({ kind: "book", bookId: book.id }),
                }
              : { label: "Book" },
            ...(chapter
              ? [
                  {
                    label: fallback(chapter.name, "Untitled chapter"),
                    onClick: () =>
                      onSelect({
                        kind: "chapter",
                        bookId: article.space_id,
                        chapterId: chapter.id,
                      }),
                  },
                ]
              : []),
            { label: fallback(article.title, "Untitled page") },
          ]}
        />
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-border/50 bg-background/60 text-muted-foreground">
            <FileText className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.4rem] font-semibold leading-tight tracking-tight">
              {fallback(article.title, "Untitled page")}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <VisibilityBadge visibility={article.visibility} />
              <span className="rounded-full border border-border/50 bg-background/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {article.status}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />v{article.revision_number} ·
                updated {formatRelative(article.updated_at)}
              </span>
            </div>
            {article.excerpt && (
              <p className="mt-2 text-sm text-muted-foreground">
                {article.excerpt}
              </p>
            )}
          </div>
          <EditPageDialog
            article={article}
            bookName={fallback(book?.name, "Book")}
            chapterName={chapter?.name ?? null}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-background/20 to-transparent px-6 py-8">
        {article.content_markdown && article.content_markdown.trim() ? (
          <div className="prose-knowledge mx-auto max-w-3xl">
            <Markdown source={article.content_markdown} />
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-xl border border-dashed border-border/50 bg-background/30 px-6 py-10 text-center">
            <FileText className="mx-auto mb-3 h-6 w-6 text-muted-foreground/70" />
            <p className="text-sm font-medium">No content yet</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              This page hasn't been written. Editing is available in Phase 2.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function StatPill({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof Book;
  label: string;
  tone?: "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        tone === "warning"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
          : "border-border/50 bg-background/50 text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="tabular-nums">{label}</span>
    </span>
  );
}

function PageListItem({
  article,
  onPick,
  active = false,
}: {
  article: KbArticle;
  onPick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex w-full items-start gap-3 px-4 py-3 text-left transition",
        active
          ? "bg-primary/10"
          : "hover:bg-white/[0.04]",
      )}
    >
      <div
        className={cn(
          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border",
          active
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border/50 bg-background/60 text-muted-foreground group-hover:text-foreground",
        )}
      >
        <FileText className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm font-medium",
              active ? "text-foreground" : "group-hover:text-foreground",
            )}
          >
            {fallback(article.title, "Untitled page")}
          </span>
          <VisibilityBadge visibility={article.visibility} size="xs" />
          <span className="rounded-full border border-border/40 bg-background/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            {article.status}
          </span>
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
          {fallback(article.excerpt, "No excerpt — open the page to view content.")}
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
        <Clock className="h-2.5 w-2.5" />
        {formatRelative(article.updated_at)}
      </span>
    </button>
  );
}

function RightColumn({
  selection,
  activeTeamName,
  bookById,
  chapterById,
  pageById,
}: {
  selection: Selection;
  activeTeamName: string;
  bookById: Map<string, KbSpace>;
  chapterById: Map<string, KbCategory>;
  pageById: Map<string, KbArticle>;
}) {
  if (selection.kind === "home") {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <RightHeader title="Permissions" subtitle="Visibility legend" />
        <div className="space-y-3 p-4">
          <div className="rounded-xl border border-border/50 bg-background/40 p-4 text-center">
            <Shield className="mx-auto mb-2 h-7 w-7 text-muted-foreground/70" />
            <p className="text-xs text-muted-foreground">
              Select a book, chapter or page to inspect its visibility and
              metadata.
            </p>
          </div>
          <ul className="space-y-1.5">
            {(
              [
                "all_employees",
                "it_only",
                "specific_teams",
                "assigned",
                "confidential",
              ] as VisibilityKey[]
            ).map((k) => {
              const meta = VISIBILITY[k];
              const Icon = meta.icon;
              return (
                <li
                  key={k}
                  className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/30 p-2.5"
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-md border",
                      meta.tone,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{meta.label}</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                      {meta.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  if (selection.kind === "book") {
    const book = bookById.get(selection.bookId);
    if (!book) return null;
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <RightHeader title="Book details" subtitle={activeTeamName} />
        <div className="space-y-4 p-4">
          <div className="rounded-xl border border-border/50 bg-background/40 p-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                <Book className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {fallback(book.name, "Untitled book")}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {activeTeamName}
                </p>
              </div>
            </div>
            {book.description && (
              <p className="mt-2.5 text-xs leading-snug text-muted-foreground">
                {book.description}
              </p>
            )}
          </div>

          <MetaGrid>
            <MetaRow label="Slug" value={fallback(book.slug, "—")} mono />
            <MetaRow
              label="Created"
              value={formatDate(book.created_at)}
            />
            <MetaRow
              label="Updated"
              value={formatDate(book.updated_at)}
            />
          </MetaGrid>

          <PermissionStub
            title="Book permissions"
            body="Per-book ACL inheritance to chapters and pages lands in Phase 2."
          />
          <InheritancePreview
            bookName={fallback(book.name, "Untitled book")}
            bookVis="all_employees"
          />
          <ManagePermissionsDialog
            scope="book"
            name={fallback(book.name, "Untitled book")}
            bookName={fallback(book.name, "Untitled book")}
            bookVis="all_employees"
            currentVis="all_employees"
          />
        </div>
      </div>
    );
  }

  if (selection.kind === "chapter") {
    const chapter = chapterById.get(selection.chapterId);
    const book = bookById.get(selection.bookId);
    if (!chapter) return null;
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <RightHeader
          title="Chapter details"
          subtitle={fallback(book?.name, "Book")}
        />
        <div className="space-y-4 p-4">
          <div className="rounded-xl border border-border/50 bg-background/40 p-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/50 bg-background/60 text-muted-foreground">
                <Folder className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {fallback(chapter.name, "Untitled chapter")}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  in {fallback(book?.name, "—")}
                </p>
              </div>
            </div>
            {chapter.description && (
              <p className="mt-2.5 text-xs leading-snug text-muted-foreground">
                {chapter.description}
              </p>
            )}
          </div>

          <MetaGrid>
            <MetaRow label="Slug" value={fallback(chapter.slug, "—")} mono />
            <MetaRow
              label="Sort order"
              value={String(chapter.sort_order ?? 0)}
            />
            <MetaRow
              label="Updated"
              value={formatDate(chapter.updated_at)}
            />
          </MetaGrid>

          <PermissionStub
            title="Chapter permissions"
            body="Inherits the parent book's access rules. Per-chapter overrides arrive in Phase 2."
          />
          <InheritancePreview
            bookName={fallback(book?.name, "Book")}
            bookVis="all_employees"
            chapterName={fallback(chapter.name, "Untitled chapter")}
            chapterVis="all_employees"
          />
          <ManagePermissionsDialog
            scope="chapter"
            name={fallback(chapter.name, "Untitled chapter")}
            bookName={fallback(book?.name, "Book")}
            bookVis="all_employees"
            chapterName={fallback(chapter.name, "Untitled chapter")}
            chapterVis="all_employees"
            currentVis="all_employees"
          />
        </div>
      </div>
    );
  }

  const article = pageById.get(selection.pageId);
  if (!article) return null;
  const meta = resolveVisibility(article.visibility);
  const Icon = meta.icon;
  const book = bookById.get(article.space_id);
  const chapter = article.category_id
    ? chapterById.get(article.category_id)
    : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <RightHeader title="Page details" subtitle={fallback(book?.name, "Book")} />
      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-border/50 bg-background/40 p-3">
          <p className="line-clamp-2 text-sm font-semibold leading-snug">
            {fallback(article.title, "Untitled page")}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {fallback(book?.name, "Book")}
            {chapter ? ` › ${chapter.name}` : ""}
          </p>
        </div>

        {/* Visibility hero card */}
        <div className={cn("relative overflow-hidden rounded-xl border p-3.5", meta.strong)}>
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/5 blur-2xl"
          />
          <div className="relative flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-current/30 bg-background/30">
              <Icon className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                Visibility
              </p>
              <p className="text-sm font-semibold">{meta.label}</p>
            </div>
          </div>
          <p className="relative mt-2.5 text-[11px] leading-relaxed opacity-90">
            {meta.description}
          </p>
          <div className="relative mt-3 rounded-lg border border-current/20 bg-background/40 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
              Who can read this
            </p>
            <p className="mt-1 text-[11px] leading-snug">{meta.audience}</p>
          </div>
        </div>

        <InheritancePreview
          bookName={fallback(book?.name, "Book")}
          bookVis="all_employees"
          chapterName={chapter?.name ?? null}
          chapterVis={chapter ? "all_employees" : null}
          pageName={fallback(article.title, "Untitled page")}
          pageVis={visFromString(article.visibility)}
        />

        <MetaGrid title="Metadata">
          <MetaRow label="Status" value={article.status} />
          <MetaRow label="Revision" value={`v${article.revision_number}`} />
          <MetaRow label="Slug" value={fallback(article.slug, "—")} mono />
          <MetaRow label="Updated" value={formatDate(article.updated_at)} />
          {article.published_at && (
            <MetaRow
              label="Published"
              value={formatDate(article.published_at)}
            />
          )}
        </MetaGrid>

        <div className="flex flex-wrap gap-2 pt-1">
          <EditPageDialog
            article={article}
            bookName={fallback(book?.name, "Book")}
            chapterName={chapter?.name ?? null}
          />
          <ManagePermissionsDialog
            scope="page"
            name={fallback(article.title, "Untitled page")}
            bookName={fallback(book?.name, "Book")}
            bookVis="all_employees"
            chapterName={chapter?.name ?? null}
            chapterVis={chapter ? "all_employees" : null}
            currentVis={visFromString(article.visibility)}
          />
        </div>
      </div>
    </div>
  );
}

function RightHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="sticky top-0 z-10 border-b border-border/40 bg-card/80 px-4 py-3 backdrop-blur">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {subtitle && (
        <p className="mt-0.5 truncate text-sm font-semibold">{subtitle}</p>
      )}
    </div>
  );
}

function PermissionStub({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/[0.04] p-3">
      <div className="flex items-center gap-1.5">
        <Settings2 className="h-3.5 w-3.5 text-amber-300/80" />
        <p className="text-xs font-semibold">{title}</p>
        <span className="ml-auto rounded-full border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
          Phase 2
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function MetaGrid({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/30 p-3">
      {title && (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
      )}
      <dl className="grid grid-cols-1 gap-2.5">{children}</dl>
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-baseline gap-2">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 truncate text-xs text-foreground/90",
          mono && "font-mono text-[11px]",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function Breadcrumbs({
  items,
}: {
  items: { label: string; onClick?: () => void }[];
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground"
    >
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 opacity-60" />}
          {it.onClick ? (
            <button
              type="button"
              className="rounded px-1 py-0.5 transition hover:bg-white/5 hover:text-foreground"
              onClick={it.onClick}
            >
              {it.label}
            </button>
          ) : (
            <span className="rounded px-1 py-0.5 text-foreground/85">
              {it.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

function NotFound({ label }: { label: string }) {
  return (
    <div className="p-6">
      <EmptyState
        icon={FileText}
        title={label}
        description="The item you selected is no longer available."
      />
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
      <div className="space-y-2 rounded-2xl border border-border/50 bg-card/40 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
      <div className="space-y-3 rounded-2xl border border-border/50 bg-card/40 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-2 pt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
      <div className="space-y-2 rounded-2xl border border-border/50 bg-card/40 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatRelative(iso: string) {
  try {
    const d = new Date(iso).getTime();
    const diff = Date.now() - d;
    const s = Math.round(diff / 1000);
    if (s < 60) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.round(h / 24);
    if (days < 30) return `${days}d ago`;
    const mo = Math.round(days / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.round(mo / 12)}y ago`;
  } catch {
    return "";
  }
}
