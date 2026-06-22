/**
 * Knowledge Center — BookStack-style three-column workspace.
 *
 * Frontend-only Phase 1 (per ITKC blueprint §15):
 *  - Department  → team   (from useAuth.teams)
 *  - Book        → knowledge_spaces
 *  - Chapter     → knowledge_categories
 *  - Page        → knowledge_articles
 *
 * Uses ONLY real backend data via useKnowledgeBackend — no mock content,
 * no seeds. Mutating actions are disabled with an explanatory tooltip
 * because per-content ACL is not yet implemented on the backend.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Book,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Globe2,
  Lock,
  RefreshCw,
  Search,
  Shield,
  User as UserIcon,
  Users,
} from "lucide-react";
import { PageContainer } from "@/components/common/PageContainer";
import { PageHeader } from "@/components/common/PageHeader";
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

// ---------------------------------------------------------------------------
// Visibility model (frontend-only; mapped from KbArticle.visibility string).
// Real backend ACL lands in Phase 2.
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
  description: string;
  icon: typeof Globe2;
  tone: string; // tailwind classes for the badge
}

const VISIBILITY: Record<VisibilityKey, VisibilityMeta> = {
  all_employees: {
    key: "all_employees",
    label: "All Employees",
    description: "Visible to every employee with Knowledge Center access.",
    icon: Globe2,
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  it_only: {
    key: "it_only",
    label: "IT Only",
    description: "Visible to members of the IT department.",
    icon: Shield,
    tone: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  specific_teams: {
    key: "specific_teams",
    label: "Specific Teams",
    description: "Visible only to selected teams (e.g. Helpdesk, Network).",
    icon: Users,
    tone: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
  assigned: {
    key: "assigned",
    label: "Assigned",
    description: "Private content — only explicitly assigned users can view.",
    icon: UserIcon,
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  confidential: {
    key: "confidential",
    label: "Confidential",
    description: "Restricted security content. Explicit grant required.",
    icon: Lock,
    tone: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  },
  unknown: {
    key: "unknown",
    label: "Unspecified",
    description: "Visibility has not been set for this page.",
    icon: Lock,
    tone: "border-border/40 bg-white/[0.04] text-muted-foreground",
  },
};

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

function VisibilityBadge({ visibility }: { visibility: string | null }) {
  const meta = resolveVisibility(visibility);
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        meta.tone,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </span>
  );
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelection({ kind: "home" });
    setExpanded(new Set());
  }, [activeTeamId]);

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;

  // -------------------------------------------------------------------------
  // Derived indexes
  // -------------------------------------------------------------------------
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

  // Search across allowed content (filters department-scoped lists already).
  const q = query.trim().toLowerCase();
  const searchHits = useMemo<KbArticle[]>(() => {
    if (!q || !data) return [];
    return data.articles
      .filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.excerpt ?? "").toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [q, data]);

  const toggleBook = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // -------------------------------------------------------------------------
  // Loading / error / empty shells
  // -------------------------------------------------------------------------
  const headerMeta =
    !loading && data
      ? `${books.length} book${books.length === 1 ? "" : "s"} · ${
          data.articles.length
        } page${data.articles.length === 1 ? "" : "s"}`
      : undefined;

  return (
    <TooltipProvider delayDuration={150}>
      <PageContainer variant="wide" className="space-y-4">
        <PageHeader
          title="Knowledge Center"
          description="Internal documentation organised by Department, Book, Chapter and Page."
          meta={headerMeta}
          actions={
            <div className="flex items-center gap-2">
              {teams.length > 1 && (
                <Select
                  value={activeTeamId ?? undefined}
                  onValueChange={(v) => setActiveTeamId(v)}
                >
                  <SelectTrigger className="h-9 w-[200px] text-sm">
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
                aria-label="Refresh"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin")}
                />
              </Button>
              <DisabledActionButton label="New Book" />
            </div>
          }
        />

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
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
            {/* ---------------------------------------------------------------
                Column 1 — Departments & Books panel
               --------------------------------------------------------------- */}
            <aside className="rounded-lg border border-border/40 bg-card/30 p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {activeTeam?.name ?? "Department"}
                </h2>
                <span className="text-[10px] text-muted-foreground">
                  {books.length}
                </span>
              </div>

              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search this department…"
                  className="h-8 pl-7 text-xs"
                />
              </div>

              {q ? (
                <SearchResults
                  hits={searchHits}
                  bookById={bookById}
                  onPick={(a) =>
                    setSelection({
                      kind: "page",
                      bookId: a.space_id,
                      chapterId: a.category_id,
                      pageId: a.id,
                    })
                  }
                />
              ) : books.length === 0 ? (
                <div className="px-2 py-6 text-center">
                  <BookOpen className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
                  <p className="text-xs text-muted-foreground">
                    No books in this department yet.
                  </p>
                </div>
              ) : (
                <nav className="space-y-0.5">
                  {books.map((book) => {
                    const isOpen = expanded.has(book.id);
                    const chapters = chaptersByBook.get(book.id) ?? [];
                    const looseArticles = (pagesByBook.get(book.id) ?? []).filter(
                      (a) => !a.category_id,
                    );
                    const total = (pagesByBook.get(book.id) ?? []).length;
                    const isActiveBook =
                      (selection.kind === "book" && selection.bookId === book.id) ||
                      (selection.kind === "chapter" &&
                        selection.bookId === book.id) ||
                      (selection.kind === "page" && selection.bookId === book.id);
                    return (
                      <div key={book.id}>
                        <div
                          className={cn(
                            "group flex items-center gap-1 rounded-md px-1 py-1 text-sm hover:bg-white/[0.04]",
                            isActiveBook && "bg-white/[0.06]",
                          )}
                        >
                          <button
                            type="button"
                            className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:text-foreground"
                            onClick={() => toggleBook(book.id)}
                            aria-label={isOpen ? "Collapse" : "Expand"}
                          >
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            onClick={() =>
                              setSelection({ kind: "book", bookId: book.id })
                            }
                          >
                            <Book className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{book.name}</span>
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              {total}
                            </span>
                          </button>
                        </div>
                        {isOpen && (
                          <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border/30 pl-2">
                            {chapters.length === 0 && looseArticles.length === 0 ? (
                              <p className="px-2 py-1 text-[11px] italic text-muted-foreground">
                                Empty book
                              </p>
                            ) : (
                              <>
                                {chapters.map((ch) => {
                                  const pages = pagesByChapter.get(ch.id) ?? [];
                                  const active =
                                    (selection.kind === "chapter" &&
                                      selection.chapterId === ch.id) ||
                                    (selection.kind === "page" &&
                                      selection.chapterId === ch.id);
                                  return (
                                    <button
                                      key={ch.id}
                                      type="button"
                                      className={cn(
                                        "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-white/[0.04]",
                                        active && "bg-white/[0.06]",
                                      )}
                                      onClick={() =>
                                        setSelection({
                                          kind: "chapter",
                                          bookId: book.id,
                                          chapterId: ch.id,
                                        })
                                      }
                                    >
                                      <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
                                      <span className="truncate">{ch.name}</span>
                                      <span className="ml-auto text-[10px] text-muted-foreground">
                                        {pages.length}
                                      </span>
                                    </button>
                                  );
                                })}
                                {looseArticles.map((a) => (
                                  <PageRow
                                    key={a.id}
                                    article={a}
                                    active={
                                      selection.kind === "page" &&
                                      selection.pageId === a.id
                                    }
                                    onPick={() =>
                                      setSelection({
                                        kind: "page",
                                        bookId: book.id,
                                        chapterId: null,
                                        pageId: a.id,
                                      })
                                    }
                                  />
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </nav>
              )}
            </aside>

            {/* ---------------------------------------------------------------
                Column 2 — Book workspace / Page reader
               --------------------------------------------------------------- */}
            <section className="min-w-0 rounded-lg border border-border/40 bg-card/30 p-5">
              <CenterColumn
                selection={selection}
                bookById={bookById}
                chapterById={chapterById}
                pageById={pageById}
                chaptersByBook={chaptersByBook}
                pagesByBook={pagesByBook}
                pagesByChapter={pagesByChapter}
                onSelect={setSelection}
              />
            </section>

            {/* ---------------------------------------------------------------
                Column 3 — Details & Permissions
               --------------------------------------------------------------- */}
            <aside className="rounded-lg border border-border/40 bg-card/30 p-4">
              <RightColumn
                selection={selection}
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

function DisabledActionButton({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button size="sm" disabled className="pointer-events-none opacity-60">
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[260px] text-xs">
        Content creation and permission management land in Phase 2 — wired to the
        backend ACL engine. Read-only for now.
      </TooltipContent>
    </Tooltip>
  );
}

function PageRow({
  article,
  active,
  onPick,
}: {
  article: KbArticle;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-white/[0.04]",
        active && "bg-white/[0.06]",
      )}
    >
      <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{article.title}</span>
    </button>
  );
}

function SearchResults({
  hits,
  bookById,
  onPick,
}: {
  hits: KbArticle[];
  bookById: Map<string, KbSpace>;
  onPick: (a: KbArticle) => void;
}) {
  if (hits.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
        No results.
      </p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {hits.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => onPick(a)}
            className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.04]"
          >
            <span className="line-clamp-1 text-xs font-medium">{a.title}</span>
            <span className="line-clamp-1 text-[10px] text-muted-foreground">
              {bookById.get(a.space_id)?.name ?? "Unknown book"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CenterColumn({
  selection,
  bookById,
  chapterById,
  pageById,
  chaptersByBook,
  pagesByBook,
  pagesByChapter,
  onSelect,
}: {
  selection: Selection;
  bookById: Map<string, KbSpace>;
  chapterById: Map<string, KbCategory>;
  pageById: Map<string, KbArticle>;
  chaptersByBook: Map<string, KbCategory[]>;
  pagesByBook: Map<string, KbArticle[]>;
  pagesByChapter: Map<string, KbArticle[]>;
  onSelect: (s: Selection) => void;
}) {
  if (selection.kind === "home") {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center">
        <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/60" />
        <h2 className="text-base font-semibold">Pick a book to start</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Select a book on the left to browse its chapters and pages. Every page
          shows its visibility scope so you always know who can read it.
        </p>
      </div>
    );
  }

  if (selection.kind === "book") {
    const book = bookById.get(selection.bookId);
    if (!book) return <NotFound label="Book not found" />;
    const chapters = chaptersByBook.get(book.id) ?? [];
    const looseArticles = (pagesByBook.get(book.id) ?? []).filter(
      (a) => !a.category_id,
    );
    return (
      <div className="space-y-5">
        <Header
          icon={Book}
          title={book.name}
          subtitle={book.description ?? "No description yet."}
        />
        {chapters.length === 0 && looseArticles.length === 0 ? (
          <EmptyState
            icon={Folder}
            title="This book is empty"
            description="Chapters and pages added to this book will appear here. Creation is read-only in the current phase."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {chapters.map((ch) => {
              const pages = pagesByChapter.get(ch.id) ?? [];
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() =>
                    onSelect({
                      kind: "chapter",
                      bookId: book.id,
                      chapterId: ch.id,
                    })
                  }
                  className="group flex flex-col gap-1 rounded-lg border border-border/40 bg-white/[0.02] p-3 text-left transition hover:border-border/60 hover:bg-white/[0.05]"
                >
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{ch.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {pages.length} page{pages.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {ch.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {ch.description}
                    </p>
                  )}
                </button>
              );
            })}
            {looseArticles.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                onPick={() =>
                  onSelect({
                    kind: "page",
                    bookId: book.id,
                    chapterId: null,
                    pageId: a.id,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (selection.kind === "chapter") {
    const book = bookById.get(selection.bookId);
    const chapter = chapterById.get(selection.chapterId);
    if (!book || !chapter) return <NotFound label="Chapter not found" />;
    const pages = pagesByChapter.get(chapter.id) ?? [];
    return (
      <div className="space-y-5">
        <Breadcrumbs
          items={[
            { label: book.name, onClick: () => onSelect({ kind: "book", bookId: book.id }) },
            { label: chapter.name },
          ]}
        />
        <Header
          icon={Folder}
          title={chapter.name}
          subtitle={chapter.description ?? "No description yet."}
        />
        {pages.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No pages in this chapter"
            description="Pages added to this chapter will appear here."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {pages.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                onPick={() =>
                  onSelect({
                    kind: "page",
                    bookId: book.id,
                    chapterId: chapter.id,
                    pageId: a.id,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // page
  const article = pageById.get(selection.pageId);
  if (!article) return <NotFound label="Page not found" />;
  const book = bookById.get(article.space_id);
  const chapter = article.category_id ? chapterById.get(article.category_id) : null;

  return (
    <article className="space-y-5">
      <Breadcrumbs
        items={[
          book
            ? {
                label: book.name,
                onClick: () => onSelect({ kind: "book", bookId: book.id }),
              }
            : { label: "Book" },
          ...(chapter
            ? [
                {
                  label: chapter.name,
                  onClick: () =>
                    onSelect({
                      kind: "chapter",
                      bookId: article.space_id,
                      chapterId: chapter.id,
                    }),
                },
              ]
            : []),
          { label: article.title },
        ]}
      />
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {article.title}
          </h1>
          <VisibilityBadge visibility={article.visibility} />
          <span className="rounded-full border border-border/40 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {article.status}
          </span>
        </div>
        {article.excerpt && (
          <p className="text-sm text-muted-foreground">{article.excerpt}</p>
        )}
      </header>

      <div className="rounded-lg border border-border/30 bg-white/[0.02] p-5">
        {article.content_markdown && article.content_markdown.trim() ? (
          <Markdown source={article.content_markdown} />
        ) : (
          <p className="text-sm italic text-muted-foreground">
            This page has no content yet.
          </p>
        )}
      </div>
    </article>
  );
}

function RightColumn({
  selection,
  bookById,
  chapterById,
  pageById,
}: {
  selection: Selection;
  bookById: Map<string, KbSpace>;
  chapterById: Map<string, KbCategory>;
  pageById: Map<string, KbArticle>;
}) {
  if (selection.kind === "home") {
    return (
      <div className="text-center text-xs text-muted-foreground">
        <Shield className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
        Select a page to inspect its visibility, audience and metadata.
      </div>
    );
  }

  if (selection.kind === "book") {
    const book = bookById.get(selection.bookId);
    if (!book) return null;
    return (
      <div className="space-y-4">
        <SectionLabel>Book</SectionLabel>
        <MetaRow label="Name" value={book.name} />
        <MetaRow label="Slug" value={book.slug} mono />
        {book.description && (
          <MetaRow label="Description" value={book.description} />
        )}
        <MetaRow label="Created" value={formatDate(book.created_at)} />
        <PermissionStub />
      </div>
    );
  }

  if (selection.kind === "chapter") {
    const chapter = chapterById.get(selection.chapterId);
    if (!chapter) return null;
    return (
      <div className="space-y-4">
        <SectionLabel>Chapter</SectionLabel>
        <MetaRow label="Name" value={chapter.name} />
        <MetaRow label="Slug" value={chapter.slug} mono />
        {chapter.description && (
          <MetaRow label="Description" value={chapter.description} />
        )}
        <PermissionStub />
      </div>
    );
  }

  const article = pageById.get(selection.pageId);
  if (!article) return null;
  const meta = resolveVisibility(article.visibility);
  const Icon = meta.icon;
  return (
    <div className="space-y-4">
      <SectionLabel>Page details</SectionLabel>

      <div
        className={cn(
          "flex items-start gap-2 rounded-md border p-3 text-xs",
          meta.tone,
        )}
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold">{meta.label}</p>
          <p className="opacity-80">{meta.description}</p>
        </div>
      </div>

      <MetaRow label="Status" value={article.status} />
      <MetaRow label="Revision" value={`v${article.revision_number}`} />
      <MetaRow label="Updated" value={formatDate(article.updated_at)} />
      {article.published_at && (
        <MetaRow label="Published" value={formatDate(article.published_at)} />
      )}

      <PermissionStub />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
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
    <div className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("text-sm", mono && "font-mono text-xs")}>{value}</p>
    </div>
  );
}

function PermissionStub() {
  return (
    <div className="rounded-md border border-dashed border-border/50 bg-white/[0.02] p-3 text-xs text-muted-foreground">
      <p className="mb-1 font-medium text-foreground">
        Permission management
      </p>
      <p>
        Per-resource access rules (allowed teams &amp; users with inheritance)
        land in the next phase. Visibility shown here is read-only for now.
      </p>
    </div>
  );
}

function Header({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Book;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border/40 bg-white/[0.04]">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <h2 className="truncate text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function Breadcrumbs({
  items,
}: {
  items: { label: string; onClick?: () => void }[];
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {it.onClick ? (
            <button
              type="button"
              className="rounded hover:text-foreground hover:underline"
              onClick={it.onClick}
            >
              {it.label}
            </button>
          ) : (
            <span className="text-foreground/80">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function ArticleCard({
  article,
  onPick,
}: {
  article: KbArticle;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex flex-col gap-1.5 rounded-lg border border-border/40 bg-white/[0.02] p-3 text-left transition hover:border-border/60 hover:bg-white/[0.05]"
    >
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="line-clamp-1 text-sm font-medium">{article.title}</span>
      </div>
      {article.excerpt && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {article.excerpt}
        </p>
      )}
      <div className="mt-1 flex items-center gap-1.5">
        <VisibilityBadge visibility={article.visibility} />
        <span className="text-[10px] text-muted-foreground">
          {article.status}
        </span>
      </div>
    </button>
  );
}

function NotFound({ label }: { label: string }) {
  return (
    <EmptyState
      icon={FileText}
      title={label}
      description="The item you selected is no longer available."
    />
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
      <div className="space-y-2 rounded-lg border border-border/40 bg-card/30 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
      <div className="space-y-3 rounded-lg border border-border/40 bg-card/30 p-5">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-border/40 bg-card/30 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
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
