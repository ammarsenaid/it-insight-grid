import { useEffect, useMemo, useState } from "react";
import {
  Library,
  FolderTree,
  FileText,
  ChevronRight,
  ChevronDown,
  Search as SearchIcon,
  History,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Markdown } from "@/components/common/Markdown";
import { formatDate } from "@/components/common/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  fetchArticleRevisions,
  useKnowledgeBackend,
} from "@/lib/knowledge/useKnowledgeBackend";
import type {
  KbArticle,
  KbCategory,
  KbRevision,
  KbSpace,
} from "@/lib/knowledge/backend-types";

type Selection =
  | { kind: "space"; id: string }
  | { kind: "category"; id: string }
  | { kind: "article"; id: string }
  | null;

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

export function KnowledgeBackendWorkspace() {
  const { teams, contextLoading, contextError, refresh, loading: authLoading } = useAuth();

  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  // Auto-select team
  useEffect(() => {
    if (teams.length === 0) {
      setActiveTeamId(null);
    } else if (!activeTeamId || !teams.find((t) => t.id === activeTeamId)) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams, activeTeamId]);

  const { data, loading, error, reload } = useKnowledgeBackend(activeTeamId);

  const [selection, setSelection] = useState<Selection>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Reset selection when team changes
  useEffect(() => {
    setSelection(null);
    setExpanded(new Set());
  }, [activeTeamId]);

  // Auto-expand all spaces once data loads
  useEffect(() => {
    if (data && expanded.size === 0 && data.spaces.length > 0) {
      setExpanded(new Set(data.spaces.map((s) => s.id)));
    }
  }, [data, expanded.size]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ------- Auth/team gating -------
  if (authLoading || contextLoading) {
    return <WorkspaceSkeleton />;
  }

  if (contextError) {
    return (
      <ErrorState
        title="Account context failed"
        message={contextError}
        onRetry={() => void refresh()}
      />
    );
  }

  if (teams.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
        <Library className="mx-auto mb-3 h-8 w-8 opacity-60" />
        <div className="text-base font-medium text-foreground">No accessible team was found</div>
        <p className="mx-auto mt-2 max-w-md">
          You don&apos;t have visibility on any team yet. Ask an administrator to grant your
          account access to a team before browsing the knowledge base.
        </p>
      </div>
    );
  }

  // ------- Workspace -------
  const tagsByArticle = new Map<string, string[]>();
  if (data) {
    const tagName = new Map(data.tags.map((t) => [t.id, t.name]));
    for (const at of data.articleTags) {
      const list = tagsByArticle.get(at.article_id) ?? [];
      const n = tagName.get(at.tag_id);
      if (n) list.push(n);
      tagsByArticle.set(at.article_id, list);
    }
  }

  const ql = query.trim().toLowerCase();
  const matchedArticleIds = useMemoMatched(data?.articles ?? [], tagsByArticle, ql);

  return (
    <div className="space-y-3">
      {/* Header / status bar */}
      <div className="glass-card flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Team</span>
          {teams.length === 1 ? (
            <Badge variant="secondary" className="h-6">
              {teams[0].name}
            </Badge>
          ) : (
            <Select value={activeTeamId ?? undefined} onValueChange={(v) => setActiveTeamId(v)}>
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge className="h-6 border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
            Backend connected
          </Badge>
          <Badge variant="outline" className="h-6 text-[10px]">
            Read-only · Phase 2A
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => void reload()}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1 h-3 w-3", loading && "animate-spin")} /> Reload
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Tree */}
        <aside className="glass-card flex h-[calc(100vh-280px)] min-h-[480px] flex-col rounded-2xl p-3">
          <div className="relative mb-2">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-sm">
            {loading && !data ? (
              <TreeSkeleton />
            ) : error ? (
              <InlineError message={error} onRetry={() => void reload()} />
            ) : !data || data.spaces.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
                No spaces in this team yet.
              </div>
            ) : (
              <ul className="space-y-0.5">
                {data.spaces.map((space) => (
                  <SpaceRow
                    key={space.id}
                    space={space}
                    categories={data.categories.filter((c) => c.space_id === space.id)}
                    articles={data.articles.filter((a) => a.space_id === space.id)}
                    expanded={expanded}
                    toggle={toggle}
                    selection={selection}
                    onSelect={setSelection}
                    filter={ql}
                    matched={matchedArticleIds}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Main */}
        <section className="glass-card flex h-[calc(100vh-280px)] min-h-[480px] flex-col overflow-hidden rounded-2xl p-4">
          {loading && !data ? (
            <ContentSkeleton />
          ) : error ? (
            <InlineError message={error} onRetry={() => void reload()} />
          ) : !data ? null : (
            <SelectionView
              data={data}
              selection={selection}
              tagsByArticle={tagsByArticle}
              teamId={activeTeamId!}
              onOpenArticle={(id) => setSelection({ kind: "article", id })}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function useMemoMatched(
  articles: KbArticle[],
  tagsByArticle: Map<string, string[]>,
  ql: string,
): Set<string> | null {
  return useMemo(() => {
    if (!ql) return null;
    const m = new Set<string>();
    for (const a of articles) {
      const hay = `${a.title} ${a.excerpt ?? ""} ${(tagsByArticle.get(a.id) ?? []).join(" ")}`.toLowerCase();
      if (hay.includes(ql)) m.add(a.id);
    }
    return m;
  }, [articles, tagsByArticle, ql]);
}

// ----------------- Tree rows -----------------

function SpaceRow({
  space,
  categories,
  articles,
  expanded,
  toggle,
  selection,
  onSelect,
  filter,
  matched,
}: {
  space: KbSpace;
  categories: KbCategory[];
  articles: KbArticle[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  filter: string;
  matched: Set<string> | null;
}) {
  const isOpen = expanded.has(space.id) || !!filter;
  const isSelected = selection?.kind === "space" && selection.id === space.id;
  const uncategorized = articles.filter((a) => !a.category_id);

  // Search-visibility for the whole space: any article matches or space name matches.
  if (matched) {
    const anyMatch =
      space.name.toLowerCase().includes(filter) ||
      articles.some((a) => matched.has(a.id));
    if (!anyMatch) return null;
  }

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md py-1 pr-1 text-sm",
          isSelected && "bg-primary/15 text-primary",
        )}
      >
        <button
          type="button"
          onClick={() => toggle(space.id)}
          className="flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => onSelect({ kind: "space", id: space.id })}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <Library className="h-3.5 w-3.5 text-primary" />
          <span className="truncate font-semibold">{space.name}</span>
        </button>
      </div>

      {isOpen && (
        <ul className="ml-3 space-y-0.5 border-l border-border/30 pl-2">
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              articles={articles.filter((a) => a.category_id === c.id)}
              expanded={expanded}
              toggle={toggle}
              selection={selection}
              onSelect={onSelect}
              filter={filter}
              matched={matched}
            />
          ))}
          {uncategorized.map((a) => (
            <ArticleRow
              key={a.id}
              article={a}
              selection={selection}
              onSelect={onSelect}
              matched={matched}
            />
          ))}
          {categories.length === 0 && uncategorized.length === 0 && (
            <li className="px-2 py-1 text-[11px] text-muted-foreground/70">Empty space</li>
          )}
        </ul>
      )}
    </li>
  );
}

function CategoryRow({
  category,
  articles,
  expanded,
  toggle,
  selection,
  onSelect,
  filter,
  matched,
}: {
  category: KbCategory;
  articles: KbArticle[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  filter: string;
  matched: Set<string> | null;
}) {
  const isOpen = expanded.has(category.id) || !!filter;
  const isSelected = selection?.kind === "category" && selection.id === category.id;

  if (matched) {
    const anyMatch =
      category.name.toLowerCase().includes(filter) ||
      articles.some((a) => matched.has(a.id));
    if (!anyMatch) return null;
  }

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md py-1 pr-1 text-sm",
          isSelected && "bg-primary/15 text-primary",
        )}
      >
        <button
          type="button"
          onClick={() => toggle(category.id)}
          className="flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => onSelect({ kind: "category", id: category.id })}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <FolderTree className="h-3.5 w-3.5 text-primary/70" />
          <span className="truncate font-medium">{category.name}</span>
          <span className="ml-auto text-[10px] text-muted-foreground/70">{articles.length}</span>
        </button>
      </div>
      {isOpen && (
        <ul className="ml-3 space-y-0.5 border-l border-border/30 pl-2">
          {articles.map((a) => (
            <ArticleRow
              key={a.id}
              article={a}
              selection={selection}
              onSelect={onSelect}
              matched={matched}
            />
          ))}
          {articles.length === 0 && (
            <li className="px-2 py-1 text-[11px] text-muted-foreground/70">No articles</li>
          )}
        </ul>
      )}
    </li>
  );
}

function ArticleRow({
  article,
  selection,
  onSelect,
  matched,
}: {
  article: KbArticle;
  selection: Selection;
  onSelect: (s: Selection) => void;
  matched: Set<string> | null;
}) {
  if (matched && !matched.has(article.id)) return null;
  const isSelected = selection?.kind === "article" && selection.id === article.id;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect({ kind: "article", id: article.id })}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-white/[0.04]",
          isSelected && "bg-primary/15 text-primary",
        )}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{article.title}</span>
      </button>
    </li>
  );
}

// ----------------- Main content -----------------

function SelectionView({
  data,
  selection,
  tagsByArticle,
  teamId,
  onOpenArticle,
}: {
  data: ReturnType<typeof useKnowledgeBackend>["data"];
  selection: Selection;
  tagsByArticle: Map<string, string[]>;
  teamId: string;
  onOpenArticle: (id: string) => void;
}) {
  if (!data) return null;

  if (!selection) {
    return (
      <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
        <div>
          <FileText className="mx-auto mb-2 h-6 w-6 opacity-60" />
          Select a Space, Category, or Article on the left.
        </div>
      </div>
    );
  }

  if (selection.kind === "space") {
    const space = data.spaces.find((s) => s.id === selection.id);
    if (!space) return <NotFound />;
    const cats = data.categories.filter((c) => c.space_id === space.id);
    const arts = data.articles.filter((a) => a.space_id === space.id);
    return (
      <div className="space-y-3 overflow-y-auto">
        <Header
          icon={<Library className="h-4 w-4 text-primary" />}
          label="Space"
          title={space.name}
          subtitle={space.description ?? undefined}
        />
        <Meta items={[
          ["Slug", space.slug],
          ["Updated", formatDate(space.updated_at)],
          ["Archived", space.is_archived ? "Yes" : "No"],
        ]} />
        <ArticleTable articles={arts} categories={cats} onOpen={onOpenArticle} />
      </div>
    );
  }

  if (selection.kind === "category") {
    const cat = data.categories.find((c) => c.id === selection.id);
    if (!cat) return <NotFound />;
    const space = data.spaces.find((s) => s.id === cat.space_id);
    const arts = data.articles.filter((a) => a.category_id === cat.id);
    return (
      <div className="space-y-3 overflow-y-auto">
        <Header
          icon={<FolderTree className="h-4 w-4 text-primary/80" />}
          label="Category"
          title={cat.name}
          subtitle={cat.description ?? undefined}
          breadcrumb={space?.name}
        />
        <Meta items={[
          ["Slug", cat.slug],
          ["Sort order", String(cat.sort_order)],
          ["Updated", formatDate(cat.updated_at)],
        ]} />
        <ArticleTable articles={arts} categories={[cat]} onOpen={onOpenArticle} />
      </div>
    );
  }

  // article
  const art = data.articles.find((a) => a.id === selection.id);
  if (!art) return <NotFound />;
  const space = data.spaces.find((s) => s.id === art.space_id);
  const cat = art.category_id ? data.categories.find((c) => c.id === art.category_id) : null;
  const tags = tagsByArticle.get(art.id) ?? [];
  return (
    <ArticleView
      article={art}
      tags={tags}
      breadcrumb={[space?.name, cat?.name].filter(Boolean).join(" / ")}
      teamId={teamId}
    />
  );
}

function Header({
  icon,
  label,
  title,
  subtitle,
  breadcrumb,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  subtitle?: string;
  breadcrumb?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
        {breadcrumb && (
          <>
            <ChevronRight className="h-3 w-3" />
            <span className="normal-case tracking-normal">{breadcrumb}</span>
          </>
        )}
      </div>
      <h2 className="mt-1 text-xl font-semibold">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function Meta({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="flex flex-wrap gap-3 rounded-lg border border-border/40 bg-white/[0.02] p-2 text-xs text-muted-foreground">
      {items.map(([k, v]) => (
        <div key={k}>
          <span className="text-muted-foreground/70">{k}: </span>
          <span className="text-foreground/80">{v}</span>
        </div>
      ))}
    </div>
  );
}

function ArticleTable({
  articles,
  categories,
  onOpen,
}: {
  articles: KbArticle[];
  categories: KbCategory[];
  onOpen: (id: string) => void;
}) {
  if (articles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">
        No articles here.
      </div>
    );
  }
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  return (
    <div className="overflow-hidden rounded-xl border border-border/40">
      <table className="min-w-full text-sm">
        <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Rev</th>
            <th className="px-3 py-2 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {articles.map((a) => (
            <tr
              key={a.id}
              className="cursor-pointer hover:bg-white/[0.03]"
              onClick={() => onOpen(a.id)}
            >
              <td className="px-3 py-2">
                <div className="font-medium">{a.title}</div>
                {a.excerpt && (
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.excerpt}</div>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {a.category_id ? catName.get(a.category_id) ?? "—" : "—"}
              </td>
              <td className="px-3 py-2 text-xs">
                <Badge variant="outline" className="h-5">{STATUS_LABEL[a.status] ?? a.status}</Badge>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{a.revision_number}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(a.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArticleView({
  article,
  tags,
  breadcrumb,
  teamId,
}: {
  article: KbArticle;
  tags: string[];
  breadcrumb: string;
  teamId: string;
}) {
  const [showRevisions, setShowRevisions] = useState(false);
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div>
        <Header
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          label="Article"
          title={article.title}
          subtitle={article.excerpt ?? undefined}
          breadcrumb={breadcrumb || undefined}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">{STATUS_LABEL[article.status] ?? article.status}</Badge>
          <Badge variant="outline">{article.visibility}</Badge>
          <Badge variant="outline">rev {article.revision_number}</Badge>
          {article.published_at && (
            <span className="text-muted-foreground">
              Published {formatDate(article.published_at)}
            </span>
          )}
          <span className="text-muted-foreground">Updated {formatDate(article.updated_at)}</span>
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="h-5 text-[10px]">
                  #{t}
                </Badge>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 px-2 text-xs"
            onClick={() => setShowRevisions((v) => !v)}
          >
            <History className="mr-1 h-3 w-3" />
            {showRevisions ? "Hide history" : "Revision history"}
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-h-0 overflow-y-auto rounded-xl border border-border/40 bg-white/[0.02] p-4">
          {article.content_markdown ? (
            <Markdown source={article.content_markdown} />
          ) : (
            <p className="text-sm text-muted-foreground">This article has no content yet.</p>
          )}
        </div>
        {showRevisions && (
          <RevisionsPanel articleId={article.id} teamId={teamId} />
        )}
      </div>
    </div>
  );
}

function RevisionsPanel({ articleId, teamId }: { articleId: string; teamId: string }) {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    revs: KbRevision[];
  }>({ loading: true, error: null, revs: [] });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, revs: [] });
    void fetchArticleRevisions(articleId, teamId).then((res) => {
      if (cancelled) return;
      if (res.error) setState({ loading: false, error: res.error, revs: [] });
      else setState({ loading: false, error: null, revs: res.data ?? [] });
    });
    return () => {
      cancelled = true;
    };
  }, [articleId, teamId]);

  return (
    <aside className="min-h-0 overflow-y-auto rounded-xl border border-border/40 bg-white/[0.02] p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Revision history
      </div>
      {state.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : state.error ? (
        <div className="text-xs text-destructive">{state.error}</div>
      ) : state.revs.length === 0 ? (
        <div className="text-xs text-muted-foreground">No revisions recorded.</div>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {state.revs.map((r) => (
            <li key={r.id} className="rounded-md border border-border/30 p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">v{r.version_number}</span>
                <Badge variant="outline" className="h-4 text-[10px]">
                  {STATUS_LABEL[r.status] ?? r.status}
                </Badge>
              </div>
              <div className="mt-0.5 text-muted-foreground">{formatDate(r.created_at)}</div>
              <div className="mt-0.5 truncate text-foreground/80">{r.title}</div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

// ----------------- States -----------------

function WorkspaceSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Skeleton className="h-[480px] rounded-2xl" />
      <Skeleton className="h-[480px] rounded-2xl" />
    </div>
  );
}

function TreeSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="glass-card flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
      <AlertCircle className="h-6 w-6 text-destructive" />
      <div>
        <div className="text-base font-medium">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button size="sm" onClick={onRetry}>
        <RefreshCw className="mr-1 h-3 w-3" /> Retry
      </Button>
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-destructive" />
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw className="mr-1 h-3 w-3" /> Retry
        </Button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">
      Item not found.
    </div>
  );
}
