import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDate, formatDateTime, timeAgo } from "@/components/common/format";
import { Markdown } from "@/components/common/Markdown";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  RotateCcw,
  GitCompare,
  ChevronRight,
  Pencil,
  Eye,
  Copy as CopyIcon,
  FolderInput,
  Archive,
  Trash2,
  Link as LinkIcon,
  Star,
  Plus,
} from "lucide-react";
import { useData } from "@/lib/data/store";
import { useRole } from "@/lib/permissions";
import type { KnowledgeNode } from "@/lib/knowledge/types";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/knowledge/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function KnowledgeDetailsPanel({
  node,
  ancestry,
  onOpen,
  onEdit,
  onPreview,
  onFavorite,
  onCopyLink,
  onDuplicate,
  onMove,
  onArchive,
  onDelete,
  onRestoreVersion,
  onOpenRelations,
}: {
  node: KnowledgeNode;
  ancestry: KnowledgeNode[];
  onOpen: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onFavorite: () => void;
  onCopyLink: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRestoreVersion: (versionId: string) => void;
  onOpenRelations: () => void;
}) {
  const data = useData();
  const role = useRole();
  const [tab, setTab] = useState("overview");
  const [compareOpen, setCompareOpen] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const relations = node.relations;
  const versions = [...(node.versions ?? [])].sort((a, b) => b.version - a.version);
  const reviews = [...(node.reviews ?? [])].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );

  const linkedTickets = data.tickets.filter((t) => relations?.ticketIds.includes(t.id));
  const linkedAssets = data.assets.filter((a) => relations?.assetIds.includes(a.id));
  const linkedIpam = data.ipam.filter((i) => relations?.ipamIds.includes(i.id));
  const linkedTasks = data.tasks.filter((t) => relations?.taskIds.includes(t.id));
  const linkedNotes = data.notes.filter((n) => relations?.noteIds.includes(n.id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3">
        <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          {ancestry.slice(0, -1).map((a, idx) => (
            <span key={a.id} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="h-3 w-3" />}
              <span>{a.title}</span>
            </span>
          ))}
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{node.type}</div>
            <div className="line-clamp-2 text-base font-semibold">{node.title}</div>
            {node.description && (
              <div className="mt-1 text-xs text-muted-foreground">{node.description}</div>
            )}
          </div>
          <StatusBadge label={STATUS_LABEL[node.status]} tone={STATUS_TONE[node.status]} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onOpen}>
            <Eye className="mr-1 h-3 w-3" /> Open
          </Button>
          {node.type === "page" && (
            <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onEdit}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onPreview}>
            <Eye className="mr-1 h-3 w-3" /> Preview
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCopyLink}>
            <LinkIcon className="mr-1 h-3 w-3" /> Link
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onFavorite}>
            <Star className={`mr-1 h-3 w-3 ${node.favorite ? "fill-amber-400 text-amber-400" : ""}`} /> Favorite
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDuplicate}>
            <CopyIcon className="mr-1 h-3 w-3" /> Duplicate
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onMove}>
            <FolderInput className="mr-1 h-3 w-3" /> Move
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onArchive}>
            <Archive className="mr-1 h-3 w-3" /> Archive
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {[
            { id: "overview", label: "Overview" },
            { id: "metadata", label: "Metadata" },
            { id: "versions", label: "Versions" },
            { id: "relations", label: "Relations" },
            { id: "activity", label: "Activity" },
            { id: "perms", label: "Permissions" },
          ].map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="h-7 rounded-lg border border-transparent bg-card/40 px-2.5 text-[11px] data-[state=active]:border-primary/40 data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-3 min-h-0 flex-1 overflow-auto">
          <TabsContent value="overview" className="m-0 space-y-3">
            <Field label="Type" value={node.type} />
            <Field label="Status" value={STATUS_LABEL[node.status]} />
            <Field label="Owner" value={node.ownerId} />
            <Field label="Visibility" value={node.visibility.replace("_", " ")} />
            <Field label="Created" value={formatDateTime(node.createdAt)} />
            <Field label="Updated" value={formatDateTime(node.updatedAt)} />
            {node.reviewDate && <Field label="Review by" value={formatDate(node.reviewDate)} />}
            <Field label="Version" value={`v${node.version}`} />
            {node.tags.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] uppercase text-muted-foreground">Tags</div>
                <div className="flex flex-wrap gap-1">
                  {node.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="metadata" className="m-0 space-y-2">
            <Field label="ID" value={node.id} mono />
            <Field label="Slug" value={node.slug} mono />
            <Field label="Parent" value={node.parentId ?? "—"} mono />
            <Field label="Order" value={String(node.order)} />
            <Field label="Views" value={String(node.views ?? 0)} />
            <Field label="Contributors" value={node.contributorIds.join(", ") || "—"} />
          </TabsContent>

          <TabsContent value="versions" className="m-0 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase text-muted-foreground">
                {versions.length} version{versions.length === 1 ? "" : "s"}
              </div>
              {versions.length >= 2 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCompareOpen(true)}>
                  <GitCompare className="mr-1 h-3 w-3" /> Compare
                </Button>
              )}
            </div>
            {versions.length === 0 ? (
              <div className="text-xs text-muted-foreground">No versions yet.</div>
            ) : (
              <ul className="space-y-2">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-lg border border-border/40 bg-background/40 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-[11px] text-foreground">v{v.version}</div>
                      <StatusBadge label={STATUS_LABEL[v.status]} tone={STATUS_TONE[v.status]} />
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {v.author} · {timeAgo(v.createdAt)}
                    </div>
                    {v.note && <div className="mt-1 text-foreground/80">{v.note}</div>}
                    <div className="mt-2 flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setConfirmRestore(v.id)}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" /> Restore
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="relations" className="m-0 space-y-2">
            <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onOpenRelations}>
              <Plus className="mr-1 h-3 w-3" /> Link records
            </Button>
            <RelGroup label="Tickets" items={linkedTickets.map((t) => `${t.number} · ${t.subject}`)} />
            <RelGroup label="Assets" items={linkedAssets.map((a) => `${a.hostname} (${a.ipAddress})`)} />
            <RelGroup label="IP Records" items={linkedIpam.map((i) => `${i.ipAddress} · ${i.hostname || i.subnet}`)} />
            <RelGroup label="Tasks" items={linkedTasks.map((t) => t.title)} />
            <RelGroup label="Notes" items={linkedNotes.map((n) => n.title)} />
            <RelGroup label="Pages" items={
              (relations?.pageIds ?? [])
                .map((id) => relations ? id : id)
                .map((id) => id)
            } />
          </TabsContent>

          <TabsContent value="activity" className="m-0 space-y-2">
            {reviews.length === 0 ? (
              <div className="text-xs text-muted-foreground">No activity yet.</div>
            ) : (
              <ul className="space-y-2">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border/40 bg-background/40 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{r.action.replace("_", " ")}</span>
                      <span className="text-[10px] text-muted-foreground">{timeAgo(r.createdAt)}</span>
                    </div>
                    <div className="mt-0.5 text-muted-foreground">{r.actor}</div>
                    {r.comment && <div className="mt-1 text-foreground/80">{r.comment}</div>}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="perms" className="m-0 space-y-2 text-xs">
            <div className="rounded-lg border border-border/40 bg-background/40 p-3">
              <div className="mb-2 text-[11px] uppercase text-muted-foreground">
                Effective for role: {role}
              </div>
              <ul className="space-y-1">
                <Perm label="View" allowed={true} />
                <Perm label="Edit" allowed={["super_admin", "it_admin", "doc_editor", "technician", "helpdesk"].includes(role)} />
                <Perm label="Submit for review" allowed={["super_admin", "it_admin", "doc_editor", "technician", "helpdesk"].includes(role)} />
                <Perm label="Approve / Publish" allowed={["super_admin", "it_admin", "doc_editor"].includes(role)} />
                <Perm label="Delete" allowed={["super_admin", "it_admin"].includes(role)} />
              </ul>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Compare versions</DialogTitle>
          </DialogHeader>
          {versions.length >= 2 ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-[11px] uppercase text-muted-foreground">
                  v{versions[1].version} · {formatDate(versions[1].createdAt)}
                </div>
                <div className="max-h-[60vh] overflow-auto rounded-lg border border-border/40 bg-background/40 p-3 text-xs">
                  <Markdown source={versions[1].content} />
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] uppercase text-muted-foreground">
                  v{versions[0].version} · {formatDate(versions[0].createdAt)}
                </div>
                <div className="max-h-[60vh] overflow-auto rounded-lg border border-primary/40 bg-primary/[0.04] p-3 text-xs">
                  <Markdown source={versions[0].content} />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Need at least two versions to compare.</div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmRestore}
        onOpenChange={(o) => !o && setConfirmRestore(null)}
        title="Restore this version?"
        description="A new version will be created with the restored content. Current content will be preserved in history."
        confirmLabel="Restore"
        onConfirm={() => {
          if (confirmRestore) onRestoreVersion(confirmRestore);
          setConfirmRestore(null);
        }}
      />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right ${mono ? "font-mono text-[10px]" : ""}`}>{value}</span>
    </div>
  );
}

function RelGroup({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((it, i) => (
          <Badge key={i} variant="outline" className="max-w-full truncate text-[10px]">
            {it}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function Perm({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span>{label}</span>
      <span className={allowed ? "text-emerald-400" : "text-muted-foreground"}>
        {allowed ? "Allowed" : "Denied"}
      </span>
    </li>
  );
}
