import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  RotateCcw,
  Trash2,
  Copy,
  TrendingUp,
  Bell,
  Archive,
  Pencil,
  Server,
  Network,
  FileText,
  Ticket as TicketIcon,
  StickyNote,
  Link2,
} from "lucide-react";
import { toast } from "sonner";

import { DetailsDrawer } from "@/components/common/DetailsDrawer";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, formatDateTime, timeAgo } from "@/components/common/format";
import { useData } from "@/lib/data/store";
import { RelationPicker, type RelationSelection } from "@/components/common/RelationPicker";
import { blockedByOpen, isOverdue } from "@/lib/tasks/tasks";
import type { Task, TaskLinks } from "@/lib/tasks/types";
import { can, useRole } from "@/lib/permissions";

const PRIORITY_TONE = { low: "muted", normal: "info", high: "warning", critical: "danger" } as const;

export function TaskDetailsDrawer({
  task,
  allTasks,
  open,
  onOpenChange,
  onEdit,
  onComplete,
  onReopen,
  onDuplicate,
  onEscalate,
  onArchive,
  onDelete,
  onSetReminder,
  onSaveLinks,
}: {
  task: Task | null;
  allTasks: Task[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEdit: (t: Task) => void;
  onComplete: (id: string) => Promise<unknown>;
  onReopen: (id: string) => Promise<unknown>;
  onDuplicate: (id: string) => Promise<unknown>;
  onEscalate: (id: string) => Promise<unknown>;
  onArchive: (id: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onSetReminder: (id: string, reminderAt: string) => Promise<unknown>;
  onSaveLinks: (id: string, links: TaskLinks) => Promise<unknown>;
}) {
  const data = useData();
  const role = useRole();
  const writable = can("tasks.write", role);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderVal, setReminderVal] = useState("");

  if (!task) return null;
  const t = allTasks.find((x) => x.id === task.id) ?? task;
  const overdue = isOverdue(t);
  const blocked = blockedByOpen(t, allTasks);

  const linkedAsset = data.assets.find((a) => a.id === t.links.linkedAssetId);
  const linkedDoc = data.documents.find((d) => d.id === t.links.linkedDocumentId);
  const linkedTickets = (t.links.linkedTicketIds ?? []).map((id) => data.tickets.find((x) => x.id === id)).filter(Boolean);
  const linkedIps = (t.links.linkedIpamIds ?? []).map((id) => data.ipam.find((x) => x.id === id)).filter(Boolean);
  const linkedNotes = (t.links.linkedNoteIds ?? []).map((id) => data.notes.find((x) => x.id === id)).filter(Boolean);
  const depTasks = (t.links.dependencyIds ?? []).map((id) => allTasks.find((x) => x.id === id)).filter(Boolean) as Task[];

  const relationsValue: RelationSelection = {
    ticketIds: t.links.linkedTicketIds ?? [],
    assetIds: t.links.linkedAssetId ? [t.links.linkedAssetId] : [],
    ipamIds: t.links.linkedIpamIds ?? [],
    taskIds: t.links.dependencyIds ?? [],
    noteIds: t.links.linkedNoteIds ?? [],
    userIds: t.links.linkedUserIds ?? [],
  };

  const runComplete = async () => {
    try { await onComplete(t.id); toast.success("Completed"); } catch { /* mutation onError already surfaced a toast */ }
  };
  const runReopen = async () => {
    try { await onReopen(t.id); toast.success("Reopened"); } catch { /* mutation onError already surfaced a toast */ }
  };
  const runDuplicate = async () => {
    try { await onDuplicate(t.id); toast.success("Duplicated"); } catch { /* mutation onError already surfaced a toast */ }
  };
  const runEscalate = async () => {
    try { await onEscalate(t.id); toast.success("Escalated"); } catch { /* mutation onError already surfaced a toast */ }
  };
  const runArchive = async () => {
    try { await onArchive(t.id); toast.success("Archived"); onOpenChange(false); } catch { /* mutation onError already surfaced a toast */ }
  };
  const runDelete = async () => {
    try {
      await onDelete(t.id);
      setConfirmDelete(false);
      onOpenChange(false);
      toast.success("Moved to recycle bin");
    } catch { /* mutation onError already surfaced a toast */ }
  };
  const runSetReminder = async () => {
    if (!reminderVal) { toast.error("Pick a date/time"); return; }
    try {
      await onSetReminder(t.id, new Date(reminderVal).toISOString());
      toast.success("Reminder scheduled");
      setReminderOpen(false);
    } catch { /* mutation onError already surfaced a toast */ }
  };
  const runSaveLinks = async (sel: RelationSelection) => {
    try {
      await onSaveLinks(t.id, {
        ...t.links,
        linkedTicketIds: sel.ticketIds,
        linkedAssetId: sel.assetIds[0],
        linkedIpamIds: sel.ipamIds,
        dependencyIds: sel.taskIds.filter((id) => id !== t.id),
        linkedNoteIds: sel.noteIds,
        linkedUserIds: sel.userIds,
      });
      toast.success("Links updated");
    } catch { /* mutation onError already surfaced a toast */ }
  };

  return (
    <DetailsDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={`${t.category} · ${t.scope}`}
      actions={
        writable ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => onEdit(t)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          </>
        ) : null
      }
      footer={
        writable ? (
          <div className="flex flex-wrap items-center gap-2">
            {t.status !== "done" ? (
              <Button size="sm" onClick={runComplete}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Complete
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={runReopen}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reopen
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={runDuplicate}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
            </Button>
            <Button size="sm" variant="ghost" onClick={runEscalate}>
              <TrendingUp className="mr-1.5 h-3.5 w-3.5" /> Escalate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReminderOpen((v) => !v)}>
              <Bell className="mr-1.5 h-3.5 w-3.5" /> Reminder
            </Button>
            <Button size="sm" variant="ghost" onClick={runArchive}>
              <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={statusTone(t.status)} label={t.status.replace("_", " ")} />
          <StatusBadge tone={PRIORITY_TONE[t.priority]} label={t.priority} />
          {t.scope && <StatusBadge tone="muted" label={t.scope} />}
          {t.escalated && <StatusBadge tone="danger" label="escalated" />}
          {t.recurring && <StatusBadge tone="info" label={`recurring ${t.recurring.freq}`} />}
          {overdue && <StatusBadge tone="danger" label="overdue" />}
          {blocked && <StatusBadge tone="warning" label="blocked by deps" />}
          {t.archived && <StatusBadge tone="muted" label="archived" />}
        </div>

        {reminderOpen && writable && (
          <div className="rounded-xl border border-border/40 bg-background/40 p-3">
            <Label className="text-xs text-muted-foreground">Set reminder</Label>
            <div className="mt-1.5 flex gap-2">
              <Input type="datetime-local" value={reminderVal} onChange={(e) => setReminderVal(e.target.value)} className="h-8" />
              <Button size="sm" onClick={runSetReminder}>Save</Button>
            </div>
            {t.reminderAt && <div className="mt-1.5 text-[11px] text-muted-foreground">Current: {formatDateTime(t.reminderAt)}</div>}
          </div>
        )}

        <Section label="Details">
          <Row label="Assignee" value={t.assignedTo || "—"} />
          <Row label="Owner" value={t.owner || "—"} />
          <Row label="Team" value={t.team || "—"} />
          <Row label="Due" value={t.dueDate ? formatDate(t.dueDate) : "—"} />
          <Row label="Reminder" value={t.reminderAt ? formatDateTime(t.reminderAt) : "—"} />
          <Row label="Created" value={timeAgo(t.createdAt)} />
          <Row label="Updated" value={timeAgo(t.updatedAt)} />
          {t.completedAt && <Row label="Completed" value={timeAgo(t.completedAt)} />}
        </Section>

        {t.description && (
          <Section label="Description">
            <p className="whitespace-pre-wrap text-sm text-foreground/90">{t.description}</p>
          </Section>
        )}

        {t.tags.length > 0 && (
          <Section label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {t.tags.map((tag) => (
                <StatusBadge key={tag} tone="muted" label={tag} />
              ))}
            </div>
          </Section>
        )}

        <Section label="Dependencies" right={writable && (
          <Button size="sm" variant="ghost" onClick={() => setLinkOpen(true)}><Link2 className="mr-1 h-3 w-3" /> Manage</Button>
        )}>
          {depTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">No dependencies.</p>
          ) : (
            <ul className="space-y-1">
              {depTasks.map((d) => (
                <li key={d.id} className="flex items-center justify-between rounded-md border border-border/30 bg-background/30 px-2.5 py-1.5 text-xs">
                  <span className="truncate">{d.title}</span>
                  <StatusBadge tone={statusTone(d.status)} label={d.status.replace("_", " ")} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section label="Linked records">
          <LinkedList>
            {linkedAsset && (
              <LinkedItem icon={Server} primary={linkedAsset.hostname} secondary={linkedAsset.displayName} to="/cmdb" />
            )}
            {linkedDoc && <LinkedItem icon={FileText} primary={linkedDoc.title} secondary={linkedDoc.category} to="/documents" />}
            {linkedTickets.map((tk) => tk && (
              <LinkedItem key={tk.id} icon={TicketIcon} primary={tk.number} secondary={tk.subject} to="/tickets/$id" params={{ id: tk.id }} />
            ))}
            {linkedIps.map((ip) => ip && (
              <LinkedItem key={ip.id} icon={Network} primary={ip.ipAddress} secondary={ip.hostname} to="/ipam" />
            ))}
            {linkedNotes.map((n) => n && (
              <LinkedItem key={n.id} icon={StickyNote} primary={n.title} secondary={n.category} to="/notes" />
            ))}
            {!linkedAsset && !linkedDoc && linkedTickets.length === 0 && linkedIps.length === 0 && linkedNotes.length === 0 && (
              <p className="text-xs text-muted-foreground">No linked records.</p>
            )}
          </LinkedList>
        </Section>

        {t.links.sourceTicketId && (
          <Section label="Source">
            <p className="text-xs text-muted-foreground">
              Converted from ticket{" "}
              <Link to="/tickets/$id" params={{ id: t.links.sourceTicketId }} className="text-primary hover:underline">
                view
              </Link>
            </p>
          </Section>
        )}
      </div>

      <RelationPicker
        open={linkOpen}
        onOpenChange={setLinkOpen}
        value={relationsValue}
        title="Link records to task"
        onSave={runSaveLinks}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete task?"
        destructive
        confirmLabel="Delete"
        onConfirm={runDelete}
      />
    </DetailsDrawer>
  );
}

function Section({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</h4>
        {right}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/20 py-1 text-xs last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function LinkedList({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-1">{children}</ul>;
}

function LinkedItem({
  icon: Icon,
  primary,
  secondary,
  to,
  params,
}: {
  icon: typeof Server;
  primary: string;
  secondary?: string;
  to: string;
  params?: Record<string, string>;
}) {
  return (
    <li>
      <Link
        to={to as never}
        params={params as never}
        className="flex items-center gap-2 rounded-md border border-border/30 bg-background/30 px-2.5 py-1.5 text-xs hover:border-primary/40"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{primary}</span>
        {secondary && <span className="ml-auto truncate text-muted-foreground">{secondary}</span>}
      </Link>
    </li>
  );
}
