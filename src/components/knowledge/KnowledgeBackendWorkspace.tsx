/**
 * Real backend-powered Knowledge Center workspace.
 *
 * Rebuilt from scratch in the polished editorial style used by the Lovable
 * design preview, but wired end-to-end to Supabase via existing hooks and
 * mutations. NO sample data — all content comes from `useKnowledgeBackend`.
 *
 * Layout:
 *   - Default view: Overview/Home (hero + book grid + recently updated)
 *   - Left sidebar: Overview entry + Books/Chapters/Pages tree + search
 *   - Detail panes: Book → Chapter → Page, with breadcrumb back navigation
 *   - All existing CRUD flows preserved (dialogs, permissions, recents)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  Library,
  Book,
  BookOpen,
  BookMarked,
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
  List as ListIcon,
  Link2,
  Clock,
  Compass,
  Sparkles,
  Tag as TagIcon,
  ArrowLeft,
  MoreHorizontal,
  Lightbulb,
  Zap,
  LayoutTemplate,
  Upload,
  CheckCircle2,
  Loader2,
  PencilLine,
  Eye,
  Share2,
  Info,
  User as UserIcon,
  Star,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Check,
} from "lucide-react";


import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  archiveArticle as reviewArchiveArticle,
  restoreArticleToDraft,
} from "@/lib/knowledge/review";
import { SpaceFormDialog } from "./dialogs/SpaceFormDialog";
import { CategoryFormDialog } from "./dialogs/CategoryFormDialog";
import { ArticleFormDialog } from "./dialogs/ArticleFormDialog";
import { TagsEditorDialog } from "./dialogs/TagsEditorDialog";
import { ArticleContentEditor } from "./ArticleContentEditor";
import { ReviewTimelinePanel } from "./ReviewTimelinePanel";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { AuditLogPanel } from "./AuditLogPanel";
import { ArticleTOC } from "./ArticleTOC";
import { useRecentlyViewed } from "@/lib/knowledge/recent";
import type {
  ArticleStatus,
  KbArticle,
  KbCategory,
  KbRevision,
  KbSpace,
} from "@/lib/knowledge/backend-types";

const documentsRouteApi = getRouteApi("/documents");

// ───────── Types ─────────
type Selection =
  | { kind: "home" }
  | { kind: "space"; id: string }
  | { kind: "category"; id: string }
  | { kind: "article"; id: string };

type StatusFilter = "all" | ArticleStatus;

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

const STATUS_PILL: Record<string, string> = {
  draft: "border-slate-500/30 bg-slate-500/10 text-slate-200",
  in_review: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  approved: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  published: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  archived: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};

// Deterministic accent gradient per book.
const ACCENT_GRADIENTS = [
  "from-rose-500/80 to-orange-500/70",
  "from-emerald-500/80 to-teal-500/70",
  "from-indigo-500/80 to-violet-500/70",
  "from-sky-500/80 to-cyan-500/70",
  "from-amber-500/80 to-pink-500/70",
  "from-fuchsia-500/80 to-purple-500/70",
];
function spaceAccent(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return ACCENT_GRADIENTS[Math.abs(h) % ACCENT_GRADIENTS.length];
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        STATUS_PILL[status] ??
          "border-border/40 bg-white/[0.04] text-muted-foreground",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ============================================================
// Top-level workspace
// ============================================================
export function KnowledgeBackendWorkspace() {
  const {
    teams,
    contextLoading,
    contextError,
    refresh,
    loading: authLoading,
  } = useAuth();

  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  useEffect(() => {
    if (teams.length === 0) setActiveTeamId(null);
    else if (!activeTeamId || !teams.find((t) => t.id === activeTeamId))
      setActiveTeamId(teams[0].id);
  }, [teams, activeTeamId]);

  const { data, loading, error, reload } = useKnowledgeBackend(activeTeamId);
  const { perms } = useKnowledgePermissions(activeTeamId);

  const [selection, setSelection] = useState<Selection>({ kind: "home" });
  const [editingArticle, setEditingArticle] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | "">("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    items: recent,
    track: trackRecent,
    forget: forgetRecent,
  } = useRecentlyViewed(activeTeamId);

  // Dialogs
  const [spaceDialog, setSpaceDialog] = useState<{
    open: boolean;
    initial: KbSpace | null;
  }>({ open: false, initial: null });
  const [categoryDialog, setCategoryDialog] = useState<{
    open: boolean;
    initial: KbCategory | null;
    spaceId: string | null;
  }>({ open: false, initial: null, spaceId: null });
  const [articleDialog, setArticleDialog] = useState<{
    open: boolean;
    initial: KbArticle | null;
    spaceId?: string;
    categoryId?: string | null;
  }>({ open: false, initial: null });
  const [tagsDialog, setTagsDialog] = useState<{
    open: boolean;
    articleId?: string;
  }>({ open: false });
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    description?: string;
    destructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Reset on team switch.
  useEffect(() => {
    setSelection({ kind: "home" });
    setEditingArticle(false);
    setExpanded(new Set());
    setStatusFilter("all");
    setShowArchived(false);
    setTagFilter("");
  }, [activeTeamId]);

  // Auto-expand visible books once data loads.
  useEffect(() => {
    if (data && expanded.size === 0 && data.spaces.length > 0) {
      setExpanded(
        new Set(data.spaces.filter((s) => !s.is_archived).map((s) => s.id)),
      );
    }
  }, [data, expanded.size]);

  // Deep link: /documents?article=<id>
  const search = documentsRouteApi.useSearch();
  const navigate = useNavigate();
  const deepLinkAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    const id = search.article;
    if (!id || !data) return;
    if (deepLinkAppliedRef.current === id) return;
    const article = data.articles.find((a) => a.id === id);
    if (!article) return;
    if (activeTeamId && article.team_id !== activeTeamId) {
      setActiveTeamId(article.team_id);
      return;
    }
    deepLinkAppliedRef.current = id;
    setSelection({ kind: "article", id });
    setEditingArticle(false);
    navigate({ to: "/documents", search: { article: undefined }, replace: true });
  }, [search.article, data, activeTeamId, navigate]);

  // Leave edit when switching off an article.
  useEffect(() => {
    if (selection.kind !== "article") setEditingArticle(false);
  }, [selection]);

  // Track recently viewed.
  useEffect(() => {
    if (!data || !activeTeamId) return;
    if (selection.kind !== "article") return;
    const a = data.articles.find((x) => x.id === selection.id);
    if (a) trackRecent({ id: a.id, title: a.title, teamId: activeTeamId });
  }, [selection, data, activeTeamId, trackRecent]);

  // "/" focuses search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))
        return;
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ───────── Derived ─────────
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
    const filterActive =
      !!ql || statusFilter !== "all" || !!tagFilter || !showArchived;
    if (!filterActive) return null;
    const m = new Set<string>();
    for (const a of data.articles) {
      if (!showArchived && a.status === "archived") continue;
      if (statusFilter !== "all" && a.status !== statusFilter) continue;
      if (tagFilter && !tagIdsByArticle.get(a.id)?.has(tagFilter)) continue;
      if (ql) {
        const hay =
          `${a.title} ${a.excerpt ?? ""} ${(tagsByArticle.get(a.id) ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(ql)) continue;
      }
      m.add(a.id);
    }
    return m;
  }, [data, ql, statusFilter, tagFilter, showArchived, tagIdsByArticle, tagsByArticle]);

  // ───────── Auth/team gating ─────────
  if (authLoading || contextLoading) return <WorkspaceSkeleton />;
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
      <div className="rounded-2xl border border-border/60 bg-card/40 p-10 text-center text-sm text-muted-foreground">
        <Library className="mx-auto mb-3 h-8 w-8 opacity-60" />
        <div className="text-base font-medium text-foreground">
          No accessible team found
        </div>
        <p className="mx-auto mt-2 max-w-md">
          Ask an administrator to grant access to a team before browsing the
          knowledge base.
        </p>
      </div>
    );
  }

  // ───────── Mutation handlers ─────────
  const handleArchiveSpace = (s: KbSpace) =>
    setConfirm({
      open: true,
      title: s.is_archived ? "Restore book" : "Archive book",
      description: s.is_archived
        ? `"${s.name}" will become visible again.`
        : `"${s.name}" will be hidden from the default view.`,
      onConfirm: async () => {
        const r = await updateSpace({ id: s.id, is_archived: !s.is_archived });
        if (r.error) toast.error(r.error);
        else {
          toast.success(s.is_archived ? "Book restored." : "Book archived.");
          reload();
        }
      },
    });

  const handleDeleteSpace = (s: KbSpace) =>
    setConfirm({
      open: true,
      destructive: true,
      title: "Delete book",
      description: `Permanently delete "${s.name}" and ALL chapters and pages inside it. This cannot be undone.`,
      onConfirm: async () => {
        const r = await deleteSpace(s.id);
        if (r.error) toast.error(r.error);
        else {
          toast.success("Book deleted.");
          if (selection.kind === "space" && selection.id === s.id)
            setSelection({ kind: "home" });
          reload();
        }
      },
    });

  const handleArchiveCategory = (c: KbCategory) =>
    setConfirm({
      open: true,
      title: c.is_archived ? "Restore chapter" : "Archive chapter",
      description: c.is_archived
        ? `"${c.name}" will be visible again.`
        : `"${c.name}" will be hidden from the default view.`,
      onConfirm: async () => {
        const r = await updateCategory({ id: c.id, is_archived: !c.is_archived });
        if (r.error) toast.error(r.error);
        else {
          toast.success(c.is_archived ? "Chapter restored." : "Chapter archived.");
          reload();
        }
      },
    });

  const handleDeleteCategory = (c: KbCategory) =>
    setConfirm({
      open: true,
      destructive: true,
      title: "Delete chapter",
      description: `Permanently delete "${c.name}". Pages in it must first be moved or deleted.`,
      onConfirm: async () => {
        const r = await deleteCategory(c.id);
        if (r.error) toast.error(r.error);
        else {
          toast.success("Chapter deleted.");
          if (selection.kind === "category" && selection.id === c.id)
            setSelection({ kind: "space", id: c.space_id });
          reload();
        }
      },
    });

  const handleDeleteArticle = (a: KbArticle) =>
    setConfirm({
      open: true,
      destructive: true,
      title: "Delete page",
      description: `Permanently delete "${a.title}" and its revision history. This cannot be undone.`,
      onConfirm: async () => {
        const r = await deleteArticle(a.id);
        if (r.error) toast.error(r.error);
        else {
          toast.success("Page deleted.");
          if (selection.kind === "article" && selection.id === a.id) {
            if (a.category_id)
              setSelection({ kind: "category", id: a.category_id });
            else setSelection({ kind: "space", id: a.space_id });
          }
          reload();
        }
      },
    });

  const handleArchiveArticle = (a: KbArticle) =>
    setConfirm({
      open: true,
      title: a.status === "archived" ? "Restore page" : "Archive page",
      description:
        a.status === "archived"
          ? `Restore "${a.title}" to draft so it can be edited again.`
          : `Archive "${a.title}". It will be hidden from the default view; content and history are preserved.`,
      onConfirm: async () => {
        const r =
          a.status === "archived"
            ? await restoreArticleToDraft(a)
            : await reviewArchiveArticle(a);
        if (r.error) toast.error(r.error);
        else {
          toast.success(a.status === "archived" ? "Page restored." : "Page archived.");
          reload();
        }
      },
    });

  // ───────── Helpers for navigation context ─────────
  const findSelectedSpaceId = (): string | null => {
    if (!data) return null;
    if (selection.kind === "space") return selection.id;
    if (selection.kind === "category")
      return data.categories.find((c) => c.id === selection.id)?.space_id ?? null;
    if (selection.kind === "article")
      return data.articles.find((a) => a.id === selection.id)?.space_id ?? null;
    return null;
  };
  const findSelectedCategoryId = (): string | null => {
    if (!data) return null;
    if (selection.kind === "category") return selection.id;
    if (selection.kind === "article")
      return data.articles.find((a) => a.id === selection.id)?.category_id ?? null;
    return null;
  };

  const selectedSpaceId = findSelectedSpaceId();
  const selectedCategoryId = findSelectedCategoryId();
  const canNewSpace = perms.manageTeam;
  const canNewCategory = perms.update && !!selectedSpaceId;
  const canNewArticle = perms.create && !!selectedSpaceId;

  return (
    <div className="space-y-4">

      {/* Layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* ───────── Sidebar ───────── */}
        <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-9rem)]">
          <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-card/70 to-card/30 shadow-lg shadow-black/10 backdrop-blur-xl">
            {/* Header */}
            <div className="relative border-b border-border/50 px-4 pb-3 pt-4">
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
              />
              <div className="mb-3 flex items-center gap-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-primary/5 ring-1 ring-inset ring-primary/30 shadow-inner shadow-primary/10">
                  <Library className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold tracking-tight">
                    Knowledge Library
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Book className="h-2.5 w-2.5" />
                      {data?.spaces.filter((s) => !s.is_archived).length ?? 0}
                    </span>
                    <span className="opacity-40">·</span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-2.5 w-2.5" />
                      {data?.articles.filter((a) => a.status !== "archived").length ?? 0}
                    </span>
                    {data && data.tags.length > 0 && (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="inline-flex items-center gap-1">
                          <TagIcon className="h-2.5 w-2.5" />
                          {data.tags.length}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="group relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search pages, tags…"
                  className="h-9 border-border/50 bg-background/40 pl-8 pr-10 text-[13px] transition-colors focus-visible:bg-background/70"
                />
                <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border/60 bg-background/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                  /
                </kbd>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <Filter className="h-3 w-3 text-muted-foreground/70" />
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as StatusFilter)}
                >
                  <SelectTrigger className="h-6 w-[108px] border-border/40 bg-background/30 px-2 text-[10.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="in_review">In review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                {data && data.tags.length > 0 && (
                  <Select
                    value={tagFilter || "__all__"}
                    onValueChange={(v) => setTagFilter(v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger className="h-6 w-[92px] border-border/40 bg-background/30 px-2 text-[10.5px]">
                      <SelectValue placeholder="Tag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All tags</SelectItem>
                      {data.tags.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          #{t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <label className="ml-auto flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="h-3 w-3 accent-primary"
                  />
                  Archived
                </label>
              </div>
            </div>

            <nav className="min-h-0 flex-1 overflow-auto px-2 py-2">
              <button
                onClick={() => setSelection({ kind: "home" })}
                className={cn(
                  "mb-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-all",
                  selection.kind === "home"
                    ? "bg-gradient-to-r from-primary/20 to-primary/5 text-primary shadow-sm shadow-primary/10 ring-1 ring-inset ring-primary/20"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                )}
              >
                <Compass className={cn("h-4 w-4", selection.kind === "home" && "text-primary")} />
                <span>Overview</span>
                {selection.kind === "home" && (
                  <Sparkles className="ml-auto h-3 w-3 text-primary/70" />
                )}
              </button>

              <div className="mb-1.5 mt-3 flex items-center justify-between px-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                  Books
                </div>
                {data && data.spaces.length > 0 && (
                  <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/80">
                    {data.spaces.filter((s) => showArchived || !s.is_archived).length}
                  </span>
                )}
              </div>

              {loading && !data ? (
                <TreeSkeleton />
              ) : error ? (
                <InlineError message={error} onRetry={() => void reload()} />
              ) : !data || data.spaces.length === 0 ? (
                <div className="mx-1 rounded-xl border border-dashed border-border/40 bg-background/20 p-5 text-center">
                  <Book className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
                  <div className="text-xs text-muted-foreground">
                    {perms.manageTeam
                      ? "No books yet — create the first one."
                      : "No books in this team yet."}
                  </div>
                </div>
              ) : (
                <ul className="space-y-px">
                  {data.spaces
                    .filter((s) => showArchived || !s.is_archived)
                    .map((space) => (
                      <SpaceTreeNode
                        key={space.id}
                        space={space}
                        categories={data.categories.filter(
                          (c) =>
                            c.space_id === space.id && (showArchived || !c.is_archived),
                        )}
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
            </nav>
          </div>
        </aside>

        {/* ───────── Main ───────── */}
        <section className="min-w-0">
          {loading && !data ? (
            <ContentSkeleton />
          ) : error ? (
            <InlineError message={error} onRetry={() => void reload()} />
          ) : !data ? null : (
            <MainPane
              data={data}
              selection={selection}
              setSelection={setSelection}
              editingArticle={editingArticle}
              setEditingArticle={setEditingArticle}
              tagsByArticle={tagsByArticle}
              perms={perms}
              recent={recent}
              onForgetRecent={forgetRecent}
              teamId={activeTeamId!}
              onNewSpace={() => setSpaceDialog({ open: true, initial: null })}
              onEditSpace={(s) => setSpaceDialog({ open: true, initial: s })}
              onArchiveSpace={handleArchiveSpace}
              onDeleteSpace={handleDeleteSpace}
              onNewCategory={(spaceId) =>
                setCategoryDialog({ open: true, initial: null, spaceId })
              }
              onEditCategory={(c) =>
                setCategoryDialog({ open: true, initial: c, spaceId: c.space_id })
              }
              onArchiveCategory={handleArchiveCategory}
              onDeleteCategory={handleDeleteCategory}
              onNewArticle={(spaceId, categoryId) =>
                setArticleDialog({ open: true, initial: null, spaceId, categoryId })
              }
              onEditArticleMeta={(a) =>
                setArticleDialog({ open: true, initial: a })
              }
              onArchiveArticle={handleArchiveArticle}
              onDeleteArticle={handleDeleteArticle}
              onEditArticleTags={(a) =>
                setTagsDialog({ open: true, articleId: a.id })
              }
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
            onSaved={(id) => {
              reload();
              setSelection({ kind: "space", id });
            }}
          />
          {categoryDialog.spaceId && (
            <CategoryFormDialog
              open={categoryDialog.open}
              onOpenChange={(o) => setCategoryDialog((s) => ({ ...s, open: o }))}
              teamId={activeTeamId}
              spaceId={categoryDialog.spaceId}
              initial={categoryDialog.initial}
              defaultSortOrder={
                data
                  ? data.categories.filter(
                      (c) => c.space_id === categoryDialog.spaceId,
                    ).length * 10
                  : 0
              }
              onSaved={(id) => {
                reload();
                setSelection({ kind: "category", id });
              }}
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
            onSaved={(id) => {
              reload();
              setSelection({ kind: "article", id });
            }}
          />
          <TagsEditorDialog
            open={tagsDialog.open}
            onOpenChange={(o) => setTagsDialog((s) => ({ ...s, open: o }))}
            teamId={activeTeamId}
            articleId={tagsDialog.articleId}
            allTags={data?.tags ?? []}
            assignedTagIds={
              tagsDialog.articleId
                ? tagIdsByArticle.get(tagsDialog.articleId)
                : undefined
            }
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
          onConfirm={() => {
            confirm.onConfirm();
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Breadcrumb
// ============================================================
function Breadcrumb({
  data,
  selection,
  onSelect,
}: {
  data: ReturnType<typeof useKnowledgeBackend>["data"];
  selection: Selection;
  onSelect: (s: Selection) => void;
}) {
  if (!data || selection.kind === "home") return null;

  const space =
    selection.kind === "space"
      ? data.spaces.find((s) => s.id === selection.id)
      : selection.kind === "category"
        ? data.spaces.find(
            (s) =>
              s.id === data.categories.find((c) => c.id === selection.id)?.space_id,
          )
        : selection.kind === "article"
          ? data.spaces.find(
              (s) =>
                s.id === data.articles.find((a) => a.id === selection.id)?.space_id,
            )
          : null;

  const category =
    selection.kind === "category"
      ? data.categories.find((c) => c.id === selection.id)
      : selection.kind === "article"
        ? data.categories.find(
            (c) =>
              c.id === data.articles.find((a) => a.id === selection.id)?.category_id,
          )
        : null;

  const article =
    selection.kind === "article"
      ? data.articles.find((a) => a.id === selection.id)
      : null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-[11px] text-muted-foreground"
    >
      <button
        type="button"
        onClick={() => onSelect({ kind: "home" })}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/[0.04] hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Overview
      </button>
      {space && (
        <>
          <ChevronRight className="h-3 w-3 opacity-60" />
          <button
            type="button"
            onClick={() => onSelect({ kind: "space", id: space.id })}
            className="truncate rounded px-1.5 py-0.5 hover:bg-white/[0.04] hover:text-foreground"
          >
            {space.name}
          </button>
        </>
      )}
      {category && (
        <>
          <ChevronRight className="h-3 w-3 opacity-60" />
          <button
            type="button"
            onClick={() => onSelect({ kind: "category", id: category.id })}
            className="truncate rounded px-1.5 py-0.5 hover:bg-white/[0.04] hover:text-foreground"
          >
            {category.name}
          </button>
        </>
      )}
      {article && (
        <>
          <ChevronRight className="h-3 w-3 opacity-60" />
          <span className="truncate px-1.5 py-0.5 text-foreground">{article.title}</span>
        </>
      )}
    </nav>
  );
}

// ============================================================
// Sidebar tree
// ============================================================
function SpaceTreeNode({
  space,
  categories,
  articles,
  expanded,
  toggle,
  selection,
  onSelect,
  matched,
  filterActive,
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
  const open = expanded.has(space.id) || filterActive;
  const isSel = selection.kind === "space" && selection.id === space.id;
  const visibleArticles = matched ? articles.filter((a) => matched.has(a.id)) : articles;
  const uncategorized = visibleArticles.filter((a) => !a.category_id);
  if (filterActive && visibleArticles.length === 0) return null;

  return (
    <li className="mb-0.5">
      <div
        className={cn(
          "group relative flex items-center gap-1 rounded-lg pr-1 transition-all",
          isSel
            ? "bg-gradient-to-r from-primary/15 to-primary/5 ring-1 ring-inset ring-primary/20"
            : "hover:bg-white/[0.04]",
        )}
      >
        {isSel && (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary"
          />
        )}
        <button
          onClick={() => toggle(space.id)}
          className="grid h-7 w-6 place-items-center text-muted-foreground/70 transition-colors hover:text-foreground"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={() => onSelect({ kind: "space", id: space.id })}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-[13px]"
          title={space.name}
        >
          <span
            className={cn(
              "grid h-5 w-5 shrink-0 place-items-center rounded-md bg-gradient-to-br ring-1 ring-inset ring-white/10",
              spaceAccent(space.id),
            )}
          >
            <Book className="h-3 w-3 text-white/90" />
          </span>
          <span
            className={cn(
              "truncate font-semibold tracking-tight",
              isSel ? "text-primary" : "text-foreground/90",
              space.is_archived && "italic text-muted-foreground",
            )}
          >
            {space.name}
          </span>
          <span className="ml-auto rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/80 opacity-0 transition-opacity group-hover:opacity-100">
            {categories.length + visibleArticles.length}
          </span>
        </button>
      </div>
      {open && (
        <div className="relative ml-[14px] mt-0.5 pl-3">
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-1 left-0 top-1 w-px bg-gradient-to-b from-border/60 via-border/40 to-transparent"
          />
          {categories.map((c) => (
            <CategoryTreeNode
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
            <ArticleTreeRow
              key={a.id}
              article={a}
              selection={selection}
              onSelect={onSelect}
            />
          ))}
          {categories.length === 0 && uncategorized.length === 0 && (
            <div className="px-2 py-1.5 text-[10.5px] italic text-muted-foreground/60">
              Empty book
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function CategoryTreeNode({
  category,
  articles,
  expanded,
  toggle,
  selection,
  onSelect,
  filterActive,
}: {
  category: KbCategory;
  articles: KbArticle[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  filterActive: boolean;
}) {
  const open = expanded.has(category.id) || filterActive;
  const isSel = selection.kind === "category" && selection.id === category.id;
  if (filterActive && articles.length === 0) return null;
  return (
    <div className="py-px">
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-1 transition-colors",
          isSel
            ? "bg-primary/10 ring-1 ring-inset ring-primary/15"
            : "hover:bg-white/[0.035]",
        )}
      >
        <button
          onClick={() => toggle(category.id)}
          className="grid h-6 w-5 place-items-center text-muted-foreground/60 transition-colors hover:text-foreground"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        <button
          onClick={() => onSelect({ kind: "category", id: category.id })}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[12.5px]",
            isSel ? "text-primary" : "text-foreground/75 hover:text-foreground",
          )}
          title={category.name}
        >
          <BookMarked
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isSel ? "text-primary/80" : "text-muted-foreground/70",
            )}
          />
          <span
            className={cn(
              "truncate font-medium",
              category.is_archived && "italic text-muted-foreground",
            )}
          >
            {category.name}
          </span>
          <span className="ml-auto rounded-full bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/70">
            {articles.length}
          </span>
        </button>
      </div>
      {open && (
        <div className="relative ml-[10px] pl-3">
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-1 left-0 top-1 w-px bg-border/30"
          />
          {articles.map((a) => (
            <ArticleTreeRow
              key={a.id}
              article={a}
              selection={selection}
              onSelect={onSelect}
            />
          ))}
          {articles.length === 0 && (
            <div className="px-2 py-1 text-[10px] italic text-muted-foreground/60">
              No pages
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ArticleTreeRow({
  article,
  selection,
  onSelect,
}: {
  article: KbArticle;
  selection: Selection;
  onSelect: (s: Selection) => void;
}) {
  const isSel = selection.kind === "article" && selection.id === article.id;
  return (
    <button
      onClick={() => onSelect({ kind: "article", id: article.id })}
      className={cn(
        "group relative flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12.5px] transition-all",
        isSel
          ? "bg-primary/15 font-medium text-primary"
          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
        article.status === "archived" && "opacity-60",
      )}
      title={article.title}
    >
      {isSel && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary"
        />
      )}
      <FileText
        className={cn(
          "h-3 w-3 shrink-0",
          isSel ? "text-primary/80" : "text-muted-foreground/60 group-hover:text-foreground/70",
        )}
      />
      <span className="truncate">{article.title}</span>
      {article.status === "draft" && (
        <Badge
          variant="outline"
          className="ml-auto h-4 shrink-0 border-amber-500/30 bg-amber-500/10 px-1 text-[9px] text-amber-300/90"
        >
          Draft
        </Badge>
      )}
      {article.status === "in_review" && (
        <Badge
          variant="outline"
          className="ml-auto h-4 shrink-0 border-blue-500/30 bg-blue-500/10 px-1 text-[9px] text-blue-300/90"
        >
          Review
        </Badge>
      )}
    </button>
  );
}

// ============================================================
// Main pane router
// ============================================================
interface MainPaneProps {
  data: NonNullable<ReturnType<typeof useKnowledgeBackend>["data"]>;
  selection: Selection;
  setSelection: (s: Selection) => void;
  editingArticle: boolean;
  setEditingArticle: (v: boolean) => void;
  tagsByArticle: Map<string, string[]>;
  perms: {
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
    manageTeam: boolean;
  };
  recent: Array<{ id: string; title: string; teamId: string; at: number }>;
  onForgetRecent: (id: string) => void;
  teamId: string;
  onNewSpace: () => void;
  onEditSpace: (s: KbSpace) => void;
  onArchiveSpace: (s: KbSpace) => void;
  onDeleteSpace: (s: KbSpace) => void;
  onNewCategory: (spaceId: string) => void;
  onEditCategory: (c: KbCategory) => void;
  onArchiveCategory: (c: KbCategory) => void;
  onDeleteCategory: (c: KbCategory) => void;
  onNewArticle: (spaceId: string, categoryId: string | null) => void;
  onEditArticleMeta: (a: KbArticle) => void;
  onArchiveArticle: (a: KbArticle) => void;
  onDeleteArticle: (a: KbArticle) => void;
  onEditArticleTags: (a: KbArticle) => void;
  onReload: () => void;
}

function MainPane(p: MainPaneProps) {
  const { data, selection, setSelection, tagsByArticle, perms } = p;
  const openArticle = (id: string) => {
    setSelection({ kind: "article", id });
    p.setEditingArticle(false);
  };

  if (selection.kind === "home") {
    return (
      <HomePane
        data={data}
        recent={p.recent}
        onForgetRecent={p.onForgetRecent}
        tagsByArticle={tagsByArticle}
        perms={perms}
        onOpenSpace={(id) => setSelection({ kind: "space", id })}
        onOpenArticle={openArticle}
        onNewSpace={p.onNewSpace}
        onNewArticle={(spaceId) => p.onNewArticle(spaceId, null)}
        onReload={p.onReload}
      />
    );
  }

  if (selection.kind === "space") {
    const space = data.spaces.find((s) => s.id === selection.id);
    if (!space) return <NotFound />;
    return (
      <SpacePane
        space={space}
        categories={data.categories.filter((c) => c.space_id === space.id)}
        articles={data.articles.filter((a) => a.space_id === space.id)}
        tagsByArticle={tagsByArticle}
        perms={perms}
        onOpenCategory={(id) => setSelection({ kind: "category", id })}
        onOpenArticle={openArticle}
        onNewCategory={() => p.onNewCategory(space.id)}
        onNewArticle={() => p.onNewArticle(space.id, null)}
        onEditSpace={() => p.onEditSpace(space)}
        onArchiveSpace={() => p.onArchiveSpace(space)}
        onDeleteSpace={() => p.onDeleteSpace(space)}
      />
    );
  }

  if (selection.kind === "category") {
    const cat = data.categories.find((c) => c.id === selection.id);
    if (!cat) return <NotFound />;
    const space = data.spaces.find((s) => s.id === cat.space_id) ?? null;
    return (
      <CategoryPane
        category={cat}
        space={space}
        articles={data.articles.filter((a) => a.category_id === cat.id)}
        tagsByArticle={tagsByArticle}
        perms={perms}
        onOpenArticle={openArticle}
        onBackToSpace={() =>
          space && setSelection({ kind: "space", id: space.id })
        }
        onNewArticle={() => p.onNewArticle(cat.space_id, cat.id)}
        onEditCategory={() => p.onEditCategory(cat)}
        onArchiveCategory={() => p.onArchiveCategory(cat)}
        onDeleteCategory={() => p.onDeleteCategory(cat)}
      />
    );
  }

  // article
  const art = data.articles.find((a) => a.id === selection.id);
  if (!art) return <NotFound />;
  const space = data.spaces.find((s) => s.id === art.space_id) ?? null;
  const cat = art.category_id
    ? data.categories.find((c) => c.id === art.category_id) ?? null
    : null;
  const articlesInCategory = cat
    ? data.articles.filter(
        (a) => a.category_id === cat.id && a.status !== "archived",
      )
    : [];
  const tagList = tagsByArticle.get(art.id) ?? [];

  if (p.editingArticle) {
    return (
      <ArticleContentEditor
        article={art}
        canUpdate={perms.update}
        canDelete={perms.delete}
        canApprove={perms.manageTeam}
        onSaved={() => p.onReload()}
        onClose={() => p.setEditingArticle(false)}
      />
    );
  }

  return (
    <ArticlePane
      article={art}
      space={space}
      category={cat}
      articlesInCategory={articlesInCategory}
      articleTags={tagList}
      teamId={p.teamId}
      canUpdate={perms.update}
      canDelete={perms.delete}
      onOpenArticle={openArticle}
      onOpenSpace={(id) => setSelection({ kind: "space", id })}
      onOpenCategory={(id) => setSelection({ kind: "category", id })}
      onEditContent={() => p.setEditingArticle(true)}
      onEditMeta={() => p.onEditArticleMeta(art)}
      onEditTags={() => p.onEditArticleTags(art)}
      onArchive={() => p.onArchiveArticle(art)}
      onDelete={() => p.onDeleteArticle(art)}
      onReload={p.onReload}
    />
  );
}

// ============================================================
// Home pane
// ============================================================
function HomePane({
  data,
  recent,
  onForgetRecent,
  tagsByArticle,
  perms,
  onOpenSpace,
  onOpenArticle,
  onNewSpace,
  onNewArticle,
  onReload,
}: {
  data: MainPaneProps["data"];
  recent: MainPaneProps["recent"];
  onForgetRecent: (id: string) => void;
  tagsByArticle: Map<string, string[]>;
  perms: MainPaneProps["perms"];
  onOpenSpace: (id: string) => void;
  onOpenArticle: (id: string) => void;
  onNewSpace: () => void;
  onNewArticle: (spaceId: string) => void;
  onReload: () => void;
}) {
  const visibleSpaces = data.spaces.filter((s) => !s.is_archived);
  const archivedSpaces = data.spaces.filter((s) => s.is_archived).length;
  const visibleCategories = data.categories.filter((c) => !c.is_archived).length;
  const publishedCount = data.articles.filter((a) => a.status === "published").length;
  const draftCount = data.articles.filter(
    (a) => a.status === "draft" || a.status === "in_review",
  ).length;
  const archivedPages = data.articles.filter((a) => a.status === "archived").length;
  const totalPages = data.articles.filter((a) => a.status !== "archived").length;
  const firstSpaceId = visibleSpaces[0]?.id ?? null;
  const recentlyUpdated = useMemo(
    () =>
      [...data.articles]
        .filter((a) => a.status !== "archived")
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 6),
    [data.articles],
  );

  if (visibleSpaces.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 p-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Library className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold">Create your first book</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Organise your documentation into books, chapters and pages.
        </p>
        {perms.manageTeam ? (
          <Button size="sm" className="mt-5" onClick={onNewSpace}>
            <Plus className="mr-1 h-3 w-3" /> Create book
          </Button>
        ) : (
          <p className="mt-5 text-xs text-muted-foreground/80">
            Ask a team manager to create the first book.
          </p>
        )}
      </div>
    );
  }

  const { profile } = useAuth();
  const greetingName =
    (profile?.display_name ?? "").split(" ")[0] ||
    (profile?.email ?? "").split("@")[0] ||
    "there";

  return (
    <div className="space-y-8">
      {/* ───────── Main column ───────── */}
      <div className="min-w-0 space-y-8">
        {/* Hero — compact */}
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/20 via-card/70 to-card/40 px-5 py-4">
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                <Sparkles className="h-3 w-3" />
                Welcome back, {greetingName} 👋
              </div>
              <h1 className="mt-1.5 text-lg font-semibold tracking-tight md:text-xl">
                Your team's living source of truth.
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {perms.manageTeam && (
                <Button size="sm" className="h-8 text-xs" onClick={onNewSpace}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> New book
                </Button>
              )}
              {perms.create && firstSpaceId && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 text-xs"
                  onClick={() => onNewArticle(firstSpaceId)}
                >
                  <FileText className="mr-1 h-3.5 w-3.5" /> New page
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={onReload}
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="relative mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Stat
              icon={<BookOpen className="h-3.5 w-3.5" />}
              label="Books"
              value={visibleSpaces.length}
            />
            <Stat
              icon={<BookMarked className="h-3.5 w-3.5" />}
              label="Chapters"
              value={visibleCategories}
            />
            <Stat
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Pages"
              value={totalPages}
            />
            <Stat
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
              label="Published"
              value={publishedCount}
            />
            <Stat
              icon={<Loader2 className="h-3.5 w-3.5 text-amber-400" />}
              label="In progress"
              value={draftCount}
            />
            <Stat
              icon={<PencilLine className="h-3.5 w-3.5 text-sky-400" />}
              label="Drafts"
              value={archivedPages + archivedSpaces}
            />
          </div>
        </div>


        {/* Books grid */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <SectionHeading
              icon={<Book className="h-4 w-4" />}
              title="Books"
              hint="Top-level collections."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {visibleSpaces.map((s) => {
              const accent = spaceAccent(s.id);
              const chapters = data.categories.filter(
                (c) => c.space_id === s.id && !c.is_archived,
              ).length;
              const pages = data.articles.filter(
                (a) => a.space_id === s.id && a.status !== "archived",
              ).length;
              return (
                <button
                  key={s.id}
                  onClick={() => onOpenSpace(s.id)}
                  className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/70 hover:shadow-lg hover:shadow-primary/5"
                >
                  <div
                    className={cn(
                      "absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
                      accent,
                    )}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={cn(
                        "grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-md",
                        accent,
                      )}
                    >
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <span className="rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {pages} pages
                    </span>
                  </div>
                  <div className="mt-4 line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight group-hover:text-primary">
                    {s.name}
                  </div>
                  {s.description && (
                    <div className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                      {s.description}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Updated {formatDate(s.updated_at)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BookMarked className="h-3 w-3" /> {chapters}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recently updated (from backend) */}
        {recentlyUpdated.length > 0 && (
          <div>
            <SectionHeading
              icon={<Clock className="h-4 w-4" />}
              title="Recently updated"
              hint="Latest edits across all books."
            />
            <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card/40">
              {recentlyUpdated.map((a) => {
                const sp = data.spaces.find((x) => x.id === a.space_id);
                const ch = a.category_id
                  ? data.categories.find((c) => c.id === a.category_id)
                  : null;
                return (
                  <button
                    key={a.id}
                    onClick={() => onOpenArticle(a.id)}
                    className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] sm:gap-4 sm:px-5"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {sp?.name ?? "—"}
                        {ch ? ` · ${ch.name}` : ""}
                      </div>
                    </div>
                    <StatusPill status={a.status} />
                    <span className="hidden w-24 text-right text-[11px] text-muted-foreground md:inline">
                      {formatDate(a.updated_at)}
                    </span>
                    <ChevronRight className="hidden h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground sm:block" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function HeroIllustration() {
  return (
    <div
      aria-hidden
      className="relative hidden h-40 w-full items-center justify-center md:flex"
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-transparent blur-2xl" />
      <svg
        viewBox="0 0 200 160"
        className="relative h-40 w-auto drop-shadow-[0_10px_30px_rgba(99,102,241,0.35)]"
        fill="none"
      >
        <defs>
          <linearGradient id="kb-book-a" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.95" />
            <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="kb-book-b" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#6366f1" stopOpacity="0.9" />
            <stop offset="1" stopColor="#312e81" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        <rect x="40" y="60" width="120" height="70" rx="8" fill="url(#kb-book-b)" />
        <rect x="55" y="40" width="90" height="80" rx="8" fill="url(#kb-book-a)" />
        <rect x="70" y="55" width="60" height="6" rx="3" fill="white" fillOpacity="0.85" />
        <rect x="70" y="68" width="40" height="4" rx="2" fill="white" fillOpacity="0.55" />
        <rect x="70" y="78" width="50" height="4" rx="2" fill="white" fillOpacity="0.4" />
        <circle cx="160" cy="40" r="14" fill="hsl(var(--primary))" fillOpacity="0.25" />
        <circle cx="160" cy="40" r="7" fill="hsl(var(--primary))" />
        <path
          d="M155 40h10M160 35v10"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <rect x="32" y="118" width="20" height="20" rx="4" fill="#22d3ee" fillOpacity="0.35" />
        <path
          d="M37 128h10M42 123v10"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function TipItem({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/[0.04] text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-medium leading-tight">{title}</div>
        <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
          {body}
        </div>
      </div>
    </li>
  );
}

function ShortcutItem({
  icon,
  label,
  onClick,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/[0.04] text-muted-foreground">
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {trailing && (
        <span className="text-muted-foreground/60">{trailing}</span>
      )}
    </button>
  );
}


// ============================================================
// Space (Book) pane
// ============================================================
function SpacePane({
  space,
  categories,
  articles,
  tagsByArticle,
  perms,
  onOpenCategory,
  onOpenArticle,
  onNewCategory,
  onNewArticle,
  onEditSpace,
  onArchiveSpace,
  onDeleteSpace,
}: {
  space: KbSpace;
  categories: KbCategory[];
  articles: KbArticle[];
  tagsByArticle: Map<string, string[]>;
  perms: MainPaneProps["perms"];
  onOpenCategory: (id: string) => void;
  onOpenArticle: (id: string) => void;
  onNewCategory: () => void;
  onNewArticle: () => void;
  onEditSpace: () => void;
  onArchiveSpace: () => void;
  onDeleteSpace: () => void;
}) {
  const accent = spaceAccent(space.id);
  const visibleCats = categories.filter((c) => !c.is_archived);
  const loosePages = articles.filter(
    (a) => !a.category_id && a.status !== "archived",
  );
  const chapterCount = visibleCats.length;
  const pageCount = articles.filter((a) => a.status !== "archived").length;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-6 md:p-7">
        <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", accent)} />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md",
                accent,
              )}
            >
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                Book
              </div>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight md:text-3xl">
                {space.name}
              </h1>
              {space.description && (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {space.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <BookMarked className="h-3 w-3" /> {chapterCount} chapter
                  {chapterCount === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" /> {pageCount} page
                  {pageCount === 1 ? "" : "s"}
                </span>
                <span>Updated {formatDate(space.updated_at)}</span>
                {space.is_archived && (
                  <Badge variant="outline" className="h-4 text-[10px]">
                    Archived
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {perms.create && !space.is_archived && (
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={onNewArticle}
              >
                <Plus className="mr-1 h-3 w-3" /> Page
              </Button>
            )}
            {perms.update && !space.is_archived && (
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={onNewCategory}
              >
                <Plus className="mr-1 h-3 w-3" /> Chapter
              </Button>
            )}
            {perms.manageTeam && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label="More"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEditSpace}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onArchiveSpace}>
                    {space.is_archived ? (
                      <>
                        <RotateCcw className="mr-2 h-3.5 w-3.5" /> Restore
                      </>
                    ) : (
                      <>
                        <Archive className="mr-2 h-3.5 w-3.5" /> Archive
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDeleteSpace}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Chapters */}
      {visibleCats.length === 0 && loosePages.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/50 bg-card/30 p-10 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <BookMarked className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-medium">This book is empty</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a chapter to organise pages, or drop in a loose page.
            </p>
          </div>
          {(perms.update || perms.create) && !space.is_archived && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              {perms.update && (
                <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={onNewCategory}>
                  <Plus className="mr-1 h-3 w-3" /> New chapter
                </Button>
              )}
              {perms.create && (
                <Button size="sm" className="h-8 text-xs" onClick={onNewArticle}>
                  <Plus className="mr-1 h-3 w-3" /> New page
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {visibleCats.map((c) => {
            const pages = articles.filter(
              (a) => a.category_id === c.id && a.status !== "archived",
            );
            return (
              <div key={c.id}>
                <div className="mb-3 flex items-end justify-between gap-3 border-b border-border/40 pb-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <BookMarked className="h-4 w-4 shrink-0 text-primary/70" />
                    <button
                      onClick={() => onOpenCategory(c.id)}
                      className="truncate text-lg font-semibold tracking-tight hover:text-primary"
                    >
                      {c.name}
                    </button>
                    {c.description && (
                      <span className="hidden truncate text-xs text-muted-foreground md:inline">
                        — {c.description}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {pages.length} page{pages.length === 1 ? "" : "s"}
                  </span>
                </div>
                {pages.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
                    No pages in this chapter yet.
                  </div>
                ) : (
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
                )}
              </div>
            );
          })}

          {loosePages.length > 0 && (
            <div>
              <div className="mb-3 flex items-end justify-between gap-3">
                <h3 className="text-lg font-semibold tracking-tight">Loose pages</h3>
                <span className="text-xs text-muted-foreground">
                  {loosePages.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {loosePages.map((a) => (
                  <PageCard
                    key={a.id}
                    article={a}
                    tags={tagsByArticle.get(a.id) ?? []}
                    onOpen={() => onOpenArticle(a.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Category (Chapter) pane
// ============================================================
function CategoryPane({
  category,
  space,
  articles,
  tagsByArticle,
  perms,
  onOpenArticle,
  onBackToSpace,
  onNewArticle,
  onEditCategory,
  onArchiveCategory,
  onDeleteCategory,
}: {
  category: KbCategory;
  space: KbSpace | null;
  articles: KbArticle[];
  tagsByArticle: Map<string, string[]>;
  perms: MainPaneProps["perms"];
  onOpenArticle: (id: string) => void;
  onBackToSpace: () => void;
  onNewArticle: () => void;
  onEditCategory: () => void;
  onArchiveCategory: () => void;
  onDeleteCategory: () => void;
}) {
  const accent = space ? spaceAccent(space.id) : "from-primary to-primary/60";
  const visible = articles.filter((a) => a.status !== "archived");
  return (
    <div className="space-y-6">
      {space && (
        <button
          type="button"
          onClick={onBackToSpace}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to {space.name}
        </button>
      )}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-6 md:p-7">
        <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", accent)} />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Chapter
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight md:text-3xl">
              {category.name}
            </h1>
            {category.description && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {category.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3" /> {visible.length} page
                {visible.length === 1 ? "" : "s"}
              </span>
              <span>Updated {formatDate(category.updated_at)}</span>
              {category.is_archived && (
                <Badge variant="outline" className="h-4 text-[10px]">
                  Archived
                </Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {perms.create && !category.is_archived && (
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={onNewArticle}
              >
                <Plus className="mr-1 h-3 w-3" /> Page
              </Button>
            )}
            {perms.update && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label="More"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEditCategory}>
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onArchiveCategory}>
                    {category.is_archived ? (
                      <>
                        <RotateCcw className="mr-2 h-3.5 w-3.5" /> Restore
                      </>
                    ) : (
                      <>
                        <Archive className="mr-2 h-3.5 w-3.5" /> Archive
                      </>
                    )}
                  </DropdownMenuItem>
                  {perms.delete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={onDeleteCategory}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete…
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/50 bg-card/30 p-10 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-medium">No pages in this chapter</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Create the first page to start documenting this topic.
            </p>
          </div>
          {perms.create && !category.is_archived && (
            <Button size="sm" className="mt-1 h-8 text-xs" onClick={onNewArticle}>
              <Plus className="mr-1 h-3 w-3" /> New page
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((a) => (
            <PageCard
              key={a.id}
              article={a}
              tags={tagsByArticle.get(a.id) ?? []}
              onOpen={() => onOpenArticle(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Article pane (read view with tabs)
// ============================================================
type Tab = "content" | "outline" | "review" | "revisions" | "audit";

function ArticlePane({
  article,
  space,
  category,
  articlesInCategory,
  articleTags,
  teamId,
  canUpdate,
  canDelete,
  onOpenArticle,
  onOpenSpace,
  onOpenCategory,
  onEditContent,
  onEditMeta,
  onEditTags,
  onArchive,
  onDelete,
  onReload,
}: {
  article: KbArticle;
  space: KbSpace | null;
  category: KbCategory | null;
  articlesInCategory: KbArticle[];
  articleTags: string[];
  teamId: string;
  canUpdate: boolean;
  canDelete: boolean;
  onOpenArticle: (id: string) => void;
  onOpenSpace: (id: string) => void;
  onOpenCategory: (id: string) => void;
  onEditContent: () => void;
  onEditMeta: () => void;
  onEditTags: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onReload: () => void;
}) {
  const [tab, setTab] = useState<Tab>("content");
  const idx = articlesInCategory.findIndex((a) => a.id === article.id);
  const prev = idx > 0 ? articlesInCategory[idx - 1] : null;
  const next =
    idx >= 0 && idx < articlesInCategory.length - 1 ? articlesInCategory[idx + 1] : null;

  const handleCopyLink = async () => {
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${base}/documents?article=${article.id}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard.");
    } catch {
      toast.error("Could not copy link.");
    }
  };

  const TABS: Array<{ id: Tab; label: string; icon: typeof ListIcon }> = [
    { id: "content", label: "Content", icon: FileText },
    { id: "outline", label: "Outline", icon: ListIcon },
    { id: "review", label: "Review", icon: CheckCircle2 },
    { id: "revisions", label: "Revisions", icon: History },
    { id: "audit", label: "Audit", icon: Clock },
  ];

  const updatedByLabel = article.updated_by
    ? article.updated_by.slice(0, 8)
    : "—";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <article className="min-w-0 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {space && (
            <button
              onClick={() => onOpenSpace(space.id)}
              className="transition-colors hover:text-foreground"
            >
              {space.name}
            </button>
          )}
          {category && (
            <>
              <ChevronRight className="h-3 w-3 opacity-60" />
              <button
                onClick={() => onOpenCategory(category.id)}
                className="transition-colors hover:text-foreground"
              >
                {category.name}
              </button>
            </>
          )}
          <ChevronRight className="h-3 w-3 opacity-60" />
          <span className="font-medium text-primary">{article.title}</span>
        </nav>

        {/* Title + action bar */}
        <header className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                {article.title}
              </h1>
              {article.excerpt && (
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                  {article.excerpt}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {canUpdate && (
                <div className="flex h-9 overflow-hidden rounded-lg shadow-sm shadow-primary/20">
                  <Button
                    size="sm"
                    className="h-9 gap-1.5 rounded-none rounded-l-lg bg-primary px-3.5 text-primary-foreground hover:bg-primary/90"
                    onClick={onEditContent}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        className="h-9 w-7 rounded-none rounded-r-lg border-l border-primary-foreground/20 bg-primary p-0 text-primary-foreground hover:bg-primary/90"
                        aria-label="Edit options"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={onEditContent}>
                        <PencilLine className="mr-2 h-3.5 w-3.5" /> Edit content
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onEditMeta}>
                        <Info className="mr-2 h-3.5 w-3.5" /> Edit details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onEditTags}>
                        <TagsIcon className="mr-2 h-3.5 w-3.5" /> Edit tags
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() => setTab("content")}
              >
                <Eye className="h-3.5 w-3.5" /> Preview
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={handleCopyLink}
              >
                <Share2 className="h-3.5 w-3.5" /> Share
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    aria-label="More"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleCopyLink}>
                    <Link2 className="mr-2 h-3.5 w-3.5" /> Copy link
                  </DropdownMenuItem>
                  {canUpdate && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onArchive}>
                        {article.status === "archived" ? (
                          <>
                            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Restore
                          </>
                        ) : (
                          <>
                            <Archive className="mr-2 h-3.5 w-3.5" /> Archive
                          </>
                        )}
                      </DropdownMenuItem>
                    </>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={onDelete}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete…
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Status / meta row */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusPill status={article.status} />
            <span className="inline-flex h-6 items-center gap-1 rounded-full border border-border/40 bg-white/[0.03] px-2.5 capitalize">
              <UserIcon className="h-3 w-3" /> {article.visibility}
            </span>
            <span className="inline-flex h-6 items-center rounded-full border border-border/40 bg-white/[0.03] px-2.5 font-medium">
              Rev {article.revision_number}
            </span>
            <span className="opacity-60">·</span>
            <span>
              Updated {formatDate(article.updated_at)}
              {article.updated_by && (
                <> by <span className="text-foreground/80">{updatedByLabel}</span></>
              )}
            </span>
          </div>
        </header>

        {/* Tabs */}
        <div className="-mb-px flex flex-wrap items-center gap-1 overflow-x-auto border-b border-border/40">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "content" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border/60 bg-card/30 px-5 py-8 md:px-10 md:py-10">
              <div className="kb-manuscript prose-knowledge max-w-none">
                {article.content_markdown ? (
                  <Markdown source={article.content_markdown} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This page has no content yet.
                  </p>
                )}
              </div>
            </div>
            {(prev || next) && (
              <div className="grid grid-cols-2 gap-3">
                {prev ? (
                  <button
                    onClick={() => onOpenArticle(prev.id)}
                    className="group rounded-xl border border-border/60 bg-card/30 p-4 text-left transition-colors hover:border-primary/40 hover:bg-card/60"
                  >
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <ArrowLeft className="h-3 w-3" /> Previous
                    </div>
                    <div className="mt-1 truncate text-sm font-medium group-hover:text-primary">
                      {prev.title}
                    </div>
                  </button>
                ) : (
                  <span />
                )}
                {next ? (
                  <button
                    onClick={() => onOpenArticle(next.id)}
                    className="group rounded-xl border border-border/60 bg-card/30 p-4 text-right transition-colors hover:border-primary/40 hover:bg-card/60"
                  >
                    <div className="flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Next <ChevronRight className="h-3 w-3" />
                    </div>
                    <div className="mt-1 truncate text-sm font-medium group-hover:text-primary">
                      {next.title}
                    </div>
                  </button>
                ) : (
                  <span />
                )}
              </div>
            )}
          </div>
        )}
        {tab === "outline" && (
          <div className="max-w-3xl">
            <ArticleTOC markdown={article.content_markdown ?? ""} />
          </div>
        )}
        {tab === "review" && (
          <div className="max-w-3xl">
            <ReviewTimelinePanel
              articleId={article.id}
              teamId={teamId}
              refreshKey={`${article.revision_number}:${article.status}`}
            />
          </div>
        )}
        {tab === "revisions" && (
          <div className="max-w-3xl">
            <RevisionsPanel
              articleId={article.id}
              teamId={teamId}
              canRestore={canUpdate}
              currentRev={article.revision_number}
              onRestored={onReload}
            />
          </div>
        )}
        {tab === "audit" && (
          <div className="max-w-3xl">
            <AuditLogPanel
              teamId={teamId}
              entityType="article"
              entityId={article.id}
              title="Page audit"
              limit={50}
            />
          </div>
        )}
      </article>

      {/* Right rail */}
      <aside className="space-y-5 xl:sticky xl:top-4 xl:self-start">
        {/* Page Details */}
        <section className="rounded-2xl border border-border/60 bg-card/30 p-5">
          <header className="mb-4 flex items-center gap-1.5 text-sm font-semibold">
            Page Details <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </header>
          <dl className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Book</dt>
              <dd className="min-w-0 text-right">
                {space ? (
                  <button
                    onClick={() => onOpenSpace(space.id)}
                    className="truncate font-medium text-primary hover:underline"
                  >
                    {space.name}
                  </button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Chapter</dt>
              <dd className="min-w-0 text-right">
                {category ? (
                  <button
                    onClick={() => onOpenCategory(category.id)}
                    className="truncate font-medium text-primary hover:underline"
                  >
                    {category.name}
                  </button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">Owner</dt>
              <dd className="flex items-center gap-1.5 font-medium">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                  {(article.created_by ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate">
                  {article.created_by ? article.created_by.slice(0, 8) : "—"}
                </span>
              </dd>
            </div>
            {article.updated_by && article.updated_by !== article.created_by && (
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Contributors</dt>
                <dd className="flex items-center gap-1">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/15 text-[10px] font-semibold text-emerald-300">
                    {article.updated_by.slice(0, 1).toUpperCase()}
                  </span>
                </dd>
              </div>
            )}
            <div className="space-y-2 border-t border-border/40 pt-3">
              <dt className="text-muted-foreground">Tags</dt>
              <dd className="flex flex-wrap gap-1.5">
                {articleTags.length === 0 && (
                  <span className="text-xs text-muted-foreground">No tags</span>
                )}
                {articleTags.map((t) => (
                  <Badge
                    key={t}
                    variant="outline"
                    className="h-6 gap-1 border-border/40 bg-white/[0.03] px-2 text-[11px] font-normal"
                  >
                    <TagIcon className="h-2.5 w-2.5" />
                    {t}
                  </Badge>
                ))}
                {canUpdate && (
                  <button
                    onClick={onEditTags}
                    className="inline-flex h-6 items-center gap-0.5 rounded-full border border-dashed border-border/50 px-2 text-[11px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
                  >
                    <Plus className="h-2.5 w-2.5" />
                  </button>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* Outline mini-card */}
        <section className="rounded-2xl border border-border/60 bg-card/30 p-5">
          <header className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            Outline <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </header>
          <MiniOutline markdown={article.content_markdown ?? ""} />
        </section>

        {/* Attachments */}
        <section className="rounded-2xl border border-border/60 bg-card/30 p-5">
          <AttachmentsPanel
            articleId={article.id}
            teamId={teamId}
            canUpdate={canUpdate}
          />
        </section>
      </aside>
    </div>
  );
}

function MiniOutline({ markdown }: { markdown: string }) {
  const items = useMemo(() => {
    const out: Array<{ level: number; text: string; slug: string }> = [];
    if (!markdown) return out;
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    let inCode = false;
    for (const raw of lines) {
      if (raw.startsWith("```")) {
        inCode = !inCode;
        continue;
      }
      if (inCode) continue;
      const m = /^(#{1,4})\s+(.*)$/.exec(raw);
      if (!m) continue;
      const text = m[2].trim();
      if (!text) continue;
      const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 80);
      out.push({ level: m[1].length, text, slug });
    }
    return out.slice(0, 12);
  }, [markdown]);

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Add headings to see the outline.
      </p>
    );
  }
  const minLevel = Math.min(...items.map((i) => i.level));
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((i, idx) => (
        <li
          key={`${i.slug}-${idx}`}
          style={{ paddingLeft: `${(i.level - minLevel) * 10}px` }}
        >
          <a
            href={`#${i.slug}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(i.slug);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="flex items-center gap-2 truncate text-muted-foreground transition-colors hover:text-primary"
          >
            <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
            <span className="truncate">{i.text}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}


// ============================================================
// Revisions panel (kept inline — used by article tabs)
// ============================================================
function RevisionsPanel({
  articleId,
  teamId,
  canRestore,
  currentRev,
  onRestored,
}: {
  articleId: string;
  teamId: string;
  canRestore: boolean;
  currentRev: number;
  onRestored: () => void;
}) {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    revs: KbRevision[];
  }>({ loading: true, error: null, revs: [] });
  const [busyId, setBusyId] = useState<string | null>(null);

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
  }, [articleId, teamId, currentRev]);

  async function handleRestore(r: KbRevision) {
    if (!canRestore) return;
    if (
      !confirm(`Restore page to revision v${r.version_number}? A new revision will be created.`)
    )
      return;
    setBusyId(r.id);
    const res = await restoreArticleRevision(articleId, r);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Restored to v${r.version_number}.`);
    onRestored();
  }

  return (
    <aside className="rounded-xl border border-border/40 bg-card/30 p-3">
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
                <span className="font-medium">
                  v{r.version_number}
                  {r.version_number === currentRev && " (current)"}
                </span>
                <Badge variant="outline" className="h-4 text-[10px]">
                  {STATUS_LABEL[r.status] ?? r.status}
                </Badge>
              </div>
              <div className="mt-0.5 text-muted-foreground">{formatDate(r.created_at)}</div>
              <div className="mt-0.5 truncate text-foreground/80">{r.title}</div>
              {canRestore && r.version_number !== currentRev && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 h-6 px-2 text-[11px]"
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

// ============================================================
// Small bits
// ============================================================
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
      className="group relative flex h-full flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/70 hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight group-hover:text-primary">
            {article.title}
          </div>
          {article.excerpt && (
            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {article.excerpt}
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill status={article.status} />
          {tags.slice(0, 2).map((t) => (
            <Badge
              key={t}
              variant="outline"
              className="border-border/40 text-[10px] font-normal"
            >
              <TagIcon className="mr-1 h-2.5 w-2.5" />
              {t}
            </Badge>
          ))}
        </div>
        <span className="shrink-0">{formatDate(article.updated_at)}</span>
      </div>
    </button>
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
      {hint && (
        <span className="hidden text-xs text-muted-foreground sm:inline">{hint}</span>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2.5 backdrop-blur">
      {icon && (
        <div className="mb-1 flex h-5 w-5 items-center justify-center text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="text-lg font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}


// ============================================================
// States
// ============================================================
function WorkspaceSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-14 rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
        <Skeleton className="hidden h-[480px] rounded-2xl lg:block" />
        <div className="space-y-4">
          <Skeleton className="h-44 rounded-2xl" />
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="hidden h-32 rounded-xl 2xl:block" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TreeSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-6"
          style={{ width: `${60 + ((i * 13) % 35)}%` }}
        />
      ))}
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-7 w-1/3" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
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
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-10 text-center">
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
    <div className="grid place-items-center p-6 text-center">
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
    <div className="grid place-items-center rounded-2xl border border-border/60 bg-card/40 p-10 text-sm text-muted-foreground">
      Item not found.
    </div>
  );
}
