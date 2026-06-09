import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Folder as FolderIcon, FileText, ChevronRight, MoreHorizontal, Edit, Trash2, Star, Eye, Download, Copy } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/common/SearchInput";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormDrawer } from "@/components/common/FormDrawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setState, logActivity, trashItem, uid, useData } from "@/lib/data/store";
import type { Document, DocType, Folder } from "@/lib/data/types";
import { toast } from "sonner";
import { fileIconFor, formatBytes, formatDate } from "@/components/common/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Documents · IT Knowledge Center" },
      { name: "description", content: "IT documentation library with folders, metadata, and rich previews." },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const data = useData();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [docDrawerOpen, setDocDrawerOpen] = useState(false);
  const [docForm, setDocForm] = useState<Partial<Document>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderParent, setFolderParent] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmFolderDelete, setConfirmFolderDelete] = useState<string | null>(null);

  const filteredDocs = useMemo(() => {
    const q = query.toLowerCase();
    return data.documents.filter((d) => {
      if (selectedFolder && d.folderId !== selectedFolder) {
        // include if subfolder selected? keep simple — strict folder match
        return false;
      }
      if (!q) return true;
      return d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q) || d.tags.some((t) => t.includes(q));
    });
  }, [data.documents, selectedFolder, query]);

  const folderTree = useMemo(() => {
    const roots = data.folders.filter((f) => !f.parentId);
    const childrenOf = (id: string) => data.folders.filter((f) => f.parentId === id);
    return { roots, childrenOf };
  }, [data.folders]);

  const selectedFolderObj = data.folders.find((f) => f.id === selectedFolder);
  const breadcrumb: Folder[] = [];
  let cur = selectedFolderObj;
  while (cur) {
    breadcrumb.unshift(cur);
    cur = data.folders.find((f) => f.id === cur!.parentId) ?? undefined;
  }

  const openCreateDoc = () => {
    setEditId(null);
    setDocForm({
      name: "",
      extension: "md",
      title: "",
      description: "",
      folderId: selectedFolder,
      category: "General",
      status: "draft",
      importance: "normal",
      owner: "",
      tags: [],
      content: "",
      version: "1.0",
    });
    setDocDrawerOpen(true);
  };

  const openEditDoc = (d: Document) => {
    setEditId(d.id);
    setDocForm({ ...d });
    setDocDrawerOpen(true);
  };

  const saveDoc = () => {
    if (!docForm.title?.trim()) { toast.error("Title required"); return; }
    setState((s) => {
      if (editId) {
        return { ...s, documents: s.documents.map((d) => d.id === editId ? { ...d, ...docForm, updatedAt: new Date().toISOString() } as Document : d) };
      }
      const now = new Date().toISOString();
      const next: Document = {
        id: uid("doc"),
        name: docForm.name || docForm.title!,
        extension: (docForm.extension as DocType) ?? "md",
        title: docForm.title!,
        description: docForm.description ?? "",
        folderId: docForm.folderId ?? null,
        category: docForm.category ?? "General",
        status: docForm.status ?? "draft",
        importance: docForm.importance ?? "normal",
        owner: docForm.owner ?? "",
        tags: docForm.tags ?? [],
        content: docForm.content ?? "",
        size: (docForm.content?.length ?? 0) + 1024,
        version: docForm.version ?? "1.0",
        reviewDate: docForm.reviewDate,
        createdAt: now,
        updatedAt: now,
      };
      return { ...s, documents: [next, ...s.documents] };
    });
    logActivity(editId ? "document.update" : "document.create", `${editId ? "Updated" : "Added"} document '${docForm.title}'`);
    toast.success(editId ? "Document updated" : "Document created");
    setDocDrawerOpen(false);
  };

  const deleteDoc = (id: string) => {
    const d = data.documents.find((x) => x.id === id);
    if (!d) return;
    trashItem("document", d.title, breadcrumbOf(d.folderId, data.folders), d, d.size);
    setState((s) => ({ ...s, documents: s.documents.filter((x) => x.id !== id) }));
    logActivity("document.delete", `Deleted document '${d.title}'`);
    toast.success("Moved to recycle bin");
  };

  const toggleFavorite = (id: string) => {
    setState((s) => ({ ...s, documents: s.documents.map((d) => d.id === id ? { ...d, favorite: !d.favorite } : d) }));
  };

  const duplicateDoc = (id: string) => {
    const d = data.documents.find((x) => x.id === id);
    if (!d) return;
    const copy: Document = { ...d, id: uid("doc"), title: d.title + " (copy)", name: d.name + " (copy)", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setState((s) => ({ ...s, documents: [copy, ...s.documents] }));
    toast.success("Document duplicated");
  };

  const downloadDoc = (id: string) => {
    const d = data.documents.find((x) => x.id === id);
    if (!d) return;
    const blob = new Blob([d.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${d.name}.${d.extension === "image" ? "txt" : d.extension}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded mock file");
  };

  const createFolder = () => {
    if (!folderName.trim()) { toast.error("Name required"); return; }
    const now = new Date().toISOString();
    const f: Folder = { id: uid("fld"), name: folderName, parentId: folderParent, createdAt: now, updatedAt: now };
    setState((s) => ({ ...s, folders: [...s.folders, f] }));
    logActivity("folder.create", `Created folder '${folderName}'`);
    toast.success("Folder created");
    setFolderDialogOpen(false);
    setFolderName("");
  };

  const deleteFolder = (id: string) => {
    const f = data.folders.find((x) => x.id === id);
    if (!f) return;
    trashItem("folder", f.name, "Documents", f, 0);
    setState((s) => ({
      ...s,
      folders: s.folders.filter((x) => x.id !== id && x.parentId !== id),
      documents: s.documents.map((d) => d.folderId === id ? { ...d, folderId: null } : d),
    }));
    if (selectedFolder === id) setSelectedFolder(null);
    logActivity("folder.delete", `Deleted folder '${f.name}'`);
    toast.success("Folder moved to recycle bin");
  };

  const selectedDocObj = data.documents.find((d) => d.id === selectedDoc);

  const columns: Column<Document>[] = [
    { key: "name", header: "Name", render: (d) => {
      const { Icon, color } = fileIconFor(d.extension);
      return (
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("h-4 w-4 shrink-0", color)} />
          <span className="truncate font-medium">{d.title}</span>
          {d.favorite && <Star className="h-3 w-3 shrink-0 fill-[#FFC86B] text-[#FFC86B]" />}
        </div>
      );
    } },
    { key: "type", header: "Type", render: (d) => <StatusBadge tone="muted" label={d.extension.toUpperCase()} /> },
    { key: "cat", header: "Category", render: (d) => <span className="text-xs">{d.category}</span> },
    { key: "status", header: "Status", render: (d) => <StatusBadge tone={statusTone(d.status)} label={d.status} /> },
    { key: "imp", header: "Importance", render: (d) => <StatusBadge tone={d.importance === "critical" ? "danger" : d.importance === "high" ? "warning" : "info"} label={d.importance} /> },
    { key: "owner", header: "Owner", render: (d) => <span className="text-xs text-muted-foreground">{d.owner}</span> },
    { key: "mod", header: "Modified", render: (d) => <span className="text-xs text-muted-foreground">{formatDate(d.updatedAt)}</span> },
    { key: "size", header: "Size", className: "text-right", render: (d) => <span className="text-xs text-muted-foreground font-mono">{formatBytes(d.size)}</span> },
    { key: "actions", header: "", className: "w-12", render: (d) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => setPreviewId(d.id)}><Eye className="mr-2 h-3.5 w-3.5" /> Preview</DropdownMenuItem>
          <DropdownMenuItem onClick={() => openEditDoc(d)}><Edit className="mr-2 h-3.5 w-3.5" /> Edit metadata</DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggleFavorite(d.id)}><Star className="mr-2 h-3.5 w-3.5" /> {d.favorite ? "Unfavorite" : "Favorite"}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => duplicateDoc(d.id)}><Copy className="mr-2 h-3.5 w-3.5" /> Duplicate</DropdownMenuItem>
          <DropdownMenuItem onClick={() => downloadDoc(d.id)}><Download className="mr-2 h-3.5 w-3.5" /> Download</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(d.id)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Documents" description="IT documentation library — folders, metadata, and rich previews."
        actions={
          <>
            <Button variant="secondary" onClick={() => { setFolderParent(selectedFolder); setFolderDialogOpen(true); }}><FolderIcon className="mr-1.5 h-4 w-4" /> New Folder</Button>
            <Button onClick={openCreateDoc}><Plus className="mr-1.5 h-4 w-4" /> Add Document</Button>
          </>
        } />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr_320px]">
        {/* Folder tree */}
        <aside className="glass-card rounded-2xl p-3">
          <div className="px-2 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Folders</div>
          <button
            onClick={() => setSelectedFolder(null)}
            className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm", !selectedFolder && "bg-primary/15 text-primary")}>
            <FolderIcon className="h-4 w-4" /> All Documents <span className="ml-auto text-[10px] text-muted-foreground">{data.documents.length}</span>
          </button>
          <div className="mt-1 space-y-0.5">
            {folderTree.roots.map((f) => (
              <FolderNode key={f.id} folder={f} depth={0} childrenOf={folderTree.childrenOf} selected={selectedFolder} onSelect={setSelectedFolder} docs={data.documents} onDelete={(id) => setConfirmFolderDelete(id)} onNewSub={(pid) => { setFolderParent(pid); setFolderDialogOpen(true); }} />
            ))}
          </div>
        </aside>

        {/* Main list */}
        <section className="min-w-0">
          <div className="glass-card mb-3 rounded-2xl p-3">
            <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
              <span>All Documents</span>
              {breadcrumb.map((b) => (
                <span key={b.id} className="flex items-center gap-1"><ChevronRight className="h-3 w-3" />{b.name}</span>
              ))}
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Search documents..." />
          </div>
          <DataTable data={filteredDocs} columns={columns} pageSize={data.settings.tablePageSize}
            onRowClick={(d) => setSelectedDoc(d.id)}
            emptyState={<EmptyState icon={FileText} title="No documents" description="Add your first document to this folder." actionLabel="Add Document" onAction={openCreateDoc} />} />
        </section>

        {/* Details */}
        <aside className="glass-card rounded-2xl p-4">
          {selectedDocObj ? <DocDetails doc={selectedDocObj} onPreview={() => setPreviewId(selectedDocObj.id)} onEdit={() => openEditDoc(selectedDocObj)} onDelete={() => setConfirmDelete(selectedDocObj.id)} onFav={() => toggleFavorite(selectedDocObj.id)} /> : (
            <div className="text-center text-sm text-muted-foreground py-12">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
              Select a document to see details
            </div>
          )}
        </aside>
      </div>

      {/* Doc Drawer */}
      <FormDrawer open={docDrawerOpen} onOpenChange={setDocDrawerOpen} title={editId ? "Edit document" : "Add document"} onSubmit={saveDoc}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Title</Label><Input value={docForm.title ?? ""} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">File name</Label><Input value={docForm.name ?? ""} onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Extension</Label>
            <Select value={docForm.extension ?? "md"} onValueChange={(v: DocType) => setDocForm({ ...docForm, extension: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["pdf","docx","xlsx","pptx","md","txt","image","file"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Folder</Label>
            <Select value={docForm.folderId ?? "none"} onValueChange={(v) => setDocForm({ ...docForm, folderId: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent><SelectItem value="none">No folder</SelectItem>{data.folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Category</Label><Input value={docForm.category ?? ""} onChange={(e) => setDocForm({ ...docForm, category: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={docForm.status ?? "draft"} onValueChange={(v: Document["status"]) => setDocForm({ ...docForm, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["draft","review","approved","archived"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Importance</Label>
            <Select value={docForm.importance ?? "normal"} onValueChange={(v: Document["importance"]) => setDocForm({ ...docForm, importance: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["low","normal","high","critical"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Owner</Label><Input value={docForm.owner ?? ""} onChange={(e) => setDocForm({ ...docForm, owner: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Review date</Label><Input type="date" value={docForm.reviewDate?.slice(0,10) ?? ""} onChange={(e) => setDocForm({ ...docForm, reviewDate: e.target.value })} /></div>
          <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Tags (comma-separated)</Label><Input value={(docForm.tags ?? []).join(", ")} onChange={(e) => setDocForm({ ...docForm, tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })} /></div>
          <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Description</Label><Textarea rows={2} value={docForm.description ?? ""} onChange={(e) => setDocForm({ ...docForm, description: e.target.value })} /></div>
          <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Content</Label><Textarea rows={6} value={docForm.content ?? ""} onChange={(e) => setDocForm({ ...docForm, content: e.target.value })} /></div>
        </div>
      </FormDrawer>

      {/* Folder dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New folder</DialogTitle><DialogDescription>Create a new folder in your documentation library.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="e.g. 11 - Procedures" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Parent folder</Label>
              <Select value={folderParent ?? "none"} onValueChange={(v) => setFolderParent(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="No parent" /></SelectTrigger>
                <SelectContent><SelectItem value="none">No parent (root)</SelectItem>{data.folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setFolderDialogOpen(false)}>Cancel</Button>
              <Button onClick={createFolder}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <Dialog open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}>
        <DialogContent className="max-w-2xl">
          {(() => {
            const d = data.documents.find((x) => x.id === previewId);
            if (!d) return null;
            const { Icon, color } = fileIconFor(d.extension);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Icon className={cn("h-5 w-5", color)} />{d.title}</DialogTitle>
                  <DialogDescription>{d.description}</DialogDescription>
                </DialogHeader>
                <div className="mt-2 max-h-[60vh] overflow-auto rounded-xl border border-border/40 bg-background/50 p-4">
                  {d.extension === "md" || d.extension === "txt" ? (
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90 font-mono">{d.content}</pre>
                  ) : d.extension === "image" ? (
                    <div className="grid h-64 place-items-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5">
                      <div className="text-center"><div className="text-xs text-muted-foreground">Mock image preview</div><div className="mt-1 text-sm font-medium">{d.name}</div></div>
                    </div>
                  ) : d.extension === "pdf" ? (
                    <div className="grid h-64 place-items-center rounded-lg border border-dashed border-border bg-background/60">
                      <div className="text-center"><Icon className="mx-auto h-10 w-10 text-[#FF7C91]" /><div className="mt-2 text-xs text-muted-foreground">Mock PDF preview · {formatBytes(d.size)}</div></div>
                    </div>
                  ) : (
                    <div className="grid h-64 place-items-center rounded-lg border border-dashed border-border bg-background/60">
                      <div className="text-center"><Icon className={cn("mx-auto h-10 w-10", color)} /><div className="mt-2 text-sm font-medium">{d.name}.{d.extension}</div><div className="text-xs text-muted-foreground">Preview not available · {formatBytes(d.size)}</div></div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)} title="Delete document?" description="Will be moved to recycle bin." destructive confirmLabel="Delete"
        onConfirm={() => { if (confirmDelete) deleteDoc(confirmDelete); setConfirmDelete(null); }} />
      <ConfirmDialog open={!!confirmFolderDelete} onOpenChange={(o) => !o && setConfirmFolderDelete(null)} title="Delete folder?" description="Documents inside will be moved to All Documents." destructive confirmLabel="Delete"
        onConfirm={() => { if (confirmFolderDelete) deleteFolder(confirmFolderDelete); setConfirmFolderDelete(null); }} />
    </div>
  );
}

function FolderNode({ folder, depth, childrenOf, selected, onSelect, docs, onDelete, onNewSub }: { folder: Folder; depth: number; childrenOf: (id: string) => Folder[]; selected: string | null; onSelect: (id: string) => void; docs: Document[]; onDelete: (id: string) => void; onNewSub: (id: string) => void }) {
  const children = childrenOf(folder.id);
  const count = docs.filter((d) => d.folderId === folder.id).length;
  return (
    <div>
      <div className={cn("group flex items-center gap-1 rounded-lg pr-1", selected === folder.id && "bg-primary/15 text-primary")}>
        <button onClick={() => onSelect(folder.id)} className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs" style={{ paddingLeft: 8 + depth * 12 }}>
          <FolderIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{folder.name}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{count}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100"><MoreHorizontal className="h-3 w-3" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onNewSub(folder.id)}><Plus className="mr-2 h-3 w-3" /> New subfolder</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(folder.id)}><Trash2 className="mr-2 h-3 w-3" /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children.map((c) => <FolderNode key={c.id} folder={c} depth={depth + 1} childrenOf={childrenOf} selected={selected} onSelect={onSelect} docs={docs} onDelete={onDelete} onNewSub={onNewSub} />)}
    </div>
  );
}

function DocDetails({ doc, onPreview, onEdit, onDelete, onFav }: { doc: Document; onPreview: () => void; onEdit: () => void; onDelete: () => void; onFav: () => void }) {
  const { Icon, color } = fileIconFor(doc.extension);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/5"><Icon className={cn("h-5 w-5", color)} /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{doc.title}</div>
          <div className="text-[11px] text-muted-foreground">{doc.name}.{doc.extension} · v{doc.version}</div>
        </div>
      </div>
      {doc.description && <p className="text-xs text-muted-foreground">{doc.description}</p>}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Info k="Category" v={doc.category} />
        <Info k="Status" v={<StatusBadge tone={statusTone(doc.status)} label={doc.status} />} />
        <Info k="Importance" v={<StatusBadge tone={doc.importance === "critical" ? "danger" : "info"} label={doc.importance} />} />
        <Info k="Owner" v={doc.owner || "—"} />
        <Info k="Size" v={formatBytes(doc.size)} />
        <Info k="Modified" v={formatDate(doc.updatedAt)} />
        <Info k="Review" v={formatDate(doc.reviewDate)} />
      </div>
      {doc.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">{doc.tags.map((t) => <StatusBadge key={t} tone="muted" label={t} />)}</div>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button size="sm" onClick={onPreview}><Eye className="mr-1.5 h-3.5 w-3.5" /> Preview</Button>
        <Button size="sm" variant="secondary" onClick={onEdit}><Edit className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
        <Button size="sm" variant="ghost" onClick={onFav}><Star className={cn("mr-1.5 h-3.5 w-3.5", doc.favorite && "fill-[#FFC86B] text-[#FFC86B]")} /></Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 className="mr-1.5 h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="rounded-lg bg-background/40 p-2"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div><div className="mt-0.5 text-xs">{v}</div></div>;
}

function breadcrumbOf(folderId: string | null, folders: Folder[]): string {
  if (!folderId) return "All Documents";
  const f = folders.find((x) => x.id === folderId);
  return f?.name ?? "Documents";
}
