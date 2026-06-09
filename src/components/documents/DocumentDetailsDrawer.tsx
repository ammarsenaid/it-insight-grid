import { useMemo, useState } from "react";
import {
  Eye,
  Pencil,
  Star,
  Copy,
  Download,
  FolderInput,
  Archive,
  Trash2,
  Link2,
  CheckCircle2,
  Clock,
  RotateCcw,
  ShieldCheck,
  History,
  Network,
  Server,
  CheckSquare,
  StickyNote,
  Ticket,
  UserRound,
  ExternalLink,
} from "lucide-react";
import { DetailsDrawer } from "@/components/common/DetailsDrawer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { ActivityTimeline } from "@/components/common/ActivityTimeline";
import { RelationPicker, type RelationSelection } from "@/components/common/RelationPicker";
import { fileIconFor, formatBytes, formatDate, formatDateTime, timeAgo } from "@/components/common/format";
import type { Document, DocStatus } from "@/lib/data/types";
import {
  addVersion,
  changeStatus,
  getRelations,
  getVersions,
  setRelations,
} from "@/lib/data/documents";
import { ROLES, can, useRole, type Role } from "@/lib/permissions";
import { useData } from "@/lib/data/store";
import { isDocumentVisible } from "@/lib/data/documents";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  doc: Document | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPreview: () => void;
  onEdit: () => void;
  onFavorite: () => void;
  onDuplicate: () => void;
  onDownload: () => void;
  onMove: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function DocumentDetailsDrawer(props: Props) {
  const { doc, open, onOpenChange } = props;
  const role = useRole();
  const data = useData();
  const [tab, setTab] = useState("overview");
  const [versionOpen, setVersionOpen] = useState(false);
  const [newVersion, setNewVersion] = useState("");
  const [versionNote, setVersionNote] = useState("");
  const [relationOpen, setRelationOpen] = useState(false);

  if (!doc) return null;

  const canEdit = can("documents.edit", role);
  const canDelete = can("documents.delete", role);
  const canArchive = can("documents.archive", role);
  const canMove = can("documents.move", role);
  const canChangeStatus = can("documents.changeStatus", role);
  const { Icon, color } = fileIconFor(doc.extension);
  const relations = getRelations(doc);
  const versions = getVersions(doc);

  // Resolve related entities
  const relTasks = data.tasks.filter((t) => relations.taskIds.includes(t.id));
  const relNotes = data.notes.filter((n) => relations.noteIds.includes(n.id));
  const relAssets = data.assets.filter((a) => relations.assetIds.includes(a.id));
  const relIps = data.ipam.filter((p) => relations.ipamIds.includes(p.id));

  // Mock activity for this document
  const activity = data.activity
    .filter((a) => a.message.toLowerCase().includes(doc.title.toLowerCase().slice(0, 12)))
    .slice(0, 6)
    .map((a) => ({
      id: a.id,
      title: a.message,
      timestamp: a.createdAt,
      tone: a.type.includes("delete")
        ? ("danger" as const)
        : a.type.includes("create")
        ? ("success" as const)
        : ("info" as const),
    }));
  if (activity.length === 0) {
    activity.push(
      { id: "syn1", title: `Updated by ${doc.owner || "—"}`, timestamp: doc.updatedAt, tone: "info" as const },
      { id: "syn2", title: "Document created", timestamp: doc.createdAt, tone: "success" as const },
    );
  }

  const handleNewVersion = () => {
    if (!newVersion.trim()) {
      toast.error("Version number required");
      return;
    }
    addVersion(doc.id, newVersion.trim(), versionNote.trim() || "—", doc.owner || "system");
    toast.success(`Published v${newVersion}`);
    setVersionOpen(false);
    setNewVersion("");
    setVersionNote("");
  };

  const handleStatusChange = (next: DocStatus) => {
    changeStatus(doc.id, next);
    toast.success(`Status changed to ${next}`);
  };

  const handleSaveRelations = (next: RelationSelection) => {
    setRelations(doc.id, next);
    toast.success("Relations updated");
  };

  return (
    <>
      <DetailsDrawer
        open={open}
        onOpenChange={onOpenChange}
        title={doc.title}
        description={`${doc.name}.${doc.extension} · v${doc.version}`}
        actions={
          <>
            <Button size="icon" variant="ghost" onClick={props.onPreview} aria-label="Preview">
              <Eye className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={props.onFavorite} aria-label="Favorite">
              <Star className={cn("h-4 w-4", doc.favorite && "fill-[#FFC86B] text-[#FFC86B]")} />
            </Button>
          </>
        }
        footer={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={props.onPreview}>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
            </Button>
            {canEdit && (
              <Button size="sm" variant="secondary" onClick={props.onEdit}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={props.onDuplicate}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
            </Button>
            <Button size="sm" variant="ghost" onClick={props.onDownload}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Download
            </Button>
            {canMove && (
              <Button size="sm" variant="ghost" onClick={props.onMove}>
                <FolderInput className="mr-1.5 h-3.5 w-3.5" /> Move
              </Button>
            )}
            {canArchive && doc.status !== "archived" && (
              <Button size="sm" variant="ghost" onClick={props.onArchive}>
                <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
              </Button>
            )}
            {canDelete && (
              <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={props.onDelete}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </div>
        }
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="relations">Relations</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="permissions">Access</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/5">
                <Icon className={cn("h-6 w-6", color)} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold">{doc.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {doc.name}.{doc.extension} · v{doc.version} · {formatBytes(doc.size)}
                </p>
                {doc.description && (
                  <p className="mt-2 text-sm text-foreground/80">{doc.description}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Info k="Category" v={doc.category} />
              <Info k="Owner" v={doc.owner || "—"} />
              <Info k="Status" v={<StatusBadge tone={statusTone(doc.status)} label={doc.status} />} />
              <Info
                k="Importance"
                v={
                  <StatusBadge
                    tone={doc.importance === "critical" ? "danger" : doc.importance === "high" ? "warning" : "info"}
                    label={doc.importance}
                  />
                }
              />
              <Info k="Modified" v={formatDate(doc.updatedAt)} />
              <Info k="Review date" v={formatDate(doc.reviewDate)} />
              <Info k="Visibility" v={<StatusBadge tone="muted" label={doc.visibility ?? "internal"} />} />
              <Info k="Created" v={formatDate(doc.createdAt)} />
            </div>

            {doc.tags.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {doc.tags.map((t) => (
                    <StatusBadge key={t} tone="muted" label={t} />
                  ))}
                </div>
              </div>
            )}

            {canChangeStatus && (
              <div className="rounded-xl border border-border/40 bg-background/40 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#52D6A4]" /> Review lifecycle
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["draft", "review", "approved", "archived"] as DocStatus[]).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={doc.status === s ? "default" : "ghost"}
                      className="h-7 text-xs"
                      onClick={() => handleStatusChange(s)}
                    >
                      {s === "approved" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                      {s === "review" && <Clock className="mr-1 h-3 w-3" />}
                      {s === "archived" && <Archive className="mr-1 h-3 w-3" />}
                      {s === "draft" && <Pencil className="mr-1 h-3 w-3" />}
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Metadata — read-only listing, full edit via Edit drawer */}
          <TabsContent value="metadata" className="mt-4">
            <div className="space-y-2 text-sm">
              <MetaRow k="ID" v={<span className="font-mono text-xs">{doc.id}</span>} />
              <MetaRow k="Title" v={doc.title} />
              <MetaRow k="File name" v={`${doc.name}.${doc.extension}`} />
              <MetaRow k="Folder" v={data.folders.find((f) => f.id === doc.folderId)?.name ?? "—"} />
              <MetaRow k="Category" v={doc.category} />
              <MetaRow k="Status" v={<StatusBadge tone={statusTone(doc.status)} label={doc.status} />} />
              <MetaRow k="Importance" v={doc.importance} />
              <MetaRow k="Visibility" v={doc.visibility ?? "internal"} />
              <MetaRow k="Owner" v={doc.owner || "—"} />
              <MetaRow k="Version" v={`v${doc.version}`} />
              <MetaRow k="Size" v={formatBytes(doc.size)} />
              <MetaRow k="Created" v={formatDateTime(doc.createdAt)} />
              <MetaRow k="Modified" v={formatDateTime(doc.updatedAt)} />
              <MetaRow k="Review date" v={formatDate(doc.reviewDate)} />
              <MetaRow k="Tags" v={doc.tags.join(", ") || "—"} />
            </div>
            {canEdit && (
              <Button size="sm" variant="secondary" className="mt-4" onClick={props.onEdit}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit metadata
              </Button>
            )}
          </TabsContent>

          {/* Versions */}
          <TabsContent value="versions" className="mt-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {versions.length} version{versions.length === 1 ? "" : "s"}
              </div>
              {canEdit && (
                <Button size="sm" variant="secondary" onClick={() => setVersionOpen(true)}>
                  <History className="mr-1.5 h-3.5 w-3.5" /> Publish version
                </Button>
              )}
            </div>
            <ol className="space-y-2">
              {versions.map((v, i) => (
                <li
                  key={v.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-card/50 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                        v{v.version}
                      </Badge>
                      {i === 0 && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">current</span>}
                    </div>
                    <p className="mt-1 text-xs text-foreground/80">{v.note}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {v.author} · {formatDateTime(v.createdAt)} · {formatBytes(v.size)}
                    </p>
                  </div>
                  {i > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => {
                        addVersion(doc.id, v.version, `Restored from v${v.version}`, doc.owner || "system");
                        toast.success(`Restored v${v.version}`);
                      }}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" /> Restore
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          </TabsContent>

          {/* Relations */}
          <TabsContent value="relations" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Linked records ({relations.ticketIds.length + relations.assetIds.length + relations.ipamIds.length + relations.taskIds.length + relations.noteIds.length + relations.userIds.length})
              </div>
              {canEdit && (
                <Button size="sm" variant="secondary" onClick={() => setRelationOpen(true)}>
                  <Link2 className="mr-1.5 h-3.5 w-3.5" /> Manage
                </Button>
              )}
            </div>

            <RelationGroup
              icon={Ticket}
              title="Tickets"
              items={relations.ticketIds.map((id) => ({ id, label: id }))}
              emptyHint="No linked tickets"
            />
            <RelationGroup
              icon={Server}
              title="Assets"
              items={relAssets.map((a) => ({ id: a.id, label: a.hostname, secondary: a.displayName }))}
              emptyHint="No linked CMDB assets"
            />
            <RelationGroup
              icon={Network}
              title="IP Records"
              items={relIps.map((ip) => ({ id: ip.id, label: ip.ipAddress, secondary: ip.hostname || ip.subnet }))}
              emptyHint="No linked IP records"
            />
            <RelationGroup
              icon={CheckSquare}
              title="Tasks"
              items={relTasks.map((t) => ({ id: t.id, label: t.title, secondary: t.category }))}
              emptyHint="No linked tasks"
            />
            <RelationGroup
              icon={StickyNote}
              title="Notes"
              items={relNotes.map((n) => ({ id: n.id, label: n.title, secondary: n.category }))}
              emptyHint="No linked notes"
            />
            <RelationGroup
              icon={UserRound}
              title="Users"
              items={relations.userIds.map((id) => ({ id, label: id }))}
              emptyHint="No linked users"
            />
          </TabsContent>

          {/* Activity */}
          <TabsContent value="activity" className="mt-4">
            <ActivityTimeline entries={activity} />
          </TabsContent>

          {/* Permissions Preview */}
          <TabsContent value="permissions" className="mt-4 space-y-3">
            <div className="rounded-xl border border-border/40 bg-background/40 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mb-1 inline h-3.5 w-3.5 text-primary" /> Permission preview compares each
              prototype role against this document's visibility (
              <strong className="text-foreground">{doc.visibility ?? "internal"}</strong>) and status (
              <strong className="text-foreground">{doc.status}</strong>).
            </div>
            <ul className="space-y-1.5">
              {ROLES.map((r) => {
                const visible = isDocumentVisible(doc, r.id as Role);
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-border/40 bg-card/50 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium">{r.label}</div>
                      <div className="text-[11px] text-muted-foreground">{r.description}</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        visible
                          ? "border-[#52D6A4]/40 bg-[#52D6A4]/10 text-[#52D6A4]"
                          : "border-[#FF7C91]/40 bg-[#FF7C91]/10 text-[#FF7C91]",
                      )}
                    >
                      {visible ? "Can view" : "Hidden"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </TabsContent>
        </Tabs>
      </DetailsDrawer>

      {/* Publish new version dialog */}
      <Dialog open={versionOpen} onOpenChange={setVersionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish a new version</DialogTitle>
            <DialogDescription>
              Adds a snapshot to the version history. The current document content is preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Version number</Label>
              <Input value={newVersion} onChange={(e) => setNewVersion(e.target.value)} placeholder="e.g. 2.1" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Release note</Label>
              <Textarea
                rows={3}
                value={versionNote}
                onChange={(e) => setVersionNote(e.target.value)}
                placeholder="What changed?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVersionOpen(false)}>Cancel</Button>
            <Button onClick={handleNewVersion}>Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RelationPicker
        open={relationOpen}
        onOpenChange={setRelationOpen}
        value={relations}
        onSave={handleSaveRelations}
        title={`Link records to "${doc.title}"`}
      />
    </>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="mt-0.5 text-xs">{v}</div>
    </div>
  );
}

function MetaRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/30 py-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className="text-right text-xs">{v}</span>
    </div>
  );
}

function RelationGroup({
  icon: Icon,
  title,
  items,
  emptyHint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: { id: string; label: string; secondary?: string }[];
  emptyHint: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-2">
      <div className="mb-1 flex items-center gap-1.5 px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {title} <span className="ml-auto font-mono">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="px-2 pb-1 text-xs text-muted-foreground/70">{emptyHint}</div>
      ) : (
        <ul className="space-y-0.5">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-white/[0.03]"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{it.label}</div>
                {it.secondary && <div className="truncate text-[10px] text-muted-foreground">{it.secondary}</div>}
              </div>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
