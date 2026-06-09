import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search as SearchIcon,
  PanelLeft,
  PanelRight,
  ChevronRight,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { RelationPicker } from "@/components/common/RelationPicker";
import { toast } from "sonner";
import { useRole, can } from "@/lib/permissions";
import {
  useKnowledge,
  createNode,
  updateNode,
  saveContent,
  setStatus,
  duplicateNode,
  moveNode,
  archiveNode,
  deleteNode,
  toggleFavorite,
  restoreVersion,
  recordView,
  addFeedback,
  getChildren,
  getAncestry,
  findSiblings,
} from "@/lib/knowledge/store";
import type {
  KnowledgeNode,
  KnowledgeNodeType,
  KnowledgeStatus,
  KnowledgeRelations,
} from "@/lib/knowledge/types";
import { emptyRelations } from "@/lib/knowledge/types";
import { useTemplates, incrementUsage } from "@/lib/templates/store";
import { KnowledgeTree } from "./KnowledgeTree";
import { KnowledgeBrowse } from "./KnowledgeBrowse";
import { KnowledgeEditor } from "./KnowledgeEditor";
import { KnowledgeViewer } from "./KnowledgeViewer";
import { KnowledgeDetailsPanel } from "./KnowledgeDetailsPanel";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type Mode = "browse" | "view" | "edit";

export function KnowledgeWorkspace() {
  const data = useKnowledge();
  const role = useRole();
  const canEdit = can("documents.edit", role) || role === "technician" || role === "helpdesk";
  const canPublish = can("documents.changeStatus", role);
  const allTemplates = useTemplates();
  const pageTemplates = useMemo(
    () => allTemplates.filter((t) =>
      !t.archived &&
      ["knowledge_page", "sop", "troubleshooting", "runbook", "postmortem", "change", "onboarding", "offboarding"].includes(t.type),
    ),
    [allTemplates],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("browse");
  const [treeQuery, setTreeQuery] = useState("");
  const [treeOpen, setTreeOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Create dialog
  const [createState, setCreateState] = useState<{
    parentId: string | null;
    type: KnowledgeNodeType;
    title: string;
    description: string;
    templateId: string;
  } | null>(null);

  // Rename / edit details
  const [renameTarget, setRenameTarget] = useState<KnowledgeNode | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [editDetailsTarget, setEditDetailsTarget] = useState<KnowledgeNode | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editReviewDate, setEditReviewDate] = useState("");
  const [editVisibility, setEditVisibility] = useState<KnowledgeNode["visibility"]>("public_internal");

  // Move dialog
  const [moveTarget, setMoveTarget] = useState<KnowledgeNode | null>(null);
  const [moveParentId, setMoveParentId] = useState<string | null>(null);

  // Confirm
  const [confirmDelete, setConfirmDelete] = useState<KnowledgeNode | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<KnowledgeNode | null>(null);

  // Relations picker
  const [relationsTarget, setRelationsTarget] = useState<KnowledgeNode | null>(null);

  const selected = useMemo(
    () => data.nodes.find((n) => n.id === selectedId) ?? null,
    [data.nodes, selectedId],
  );

  // Effective browse parent: for pages, list siblings; for containers, list children
  const browseParent: KnowledgeNode | null = useMemo(() => {
    if (!selected) return null;
    if (selected.type === "page") return selected.parentId
      ? data.nodes.find((n) => n.id === selected.parentId) ?? null
      : null;
    return selected;
  }, [selected, data.nodes]);

  const browseChildren = useMemo(
    () => getChildren(browseParent?.id ?? null, data.nodes),
    [browseParent, data.nodes],
  );

  // Switch to viewer when selecting a page
  useEffect(() => {
    if (selected?.type === "page") {
      setMode("view");
      recordView(selected.id);
    } else if (selected) {
      setMode("browse");
    } else {
      setMode("browse");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setTreeOpen(false);
  };

  const ancestry = selected ? getAncestry(selected.id, data.nodes) : [];
  const siblings = selected?.type === "page" ? findSiblings(selected.id, data.nodes) : { prev: null, next: null };

  // ---------- Handlers ----------
  const openCreate = (parent: KnowledgeNode | null, type: KnowledgeNodeType) => {
    if (!canEdit) {
      toast.error("Your role can't create knowledge items");
      return;
    }
    setCreateState({
      parentId: parent?.id ?? null,
      type,
      title: "",
      description: "",
      templateId: type === "page" ? "reg_kb_tpl_blank" : "",
    });
  };

  const submitCreate = () => {
    if (!createState) return;
    if (!createState.title.trim()) {
      toast.error("Title is required");
      return;
    }
    const tpl = createState.type === "page" && createState.templateId
      ? pageTemplates.find((t) => t.id === createState.templateId)
      : undefined;
    const node = createNode({
      type: createState.type,
      parentId: createState.parentId,
      title: createState.title,
      description: createState.description || undefined,
      content: tpl?.content,
    });
    if (tpl) incrementUsage(tpl.id);
    toast.success(`${labelType(createState.type)} created`);
    setCreateState(null);
    setSelectedId(node.id);
  };

  const openRename = (node: KnowledgeNode) => {
    setRenameTarget(node);
    setRenameTitle(node.title);
  };
  const submitRename = () => {
    if (!renameTarget) return;
    updateNode(renameTarget.id, { title: renameTitle.trim() || renameTarget.title });
    toast.success("Renamed");
    setRenameTarget(null);
  };

  const openEditDetails = (node: KnowledgeNode) => {
    setEditDetailsTarget(node);
    setEditDescription(node.description ?? "");
    setEditTags(node.tags.join(", "));
    setEditReviewDate(node.reviewDate?.slice(0, 10) ?? "");
    setEditVisibility(node.visibility);
  };
  const submitEditDetails = () => {
    if (!editDetailsTarget) return;
    updateNode(editDetailsTarget.id, {
      description: editDescription || undefined,
      tags: editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      reviewDate: editReviewDate ? new Date(editReviewDate).toISOString() : undefined,
      visibility: editVisibility,
    });
    toast.success("Details updated");
    setEditDetailsTarget(null);
  };

  const openMove = (node: KnowledgeNode) => {
    setMoveTarget(node);
    setMoveParentId(node.parentId);
  };
  const submitMove = () => {
    if (!moveTarget) return;
    const ok = moveNode(moveTarget.id, moveParentId);
    if (!ok) {
      toast.error("Cannot move into itself or a descendant");
      return;
    }
    toast.success("Moved");
    setMoveTarget(null);
  };

  const onCopyLink = (node: KnowledgeNode) => {
    const url = `${window.location.origin}/documents?k=${node.id}`;
    try {
      navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.success(url);
    }
  };

  const onSaveDraft = (content: string) => {
    if (!selected) return;
    saveContent(selected.id, content, { note: "Saved draft" });
    if (selected.status === "published" || selected.status === "approved") {
      // editing a published doc keeps status; explicit submit to change
    } else {
      updateNode(selected.id, { status: "draft" });
    }
    toast.success("Draft saved");
  };

  const onSubmitReview = (content: string) => {
    if (!selected) return;
    saveContent(selected.id, content, { note: "Submitted for review" });
    setStatus(selected.id, "in_review", "submit", "Submitted for review");
    toast.success("Submitted for review");
  };

  const onApprove = (content: string) => {
    if (!selected) return;
    saveContent(selected.id, content, { note: "Approved" });
    setStatus(selected.id, "approved", "approve", "Approved");
    toast.success("Approved");
  };

  const onPublish = (content: string) => {
    if (!selected) return;
    saveContent(selected.id, content, { note: "Published" });
    setStatus(selected.id, "published", "publish", "Published");
    setMode("view");
    toast.success("Published");
  };

  const onSaveRelations = (rels: KnowledgeRelations) => {
    if (!relationsTarget) return;
    updateNode(relationsTarget.id, { relations: rels });
    toast.success("Relations updated");
  };

  // For relation picker — adapter (shared picker uses different shape)
  const relsForPicker = useMemo(() => {
    const r = relationsTarget?.relations ?? emptyRelations();
    return {
      ticketIds: r.ticketIds,
      assetIds: r.assetIds,
      ipamIds: r.ipamIds,
      taskIds: r.taskIds,
      noteIds: r.noteIds,
      userIds: r.userIds,
    };
  }, [relationsTarget]);

  const allContainers = data.nodes.filter((n) => n.type !== "page");

  // ---------- Render ----------
  return (
    <div className="grid h-[calc(100vh-220px)] min-h-[560px] gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Tree */}
      <aside className="glass-card hidden h-full min-h-0 rounded-2xl p-3 lg:flex lg:flex-col">
        <div className="mb-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={treeQuery}
              onChange={(e) => setTreeQuery(e.target.value)}
              placeholder="Filter tree…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <NewMenu
          selected={selected}
          onCreate={openCreate}
          className="mb-2 w-full"
        />
        <div className="min-h-0 flex-1">
          <KnowledgeTree
            nodes={data.nodes}
            selectedId={selectedId}
            query={treeQuery}
            actions={{
              onSelect: handleSelect,
              onNewChild: (parent, type) => openCreate(parent, type),
              onNewSpace: () => openCreate(null, "space"),
              onRename: openRename,
              onEditDetails: openEditDetails,
              onMove: openMove,
              onDuplicate: (n) => {
                const c = duplicateNode(n.id);
                if (c) {
                  toast.success("Duplicated");
                  setSelectedId(c.id);
                }
              },
              onArchive: (n) => setConfirmArchive(n),
              onDelete: (n) => setConfirmDelete(n),
              onFavorite: (n) => toggleFavorite(n.id),
              onCopyLink,
            }}
          />
        </div>
      </aside>

      {/* Main area */}
      <section className="glass-card flex h-full min-h-0 flex-col rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" className="h-8 lg:hidden" onClick={() => setTreeOpen(true)}>
            <PanelLeft className="mr-1 h-4 w-4" /> Tree
          </Button>
          {selected && (
            <Button size="sm" variant="secondary" className="ml-auto h-8" onClick={() => setDetailsOpen(true)}>
              <PanelRight className="mr-1 h-4 w-4" /> Details
            </Button>
          )}
        </div>

        {selected && (
          <div className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {ancestry.map((a, idx) => (
              <span key={a.id} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight className="h-3 w-3" />}
                <button onClick={() => setSelectedId(a.id)} className="hover:text-foreground">
                  {a.title}
                </button>
              </span>
            ))}
            <span className="ml-auto flex items-center gap-2">
              {mode === "view" && selected.type === "page" && canEdit && (
                <Button size="sm" variant="secondary" className="h-7" onClick={() => setMode("edit")}>
                  Edit
                </Button>
              )}
              {mode === "edit" && (
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setMode("view")}>
                  Cancel edit
                </Button>
              )}
            </span>
          </div>
        )}

        <div className="min-h-0 flex-1">
          {!selected ? (
            <EmptyKnowledge onNewSpace={() => openCreate(null, "space")} />
          ) : mode === "edit" && selected.type === "page" ? (
            <KnowledgeEditor
              node={selected}
              canPublish={canPublish}
              onSaveDraft={onSaveDraft}
              onSubmitReview={onSubmitReview}
              onApprove={onApprove}
              onPublish={onPublish}
              onCancel={() => setMode("view")}
              onRenameTitle={(t) => updateNode(selected.id, { title: t })}
            />
          ) : selected.type === "page" ? (
            <KnowledgeViewer
              node={selected}
              ancestry={ancestry}
              prev={siblings.prev}
              next={siblings.next}
              onEdit={() => setMode("edit")}
              onFavorite={() => toggleFavorite(selected.id)}
              onCopyLink={() => onCopyLink(selected)}
              onMore={() => setDetailsOpen(true)}
              onOpen={(id) => setSelectedId(id)}
              onFeedback={(h) => {
                addFeedback(selected.id, h);
                toast.success("Thanks for the feedback");
              }}
            />
          ) : (
            <KnowledgeBrowse
              parent={browseParent}
              children={browseChildren}
              onOpen={(id) => setSelectedId(id)}
              onEdit={(id) => {
                setSelectedId(id);
                setMode("edit");
              }}
            />
          )}
        </div>
      </section>

      {/* Details now live in an on-demand drawer (see below) for full-width reading */}

      {/* Mobile tree drawer */}
      <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
        <SheetContent side="left" className="w-80 p-4">
          <SheetTitle className="mb-3">Knowledge tree</SheetTitle>
          <Input
            value={treeQuery}
            onChange={(e) => setTreeQuery(e.target.value)}
            placeholder="Filter…"
            className="mb-2 h-8 text-xs"
          />
          <NewMenu selected={selected} onCreate={openCreate} className="mb-2 w-full" />
          <KnowledgeTree
            nodes={data.nodes}
            selectedId={selectedId}
            query={treeQuery}
            actions={{
              onSelect: handleSelect,
              onNewChild: (parent, type) => openCreate(parent, type),
              onNewSpace: () => openCreate(null, "space"),
              onRename: openRename,
              onEditDetails: openEditDetails,
              onMove: openMove,
              onDuplicate: (n) => {
                const c = duplicateNode(n.id);
                if (c) setSelectedId(c.id);
              },
              onArchive: (n) => setConfirmArchive(n),
              onDelete: (n) => setConfirmDelete(n),
              onFavorite: (n) => toggleFavorite(n.id),
              onCopyLink,
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Mobile details drawer */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-96 overflow-y-auto p-4">
          <SheetTitle className="mb-3">Details</SheetTitle>
          {selected && (
            <KnowledgeDetailsPanel
              node={selected}
              ancestry={ancestry}
              onOpen={() => {
                if (selected.type === "page") setMode("view");
                setDetailsOpen(false);
              }}
              onEdit={() => {
                setMode("edit");
                setDetailsOpen(false);
              }}
              onPreview={() => {
                setMode("view");
                setDetailsOpen(false);
              }}
              onFavorite={() => toggleFavorite(selected.id)}
              onCopyLink={() => onCopyLink(selected)}
              onDuplicate={() => {
                const c = duplicateNode(selected.id);
                if (c) setSelectedId(c.id);
              }}
              onMove={() => openMove(selected)}
              onArchive={() => setConfirmArchive(selected)}
              onDelete={() => setConfirmDelete(selected)}
              onRestoreVersion={(vid) => restoreVersion(selected.id, vid)}
              onOpenRelations={() => setRelationsTarget(selected)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Create dialog */}
      <Dialog open={!!createState} onOpenChange={(o) => !o && setCreateState(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New {createState ? labelType(createState.type) : "item"}</DialogTitle>
            <DialogDescription>
              {createState?.parentId
                ? "Will be created inside the selected parent."
                : "Creating at the top level."}
            </DialogDescription>
          </DialogHeader>
          {createState && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select
                  value={createState.type}
                  onValueChange={(v) =>
                    setCreateState({ ...createState, type: v as KnowledgeNodeType })
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {createState.parentId === null && (
                      <SelectItem value="space">Space</SelectItem>
                    )}
                    <SelectItem value="book">Book</SelectItem>
                    <SelectItem value="chapter">Chapter</SelectItem>
                    <SelectItem value="page">Page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Title</Label>
                <Input
                  value={createState.title}
                  onChange={(e) => setCreateState({ ...createState, title: e.target.value })}
                  placeholder={`${labelType(createState.type)} title`}
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-xs">Description (optional)</Label>
                <Textarea
                  value={createState.description}
                  onChange={(e) => setCreateState({ ...createState, description: e.target.value })}
                  rows={2}
                />
              </div>
              {createState.type === "page" && (
                <div>
                  <Label className="text-xs">Template</Label>
                  <Select
                    value={createState.templateId}
                    onValueChange={(v) => setCreateState({ ...createState, templateId: v })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pageTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {pageTemplates.find((t) => t.id === createState.templateId)?.description}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateState(null)}>Cancel</Button>
            <Button onClick={submitCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <Input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} autoFocus />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button onClick={submitRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit details dialog */}
      <Dialog open={!!editDetailsTarget} onOpenChange={(o) => !o && setEditDetailsTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit details</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
            </div>
            <div>
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Review date</Label>
                <Input type="date" value={editReviewDate} onChange={(e) => setEditReviewDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Visibility</Label>
                <Select value={editVisibility} onValueChange={(v) => setEditVisibility(v as KnowledgeNode["visibility"])}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public_internal">Internal</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                    <SelectItem value="confidential">Confidential</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDetailsTarget(null)}>Cancel</Button>
            <Button onClick={submitEditDetails}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog open={!!moveTarget} onOpenChange={(o) => !o && setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move "{moveTarget?.title}"</DialogTitle>
            <DialogDescription>Pick a new parent. Pages can also be moved to the top of a space.</DialogDescription>
          </DialogHeader>
          <Select
            value={moveParentId ?? "__root"}
            onValueChange={(v) => setMoveParentId(v === "__root" ? null : v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__root">— Top level (Space) —</SelectItem>
              {allContainers
                .filter((c) => c.id !== moveTarget?.id)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {labelType(c.type)} · {c.title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveTarget(null)}>Cancel</Button>
            <Button onClick={submitMove}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={!!confirmArchive}
        onOpenChange={(o) => !o && setConfirmArchive(null)}
        title={`Archive "${confirmArchive?.title}"?`}
        description="Archived items and their children are hidden by default but can be restored from filters."
        confirmLabel="Archive"
        onConfirm={() => {
          if (confirmArchive) {
            archiveNode(confirmArchive.id);
            toast.success("Archived");
          }
          setConfirmArchive(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.title}"?`}
        description="This removes the item and all of its children locally."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) {
            const wasSelected = selectedId === confirmDelete.id;
            deleteNode(confirmDelete.id);
            if (wasSelected) setSelectedId(null);
            toast.success("Deleted");
          }
          setConfirmDelete(null);
        }}
      />

      {/* Relations picker */}
      <RelationPicker
        open={!!relationsTarget}
        onOpenChange={(o) => !o && setRelationsTarget(null)}
        value={relsForPicker}
        onSave={(next) => {
          if (!relationsTarget) return;
          onSaveRelations({
            ticketIds: next.ticketIds,
            assetIds: next.assetIds,
            ipamIds: next.ipamIds,
            taskIds: next.taskIds,
            noteIds: next.noteIds,
            userIds: next.userIds,
            pageIds: relationsTarget.relations?.pageIds ?? [],
          });
        }}
        title={`Link records to "${relationsTarget?.title ?? ""}"`}
      />
    </div>
  );
}

function labelType(t: KnowledgeNodeType) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function NewMenu({
  selected,
  onCreate,
  className,
}: {
  selected: KnowledgeNode | null;
  onCreate: (parent: KnowledgeNode | null, type: KnowledgeNodeType) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className={className}>
          <Plus className="mr-1 h-3.5 w-3.5" /> New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
          Create
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onCreate(null, "space")}>New Space</DropdownMenuItem>
        <DropdownMenuSeparator />
        {selected && (
          <>
            {selected.type !== "page" && (
              <DropdownMenuItem onClick={() => onCreate(selected, "book")}>
                New Book in "{selected.title}"
              </DropdownMenuItem>
            )}
            {(selected.type === "book" || selected.type === "chapter") && (
              <DropdownMenuItem onClick={() => onCreate(selected, "chapter")}>
                New Chapter in "{selected.title}"
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() =>
                onCreate(
                  selected.type === "page" ? selected : selected,
                  "page",
                )
              }
            >
              New Page {selected.type === "page" ? "(subpage)" : `in "${selected.title}"`}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyKnowledge({ onNewSpace }: { onNewSpace: () => void }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
          <FileText className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">Welcome to the Knowledge Base</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Author structured documentation as Spaces → Books → Chapters → Pages. Select something on the left, or start a new Space.
        </p>
        <Button className="mt-4" onClick={onNewSpace}>
          <Plus className="mr-1 h-4 w-4" /> New Space
        </Button>
      </div>
    </div>
  );
}
