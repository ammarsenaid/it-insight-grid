import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Send,
  Lock,
  Users as UsersIcon,
  User as UserIcon,
  Clock,
  UserCheck,
  PlayCircle,
  Tag,
  Paperclip,
  Trash2,
  Download,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FormDrawer } from "@/components/common/FormDrawer";
import { formatDateTime, timeAgo } from "@/components/common/format";

import { Button } from "@/components/ui/button";
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

import { useAuth } from "@/lib/auth/AuthProvider";
import { useRole, can } from "@/lib/permissions";
import {
  profilesQuery,
  sdKeys,
  ticketQuery,
  ticketCommentsQuery,
  ticketStatusEventsQuery,
  ticketAssignmentHistoryQuery,
  ticketAttachmentsQuery,
} from "@/lib/service-desk/queries";
import {
  updateTicket,
} from "@/lib/service-desk/tickets";
import { addTicketComment } from "@/lib/service-desk/comments";
import {
  uploadTicketAttachment,
  deleteTicketAttachment,
  getAttachmentSignedUrl,
} from "@/lib/service-desk/attachments";
import { nameOf, profileMap } from "@/lib/service-desk/profiles";
import type {
  TicketAttachment,
  TicketPriority,
  TicketStatus,
} from "@/lib/service-desk/types";

export const Route = createFileRoute("/tickets/$id")({
  head: () => ({ meta: [{ title: "Ticket · IT Knowledge Center" }] }),
  component: TicketDetail,
});

const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "on_hold", "resolved", "closed", "reopened"];
const TICKET_PRIORITIES: TicketPriority[] = ["low", "normal", "high", "critical"];
const SUGGESTED_TEAMS = ["Service Desk", "Field Ops", "Network", "Infrastructure"];

const PRIORITY_TONE: Record<TicketPriority, "muted" | "info" | "warning" | "danger"> = {
  low: "muted", normal: "info", high: "warning", critical: "danger",
};
const STATUS_TONE: Record<TicketStatus, "info" | "warning" | "success" | "muted" | "danger" | "default"> = {
  open: "info", in_progress: "warning", on_hold: "muted", resolved: "success", closed: "muted", reopened: "danger",
};

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " "); }
function labelStatus(s: TicketStatus) { return s === "in_progress" ? "In progress" : s === "on_hold" ? "On hold" : cap(s); }

function TicketDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session } = useAuth();
  const role = useRole();
  const userId = session?.user?.id ?? "";

  const internalAllowed = can("tickets.viewInternal", role);
  const canAssign = can("tickets.assign", role);
  const canResolve = can("tickets.resolve", role);
  const canCommentPublic = can("tickets.commentPublic", role);
  const canCommentInternal = can("tickets.commentInternal", role);
  const canViewAttachments = can("tickets.attachments.view", role);
  const canUploadAttachments = can("tickets.attachments.upload", role);
  const canManageAttachments = can("tickets.attachments.manage", role);
  const isRequesterView = !internalAllowed; // employee-style portal view
  const enabled = Boolean(userId);

  const { data: ticket, isLoading, isError, error } = useQuery({ ...ticketQuery(id), enabled });
  const { data: comments = [] } = useQuery({ ...ticketCommentsQuery(id), enabled: enabled && Boolean(ticket) });
  const { data: statusEvents = [] } = useQuery({
    ...ticketStatusEventsQuery(id),
    enabled: enabled && Boolean(ticket) && internalAllowed,
  });
  const { data: assignEvents = [] } = useQuery({
    ...ticketAssignmentHistoryQuery(id),
    enabled: enabled && Boolean(ticket) && internalAllowed,
  });
  const { data: profiles = [] } = useQuery({ ...profilesQuery(), enabled });
  const pmap = useMemo(() => profileMap(profiles), [profiles]);

  // Attachments: employees see only public; agents see public + internal.
  const { data: rawAttachments = [], isLoading: attLoading, isError: attError, error: attErrorObj } = useQuery({
    ...ticketAttachmentsQuery(id),
    enabled: enabled && Boolean(ticket) && canViewAttachments,
  });
  const attachments = useMemo<TicketAttachment[]>(
    () => rawAttachments.filter((a) => (isRequesterView ? a.visibility !== "internal" : true)),
    [rawAttachments, isRequesterView],
  );

  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const invalidateTicket = () => {
    qc.invalidateQueries({ queryKey: sdKeys.ticket(id) });
    qc.invalidateQueries({ queryKey: sdKeys.ticketComments(id) });
    qc.invalidateQueries({ queryKey: sdKeys.ticketStatus(id) });
    qc.invalidateQueries({ queryKey: sdKeys.ticketAssignments(id) });
    qc.invalidateQueries({ queryKey: sdKeys.ticketAttachments(id) });
    qc.invalidateQueries({ queryKey: sdKeys.tickets() });
    qc.invalidateQueries({ queryKey: sdKeys.ticketsMine(userId) });
  };


  const updateMut = useMutation({
    mutationFn: (patch: Parameters<typeof updateTicket>[1]) => updateTicket(id, patch),
    onSuccess: () => invalidateTicket(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const commentMut = useMutation({
    mutationFn: (input: { body: string; internal: boolean }) =>
      addTicketComment({ ticketId: id, authorId: userId, body: input.body, internal: input.internal }),
    onSuccess: (_d, vars) => {
      setReply("");
      setInternal(false);
      toast.success(vars.internal ? "Internal note added" : "Reply sent");
      invalidateTicket();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) =>
      uploadTicketAttachment({
        ticketId: id,
        uploadedBy: userId,
        file,
        visibility: isRequesterView ? "public" : internal ? "internal" : "public",
      }),
    onSuccess: () => {
      toast.success("Attachment uploaded");
      qc.invalidateQueries({ queryKey: sdKeys.ticketAttachments(id) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const deleteAttMut = useMutation({
    mutationFn: (att: TicketAttachment) => deleteTicketAttachment(att),
    onSuccess: () => {
      toast.success("Attachment removed");
      qc.invalidateQueries({ queryKey: sdKeys.ticketAttachments(id) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const handleDownload = async (att: TicketAttachment) => {
    try {
      const url = await getAttachmentSignedUrl(att.storagePath, 300);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download link failed");
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    uploadMut.mutate(f);
    e.target.value = "";
  };


  if (!enabled) {
    return (
      <div>
        <PageHeader title="Sign in required" description="Authenticate to view this ticket." />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Loading ticket…" description="Fetching the latest details." />
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div>
        <PageHeader
          title="Ticket not found"
          description={isError ? (error instanceof Error ? error.message : "Unable to load ticket.") : "The ticket may have been removed or you do not have access."}
          actions={<Link to="/tickets"><Button variant="secondary"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to queue</Button></Link>}
        />
      </div>
    );
  }

  // Employee own-ticket isolation. RLS is the real guard; this is a UX guard.
  if (isRequesterView && ticket.requesterId !== userId) {
    return (
      <div>
        <PageHeader
          title="Access restricted"
          description="This ticket belongs to another requester."
          actions={<Link to="/my-requests"><Button variant="secondary"><ArrowLeft className="mr-1.5 h-4 w-4" /> My requests</Button></Link>}
        />
      </div>
    );
  }

  const requesterName = nameOf(ticket.requesterId, pmap);
  const assigneeName = ticket.assigneeId ? nameOf(ticket.assigneeId, pmap) : null;
  const visibleComments = comments.filter((c) => (isRequesterView ? !c.internal : true));
  const isClosedLike = ticket.status === "resolved" || ticket.status === "closed";

  const handleReply = () => {
    if (!reply.trim()) { toast.error("Type a message before sending"); return; }
    if (!canCommentPublic) { toast.error("You cannot post on this ticket"); return; }
    commentMut.mutate({
      body: reply.trim(),
      internal: internal && internalAllowed && canCommentInternal,
    });
  };

  const handleResolve = () => {
    if (resolution.trim().length < 4) { toast.error("Provide a resolution summary"); return; }
    // Post the resolution as an internal note for audit trail, then mark resolved.
    commentMut.mutate(
      { body: `Resolution: ${resolution.trim()}`, internal: true },
      {
        onSuccess: () => {
          updateMut.mutate({ status: "resolved" }, {
            onSuccess: () => { setResolution(""); setResolveOpen(false); toast.success("Ticket resolved"); },
          });
        },
      },
    );
  };

  const handleReopen = () => {
    if (reopenReason.trim().length < 4) { toast.error("Provide a reason"); return; }
    commentMut.mutate(
      { body: `Reopen reason: ${reopenReason.trim()}`, internal: isRequesterView ? false : true },
      {
        onSuccess: () => {
          updateMut.mutate({ status: "reopened" }, {
            onSuccess: () => { setReopenReason(""); setReopenOpen(false); toast.success("Ticket reopened"); },
          });
        },
      },
    );
  };

  // Build the assignee dropdown from known profiles. RLS scopes the list.
  const assignableUsers = profiles;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Link to={isRequesterView ? "/my-requests" : "/tickets"} className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> {isRequesterView ? "My requests" : "Ticket queue"}
        </Link>
        <span>/</span>
        <span className="font-mono text-foreground">{ticket.ticketNumber}</span>
      </div>

      <PageHeader
        title={ticket.subject}
        description={`${cap(ticket.type)} · ${ticket.category ?? "Uncategorized"}${ticket.subcategory ? " / " + ticket.subcategory : ""} · Requested by ${requesterName}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isRequesterView && canResolve && (
              <>
                {isClosedLike ? (
                  <Button variant="secondary" onClick={() => setReopenOpen(true)}>
                    <RotateCcw className="mr-1.5 h-4 w-4" /> Reopen
                  </Button>
                ) : (
                  <Button onClick={() => setResolveOpen(true)}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" /> Resolve
                  </Button>
                )}
              </>
            )}
            {isRequesterView && isClosedLike && (
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
            <Stat label="Source"><span>{cap(ticket.source)}</span></Stat>
            <Stat label="Updated"><span suppressHydrationWarning>{timeAgo(ticket.updatedAt)}</span></Stat>
          </div>

          <SectionCard title="Description">
            <p className="whitespace-pre-line text-sm text-muted-foreground">{ticket.description || "No description provided."}</p>
          </SectionCard>

          <SectionCard title="Conversation">
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All ({visibleComments.length})</TabsTrigger>
                {internalAllowed && (
                  <TabsTrigger value="internal">
                    <Lock className="mr-1 h-3 w-3" /> Internal ({comments.filter((c) => c.internal).length})
                  </TabsTrigger>
                )}
                <TabsTrigger value="public">Replies ({comments.filter((c) => !c.internal).length})</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="mt-3 space-y-2">
                {visibleComments.map((c) => (
                  <CommentBubble key={c.id} author={nameOf(c.authorId, pmap)} body={c.body} internal={c.internal} createdAt={c.createdAt} />
                ))}
                {visibleComments.length === 0 && <p className="text-xs text-muted-foreground">No messages yet.</p>}
              </TabsContent>
              {internalAllowed && (
                <TabsContent value="internal" className="mt-3 space-y-2">
                  {comments.filter((c) => c.internal).map((c) => (
                    <CommentBubble key={c.id} author={nameOf(c.authorId, pmap)} body={c.body} internal createdAt={c.createdAt} />
                  ))}
                  {comments.filter((c) => c.internal).length === 0 && <p className="text-xs text-muted-foreground">No internal notes.</p>}
                </TabsContent>
              )}
              <TabsContent value="public" className="mt-3 space-y-2">
                {comments.filter((c) => !c.internal).map((c) => (
                  <CommentBubble key={c.id} author={nameOf(c.authorId, pmap)} body={c.body} internal={false} createdAt={c.createdAt} />
                ))}
              </TabsContent>
            </Tabs>

            {canCommentPublic ? (
              <div className="mt-4 rounded-xl border border-border/60 bg-background/30 p-3">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={internal ? "Add an internal note (visible only to IT)…" : "Reply to requester…"}
                  rows={3}
                  disabled={commentMut.isPending}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {internalAllowed && canCommentInternal && (
                      <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-primary" />
                        <Lock className="h-3 w-3" /> Internal note
                      </label>
                    )}
                  </div>
                  <Button size="sm" onClick={handleReply} disabled={commentMut.isPending}>
                    <Send className="mr-1 h-3.5 w-3.5" /> {commentMut.isPending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-border/60 bg-background/20 p-3 text-xs text-muted-foreground">
                Read-only access — you cannot post replies or notes on this ticket.
              </p>
            )}
          </SectionCard>

          <SectionCard title={`Attachments (${attachments.length})`}>
            {!canViewAttachments ? (
              <p className="text-xs text-muted-foreground">You do not have permission to view attachments.</p>
            ) : attLoading ? (
              <p className="text-xs text-muted-foreground">Loading attachments…</p>
            ) : attError ? (
              <p className="text-xs text-[#FF7C91]">{attErrorObj instanceof Error ? attErrorObj.message : "Failed to load attachments"}</p>
            ) : attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No attachments.</p>
            ) : (
              <ul className="space-y-1.5">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/30 p-2 text-xs">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{a.fileName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {(a.sizeBytes / 1024).toFixed(1)} KB · {a.visibility === "internal" ? "Internal" : "Public"} · {nameOf(a.uploadedBy, pmap)}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDownload(a)} title="Download">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {(a.uploadedBy === userId || canManageAttachments) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-[#FF7C91]"
                        onClick={() => deleteAttMut.mutate(a)}
                        disabled={deleteAttMut.isPending}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canUploadAttachments && (
              <div className="mt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFilePick}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMut.isPending}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  {uploadMut.isPending ? "Uploading…" : "Upload file"}
                </Button>
                <span className="ml-2 text-[10px] text-muted-foreground">Max 50 MB</span>
              </div>
            )}
          </SectionCard>


          {internalAllowed && (
            <SectionCard title="Activity timeline">
              <ol className="relative space-y-3 border-l border-border/40 pl-4">
                <TimelineItem label={`Ticket created by ${requesterName}`} at={ticket.createdAt} />
                {statusEvents.map((e) => (
                  <TimelineItem
                    key={e.id}
                    label={`Status changed${e.fromStatus ? ` from ${labelStatus(e.fromStatus)}` : ""} to ${labelStatus(e.toStatus)}${e.changedBy ? ` by ${nameOf(e.changedBy, pmap)}` : ""}${e.reason ? ` — ${e.reason}` : ""}`}
                    at={e.changedAt}
                    tone={e.toStatus === "resolved" ? "success" : e.toStatus === "reopened" ? "danger" : e.toStatus === "in_progress" ? "warning" : "info"}
                  />
                ))}
                {assignEvents.map((e) => {
                  const toAssignee = e.toAssigneeId ? nameOf(e.toAssigneeId, pmap) : null;
                  const fromAssignee = e.fromAssigneeId ? nameOf(e.fromAssigneeId, pmap) : null;
                  const parts: string[] = [];
                  if (toAssignee || fromAssignee) {
                    parts.push(`Assignee: ${fromAssignee ?? "—"} → ${toAssignee ?? "—"}`);
                  }
                  if (e.toTeam || e.fromTeam) {
                    parts.push(`Team: ${e.fromTeam ?? "—"} → ${e.toTeam ?? "—"}`);
                  }
                  return (
                    <TimelineItem
                      key={e.id}
                      label={`${parts.join(" · ") || "Assignment updated"}${e.changedBy ? ` by ${nameOf(e.changedBy, pmap)}` : ""}`}
                      at={e.changedAt}
                      tone="info"
                    />
                  );
                })}
                {ticket.resolvedAt && <TimelineItem label="Ticket resolved" at={ticket.resolvedAt} tone="success" />}
                {ticket.closedAt && <TimelineItem label="Ticket closed" at={ticket.closedAt} tone="muted" />}
              </ol>
            </SectionCard>
          )}
        </div>

        <div className="space-y-4">
          <SectionCard title="People">
            <KV k="Requester" v={requesterName} icon={UserIcon} />
            <KV k="Assignee" v={assigneeName ?? <em className="text-[#FFC86B] not-italic">Unassigned</em>} icon={UserCheck} />
            <KV k="Team" v={ticket.assignedTeam ?? "—"} icon={UsersIcon} />
            {!isRequesterView && canAssign && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Select
                  value={ticket.assigneeId ?? "none"}
                  onValueChange={(v) => {
                    const next = v === "none" ? null : v;
                    updateMut.mutate({ assigneeId: next }, {
                      onSuccess: () => toast.success(next ? `Assigned to ${nameOf(next, pmap)}` : "Unassigned"),
                    });
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="Reassign" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {assignableUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.displayName}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select
                  value={ticket.assignedTeam ?? "none"}
                  onValueChange={(v) => {
                    const next = v === "none" ? null : v;
                    updateMut.mutate({ assignedTeam: next }, {
                      onSuccess: () => toast.success(next ? `Team: ${next}` : "Team cleared"),
                    });
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="Team" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {SUGGESTED_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    {ticket.assignedTeam && !SUGGESTED_TEAMS.includes(ticket.assignedTeam) && (
                      <SelectItem value={ticket.assignedTeam}>{ticket.assignedTeam}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Lifecycle">
            <KV k="Status" v={<StatusBadge label={labelStatus(ticket.status)} tone={STATUS_TONE[ticket.status]} />} />
            <KV k="Priority" v={<StatusBadge label={cap(ticket.priority)} tone={PRIORITY_TONE[ticket.priority]} />} />
            <KV k="Opened" v={<span suppressHydrationWarning>{formatDateTime(ticket.openedAt)}</span>} icon={Clock} />
            <KV k="Created" v={<span suppressHydrationWarning>{formatDateTime(ticket.createdAt)}</span>} />
            <KV k="Updated" v={<span suppressHydrationWarning>{formatDateTime(ticket.updatedAt)}</span>} />
            {ticket.resolvedAt && <KV k="Resolved" v={<span suppressHydrationWarning>{formatDateTime(ticket.resolvedAt)}</span>} />}
            {ticket.closedAt && <KV k="Closed" v={<span suppressHydrationWarning>{formatDateTime(ticket.closedAt)}</span>} />}
            {!isRequesterView && canResolve && (
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <Select
                  value={ticket.status}
                  onValueChange={(v) => updateMut.mutate({ status: v as TicketStatus }, {
                    onSuccess: () => toast.success(`Status: ${labelStatus(v as TicketStatus)}`),
                  })}
                >
                  <SelectTrigger className="h-8 text-xs"><PlayCircle className="mr-1 h-3 w-3" /><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelStatus(s)}</SelectItem>)}</SelectContent>
                </Select>
                <Select
                  value={ticket.priority}
                  onValueChange={(v) => updateMut.mutate({ priority: v as TicketPriority }, {
                    onSuccess: () => toast.success(`Priority: ${cap(v)}`),
                  })}
                >
                  <SelectTrigger className="h-8 text-xs"><AlertTriangle className="mr-1 h-3 w-3" /><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{cap(p)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </SectionCard>

          {ticket.tags.length > 0 && (
            <SectionCard title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {ticket.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]"><Tag className="mr-1 h-3 w-3" />{t}</Badge>)}
              </div>
            </SectionCard>
          )}

          {ticket.affectedService && (
            <SectionCard title="Affected service">
              <p className="text-xs text-muted-foreground">{ticket.affectedService}</p>
            </SectionCard>
          )}
        </div>
      </div>

      <FormDrawer
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        title={`Resolve ${ticket.ticketNumber}`}
        description="Add a resolution summary. It is recorded as an internal note."
        submitLabel={updateMut.isPending || commentMut.isPending ? "Working…" : "Mark resolved"}
        onSubmit={handleResolve}
      >
        <div className="space-y-2">
          <Label className="text-xs">Resolution</Label>
          <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={4} placeholder="What was done to resolve this?" />
        </div>
      </FormDrawer>

      <FormDrawer
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title={`Reopen ${ticket.ticketNumber}`}
        submitLabel={updateMut.isPending || commentMut.isPending ? "Working…" : "Reopen ticket"}
        onSubmit={handleReopen}
      >
        <div className="space-y-2">
          <Label className="text-xs">Reason for reopening</Label>
          <Textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={3} />
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
