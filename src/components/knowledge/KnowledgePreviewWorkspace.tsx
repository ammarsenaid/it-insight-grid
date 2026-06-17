/**
 * LOVABLE PREVIEW ONLY — polished, read-only knowledge workspace.
 *
 * Renders sample books/chapters/pages so the /documents page can be
 * design-reviewed without a real backend. All mutating actions are no-ops
 * with a "Preview only — backend not connected" toast.
 *
 * SAFETY: gated by `isLovablePreviewHost()`; never reached on production.
 */
import { useMemo, useState } from "react";
import {
  Book,
  BookMarked,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  FileText,
  Filter,
  Library,
  Pencil,
  Plus,
  Search as SearchIcon,
  Sparkles,
  Star,
  Tag as TagIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/common/Markdown";
import { formatDate } from "@/components/common/format";
import { cn } from "@/lib/utils";
import type {
  KbArticle,
  KbCategory,
  KbSpace,
} from "@/lib/knowledge/backend-types";
import { PREVIEW_KB_DATA } from "@/preview/sampleKnowledge";

const STATUS_STYLE: Record<KbArticle["status"], { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "border-slate-500/30 bg-slate-500/10 text-slate-200" },
  in_review: { label: "In review", cls: "border-amber-500/30 bg-amber-500/10 text-amber-200" },
  approved: { label: "Approved", cls: "border-sky-500/30 bg-sky-500/10 text-sky-200" },
  published: { label: "Published", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" },
  archived: { label: "Archived", cls: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300" },
};

const SPACE_ACCENT: Record<string, string> = {
  "sp-runbooks": "from-rose-500/80 to-orange-500/70",
  "sp-onboarding": "from-emerald-500/80 to-teal-500/70",
  "sp-architecture": "from-indigo-500/80 to-violet-500/70",
};

function previewToast() {
  toast.message("Preview only — backend not connected", {
    description: "Editing is disabled in the Lovable design preview.",
  });
}

type Selection =
  | { kind: "home" }
  | { kind: "space"; id: string }
  | { kind: "category"; id: string }
  | { kind: "article"; id: string };

export function KnowledgePreviewWorkspace() {
  const { spaces, categories, articles, tags, articleTags } = PREVIEW_KB_DATA;
  const [selection, setSelection] = useState<Selection>({ kind: "home" });
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(spaces.map((s) => s.id)),
  );

  const tagsByArticle = useMemo(() => {
    const map = new Map<string, string[]>();
    const tagName = new Map(tags.map((t) => [t.id, t.name]));
    for (const at of articleTags) {
      const list = map.get(at.article_id) ?? [];
      const n = tagName.get(at.tag_id);
      if (n) list.push(n);
      map.set(at.article_id, list);
    }
    return map;
  }, [tags, articleTags]);

  const ql = query.trim().toLowerCase();
  const matchesQuery = (a: KbArticle) =>
    !ql ||
    `${a.title} ${a.excerpt ?? ""} ${(tagsByArticle.get(a.id) ?? []).join(" ")}`
      .toLowerCase()
      .includes(ql);

  const matchedArticles = useMemo(
    () => (ql ? articles.filter(matchesQuery) : articles),
    [articles, ql, tagsByArticle],
  );

  const recents = useMemo(
    () =>
      [...articles]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 5),
    [articles],
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const activeArticle =
    selection.kind === "article"
      ? articles.find((a) => a.id === selection.id) ?? null
      : null;
  const activeSpace =
    selection.kind === "space"
      ? spaces.find((s) => s.id === selection.id) ?? null
      : null;
  const activeCategory =
    selection.kind === "category"
      ? categories.find((c) => c.id === selection.id) ?? null
      : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* ───────── Sidebar ───────── */}
      <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/40 backdrop-blur">
          <div className="border-b border-border/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-primary/30">
                <Library className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight">
                  Knowledge Library
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {spaces.length} books · {articles.length} pages
                </div>
              </div>
            </div>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages, tags…"
                className="h-9 pl-8 text-sm"
              />
            </div>
          </div>

          <nav className="min-h-0 flex-1 overflow-auto p-2">
            <button
              onClick={() => setSelection({ kind: "home" })}
              className={cn(
                "mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                selection.kind === "home"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
              )}
            >
              <Compass className="h-4 w-4" /> Overview
            </button>

            <div className="mb-1 mt-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Books
            </div>

            {spaces.map((space) => {
              const open = expanded.has(space.id);
              const isSel =
                selection.kind === "space" && selection.id === space.id;
              const cats = categories.filter((c) => c.space_id === space.id);
              return (
                <div key={space.id} className="mb-0.5">
                  <div
                    className={cn(
                      "group flex items-center gap-1 rounded-lg pr-1.5 transition-colors",
                      isSel ? "bg-primary/10" : "hover:bg-white/[0.04]",
                    )}
                  >
                    <button
                      onClick={() => toggle(space.id)}
                      className="grid h-7 w-6 place-items-center text-muted-foreground hover:text-foreground"
                      aria-label={open ? "Collapse" : "Expand"}
                    >
                      {open ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => setSelection({ kind: "space", id: space.id })}
                      className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm"
                    >
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full bg-gradient-to-br",
                          SPACE_ACCENT[space.id] ?? "from-primary to-primary/60",
                        )}
                      />
                      <span
                        className={cn(
                          "truncate font-medium",
                          isSel ? "text-primary" : "text-foreground",
                        )}
                      >
                        {space.name}
                      </span>
                    </button>
                  </div>
                  {open && (
                    <div className="ml-6 border-l border-border/40 pl-2">
                      {cats.map((cat) => {
                        const isCatSel =
                          selection.kind === "category" &&
                          selection.id === cat.id;
                        const pages = articles.filter(
                          (a) => a.category_id === cat.id,
                        );
                        return (
                          <div key={cat.id} className="py-0.5">
                            <button
                              onClick={() =>
                                setSelection({ kind: "category", id: cat.id })
                              }
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors",
                                isCatSel
                                  ? "bg-primary/10 text-primary"
                                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                              )}
                            >
                              <BookMarked className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              <span className="truncate">{cat.name}</span>
                            </button>
                            <div className="ml-5 border-l border-border/30 pl-2">
                              {pages.map((a) => {
                                const isASel =
                                  selection.kind === "article" &&
                                  selection.id === a.id;
                                return (
                                  <button
                                    key={a.id}
                                    onClick={() =>
                                      setSelection({ kind: "article", id: a.id })
                                    }
                                    className={cn(
                                      "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12.5px] transition-colors",
                                      isASel
                                        ? "bg-primary/15 text-primary"
                                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                                    )}
                                  >
                                    <FileText className="h-3 w-3 shrink-0 opacity-60" />
                                    <span className="truncate">{a.title}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="border-t border-border/50 p-3">
            <Button
              size="sm"
              variant="secondary"
              className="w-full justify-start"
              onClick={previewToast}
            >
              <Plus className="mr-2 h-3.5 w-3.5" /> New page
            </Button>
            <p className="mt-2 px-1 text-[10px] leading-relaxed text-muted-foreground">
              Preview workspace · sample data only. Editing is disabled.
            </p>
          </div>
        </div>
      </aside>

      {/* ───────── Main ───────── */}
      <section className="min-w-0">
        {selection.kind === "home" && (
          <HomePane
            spaces={spaces}
            articles={articles}
            recents={recents}
            tagsByArticle={tagsByArticle}
            onOpen={(id) => setSelection({ kind: "article", id })}
            onOpenSpace={(id) => setSelection({ kind: "space", id })}
          />
        )}
        {selection.kind === "space" && activeSpace && (
          <SpacePane
            space={activeSpace}
            categories={categories.filter((c) => c.space_id === activeSpace.id)}
            articles={articles.filter((a) => a.space_id === activeSpace.id)}
            tagsByArticle={tagsByArticle}
            onOpenArticle={(id) => setSelection({ kind: "article", id })}
            onOpenCategory={(id) => setSelection({ kind: "category", id })}
          />
        )}
        {selection.kind === "category" && activeCategory && (
          <CategoryPane
            category={activeCategory}
            space={
              spaces.find((s) => s.id === activeCategory.space_id) ?? null
            }
            articles={articles.filter(
              (a) => a.category_id === activeCategory.id,
            )}
            tagsByArticle={tagsByArticle}
            onOpenArticle={(id) => setSelection({ kind: "article", id })}
            onBack={() =>
              setSelection({ kind: "space", id: activeCategory.space_id })
            }
          />
        )}
        {selection.kind === "article" && activeArticle && (
          <ArticlePane
            article={activeArticle}
            space={
              spaces.find((s) => s.id === activeArticle.space_id) ?? null
            }
            category={
              categories.find((c) => c.id === activeArticle.category_id) ??
              null
            }
            articlesInCategory={articles.filter(
              (a) => a.category_id === activeArticle.category_id,
            )}
            articleTags={tagsByArticle.get(activeArticle.id) ?? []}
            onOpenArticle={(id) => setSelection({ kind: "article", id })}
            onOpenSpace={(id) => setSelection({ kind: "space", id })}
            onOpenCategory={(id) => setSelection({ kind: "category", id })}
          />
        )}

        {ql && (
          <SearchResults
            query={ql}
            results={matchedArticles}
            tagsByArticle={tagsByArticle}
            onOpen={(id) => setSelection({ kind: "article", id })}
          />
        )}
      </section>
    </div>
  );
}

/* ───────── Panes ───────── */

function HomePane({
  spaces,
  articles,
  recents,
  tagsByArticle,
  onOpen,
  onOpenSpace,
}: {
  spaces: KbSpace[];
  articles: KbArticle[];
  recents: KbArticle[];
  tagsByArticle: Map<string, string[]>;
  onOpen: (id: string) => void;
  onOpenSpace: (id: string) => void;
}) {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/15 via-card/60 to-card/40 p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-col gap-4">
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            <Sparkles className="h-3 w-3" /> Preview workspace
          </div>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
            Your team's living source of truth.
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground md:text-base">
            Browse runbooks, onboarding guides and architectural decisions —
            organised the way your engineers actually work.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-3 text-sm md:max-w-md">
            <Stat label="Books" value={spaces.length} />
            <Stat
              label="Published"
              value={articles.filter((a) => a.status === "published").length}
            />
            <Stat label="Total pages" value={articles.length} />
          </div>
        </div>
      </div>

      {/* Books grid */}
      <div>
        <SectionHeading
          icon={<Book className="h-4 w-4" />}
          title="Books"
          hint="Top-level collections, grouped by domain."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {spaces.map((s) => {
            const pages = articles.filter((a) => a.space_id === s.id).length;
            return (
              <button
                key={s.id}
                onClick={() => onOpenSpace(s.id)}
                className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/40 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/70"
              >
                <div
                  className={cn(
                    "absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
                    SPACE_ACCENT[s.id] ?? "from-primary to-primary/60",
                  )}
                />
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-md",
                      SPACE_ACCENT[s.id] ?? "from-primary to-primary/60",
                    )}
                  >
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold tracking-tight">
                      {s.name}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {s.description}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{pages} pages</span>
                  <span>Updated {formatDate(s.updated_at)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recents */}
      <div>
        <SectionHeading
          icon={<Clock className="h-4 w-4" />}
          title="Recently updated"
          hint="What changed in the last few days."
        />
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40 divide-y divide-border/40">
          {recents.map((a) => (
            <button
              key={a.id}
              onClick={() => onOpen(a.id)}
              className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-muted-foreground">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{a.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {a.excerpt}
                </div>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                {(tagsByArticle.get(a.id) ?? []).slice(0, 2).map((t) => (
                  <Badge
                    key={t}
                    variant="outline"
                    className="border-border/40 text-[10px] font-normal"
                  >
                    <TagIcon className="mr-1 h-2.5 w-2.5" /> {t}
                  </Badge>
                ))}
              </div>
              <StatusPill status={a.status} />
              <span className="hidden w-24 text-right text-[11px] text-muted-foreground md:inline">
                {formatDate(a.updated_at)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpacePane({
  space,
  categories,
  articles,
  tagsByArticle,
  onOpenArticle,
  onOpenCategory,
}: {
  space: KbSpace;
  categories: KbCategory[];
  articles: KbArticle[];
  tagsByArticle: Map<string, string[]>;
  onOpenArticle: (id: string) => void;
  onOpenCategory: (id: string) => void;
}) {
  return (
    <div className="space-y-8">
      <Header
        eyebrow="Book"
        title={space.name}
        description={space.description}
        accent={SPACE_ACCENT[space.id]}
      />
      {categories.map((c) => {
        const pages = articles.filter((a) => a.category_id === c.id);
        return (
          <div key={c.id}>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <button
                  onClick={() => onOpenCategory(c.id)}
                  className="text-lg font-semibold tracking-tight hover:text-primary"
                >
                  {c.name}
                </button>
                {c.description && (
                  <p className="text-sm text-muted-foreground">
                    {c.description}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {pages.length} pages
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {pages.map((a) => (
                <PageCard
                  key={a.id}
                  article={a}
                  tags={tagsByArticle.get(a.id) ?? []}
                  onOpen={() => onOpenArticle(a.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryPane({
  category,
  space,
  articles,
  tagsByArticle,
  onOpenArticle,
  onBack,
}: {
  category: KbCategory;
  space: KbSpace | null;
  articles: KbArticle[];
  tagsByArticle: Map<string, string[]>;
  onOpenArticle: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-xs text-muted-foreground">
        {space && (
          <button onClick={onBack} className="hover:text-foreground">
            {space.name}
          </button>
        )}
        <span className="mx-2 opacity-50">/</span>
        <span className="text-foreground">{category.name}</span>
      </div>
      <Header
        eyebrow="Chapter"
        title={category.name}
        description={category.description}
        accent={space ? SPACE_ACCENT[space.id] : undefined}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {articles.map((a) => (
          <PageCard
            key={a.id}
            article={a}
            tags={tagsByArticle.get(a.id) ?? []}
            onOpen={() => onOpenArticle(a.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ArticlePane({
  article,
  space,
  category,
  articlesInCategory,
  articleTags,
  onOpenArticle,
  onOpenSpace,
  onOpenCategory,
}: {
  article: KbArticle;
  space: KbSpace | null;
  category: KbCategory | null;
  articlesInCategory: KbArticle[];
  articleTags: string[];
  onOpenArticle: (id: string) => void;
  onOpenSpace: (id: string) => void;
  onOpenCategory: (id: string) => void;
}) {
  const idx = articlesInCategory.findIndex((a) => a.id === article.id);
  const prev = idx > 0 ? articlesInCategory[idx - 1] : null;
  const next =
    idx >= 0 && idx < articlesInCategory.length - 1
      ? articlesInCategory[idx + 1]
      : null;

  return (
    <article className="space-y-8">
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {space && (
          <button
            onClick={() => onOpenSpace(space.id)}
            className="hover:text-foreground"
          >
            {space.name}
          </button>
        )}
        {category && (
          <>
            <ChevronRight className="h-3 w-3 opacity-60" />
            <button
              onClick={() => onOpenCategory(category.id)}
              className="hover:text-foreground"
            >
              {category.name}
            </button>
          </>
        )}
        <ChevronRight className="h-3 w-3 opacity-60" />
        <span className="text-primary">{article.title}</span>
      </nav>

      <header className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {article.title}
            </h1>
            {article.excerpt && (
              <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
                {article.excerpt}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={previewToast}
              aria-label="Favorite"
            >
              <Star className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-8"
              onClick={previewToast}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusPill status={article.status} />
          {articleTags.map((t) => (
            <Badge
              key={t}
              variant="outline"
              className="border-border/40 text-[10px] font-normal"
            >
              <TagIcon className="mr-1 h-2.5 w-2.5" /> {t}
            </Badge>
          ))}
          <span className="opacity-60">·</span>
          <span>Updated {formatDate(article.updated_at)}</span>
          <span className="opacity-60">·</span>
          <span>v{article.revision_number}</span>
        </div>
      </header>

      <div className="rounded-2xl border border-border/60 bg-card/30 px-8 py-10">
        <div className="kb-manuscript max-w-3xl">
          <Markdown source={article.content_markdown ?? "_Empty page._"} />
        </div>
      </div>

      {(prev || next) && (
        <div className="grid grid-cols-2 gap-3">
          {prev ? (
            <button
              onClick={() => onOpenArticle(prev.id)}
              className="rounded-xl border border-border/60 bg-card/30 p-4 text-left transition-colors hover:border-primary/40 hover:bg-card/60"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                ← Previous
              </div>
              <div className="mt-1 truncate text-sm font-medium">
                {prev.title}
              </div>
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button
              onClick={() => onOpenArticle(next.id)}
              className="rounded-xl border border-border/60 bg-card/30 p-4 text-right transition-colors hover:border-primary/40 hover:bg-card/60"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Next →
              </div>
              <div className="mt-1 truncate text-sm font-medium">
                {next.title}
              </div>
            </button>
          ) : (
            <span />
          )}
        </div>
      )}
    </article>
  );
}

function SearchResults({
  query,
  results,
  tagsByArticle,
  onOpen,
}: {
  query: string;
  results: KbArticle[];
  tagsByArticle: Map<string, string[]>;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mt-8 rounded-2xl border border-border/60 bg-card/40 p-5">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        <span>
          {results.length} result{results.length === 1 ? "" : "s"} for "
          <span className="text-foreground">{query}</span>"
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {results.map((a) => (
          <button
            key={a.id}
            onClick={() => onOpen(a.id)}
            className="flex w-full items-start gap-3 py-3 text-left hover:text-primary"
          >
            <FileText className="mt-1 h-4 w-4 shrink-0 opacity-60" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{a.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {a.excerpt}
              </div>
            </div>
            <div className="hidden items-center gap-1.5 sm:flex">
              {(tagsByArticle.get(a.id) ?? []).slice(0, 2).map((t) => (
                <Badge
                  key={t}
                  variant="outline"
                  className="border-border/40 text-[10px] font-normal"
                >
                  {t}
                </Badge>
              ))}
            </div>
          </button>
        ))}
        {results.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nothing matched. Try a different keyword.
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── Small bits ───────── */

function PageCard({
  article,
  tags,
  onOpen,
}: {
  article: KbArticle;
  tags: string[];
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/70"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight group-hover:text-primary">
            {article.title}
          </div>
          {article.excerpt && (
            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {article.excerpt}
            </div>
          )}
        </div>
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap gap-1.5">
          <StatusPill status={article.status} />
          {tags.slice(0, 2).map((t) => (
            <Badge
              key={t}
              variant="outline"
              className="border-border/40 text-[10px] font-normal"
            >
              {t}
            </Badge>
          ))}
        </div>
        <span>{formatDate(article.updated_at)}</span>
      </div>
    </button>
  );
}

function Header({
  eyebrow,
  title,
  description,
  accent,
}: {
  eyebrow: string;
  title: string;
  description?: string | null;
  accent?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-7">
      {accent && (
        <div
          className={cn(
            "absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
            accent,
          )}
        />
      )}
      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        {eyebrow}
      </div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
        {title}
      </h1>
      {description && (
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          {description}
        </p>
      )}
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-white/[0.05] text-primary">
          {icon}
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-3 py-2">
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: KbArticle["status"] }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        s.cls,
      )}
    >
      {s.label}
    </span>
  );
}
