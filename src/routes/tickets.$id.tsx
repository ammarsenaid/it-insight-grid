import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Send,
  Lock,
  Paperclip,
  Eye,
  Users as UsersIcon,
  Server,
  Network,
  FileText,
  CheckSquare,
  StickyNote,
  User as UserIcon,
  Clock,
  TrendingUp,
  UserCheck,
  PlayCircle,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormDrawer } from "@/components/common/FormDrawer";
import { formatDateTime, timeAgo } from "@/components/common/format";
import { useData } from "@/lib/data/store";
import {
  AGENTS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TEAMS,
  addAttachment,
  addComment,
  archiveTickets,
  assignTickets,
  currentRequesterFor,
  escalate,
  isRequesterRole,
  recomputeSla,
  reopenTicket,
  resolveTicket,
  setPriority,
  setStatus,
  setTeam,
  setWatchers,
  slaLabel,
} from "@/lib/data/tickets";
import type { Ticket, TicketPriority, TicketStatus } from "@/lib/data/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRole, can } from "@/lib/permissions";

export const Route = createFileRoute("/tickets/$id")({
  head: () => ({ meta: [{ title: "Ticket · IT Knowledge Center" }] }),
  component: TicketDetail,
});

const PRIORITY_TONE: Record<TicketPriority, "muted" | "info" | "warning" | "danger"> = {
  low: "muted", normal: "info", high: "warning", critical: "danger",
};
const STATUS_TONE: Record<TicketStatus, "info" | "warning" | "success" | "muted" | "danger" | "default"> = {
  open: "info", in_progress: "warning", waiting: "muted", resolved: "success", closed: "muted", cancelled: "danger",
};

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " "); }
function labelStatus(s: TicketStatus) { return s === "in_progress" ? "In progress" : cap(s); }

function TicketDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const data = useData();
  const role = useRole();
  const internalAllowed = can("tickets.viewInternal", role);
  const canResolve = can("tickets.resolve", role);
  const isRequesterView = !internalAllowed;
  const ticket = useMemo(() => {
    const t = data.tickets.find((x) => x.id === id);
    return t ? recomputeSla(t) : undefined;
  }, [data.tickets, id]);

  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [watchersOpen, setWatchersOpen] = useState(false);
  const [watcherInput, setWatcherInput] = useState("");

  if (!ticket) {
    return (
      <div>
        <PageHeader title="Ticket not found" description="The ticket may have been archived or its link is incorrect." actions={<Link to="/tickets"><Button variant="secondary"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to queue</Button></Link>} />
      </div>
    );
  }

  // Visibility guard for requester portal: only allow if it's the user's own ticket.
  // Auditor read-only access is preserved (they are not a requester role).
  if (isRequesterRole(role) && ticket.requester !== currentRequesterFor(role)) {
    return (
      <div>
        <PageHeader title="Access restricted" description="This ticket belongs to another requester." actions={<Link to="/my-requests"><Button variant="secondary"><ArrowLeft className="mr-1.5 h-4 w-4" /> My requests</Button></Link>} />
      </div>
    );
  }

  const sla = slaLabel(ticket);
  const linkedAsset = data.assets.find((a) => a.id === ticket.linkedAssetId);
  const linkedIp = data.ipam.find((p) => p.id === ticket.linkedIpamId);
  const linkedDoc = data.documents.find((d) => d.id === ticket.linkedDocumentId);
  // Related tickets: same category, exclude self
  const relatedTickets = data.tickets.filter((t) => t.id !== ticket.id && t.category === ticket.category).slice(0, 5);
  // Related tasks / notes: linked to same asset
  const relatedTasks = data.tasks.filter((t) => t.linkedAssetId && t.linkedAssetId === ticket.linkedAssetId);
  const relatedNotes = data.notes.filter((n) => n.linkedDocumentId && n.linkedDocumentId === ticket.linkedDocumentId);

  const conversation = ticket.comments.filter((c) => isRequesterView ? !c.internal : true);

  const currentActor = isRequesterView ? ticket.requester : AGENTS[0];

  const handleReply = () => {
    if (!reply.trim()) return toast.error("Type a message before sending");
    addComment(ticket.id, currentActor, reply.trim(), internal && internalAllowed);
    setReply("");
    setInternal(false);
    toast.success(internal ? "Internal note added" : "Reply sent");
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Link to={isRequesterView ? "/my-requests" : "/tickets"} className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> {isRequesterView ? "My requests" : "Ticket queue"}
        </Link>
        <span>/</span>
        <span className="font-mono text-foreground">{ticket.number}</span>
      </div>

      <PageHeader
        title={ticket.subject}
        description={`${cap(ticket.type)} · ${ticket.category}${ticket.subcategory ? " / " + ticket.subcategory : ""} · Requested by ${ticket.requester}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isRequesterView && (
              <>
                <Button variant="secondary" disabled={!canResolve} onClick={() => escalate(ticket.id)}>
                  <TrendingUp className="mr-1.5 h-4 w-4" /> Escalate
                </Button>
                {ticket.status === "resolved" || ticket.status === "closed" ? (
                  <Button variant="secondary" onClick={() => setReopenOpen(true)} disabled={!canResolve}>
                    <RotateCcw className="mr-1.5 h-4 w-4" /> Reopen
                  </Button>
                ) : (
                  <Button onClick={() => setResolveOpen(true)} disabled={!canResolve}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" /> Resolve
                  </Button>
                )}
                <Button variant="ghost" className="text-[#FF7C91]" disabled={!can("documents.delete", role)} onClick={() => setArchiveOpen(true)}>
                  <Trash2 className="mr-1.5 h-4 w-4" /> Archive
                </Button>
              </>
            )}
            {isRequesterView && (ticket.status === "resolved" || ticket.status === "closed") && (
              <Button variant="secondary" onClick={() => setReopenOpen(true)}>
                <RotateCcw className="mr-1.5 h-4 w-4" /> Reopen request
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Status strip */}
          <div className="glass-card grid grid-cols-2 gap-3 rounded-2xl p-4 sm:grid-cols-4">
            <Stat label="Status"><StatusBadge label={labelStatus(ticket.status)} tone={STATUS_TONE[ticket.status]} /></Stat>
            <Stat label="Priority"><StatusBadge label={cap(ticket.priority)} tone={PRIORITY_TONE[ticket.priority]} /></Stat>
            <Stat label="SLA"><StatusBadge label={sla.label} tone={sla.tone} /></Stat>
            <Stat label="Updated"><span suppressHydrationWarning>{timeAgo(ticket.updatedAt)}</span></Stat>
          </div>

          <SectionCard title="Description">
            <p className="whitespace-pre-line text-sm text-muted-foreground">{ticket.description}</p>
          </SectionCard>

          <SectionCard title="Conversation">
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All ({conversation.length})</TabsTrigger>
                {internalAllowed && (
                  <TabsTrigger value="internal">
                    <Lock className="mr-1 h-3 w-3" /> Internal ({ticket.comments.filter((c) => c.internal).length})
                  </TabsTrigger>
                )}
                <TabsTrigger value="public">Replies ({ticket.comments.filter((c) => !c.internal).length})</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="mt-3 space-y-2">
                {conversation.map((c) => <CommentBubble key={c.id} author={c.author} body={c.body} internal={c.internal} createdAt={c.createdAt} />)}
                {conversation.length === 0 && <p className="text-xs text-muted-foreground">No messages yet.</p>}
              </TabsContent>
              {internalAllowed && (
                <TabsContent value="internal" className="mt-3 space-y-2">
                  {ticket.comments.filter((c) => c.internal).map((c) => <CommentBubble key={c.id} author={c.author} body={c.body} internal createdAt={c.createdAt} />)}
                  {ticket.comments.filter((c) => c.internal).length === 0 && <p className="text-xs text-muted-foreground">No internal notes.</p>}
                </TabsContent>
              )}
              <TabsContent value="public" className="mt-3 space-y-2">
                {ticket.comments.filter((c) => !c.internal).map((c) => <CommentBubble key={c.id} author={c.author} body={c.body} internal={false} createdAt={c.createdAt} />)}
              </TabsContent>
            </Tabs>

            {can("tickets.create", role) ? (
              <div className="mt-4 rounded-xl border border-border/60 bg-background/30 p-3">
                <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={internal ? "Add an internal note (visible only to IT)…" : "Reply to requester…"} rows={3} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {can("tickets.assign", role) && (
                      <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-primary" />
                        <Lock className="h-3 w-3" /> Internal note
                      </label>
                    )}
                  </div>
                  <Button size="sm" onClick={handleReply}>
                    <Send className="mr-1 h-3.5 w-3.5" /> Send
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-border/60 bg-background/20 p-3 text-xs text-muted-foreground">
                Read-only access — you cannot post replies or notes on this ticket.
              </p>
            )}
          </SectionCard>

          {ticket.attachments.length > 0 && (
            <SectionCard title={`Attachments (${ticket.attachments.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {ticket.attachments.map((f, i) => (
                  <Badge key={i} variant="outline" className="font-mono text-[10px]">
                    <Paperclip className="mr-1 h-3 w-3" />{f}
                  </Badge>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Activity timeline">
            <ol className="relative space-y-3 border-l border-border/40 pl-4">
              <TimelineItem label={`Ticket created by ${ticket.requester}`} at={ticket.createdAt} />
              {ticket.assignee && <TimelineItem label={`Assigned to ${ticket.assignee}`} at={ticket.updatedAt} tone="info" />}
              {ticket.status === "in_progress" && <TimelineItem label="Work started" at={ticket.updatedAt} tone="warning" />}
              {ticket.status === "waiting" && <TimelineItem label="Waiting on requester" at={ticket.updatedAt} tone="muted" />}
              {ticket.resolvedAt && <TimelineItem label="Ticket resolved" at={ticket.resolvedAt} tone="success" />}
              {ticket.comments.slice(-3).map((c) => (
                <TimelineItem key={c.id} label={`${c.author} ${c.internal ? "added internal note" : "replied"}`} at={c.createdAt} />
              ))}
            </ol>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="People">
            <KV k="Requester" v={ticket.requester} icon={UserIcon} />
            <KV k="Assignee" v={ticket.assignee ?? <em className="text-[#FFC86B] not-italic">Unassigned</em>} icon={UserCheck} />
            <KV k="Team" v={ticket.team ?? "—"} icon={UsersIcon} />
            {!isRequesterView && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Select value={ticket.assignee ?? "none"} onValueChange={(v) => { assignTickets([ticket.id], v === "none" ? "" : v); toast.success(v === "none" ? "Unassigned" : `Assigned to ${v}`); }}>
                  <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="Reassign" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={ticket.team ?? TICKET_TEAMS[0]} onValueChange={(v) => { setTeam([ticket.id], v); toast.success(`Team: ${v}`); }}>
                  <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Lifecycle">
            <KV k="Status" v={<StatusBadge label={labelStatus(ticket.status)} tone={STATUS_TONE[ticket.status]} />} />
            <KV k="Priority" v={<StatusBadge label={cap(ticket.priority)} tone={PRIORITY_TONE[ticket.priority]} />} />
            <KV k="SLA" v={<StatusBadge label={sla.label} tone={sla.tone} />} icon={AlertTriangle} />
            <KV k="SLA due" v={<span suppressHydrationWarning>{ticket.slaDueAt ? formatDateTime(ticket.slaDueAt) : "—"}</span>} icon={Clock} />
            <KV k="Created" v={<span suppressHydrationWarning>{formatDateTime(ticket.createdAt)}</span>} />
            <KV k="Updated" v={<span suppressHydrationWarning>{formatDateTime(ticket.updatedAt)}</span>} />
            {!isRequesterView && (
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <Select value={ticket.status} onValueChange={(v) => { setStatus([ticket.id], v as TicketStatus); toast.success(`Status: ${labelStatus(v as TicketStatus)}`); }}>
                  <SelectTrigger className="h-8 text-xs"><PlayCircle className="mr-1 h-3 w-3" /><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelStatus(s)}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={ticket.priority} onValueChange={(v) => { setPriority([ticket.id], v as TicketPriority); toast.success(`Priority: ${cap(v)}`); }}>
                  <SelectTrigger className="h-8 text-xs"><AlertTriangle className="mr-1 h-3 w-3" /><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{cap(p)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Linked records">
            {linkedAsset && <LinkedRow to="/cmdb" icon={Server} label={linkedAsset.hostname} sub={linkedAsset.displayName} />}
            {linkedIp && <LinkedRow to="/ipam" icon={Network} label={linkedIp.ipAddress} sub={linkedIp.hostname} />}
            {linkedDoc && <LinkedRow to="/documents" icon={FileText} label={linkedDoc.title} sub={linkedDoc.category} />}
            {relatedTasks.slice(0, 3).map((t) => <LinkedRow key={t.id} to="/tasks" icon={CheckSquare} label={t.title} sub={t.category} />)}
            {relatedNotes.slice(0, 3).map((n) => <LinkedRow key={n.id} to="/notes" icon={StickyNote} label={n.title} sub={n.category} />)}
            {!linkedAsset && !linkedIp && !linkedDoc && relatedTasks.length === 0 && relatedNotes.length === 0 && (
              <p className="text-xs text-muted-foreground">No linked records.</p>
            )}
          </SectionCard>

          <SectionCard title={`Watchers (${ticket.watchers.length})`}>
            <div className="flex flex-wrap gap-1.5">
              {ticket.watchers.map((w) => (
                <Badge key={w} variant="outline" className="text-[10px]">
                  {w}
                  {!isRequesterView && (
                    <button onClick={() => { setWatchers(ticket.id, ticket.watchers.filter((x) => x !== w)); toast.success("Watcher removed"); }} className="ml-1 text-muted-foreground hover:text-foreground">×</button>
                  )}
                </Badge>
              ))}
              {ticket.watchers.length === 0 && <span className="text-xs text-muted-foreground">No watchers</span>}
            </div>
            {!isRequesterView && (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setWatchersOpen(true)}>
                <UsersIcon className="mr-1 h-3.5 w-3.5" /> Add watcher
              </Button>
            )}
          </SectionCard>

          {relatedTickets.length > 0 && (
            <SectionCard title={`Related tickets (${relatedTickets.length})`}>
              <div className="space-y-1.5">
                {relatedTickets.map((t) => (
                  <Link key={t.id} to="/tickets/$id" params={{ id: t.id }} className="block rounded-lg border border-border/40 bg-background/30 p-2 text-xs transition-colors hover:bg-white/[0.03]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-primary">{t.number}</span>
                      <StatusBadge label={labelStatus(t.status)} tone={STATUS_TONE[t.status]} />
                    </div>
                    <div className="mt-0.5 truncate">{t.subject}</div>
                  </Link>
                ))}
              </div>
            </SectionCard>
          )}

          {ticket.tags.length > 0 && (
            <SectionCard title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {ticket.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]"><Tag className="mr-1 h-3 w-3" />{t}</Badge>)}
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive ${ticket.number}?`}
        description="The ticket will be moved to the recycle bin and can be restored later."
        confirmLabel="Archive"
        destructive
        onConfirm={() => { archiveTickets([ticket.id]); toast.success(`${ticket.number} archived`); navigate({ to: "/tickets" }); }}
      />

      <FormDrawer
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        title={`Resolve ${ticket.number}`}
        description="Add a resolution summary visible to the requester."
        submitLabel="Mark resolved"
        onSubmit={() => {
          if (resolution.trim().length < 4) return toast.error("Provide a resolution summary");
          resolveTicket(ticket.id, resolution.trim(), currentActor);
          setResolution("");
          setResolveOpen(false);
          toast.success("Ticket resolved");
        }}
      >
        <div className="space-y-2">
          <Label className="text-xs">Resolution</Label>
          <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={4} placeholder="What was done to resolve this?" />
        </div>
      </FormDrawer>

      <FormDrawer
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title={`Reopen ${ticket.number}`}
        submitLabel="Reopen ticket"
        onSubmit={() => {
          if (reopenReason.trim().length < 4) return toast.error("Provide a reason");
          reopenTicket(ticket.id, reopenReason.trim(), currentActor);
          setReopenReason("");
          setReopenOpen(false);
          toast.success("Ticket reopened");
        }}
      >
        <div className="space-y-2">
          <Label className="text-xs">Reason for reopening</Label>
          <Textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={3} />
        </div>
      </FormDrawer>

      <FormDrawer
        open={watchersOpen}
        onOpenChange={setWatchersOpen}
        title="Add watcher"
        submitLabel="Add"
        onSubmit={() => {
          const v = watcherInput.trim();
          if (!v) return toast.error("Enter a username");
          if (ticket.watchers.includes(v)) return toast.info("Already watching");
          setWatchers(ticket.id, [...ticket.watchers, v]);
          setWatcherInput("");
          setWatchersOpen(false);
          toast.success(`${v} added as watcher`);
        }}
      >
        <div className="space-y-2">
          <Label className="text-xs">Username</Label>
          <Input value={watcherInput} onChange={(e) => setWatcherInput(e.target.value)} placeholder="user.name" />
        </div>
      </FormDrawer>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function CommentBubble({ author, body, internal, createdAt }: { author: string; body: string; internal: boolean; createdAt: string }) {
  return (
    <div className={`rounded-xl border p-3 ${internal ? "border-[#FFC86B]/30 bg-[#FFC86B]/5" : "border-border/40 bg-background/30"}`}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-medium">
          {author}
          {internal && <span className="ml-2 inline-flex items-center gap-1 rounded bg-[#FFC86B]/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#FFC86B]"><Lock className="h-2.5 w-2.5" /> Internal</span>}
        </span>
        <span className="text-muted-foreground" suppressHydrationWarning>{timeAgo(createdAt)}</span>
      </div>
      <p className="whitespace-pre-line text-sm">{body}</p>
    </div>
  );
}

function TimelineItem({ label, at, tone = "muted" }: { label: string; at: string; tone?: "success" | "warning" | "danger" | "info" | "muted" }) {
  const colors = {
    success: "bg-[#52D6A4]", warning: "bg-[#FFC86B]", danger: "bg-[#FF7C91]", info: "bg-[#5B8CFF]", muted: "bg-muted-foreground",
  } as const;
  return (
    <li className="relative">
      <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-2 ring-background ${colors[tone]}`} />
      <p className="text-xs leading-snug">{label}</p>
      <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>{timeAgo(at)}</p>
    </li>
  );
}

function KV({ k, v, icon: Icon }: { k: string; v: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/30 py-1.5 last:border-b-0">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />} {k}
      </span>
      <span className="text-right text-xs">{v}</span>
    </div>
  );
}

function LinkedRow({ to, icon: Icon, label, sub }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string; sub: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/30 p-2 transition-colors hover:bg-white/[0.03]">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{label}</div>
        <div className="truncate text-[10px] text-muted-foreground">{sub}</div>
      </div>
      <Eye className="h-3 w-3 text-muted-foreground" />
    </Link>
  );
}
