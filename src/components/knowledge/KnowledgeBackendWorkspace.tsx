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
  Plus,
  Pencil,
  Archive,
  RotateCcw,
  Trash2,
  Tags as TagsIcon,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
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
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  fetchArticleRevisions,
  useKnowledgeBackend,
} from "@/lib/knowledge/useKnowledgeBackend";
import { useKnowledgePermissions } from "@/lib/knowledge/permissions";
import {
  deleteArticle,
  deleteCategory,
  deleteSpace,
  restoreArticleRevision,
  updateCategory,
  updateSpace,
} from "@/lib/knowledge/mutations";
import { SpaceFormDialog } from "./dialogs/SpaceFormDialog";
import { CategoryFormDialog } from "./dialogs/CategoryFormDialog";
import { ArticleFormDialog } from "./dialogs/ArticleFormDialog";
import { TagsEditorDialog } from "./dialogs/TagsEditorDialog";
import { ArticleContentEditor } from "./ArticleContentEditor";
import { ReviewTimelinePanel } from "./ReviewTimelinePanel";
import { AttachmentsPanel } from "./AttachmentsPanel";
import type {
  ArticleStatus,
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

type StatusFilter = "all" | ArticleStatus;

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

  useEffect(() => {
    if (teams.length === 0) {
      setActiveTeamId(null);
    } else if (!activeTeamId || !teams.find((t) => t.id === activeTeamId)) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams, activeTeamId]);

  const { data, loading, error, reload } = useKnowledgeBackend(activeTeamId);
  const { perms } = useKnowledgePermissions(activeTeamId);

  const [selection, setSelection] = useState<Selection>(null);
  const [editingArticle, setEditingArticle] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | "">("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Dialogs
  const [spaceDialog, setSpaceDialog] = useState<{ open: boolean; initial: KbSpace | null }>({
    open: false,
    initial: null,
  });
  const [categoryDialog, setCategoryDialog] = useState<{
    open: boolean; initial: KbCategory | null; spaceId: string | null;
  }>({ open: false, initial: null, spaceId: null });
  const [articleDialog, setArticleDialog] = useState<{
    open: boolean; initial: KbArticle | null; spaceId?: string; categoryId?: string | null;
  }>({ open: false, initial: null });
  const [tagsDialog, setTagsDialog] = useState<{
    open: boolean; articleId?: string;
  }>({ open: false });
  const [confirm, setConfirm] = useState<{
    open: boolean; title: string; description?: string; destructive?: boolean; onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    setSelection(null);
    setEditingArticle(false);
    setExpanded(new Set());
    setStatusFilter("all");
    setShowArchived(false);
    setTagFilter("");
  }, [activeTeamId]);

  useEffect(() => {
    if (data && expanded.size === 0 && data.spaces.length > 0) {
      setExpanded(new Set(data.spaces.filter((s) => !s.is_archived).map((s) => s.id)));
    }
  }, [data, expanded.size]);

  // Leave edit mode when switching to a non-article selection
  useEffect(() => {
    if (!selection || selection.kind !== "article") setEditingArticle(false);
  }, [selection]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // ---- Derived ----
  const tagsByArticle = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!data) return map;
    const tagName = new Map(data.tags.map((t) => [t.id, t.name]));
    for (const at of data.articleTags) {
      const list = map.get(at.article_id) ?? [];
      const n = tagName.get(at.tag_id);
      if (n) list.push(n);
      map.set(at.article_id, list);
    }
    return map;
  }, [data]);

  const tagIdsByArticle = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!data) return map;
    for (const at of data.articleTags) {
      const s = map.get(at.article_id) ?? new Set<string>();
      s.add(at.tag_id);
      map.set(at.article_id, s);
    }
    return map;
  }, [data]);

  const ql = query.trim().toLowerCase();

  const filteredArticleIds = useMemo(() => {
    if (!data) return null;
    const filter = ql || statusFilter !== "all" || tagFilter || !showArchived;
    if (!filter) return null;
    const m = new Set<string>();
    for (const a of data.articles) {
      if (!showArchived && a.status === "archived") continue;
      if (statusFilter !== "all" && a.status !== statusFilter) continue;
      if (tagFilter && !(tagIdsByArticle.get(a.id)?.has(tagFilter))) continue;
      if (ql) {
        const hay = `${a.title} ${a.excerpt ?? ""} ${(tagsByArticle.get(a.id) ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(ql)) continue;
      }
      m.add(a.id);
    }
    return m;
  }, [data, ql, statusFilter, tagFilter, showArchived, tagIdsByArticle, tagsByArticle]);

  // ---- Auth/team gating ----
  if (authLoading || contextLoading) return <WorkspaceSkeleton />;
  if (contextError) {
    return <ErrorState title="Account context failed" message={contextError} onRetry={() => void refresh()} />;
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

  // Mutation handlers shared by tree + selection panel
  const handleArchiveSpace = (s: KbSpace) =>
    setConfirm({
      open: true,
      title: s.is_archived ? "Restore space" : "Archive space",
      description: s.is_archived
        ? `"${s.name}" will become visible again.`
        : `"${s.name}" will be hidden from the default view. Categories and articles inside it remain in the database.`,
      onConfirm: async () => {
        const r = await updateSpace({ id: s.id, is_archived: !s.is_archived });
        if (r.error) toast.error(r.error); else { toast.success(s.is_archived ? "Space restored." : "Space archived."); reload(); }
      },
    });

  const handleDeleteSpace = (s: KbSpace) =>
    setConfirm({
      open: true, destructive: true,
      title: "Delete space",
      description: `Permanently delete "${s.name}" and ALL categories and articles inside it. This cannot be undone.`,
      onConfirm: async () => {
        const r = await deleteSpace(s.id);
        if (r.error) toast.error(r.error); else { toast.success("Space deleted."); if (selection?.kind === "space" && selection.id === s.id) setSelection(null); reload(); }
      },
    });

  const handleArchiveCategory = (c: KbCategory) =>
    setConfirm({
      open: true,
      title: c.is_archived ? "Restore category" : "Archive category",
      description: c.is_archived ? `"${c.name}" will be visible again.` : `"${c.name}" will be hidden from the default view.`,
      onConfirm: async () => {
        const r = await updateCategory({ id: c.id, is_archived: !c.is_archived });
        if (r.error) toast.error(r.error); else { toast.success(c.is_archived ? "Category restored." : "Category archived."); reload(); }
      },
    });

  const handleDeleteCategory = (c: KbCategory) =>
    setConfirm({
      open: true, destructive: true,
      title: "Delete category",
      description: `Permanently delete "${c.name}". Articles in it must first be moved or deleted (DB will block otherwise).`,
      onConfirm: async () => {
        const r = await deleteCategory(c.id);
        if (r.error) toast.error(r.error); else { toast.success("Category deleted."); if (selection?.kind === "category" && selection.id === c.id) setSelection(null); reload(); }
      },
    });

  const handleDeleteArticle = (a: KbArticle) =>
    setConfirm({
      open: true, destructive: true,
      title: "Delete article",
      description: `Permanently delete "${a.title}" and its revision history. This cannot be undone.`,
      onConfirm: async () => {
        const r = await deleteArticle(a.id);
        if (r.error) toast.error(r.error); else { toast.success("Article deleted."); if (selection?.kind === "article" && selection.id === a.id) setSelection(null); reload(); }
      },
    });

  return (
    <div className="space-y-3">
      {/* Header / status bar */}
      <div className="glass-card flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Team</span>
          {teams.length === 1 ? (
            <Badge variant="secondary" className="h-6">{teams[0].name}</Badge>
          ) : (
            <Select value={activeTeamId ?? undefined} onValueChange={(v) => setActiveTeamId(v)}>
              <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder="Select a team" /></SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {perms.manageTeam && (
            <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setSpaceDialog({ open: true, initial: null })}>
              <Plus className="mr-1 h-3 w-3" /> New space
            </Button>
          )}
          {perms.create && data && data.spaces.some((s) => !s.is_archived) && (
            <Button size="sm" variant="secondary" className="h-7 text-xs"
              onClick={() => setArticleDialog({ open: true, initial: null, spaceId: data.spaces.find((s) => !s.is_archived)!.id, categoryId: null })}>
              <Plus className="mr-1 h-3 w-3" /> New article
            </Button>
          )}
          {perms.update && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setTagsDialog({ open: true })}>
              <TagsIcon className="mr-1 h-3 w-3" /> Tags
            </Button>
          )}
          <Badge className="h-6 border-emerald-500/40 bg-emerald-500/10 text-emerald-300">Backend connected</Badge>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={cn("mr-1 h-3 w-3", loading && "animate-spin")} /> Reload
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
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

          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="h-7 w-[120px] text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            {data && data.tags.length > 0 && (
              <Select value={tagFilter || "__all__"} onValueChange={(v) => setTagFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-7 w-[120px] text-[11px]"><SelectValue placeholder="Tag" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All tags</SelectItem>
                  {data.tags.map((t) => <SelectItem key={t.id} value={t.id}>#{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <label className="ml-auto flex items-center gap-1 text-muted-foreground">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3 w-3 accent-primary" />
              Archived
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1 text-sm">
            {loading && !data ? (
              <TreeSkeleton />
            ) : error ? (
              <InlineError message={error} onRetry={() => void reload()} />
            ) : !data || data.spaces.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
                {perms.manageTeam ? "No spaces yet — create the first one to begin." : "No spaces in this team yet."}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {data.spaces
                  .filter((s) => showArchived || !s.is_archived)
                  .map((space) => (
                    <SpaceRow
                      key={space.id}
                      space={space}
                      categories={data.categories.filter((c) => c.space_id === space.id && (showArchived || !c.is_archived))}
                      articles={data.articles.filter((a) => a.space_id === space.id)}
                      expanded={expanded}
                      toggle={toggle}
                      selection={selection}
                      onSelect={setSelection}
                      matched={filteredArticleIds}
                      filterActive={!!ql || statusFilter !== "all" || !!tagFilter}
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
              tagIdsByArticle={tagIdsByArticle}
              teamId={activeTeamId!}
              perms={perms}
              editingArticle={editingArticle}
              setEditingArticle={setEditingArticle}
              onOpenArticle={(id) => { setSelection({ kind: "article", id }); setEditingArticle(false); }}
              onNewSpace={() => setSpaceDialog({ open: true, initial: null })}
              onEditSpace={(s) => setSpaceDialog({ open: true, initial: s })}
              onArchiveSpace={handleArchiveSpace}
              onDeleteSpace={handleDeleteSpace}
              onNewCategory={(spaceId, sortOrder) => setCategoryDialog({ open: true, initial: null, spaceId })}
              onEditCategory={(c) => setCategoryDialog({ open: true, initial: c, spaceId: c.space_id })}
              onArchiveCategory={handleArchiveCategory}
              onDeleteCategory={handleDeleteCategory}
              onNewArticle={(spaceId, categoryId) => setArticleDialog({ open: true, initial: null, spaceId, categoryId })}
              onEditArticleMeta={(a) => setArticleDialog({ open: true, initial: a })}
              onDeleteArticle={handleDeleteArticle}
              onEditArticleTags={(a) => setTagsDialog({ open: true, articleId: a.id })}
              onReload={reload}
            />
          )}
        </section>
      </div>

      {/* Dialogs */}
      {activeTeamId && (
        <>
          <SpaceFormDialog
            open={spaceDialog.open}
            onOpenChange={(o) => setSpaceDialog((s) => ({ ...s, open: o }))}
            teamId={activeTeamId}
            initial={spaceDialog.initial}
            onSaved={(id) => { reload(); setSelection({ kind: "space", id }); }}
          />
          {categoryDialog.spaceId && (
            <CategoryFormDialog
              open={categoryDialog.open}
              onOpenChange={(o) => setCategoryDialog((s) => ({ ...s, open: o }))}
              teamId={activeTeamId}
              spaceId={categoryDialog.spaceId}
              initial={categoryDialog.initial}
              defaultSortOrder={
                data ? data.categories.filter((c) => c.space_id === categoryDialog.spaceId).length * 10 : 0
              }
              onSaved={(id) => { reload(); setSelection({ kind: "category", id }); }}
            />
          )}
          <ArticleFormDialog
            open={articleDialog.open}
            onOpenChange={(o) => setArticleDialog((s) => ({ ...s, open: o }))}
            teamId={activeTeamId}
            spaces={data?.spaces ?? []}
            categories={data?.categories ?? []}
            initial={articleDialog.initial}
            defaultSpaceId={articleDialog.spaceId}
            defaultCategoryId={articleDialog.categoryId ?? null}
            onSaved={(id) => { reload(); setSelection({ kind: "article", id }); }}
          />
          <TagsEditorDialog
            open={tagsDialog.open}
            onOpenChange={(o) => setTagsDialog((s) => ({ ...s, open: o }))}
            teamId={activeTeamId}
            articleId={tagsDialog.articleId}
            allTags={data?.tags ?? []}
            assignedTagIds={tagsDialog.articleId ? tagIdsByArticle.get(tagsDialog.articleId) : undefined}
            canUpdate={perms.update}
            canDelete={perms.delete}
            onChange={reload}
          />
        </>
      )}
      {confirm && (
        <ConfirmDialog
          open={confirm.open}
          onOpenChange={(o) => setConfirm((c) => (c ? { ...c, open: o } : c))}
          title={confirm.title}
          description={confirm.description}
          destructive={confirm.destructive}
          confirmLabel={confirm.destructive ? "Delete" : "Confirm"}
          onConfirm={() => { confirm.onConfirm(); setConfirm(null); }}
        />
      )}
    </div>
  );
}

// ----------------- Tree rows -----------------

function SpaceRow({
  space, categories, articles, expanded, toggle, selection, onSelect, matched, filterActive,
}: {
  space: KbSpace;
  categories: KbCategory[];
  articles: KbArticle[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  matched: Set<string> | null;
  filterActive: boolean;
}) {
  const isOpen = expanded.has(space.id) || filterActive;
  const isSelected = selection?.kind === "space" && selection.id === space.id;
  const visibleArticles = matched ? articles.filter((a) => matched.has(a.id)) : articles;
  const uncategorized = visibleArticles.filter((a) => !a.category_id);

  if (filterActive && visibleArticles.length === 0 && !space.name.toLowerCase().includes("")) {
    // never matches filter; keep tree clean
    return null;
  }

  return (
    <li>
      <div className={cn("group flex items-center gap-1 rounded-md py-1 pr-1 text-sm", isSelected && "bg-primary/15 text-primary")}>
        <button type="button" onClick={() => toggle(space.id)} className="flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={() => onSelect({ kind: "space", id: space.id })} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <Library className={cn("h-3.5 w-3.5", space.is_archived ? "text-muted-foreground" : "text-primary")} />
          <span className={cn("truncate font-semibold", space.is_archived && "italic text-muted-foreground")}>{space.name}</span>
        </button>
      </div>

      {isOpen && (
        <ul className="ml-3 space-y-0.5 border-l border-border/30 pl-2">
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              articles={visibleArticles.filter((a) => a.category_id === c.id)}
              expanded={expanded}
              toggle={toggle}
              selection={selection}
              onSelect={onSelect}
              filterActive={filterActive}
            />
          ))}
          {uncategorized.map((a) => (
            <ArticleRow key={a.id} article={a} selection={selection} onSelect={onSelect} />
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
  category, articles, expanded, toggle, selection, onSelect, filterActive,
}: {
  category: KbCategory;
  articles: KbArticle[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  filterActive: boolean;
}) {
  const isOpen = expanded.has(category.id) || filterActive;
  const isSelected = selection?.kind === "category" && selection.id === category.id;
  if (filterActive && articles.length === 0) return null;

  return (
    <li>
      <div className={cn("group flex items-center gap-1 rounded-md py-1 pr-1 text-sm", isSelected && "bg-primary/15 text-primary")}>
        <button type="button" onClick={() => toggle(category.id)} className="flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={() => onSelect({ kind: "category", id: category.id })} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <FolderTree className={cn("h-3.5 w-3.5", category.is_archived ? "text-muted-foreground" : "text-primary/70")} />
          <span className={cn("truncate font-medium", category.is_archived && "italic text-muted-foreground")}>{category.name}</span>
          <span className="ml-auto text-[10px] text-muted-foreground/70">{articles.length}</span>
        </button>
      </div>
      {isOpen && (
        <ul className="ml-3 space-y-0.5 border-l border-border/30 pl-2">
          {articles.map((a) => <ArticleRow key={a.id} article={a} selection={selection} onSelect={onSelect} />)}
          {articles.length === 0 && <li className="px-2 py-1 text-[11px] text-muted-foreground/70">No articles</li>}
        </ul>
      )}
    </li>
  );
}

function ArticleRow({ article, selection, onSelect }: {
  article: KbArticle; selection: Selection; onSelect: (s: Selection) => void;
}) {
  const isSelected = selection?.kind === "article" && selection.id === article.id;
  const dim = article.status === "archived";
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect({ kind: "article", id: article.id })}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-white/[0.04]",
          isSelected && "bg-primary/15 text-primary",
          dim && "opacity-60",
        )}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{article.title}</span>
        {article.status === "draft" && <Badge variant="outline" className="ml-auto h-4 text-[9px]">Draft</Badge>}
        {article.status === "archived" && <Badge variant="outline" className="ml-auto h-4 text-[9px]">Arch</Badge>}
      </button>
    </li>
  );
}

// ----------------- Main content -----------------

interface SelectionViewProps {
  data: NonNullable<ReturnType<typeof useKnowledgeBackend>["data"]>;
  selection: Selection;
  tagsByArticle: Map<string, string[]>;
  tagIdsByArticle: Map<string, Set<string>>;
  teamId: string;
  perms: { read: boolean; create: boolean; update: boolean; delete: boolean; manageTeam: boolean };
  editingArticle: boolean;
  setEditingArticle: (v: boolean) => void;
  onOpenArticle: (id: string) => void;
  onNewSpace: () => void;
  onEditSpace: (s: KbSpace) => void;
  onArchiveSpace: (s: KbSpace) => void;
  onDeleteSpace: (s: KbSpace) => void;
  onNewCategory: (spaceId: string, sortOrder: number) => void;
  onEditCategory: (c: KbCategory) => void;
  onArchiveCategory: (c: KbCategory) => void;
  onDeleteCategory: (c: KbCategory) => void;
  onNewArticle: (spaceId: string, categoryId: string | null) => void;
  onEditArticleMeta: (a: KbArticle) => void;
  onDeleteArticle: (a: KbArticle) => void;
  onEditArticleTags: (a: KbArticle) => void;
  onReload: () => void;
}

function SelectionView(p: SelectionViewProps) {
  const { data, selection, tagsByArticle, teamId, perms, onOpenArticle } = p;

  if (!selection) {
    return (
      <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
        <div>
          <FileText className="mx-auto mb-2 h-6 w-6 opacity-60" />
          Select a Space, Category, or Article on the left.
          {perms.manageTeam && data.spaces.length === 0 && (
            <div className="mt-3">
              <Button size="sm" onClick={p.onNewSpace}><Plus className="mr-1 h-3 w-3" /> Create first space</Button>
            </div>
          )}
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
        <div className="flex items-start gap-2">
          <Header icon={<Library className="h-4 w-4 text-primary" />} label="Space" title={space.name} subtitle={space.description ?? undefined} />
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {perms.create && !space.is_archived && (
              <Button size="sm" variant="secondary" className="h-7 text-xs"
                onClick={() => p.onNewArticle(space.id, null)}>
                <Plus className="mr-1 h-3 w-3" /> Article
              </Button>
            )}
            {perms.update && !space.is_archived && (
              <Button size="sm" variant="secondary" className="h-7 text-xs"
                onClick={() => p.onNewCategory(space.id, cats.length * 10)}>
                <Plus className="mr-1 h-3 w-3" /> Category
              </Button>
            )}
            {perms.manageTeam && (
              <>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => p.onEditSpace(space)}>
                  <Pencil className="mr-1 h-3 w-3" /> Edit
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => p.onArchiveSpace(space)}>
                  {space.is_archived ? <><RotateCcw className="mr-1 h-3 w-3" /> Restore</> : <><Archive className="mr-1 h-3 w-3" /> Archive</>}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => p.onDeleteSpace(space)}>
                  <Trash2 className="mr-1 h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
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
        <div className="flex items-start gap-2">
          <Header
            icon={<FolderTree className="h-4 w-4 text-primary/80" />}
            label="Category"
            title={cat.name}
            subtitle={cat.description ?? undefined}
            breadcrumb={space?.name}
          />
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {perms.create && !cat.is_archived && (
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => p.onNewArticle(cat.space_id, cat.id)}>
                <Plus className="mr-1 h-3 w-3" /> Article
              </Button>
            )}
            {perms.update && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => p.onEditCategory(cat)}>
                <Pencil className="mr-1 h-3 w-3" /> Edit
              </Button>
            )}
            {perms.update && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => p.onArchiveCategory(cat)}>
                {cat.is_archived ? <><RotateCcw className="mr-1 h-3 w-3" /> Restore</> : <><Archive className="mr-1 h-3 w-3" /> Archive</>}
              </Button>
            )}
            {perms.delete && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => p.onDeleteCategory(cat)}>
                <Trash2 className="mr-1 h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        <Meta items={[
          ["Slug", cat.slug],
          ["Sort order", String(cat.sort_order)],
          ["Updated", formatDate(cat.updated_at)],
          ["Archived", cat.is_archived ? "Yes" : "No"],
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

  if (p.editingArticle) {
    return (
      <ArticleContentEditor
        article={art}
        canUpdate={perms.update}
        canDelete={perms.delete}
        canApprove={perms.manageTeam}
        onSaved={() => { p.onReload(); }}
        onClose={() => p.setEditingArticle(false)}
      />
    );
  }

  return (
    <ArticleView
      article={art}
      tags={tags}
      breadcrumb={[space?.name, cat?.name].filter(Boolean).join(" / ")}
      teamId={teamId}
      canUpdate={perms.update}
      canDelete={perms.delete}
      onEditContent={() => p.setEditingArticle(true)}
      onEditMeta={() => p.onEditArticleMeta(art)}
      onEditTags={() => p.onEditArticleTags(art)}
      onDelete={() => p.onDeleteArticle(art)}
      onReload={p.onReload}
    />
  );
}

function Header({ icon, label, title, subtitle, breadcrumb }: {
  icon: React.ReactNode; label: string; title: string; subtitle?: string; breadcrumb?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}<span>{label}</span>
        {breadcrumb && (<><ChevronRight className="h-3 w-3" /><span className="normal-case tracking-normal">{breadcrumb}</span></>)}
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
        <div key={k}><span className="text-muted-foreground/70">{k}: </span><span className="text-foreground/80">{v}</span></div>
      ))}
    </div>
  );
}

function ArticleTable({ articles, categories, onOpen }: {
  articles: KbArticle[]; categories: KbCategory[]; onOpen: (id: string) => void;
}) {
  if (articles.length === 0) {
    return <div className="rounded-xl border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">No articles here.</div>;
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
            <tr key={a.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => onOpen(a.id)}>
              <td className="px-3 py-2">
                <div className="font-medium">{a.title}</div>
                {a.excerpt && <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.excerpt}</div>}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{a.category_id ? catName.get(a.category_id) ?? "—" : "—"}</td>
              <td className="px-3 py-2 text-xs"><Badge variant="outline" className="h-5">{STATUS_LABEL[a.status] ?? a.status}</Badge></td>
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
  article, tags, breadcrumb, teamId, canUpdate, canDelete,
  onEditContent, onEditMeta, onEditTags, onDelete, onReload,
}: {
  article: KbArticle; tags: string[]; breadcrumb: string; teamId: string;
  canUpdate: boolean; canDelete: boolean;
  onEditContent: () => void; onEditMeta: () => void; onEditTags: () => void;
  onDelete: () => void; onReload: () => void;
}) {
  type SidePanel = "none" | "revisions" | "review";
  const [panel, setPanel] = useState<SidePanel>("none");
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div>
        <div className="flex items-start gap-2">
          <Header
            icon={<FileText className="h-4 w-4 text-muted-foreground" />}
            label="Article"
            title={article.title}
            subtitle={article.excerpt ?? undefined}
            breadcrumb={breadcrumb || undefined}
          />
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {canUpdate && (
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onEditContent}>
                <Pencil className="mr-1 h-3 w-3" /> Edit content
              </Button>
            )}
            {canUpdate && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onEditMeta}>Metadata</Button>
            )}
            {canUpdate && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onEditTags}>
                <TagsIcon className="mr-1 h-3 w-3" /> Tags
              </Button>
            )}
            {canDelete && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={onDelete}>
                <Trash2 className="mr-1 h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">{STATUS_LABEL[article.status] ?? article.status}</Badge>
          <Badge variant="outline">{article.visibility}</Badge>
          <Badge variant="outline">rev {article.revision_number}</Badge>
          {article.published_at && <span className="text-muted-foreground">Published {formatDate(article.published_at)}</span>}
          <span className="text-muted-foreground">Updated {formatDate(article.updated_at)}</span>
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {tags.map((t) => <Badge key={t} variant="secondary" className="h-5 text-[10px]">#{t}</Badge>)}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant={panel === "review" ? "secondary" : "ghost"} className="h-7 px-2 text-xs"
              onClick={() => setPanel((p) => (p === "review" ? "none" : "review"))}>
              <History className="mr-1 h-3 w-3" />Review
            </Button>
            <Button size="sm" variant={panel === "revisions" ? "secondary" : "ghost"} className="h-7 px-2 text-xs"
              onClick={() => setPanel((p) => (p === "revisions" ? "none" : "revisions"))}>
              <History className="mr-1 h-3 w-3" />Revisions
            </Button>
          </div>
        </div>
      </div>

      <div className={cn("grid min-h-0 gap-3", panel !== "none" && "lg:grid-cols-[minmax(0,1fr)_300px]")}>
        <div className="min-h-0 overflow-y-auto rounded-xl border border-border/40 bg-white/[0.02] p-4">
          {article.content_markdown ? <Markdown source={article.content_markdown} /> : <p className="text-sm text-muted-foreground">This article has no content yet.</p>}
        </div>
        {panel === "revisions" && (
          <RevisionsPanel
            articleId={article.id}
            teamId={teamId}
            canRestore={canUpdate}
            currentRev={article.revision_number}
            onRestored={onReload}
          />
        )}
        {panel === "review" && (
          <ReviewTimelinePanel
            articleId={article.id}
            teamId={teamId}
            refreshKey={`${article.revision_number}:${article.status}`}
          />
        )}
      </div>
    </div>
  );
}

function RevisionsPanel({
  articleId, teamId, canRestore, currentRev, onRestored,
}: {
  articleId: string; teamId: string; canRestore: boolean; currentRev: number; onRestored: () => void;
}) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; revs: KbRevision[] }>({ loading: true, error: null, revs: [] });
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, revs: [] });
    void fetchArticleRevisions(articleId, teamId).then((res) => {
      if (cancelled) return;
      if (res.error) setState({ loading: false, error: res.error, revs: [] });
      else setState({ loading: false, error: null, revs: res.data ?? [] });
    });
    return () => { cancelled = true; };
  }, [articleId, teamId, currentRev]);

  async function handleRestore(r: KbRevision) {
    if (!canRestore) return;
    if (!confirm(`Restore article to revision v${r.version_number}? A new revision will be created.`)) return;
    setBusyId(r.id);
    const res = await restoreArticleRevision(articleId, r);
    setBusyId(null);
    if (res.error) { toast.error(res.error); return; }
    toast.success(`Restored to v${r.version_number}.`);
    onRestored();
  }

  return (
    <aside className="min-h-0 overflow-y-auto rounded-xl border border-border/40 bg-white/[0.02] p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Revision history</div>
      {state.loading ? (
        <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
      ) : state.error ? (
        <div className="text-xs text-destructive">{state.error}</div>
      ) : state.revs.length === 0 ? (
        <div className="text-xs text-muted-foreground">No revisions recorded.</div>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {state.revs.map((r) => (
            <li key={r.id} className="rounded-md border border-border/30 p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">v{r.version_number}{r.version_number === currentRev && " (current)"}</span>
                <Badge variant="outline" className="h-4 text-[10px]">{STATUS_LABEL[r.status] ?? r.status}</Badge>
              </div>
              <div className="mt-0.5 text-muted-foreground">{formatDate(r.created_at)}</div>
              <div className="mt-0.5 truncate text-foreground/80">{r.title}</div>
              {canRestore && r.version_number !== currentRev && (
                <Button
                  size="sm" variant="ghost" className="mt-1 h-6 px-2 text-[11px]"
                  disabled={busyId === r.id}
                  onClick={() => void handleRestore(r)}
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> Restore this version
                </Button>
              )}
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
    <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Skeleton className="h-[480px] rounded-2xl" />
      <Skeleton className="h-[480px] rounded-2xl" />
    </div>
  );
}

function TreeSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="space-y-3"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-40 w-full" /></div>
  );
}

function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="glass-card flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
      <AlertCircle className="h-6 w-6 text-destructive" />
      <div><div className="text-base font-medium">{title}</div><p className="mt-1 text-sm text-muted-foreground">{message}</p></div>
      <Button size="sm" onClick={onRetry}><RefreshCw className="mr-1 h-3 w-3" /> Retry</Button>
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-destructive" />
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button size="sm" className="mt-3" onClick={onRetry}><RefreshCw className="mr-1 h-3 w-3" /> Retry</Button>
      </div>
    </div>
  );
}

function NotFound() {
  return <div className="grid h-full place-items-center text-sm text-muted-foreground">Item not found.</div>;
}
