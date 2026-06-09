import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  Folder as FolderIcon,
  FileText,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  Star,
  Eye,
  Download,
  Copy,
  Archive,
  FolderInput,
  LayoutGrid,
  Rows3,
  Filter,
  CheckSquare,
  Square,
  X,
  Lock,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormDrawer } from "@/components/common/FormDrawer";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { FilterBar } from "@/components/common/FilterBar";
import { FolderTree } from "@/components/documents/FolderTree";
import { DocumentPreview } from "@/components/documents/DocumentPreview";
import { DocumentDetailsDrawer } from "@/components/documents/DocumentDetailsDrawer";
import { useData } from "@/lib/data/store";
import type { Document, DocStatus, DocType, DocumentVisibility, Folder } from "@/lib/data/types";
import {
  applyTabFilter,
  archiveDocument,
  archiveFolder,
  bulkArchive,
  bulkChangeStatus,
  bulkDelete,
  bulkMove,
  createDocument,
  createFolder,
  deleteDocument,
  deleteFolder,
  descendantFolderIds,
  downloadMock,
  DOC_TABS,
  duplicateDocument,
  favoriteDocument,
  filterVisibleDocuments,
  folderBreadcrumb,
  moveDocument,
  moveFolder,
  renameFolder,
  updateDocument,
  type DocumentTab,
} from "@/lib/data/documents";
import { can, useRole } from "@/lib/permissions";
import { toast } from "sonner";
import { fileIconFor, formatBytes, formatDate } from "@/components/common/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Documents · IT Knowledge Center" },
      { name: "description", content: "IT documentation library with folders, metadata, rich previews, and bulk operations." },
    ],
  }),
  component: DocumentsPage,
});

type ViewMode = "table" | "cards";
type SortKey = "title" | "updatedAt" | "size" | "category" | "owner";

function DocumentsPage() {
  const data = useData();
  const role = useRole();
  const canCreate = can("documents.create", role);
  const canBulk = can("documents.bulk", role);
  const canFolderWrite = can("folders.write", role);

  // Filters / view state
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [tab, setTab] = useState<DocumentTab>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const pageSize = data.settings.tablePageSize;

  // Filter facets
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterImportance, setFilterImportance] = useState<string>("all");
  const [filterOwner, setFilterOwner] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Details / drawers / dialogs
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [docDrawerOpen, setDocDrawerOpen] = useState(false);
  const [docForm, setDocForm] = useState<Partial<Document>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Folder ops
  const [folderDialog, setFolderDialog] = useState<{ mode: "create" | "rename"; parentId: string | null; target?: Folder } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [confirmFolderDelete, setConfirmFolderDelete] = useState<Folder | null>(null);
  const [moveFolderTarget, setMoveFolderTarget] = useState<Folder | null>(null);
  const [moveFolderParent, setMoveFolderParent] = useState<string | null>(null);
  const [moveDocsOpen, setMoveDocsOpen] = useState(false);
  const [moveDocsTarget, setMoveDocsTarget] = useState<string | null>(null);
  const [moveDocsIds, setMoveDocsIds] = useState<string[]>([]);

  // Effective folder set: include descendants when a folder is selected
  const visibleFolderIds = useMemo(() => {
    if (!selectedFolder) return null;
    return new Set(descendantFolderIds(selectedFolder, data.folders));
  }, [selectedFolder, data.folders]);

  // Derived documents
  const filteredDocs = useMemo(() => {
    let docs = filterVisibleDocuments(data.documents, role);
    docs = applyTabFilter(docs, tab);
    if (visibleFolderIds) {
      docs = docs.filter((d) => d.folderId && visibleFolderIds.has(d.folderId));
    }
    if (filterCategory !== "all") docs = docs.filter((d) => d.category === filterCategory);
    if (filterImportance !== "all") docs = docs.filter((d) => d.importance === filterImportance);
    if (filterOwner !== "all") docs = docs.filter((d) => d.owner === filterOwner);
    if (filterType !== "all") docs = docs.filter((d) => d.extension === filterType);
    const q = query.trim().toLowerCase();
    if (q) {
      docs = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)) ||
          d.name.toLowerCase().includes(q),
      );
    }
    docs = [...docs].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "title": av = a.title; bv = b.title; break;
        case "category": av = a.category; bv = b.category; break;
        case "owner": av = a.owner; bv = b.owner; break;
        case "size": av = a.size; bv = b.size; break;
        case "updatedAt": av = +new Date(a.updatedAt); bv = +new Date(b.updatedAt); break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return docs;
  }, [data.documents, role, tab, visibleFolderIds, filterCategory, filterImportance, filterOwner, filterType, query, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageDocs = filteredDocs.slice(safePage * pageSize, safePage * pageSize + pageSize);

  // Facet options
  const categories = useMemo(() => [...new Set(data.documents.map((d) => d.category))].sort(), [data.documents]);
  const owners = useMemo(() => [...new Set(data.documents.map((d) => d.owner).filter(Boolean))].sort(), [data.documents]);

  const selectedFolderObj = data.folders.find((f) => f.id === selectedFolder) ?? null;
  const breadcrumb: Folder[] = [];
  {
    let cur: Folder | undefined = selectedFolderObj ?? undefined;
    while (cur) {
      breadcrumb.unshift(cur);
      cur = data.folders.find((f) => f.id === cur!.parentId) ?? undefined;
    }
  }

  // ----- Handlers -----
  const openCreateDoc = () => {
    if (!canCreate) { toast.error("Your role can't create documents"); return; }
    setEditId(null);
    setDocForm({
      name: "",
      extension: "md",
      title: "",
      description: "",
      folderId: selectedFolder,
      category: categories[0] ?? "General",
      status: "draft",
      importance: "normal",
      owner: "",
      tags: [],
      content: "",
      version: "1.0",
      visibility: "internal",
    });
    setDocDrawerOpen(true);
  };
  const openEditDoc = (d: Document) => {
    if (!can("documents.edit", role)) { toast.error("Your role can't edit documents"); return; }
    setEditId(d.id);
    setDocForm({ ...d });
    setDocDrawerOpen(true);
  };
  const saveDoc = () => {
    if (!docForm.title?.trim()) { toast.error("Title is required"); return; }
    if (editId) {
      updateDocument(editId, docForm);
      toast.success("Document updated");
    } else {
      const created = createDocument(docForm);
      setDetailsId(created.id);
      toast.success("Document created");
    }
    setDocDrawerOpen(false);
  };

  const onFolderRename = (folder: Folder) => {
    setFolderDialog({ mode: "rename", parentId: folder.parentId, target: folder });
    setFolderName(folder.name);
  };
  const onFolderMove = (folder: Folder) => {
    setMoveFolderTarget(folder);
    setMoveFolderParent(folder.parentId);
  };
  const onFolderArchive = (folder: Folder) => {
    archiveFolder(folder.id);
    toast.success(`Archived contents of '${folder.name}'`);
  };
  const onFolderDelete = (folder: Folder) => setConfirmFolderDelete(folder);

  const onNewRootFolder = () => {
    setFolderDialog({ mode: "create", parentId: null });
    setFolderName("");
  };
  const onNewSubFolder = (parentId: string) => {
    setFolderDialog({ mode: "create", parentId });
    setFolderName("");
  };

  const handleFolderSubmit = () => {
    if (!folderName.trim()) { toast.error("Folder name required"); return; }
    if (folderDialog?.mode === "rename" && folderDialog.target) {
      renameFolder(folderDialog.target.id, folderName.trim());
      toast.success("Folder renamed");
    } else if (folderDialog?.mode === "create") {
      createFolder(folderName.trim(), folderDialog.parentId);
      toast.success("Folder created");
    }
    setFolderDialog(null);
  };

  const submitMoveFolder = () => {
    if (!moveFolderTarget) return;
    const ok = moveFolder(moveFolderTarget.id, moveFolderParent);
    if (!ok) { toast.error("Cannot move a folder into its own descendant"); return; }
    toast.success("Folder moved");
    setMoveFolderTarget(null);
  };

  const submitMoveDocs = () => {
    if (moveDocsIds.length === 0) return;
    bulkMove(moveDocsIds, moveDocsTarget);
    toast.success(`Moved ${moveDocsIds.length} document${moveDocsIds.length === 1 ? "" : "s"}`);
    setMoveDocsOpen(false);
    setMoveDocsIds([]);
    setSelectedIds(new Set());
  };

  // Selection
  const allOnPageSelected = pageDocs.length > 0 && pageDocs.every((d) => selectedIds.has(d.id));
  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageDocs.forEach((d) => next.delete(d.id));
      else pageDocs.forEach((d) => next.add(d.id));
      return next;
    });
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const detailsDoc = data.documents.find((d) => d.id === detailsId) ?? null;
  const previewDoc = data.documents.find((d) => d.id === previewId) ?? null;

  const isKnowledge = workspace === "knowledge";

  return (
    <div>
      <PageHeader
        title="Documents"
        description={
          isKnowledge
            ? "Author structured internal documentation — spaces, books, chapters, and pages."
            : "Legacy file records — folders, metadata, lifecycle, and rich previews."
        }
        actions={
          isKnowledge ? null : (
            <>
              {canFolderWrite && (
                <Button variant="secondary" onClick={() => onNewSubFolder(selectedFolder ?? "")} disabled={!selectedFolder}>
                  <FolderIcon className="mr-1.5 h-4 w-4" /> New Subfolder
                </Button>
              )}
              {canFolderWrite && (
                <Button variant="secondary" onClick={onNewRootFolder}>
                  <FolderIcon className="mr-1.5 h-4 w-4" /> New Folder
                </Button>
              )}
              {canCreate && (
                <Button onClick={openCreateDoc}>
                  <Plus className="mr-1.5 h-4 w-4" /> Add Document
                </Button>
              )}
            </>
          )
        }
      />

      <div className="mb-4 inline-flex items-center gap-1 rounded-xl border border-border/40 bg-card/40 p-1">
        <button
          type="button"
          onClick={() => setWorkspace("knowledge")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition",
            isKnowledge ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Knowledge
        </button>
        <button
          type="button"
          onClick={() => setWorkspace("legacy")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition",
            !isKnowledge ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Legacy File Records
        </button>
      </div>

      {isKnowledge ? <KnowledgeWorkspace /> : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Folder tree */}
        <aside className="glass-card hidden rounded-2xl p-3 lg:block">
          <FolderTree
            folders={data.folders}
            documents={data.documents}
            selected={selectedFolder}
            onSelect={(id) => { setSelectedFolder(id); setPage(0); setSelectedIds(new Set()); }}
            onNewRoot={onNewRootFolder}
            onNewSub={onNewSubFolder}
            onRename={onFolderRename}
            onMove={onFolderMove}
            onArchive={onFolderArchive}
            onDelete={onFolderDelete}
          />
        </aside>

        {/* Main list area */}
        <section className="min-w-0">
          {/* Tabs */}
          <Tabs value={tab} onValueChange={(v) => { setTab(v as DocumentTab); setPage(0); }} className="mb-3">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
              {DOC_TABS.map((t) => {
                const count =
                  t.id === "all"
                    ? filterVisibleDocuments(data.documents, role).length
                    : applyTabFilter(filterVisibleDocuments(data.documents, role), t.id).length;
                return (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className="h-8 rounded-lg border border-transparent bg-card/40 px-3 text-xs data-[state=active]:border-primary/40 data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
                  >
                    {t.label}
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{count}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {/* Breadcrumb */}
          {(selectedFolder || tab !== "all") && (
            <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
              <button onClick={() => setSelectedFolder(null)} className="hover:text-foreground">All Documents</button>
              {breadcrumb.map((b) => (
                <span key={b.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  <button onClick={() => setSelectedFolder(b.id)} className="hover:text-foreground">{b.name}</button>
                </span>
              ))}
            </div>
          )}

          {/* Filter bar */}
          <FilterBar
            query={query}
            onQueryChange={(v) => { setQuery(v); setPage(0); }}
            placeholder="Search title, description, tags…"
            onReset={
              query || filterCategory !== "all" || filterImportance !== "all" || filterOwner !== "all" || filterType !== "all"
                ? () => {
                    setQuery(""); setFilterCategory("all"); setFilterImportance("all");
                    setFilterOwner("all"); setFilterType("all"); setPage(0);
                  }
                : undefined
            }
          >
            <FacetSelect label="Category" value={filterCategory} options={categories} onChange={setFilterCategory} />
            <FacetSelect
              label="Importance"
              value={filterImportance}
              options={["low", "normal", "high", "critical"]}
              onChange={setFilterImportance}
            />
            <FacetSelect label="Owner" value={filterOwner} options={owners} onChange={setFilterOwner} />
            <FacetSelect
              label="Type"
              value={filterType}
              options={["pdf", "docx", "xlsx", "pptx", "md", "txt", "image", "file"]}
              onChange={setFilterType}
            />

            <div className="ml-auto flex items-center gap-1 rounded-lg border border-border/40 bg-background/40 p-0.5">
              <Button
                size="sm"
                variant={view === "table" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setView("table")}
                aria-label="Table view"
              >
                <Rows3 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={view === "cards" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setView("cards")}
                aria-label="Card view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-9 text-xs">
                  <Filter className="mr-1 h-3.5 w-3.5" /> Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                {(["updatedAt", "title", "category", "owner", "size"] as SortKey[]).map((k) => (
                  <DropdownMenuItem key={k} onClick={() => setSortKey(k)}>
                    {sortKey === k ? "• " : "  "}{k}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
                  Direction: {sortDir === "asc" ? "Ascending" : "Descending"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </FilterBar>

          {/* Bulk toolbar */}
          {selectedIds.size > 0 && (
            <div className="glass-card mb-3 flex flex-wrap items-center gap-2 rounded-2xl p-3">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                {selectedIds.size} selected
              </Badge>
              {canBulk && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { setMoveDocsIds([...selectedIds]); setMoveDocsTarget(selectedFolder); setMoveDocsOpen(true); }}
                  >
                    <FolderInput className="mr-1.5 h-3.5 w-3.5" /> Move
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="secondary">Change status</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {(["draft", "review", "approved", "archived"] as DocStatus[]).map((s) => (
                        <DropdownMenuItem
                          key={s}
                          onClick={() => {
                            bulkChangeStatus([...selectedIds], s);
                            toast.success(`Status set to ${s} for ${selectedIds.size} documents`);
                            clearSelection();
                          }}
                        >
                          {s}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      bulkArchive([...selectedIds]);
                      toast.success(`Archived ${selectedIds.size} documents`);
                      clearSelection();
                    }}
                  >
                    <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
                  </Button>
                </>
              )}
              {can("documents.delete", role) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setConfirmBulkDelete(true)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                </Button>
              )}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={clearSelection}>
                <X className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            </div>
          )}

          {/* List */}
          {filteredDocs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={query ? "No matching documents" : "No documents here"}
              description={query ? "Try clearing filters or searching elsewhere." : "Add your first document or pick a different folder."}
              actionLabel={canCreate ? "Add Document" : undefined}
              onAction={canCreate ? openCreateDoc : undefined}
            />
          ) : view === "table" ? (
            <div className="glass-card overflow-hidden rounded-2xl">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card/80 backdrop-blur">
                    <TableRow className="border-border/60 hover:bg-transparent">
                      <TableHead className="w-10">
                        {canBulk && (
                          <button onClick={toggleSelectPage} aria-label="Select page" className="text-muted-foreground">
                            {allOnPageSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                          </button>
                        )}
                      </TableHead>
                      {["Name", "Type", "Category", "Status", "Importance", "Owner", "Modified", "Size", ""].map((h) => (
                        <TableHead key={h} className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageDocs.map((d) => {
                      const { Icon, color } = fileIconFor(d.extension);
                      const checked = selectedIds.has(d.id);
                      return (
                        <TableRow
                          key={d.id}
                          onClick={() => setDetailsId(d.id)}
                          className={cn("cursor-pointer border-border/40 transition-colors hover:bg-white/[0.03]", checked && "bg-primary/[0.06]")}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {canBulk && <Checkbox checked={checked} onCheckedChange={() => toggleSelect(d.id)} />}
                          </TableCell>
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-2">
                              <Icon className={cn("h-4 w-4 shrink-0", color)} />
                              <span className="truncate font-medium">{d.title}</span>
                              {d.favorite && <Star className="h-3 w-3 shrink-0 fill-[#FFC86B] text-[#FFC86B]" />}
                              {d.visibility === "restricted" && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                            </div>
                          </TableCell>
                          <TableCell><StatusBadge tone="muted" label={d.extension.toUpperCase()} /></TableCell>
                          <TableCell><span className="text-xs">{d.category}</span></TableCell>
                          <TableCell><StatusBadge tone={statusTone(d.status)} label={d.status} /></TableCell>
                          <TableCell>
                            <StatusBadge
                              tone={d.importance === "critical" ? "danger" : d.importance === "high" ? "warning" : "info"}
                              label={d.importance}
                            />
                          </TableCell>
                          <TableCell><span className="text-xs text-muted-foreground">{d.owner || "—"}</span></TableCell>
                          <TableCell><span className="text-xs text-muted-foreground">{formatDate(d.updatedAt)}</span></TableCell>
                          <TableCell className="text-right"><span className="font-mono text-xs text-muted-foreground">{formatBytes(d.size)}</span></TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <RowMenu
                              doc={d}
                              onPreview={() => setPreviewId(d.id)}
                              onEdit={() => openEditDoc(d)}
                              onFavorite={() => { favoriteDocument(d.id); toast.success(d.favorite ? "Removed from favorites" : "Added to favorites"); }}
                              onDuplicate={() => { duplicateDocument(d.id); toast.success("Document duplicated"); }}
                              onDownload={() => { downloadMock(d); toast.success("Downloaded mock file"); }}
                              onMove={() => { setMoveDocsIds([d.id]); setMoveDocsTarget(d.folderId); setMoveDocsOpen(true); }}
                              onArchive={() => { archiveDocument(d.id); toast.success("Archived"); }}
                              onDelete={() => setConfirmDelete(d.id)}
                              role={role}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border/40 px-4 py-3 text-xs text-muted-foreground">
                  <div>Showing {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filteredDocs.length)} of {filteredDocs.length}</div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-7" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
                    <span className="font-mono">{safePage + 1} / {totalPages}</span>
                    <Button size="sm" variant="ghost" className="h-7" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next</Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pageDocs.map((d) => {
                const { Icon, color } = fileIconFor(d.extension);
                const checked = selectedIds.has(d.id);
                return (
                  <div
                    key={d.id}
                    onClick={() => setDetailsId(d.id)}
                    className={cn(
                      "glass-card cursor-pointer rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-white/10",
                      checked && "ring-1 ring-primary/40",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {canBulk && (
                        <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                          <Checkbox checked={checked} onCheckedChange={() => toggleSelect(d.id)} />
                        </div>
                      )}
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5">
                        <Icon className={cn("h-5 w-5", color)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-1.5">
                          <h3 className="line-clamp-2 flex-1 text-sm font-semibold leading-snug">{d.title}</h3>
                          {d.favorite && <Star className="mt-0.5 h-3 w-3 shrink-0 fill-[#FFC86B] text-[#FFC86B]" />}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{d.category} · v{d.version}</p>
                      </div>
                    </div>
                    {d.description && <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{d.description}</p>}
                    <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                      <StatusBadge tone={statusTone(d.status)} label={d.status} />
                      <span className="font-mono">{formatBytes(d.size)} · {formatDate(d.updatedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
      )}


      {/* Doc create/edit drawer */}
      <FormDrawer
        open={docDrawerOpen}
        onOpenChange={setDocDrawerOpen}
        title={editId ? "Edit document" : "Add document"}
        onSubmit={saveDoc}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" full><Input value={docForm.title ?? ""} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} /></Field>
          <Field label="File name"><Input value={docForm.name ?? ""} onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} /></Field>
          <Field label="Extension">
            <Select value={docForm.extension ?? "md"} onValueChange={(v: DocType) => setDocForm({ ...docForm, extension: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["pdf", "docx", "xlsx", "pptx", "md", "txt", "image", "file"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Folder">
            <Select value={docForm.folderId ?? "none"} onValueChange={(v) => setDocForm({ ...docForm, folderId: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No folder</SelectItem>
                {data.folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Category"><Input value={docForm.category ?? ""} onChange={(e) => setDocForm({ ...docForm, category: e.target.value })} /></Field>
          <Field label="Status">
            <Select value={docForm.status ?? "draft"} onValueChange={(v: DocStatus) => setDocForm({ ...docForm, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["draft", "review", "approved", "archived"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Importance">
            <Select value={docForm.importance ?? "normal"} onValueChange={(v: Document["importance"]) => setDocForm({ ...docForm, importance: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["low", "normal", "high", "critical"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Visibility">
            <Select value={docForm.visibility ?? "internal"} onValueChange={(v: DocumentVisibility) => setDocForm({ ...docForm, visibility: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="restricted">Restricted (admin/agent)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Owner"><Input value={docForm.owner ?? ""} onChange={(e) => setDocForm({ ...docForm, owner: e.target.value })} /></Field>
          <Field label="Review date"><Input type="date" value={docForm.reviewDate?.slice(0, 10) ?? ""} onChange={(e) => setDocForm({ ...docForm, reviewDate: e.target.value })} /></Field>
          <Field label="Tags (comma-separated)" full>
            <Input
              value={(docForm.tags ?? []).join(", ")}
              onChange={(e) => setDocForm({ ...docForm, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
            />
          </Field>
          <Field label="Description" full><Textarea rows={2} value={docForm.description ?? ""} onChange={(e) => setDocForm({ ...docForm, description: e.target.value })} /></Field>
          <Field label="Content" full><Textarea rows={6} value={docForm.content ?? ""} onChange={(e) => setDocForm({ ...docForm, content: e.target.value })} /></Field>
        </div>
      </FormDrawer>

      {/* Folder create/rename dialog */}
      <Dialog open={!!folderDialog} onOpenChange={(o) => !o && setFolderDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{folderDialog?.mode === "rename" ? "Rename folder" : "New folder"}</DialogTitle>
            <DialogDescription>
              {folderDialog?.mode === "rename"
                ? "Update the folder name."
                : folderDialog?.parentId
                ? `Subfolder under ${folderBreadcrumb(folderDialog.parentId, data.folders)}`
                : "Top-level folder."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Field label="Name" full>
              <Input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFolderSubmit()}
                placeholder="e.g. 11 - Procedures"
                autoFocus
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFolderDialog(null)}>Cancel</Button>
            <Button onClick={handleFolderSubmit}>{folderDialog?.mode === "rename" ? "Rename" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move folder dialog */}
      <Dialog open={!!moveFolderTarget} onOpenChange={(o) => !o && setMoveFolderTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move folder</DialogTitle>
            <DialogDescription>
              Move "{moveFolderTarget?.name}" to another parent folder.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Field label="New parent" full>
              <Select value={moveFolderParent ?? "none"} onValueChange={(v) => setMoveFolderParent(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Root (no parent)</SelectItem>
                  {data.folders
                    .filter((f) => moveFolderTarget && !descendantFolderIds(moveFolderTarget.id, data.folders).includes(f.id))
                    .map((f) => <SelectItem key={f.id} value={f.id}>{folderBreadcrumb(f.id, data.folders)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveFolderTarget(null)}>Cancel</Button>
            <Button onClick={submitMoveFolder}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move documents dialog */}
      <Dialog open={moveDocsOpen} onOpenChange={setMoveDocsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move documents</DialogTitle>
            <DialogDescription>
              Move {moveDocsIds.length} document{moveDocsIds.length === 1 ? "" : "s"} to another folder.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Field label="Destination" full>
              <Select value={moveDocsTarget ?? "none"} onValueChange={(v) => setMoveDocsTarget(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No folder (root)</SelectItem>
                  {data.folders.map((f) => <SelectItem key={f.id} value={f.id}>{folderBreadcrumb(f.id, data.folders)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveDocsOpen(false)}>Cancel</Button>
            <Button onClick={submitMoveDocs}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}>
        <DialogContent className="max-w-3xl">
          {previewDoc && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const { Icon, color } = fileIconFor(previewDoc.extension);
                    return <Icon className={cn("h-5 w-5", color)} />;
                  })()}
                  {previewDoc.title}
                </DialogTitle>
                <DialogDescription>{previewDoc.description || "Document preview"}</DialogDescription>
              </DialogHeader>
              <div className="mt-2">
                <DocumentPreview doc={previewDoc} />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => downloadMock(previewDoc)}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                </Button>
                <Button onClick={() => setPreviewId(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Details drawer */}
      <DocumentDetailsDrawer
        doc={detailsDoc}
        open={!!detailsId}
        onOpenChange={(o) => !o && setDetailsId(null)}
        onPreview={() => detailsDoc && setPreviewId(detailsDoc.id)}
        onEdit={() => detailsDoc && openEditDoc(detailsDoc)}
        onFavorite={() => detailsDoc && (favoriteDocument(detailsDoc.id), toast.success(detailsDoc.favorite ? "Removed from favorites" : "Added to favorites"))}
        onDuplicate={() => detailsDoc && (duplicateDocument(detailsDoc.id), toast.success("Document duplicated"))}
        onDownload={() => detailsDoc && (downloadMock(detailsDoc), toast.success("Downloaded mock file"))}
        onMove={() => detailsDoc && (setMoveDocsIds([detailsDoc.id]), setMoveDocsTarget(detailsDoc.folderId), setMoveDocsOpen(true))}
        onArchive={() => detailsDoc && (archiveDocument(detailsDoc.id), toast.success("Archived"))}
        onDelete={() => detailsDoc && setConfirmDelete(detailsDoc.id)}
      />

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete document?"
        description="It will be moved to the Recycle Bin. You can restore it within 30 days."
        destructive
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDelete) {
            deleteDocument(confirmDelete);
            if (detailsId === confirmDelete) setDetailsId(null);
            toast.success("Moved to Recycle Bin");
          }
          setConfirmDelete(null);
        }}
      />
      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Delete ${selectedIds.size} documents?`}
        description="All selected documents will be moved to the Recycle Bin."
        destructive
        confirmLabel="Delete all"
        onConfirm={() => {
          bulkDelete([...selectedIds]);
          toast.success(`Moved ${selectedIds.size} documents to Recycle Bin`);
          clearSelection();
          setConfirmBulkDelete(false);
        }}
      />
      <ConfirmDialog
        open={!!confirmFolderDelete}
        onOpenChange={(o) => !o && setConfirmFolderDelete(null)}
        title={`Delete folder "${confirmFolderDelete?.name}"?`}
        description="The folder (and its subfolders) is moved to the Recycle Bin. Documents inside move to All Documents."
        destructive
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmFolderDelete) {
            deleteFolder(confirmFolderDelete.id);
            if (selectedFolder === confirmFolderDelete.id) setSelectedFolder(null);
            toast.success("Folder moved to Recycle Bin");
          }
          setConfirmFolderDelete(null);
        }}
      />
    </div>
  );
}

function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[140px] border-border/60 bg-background/40 text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", full && "col-span-2")}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RowMenu({
  doc,
  role,
  onPreview,
  onEdit,
  onFavorite,
  onDuplicate,
  onDownload,
  onMove,
  onArchive,
  onDelete,
}: {
  doc: Document;
  role: ReturnType<typeof useRole>;
  onPreview: () => void;
  onEdit: () => void;
  onFavorite: () => void;
  onDuplicate: () => void;
  onDownload: () => void;
  onMove: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onPreview}><Eye className="mr-2 h-3.5 w-3.5" /> Preview</DropdownMenuItem>
        {can("documents.edit", role) && (
          <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit metadata</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onFavorite}>
          <Star className={cn("mr-2 h-3.5 w-3.5", doc.favorite && "fill-[#FFC86B] text-[#FFC86B]")} />
          {doc.favorite ? "Unfavorite" : "Favorite"}
        </DropdownMenuItem>
        {can("documents.edit", role) && (
          <DropdownMenuItem onClick={onDuplicate}><Copy className="mr-2 h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onDownload}><Download className="mr-2 h-3.5 w-3.5" /> Download</DropdownMenuItem>
        {can("documents.move", role) && (
          <DropdownMenuItem onClick={onMove}><FolderInput className="mr-2 h-3.5 w-3.5" /> Move…</DropdownMenuItem>
        )}
        {can("documents.archive", role) && doc.status !== "archived" && (
          <DropdownMenuItem onClick={onArchive}><Archive className="mr-2 h-3.5 w-3.5" /> Archive</DropdownMenuItem>
        )}
        {can("documents.delete", role) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
