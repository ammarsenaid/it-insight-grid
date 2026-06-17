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
  MessageSquare,
  Activity as ActivityIcon,
  Link2,
  Flag,
  Laptop,
  AppWindow,
  UserCircle2,
  Wifi,
  Printer,
  Mail,
  ShieldAlert,
  HelpCircle,
  MoreHorizontal,
  AtSign,
  Smile,
  Image as ImageIcon,
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

  const CategoryIcon = pickCategoryIcon(ticket.category);
  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

  const publicReplies = comments.filter((c) => !c.internal);
  const internalNotes = comments.filter((c) => c.internal);

  // Recent activity (real events only). No mock data.
  const recentActivity = [
    ...statusEvents.map((e) => ({
      key: `s-${e.id}`,
      icon: PlayCircle,
      tone: e.toStatus === "resolved" ? "success" : e.toStatus === "reopened" ? "danger" : "info",
      title: <>Status changed to <span className="font-medium text-foreground">{labelStatus(e.toStatus)}</span></>,
      by: e.changedBy ? nameOf(e.changedBy, pmap) : "System",
      at: e.changedAt,
    })),
    ...assignEvents.map((e) => ({
      key: `a-${e.id}`,
      icon: UserCheck,
      tone: "info" as const,
      title: <>Assignment updated</>,
      by: e.changedBy ? nameOf(e.changedBy, pmap) : "System",
      at: e.changedAt,
    })),
    ...visibleComments.slice(-2).map((c) => ({
      key: `c-${c.id}`,
      icon: MessageSquare,
      tone: "muted" as const,
      title: <>Comment added</>,
      by: nameOf(c.authorId, pmap),
      at: c.createdAt,
    })),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 4);

  return (
    <div className="space-y-5">
      <div>
        <Link
          to={isRequesterView ? "/my-requests" : "/tickets"}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {isRequesterView ? "Back to my requests" : "Back to tickets"}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* MAIN COLUMN */}
        <div className="space-y-5">
          {/* Hero card */}
          <div className="glass-card relative overflow-hidden rounded-2xl border border-border/50 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/30">
                <CategoryIcon className="h-7 w-7 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
                  <span className="font-mono text-sm text-muted-foreground">#{ticket.ticketNumber}</span>
                  <StatusBadge label={labelStatus(ticket.status)} tone={STATUS_TONE[ticket.status]} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                  <HeroFact label="Priority">
                    <span className="inline-flex items-center gap-1.5">
                      <Flag className={`h-3.5 w-3.5 ${priorityIconColor(ticket.priority)}`} />
                      <span className="text-sm">{cap(ticket.priority)}</span>
                    </span>
                  </HeroFact>
                  <HeroFact label="Category">
                    <span className="inline-flex items-center gap-1.5">
                      <CategoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{ticket.category ?? "Uncategorized"}</span>
                    </span>
                  </HeroFact>
                  <HeroFact label="Assignee">
                    {assigneeName ? (
                      <span className="inline-flex items-center gap-2">
                        <Avatar text={initials(assigneeName)} tone="emerald" />
                        <span className="truncate text-sm">{assigneeName}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-[#FFC86B]">Unassigned</span>
                    )}
                  </HeroFact>
                  <HeroFact label="Requester">
                    <span className="inline-flex items-center gap-2">
                      <Avatar text={initials(requesterName)} tone="violet" />
                      <span className="truncate text-sm">{requesterName}</span>
                    </span>
                  </HeroFact>
                  <HeroFact label="Created">
                    <span className="inline-flex items-center gap-1.5 text-sm" suppressHydrationWarning>
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDateTime(ticket.createdAt)}
                    </span>
                  </HeroFact>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {!isRequesterView && canResolve && (
                  isClosedLike ? (
                    <Button variant="secondary" size="sm" onClick={() => setReopenOpen(true)}>
                      <RotateCcw className="mr-1.5 h-4 w-4" /> Reopen
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setResolveOpen(true)}>
                      <CheckCircle2 className="mr-1.5 h-4 w-4" /> Resolve
                    </Button>
                  )
                )}
                {isRequesterView && isClosedLike && (
                  <Button variant="secondary" size="sm" onClick={() => setReopenOpen(true)}>
                    <RotateCcw className="mr-1.5 h-4 w-4" /> Reopen request
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Tabbed content */}
          <div className="glass-card rounded-2xl border border-border/50 p-5">
            <Tabs defaultValue="overview">
              <TabsList className="mb-4 h-auto gap-1 bg-transparent p-0">
                <TabPill value="overview" icon={MessageSquare} label="Overview" />
                <TabPill value="comments" icon={MessageSquare} label="Comments" count={publicReplies.length} />
                <TabPill value="attachments" icon={Paperclip} label="Attachments" count={attachments.length} />
                {internalAllowed && <TabPill value="activity" icon={ActivityIcon} label="Activity" />}
                <TabPill value="related" icon={Link2} label="Related" />
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Description</h3>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {ticket.description || "No description provided."}
                  </p>
                </section>
                <section>
                  <h3 className="mb-3 text-sm font-semibold">Conversation</h3>
                  <ConversationList comments={visibleComments} pmap={pmap} userId={userId} />
                </section>
                {canCommentPublic && (
                  <ReplyComposer
                    value={reply}
                    onChange={setReply}
                    onSend={handleReply}
                    pending={commentMut.isPending}
                    internal={internal}
                    setInternal={setInternal}
                    internalAllowed={internalAllowed && canCommentInternal}
                    me={initials(requesterName)}
                  />
                )}
              </TabsContent>

              <TabsContent value="comments" className="space-y-4">
                <ConversationList comments={visibleComments} pmap={pmap} userId={userId} />
                {canCommentPublic && (
                  <ReplyComposer
                    value={reply}
                    onChange={setReply}
                    onSend={handleReply}
                    pending={commentMut.isPending}
                    internal={internal}
                    setInternal={setInternal}
                    internalAllowed={internalAllowed && canCommentInternal}
                    me={initials(requesterName)}
                  />
                )}
                {internalAllowed && internalNotes.length > 0 && (
                  <section>
                    <h4 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#FFC86B]">
                      <Lock className="h-3 w-3" /> Internal notes
                    </h4>
                    <div className="space-y-2">
                      {internalNotes.map((c) => (
                        <CommentBubble key={c.id} author={nameOf(c.authorId, pmap)} body={c.body} internal createdAt={c.createdAt} />
                      ))}
                    </div>
                  </section>
                )}
              </TabsContent>

              <TabsContent value="attachments" className="space-y-3">
                {!canViewAttachments ? (
                  <p className="text-xs text-muted-foreground">You do not have permission to view attachments.</p>
                ) : attLoading ? (
                  <p className="text-xs text-muted-foreground">Loading attachments…</p>
                ) : attError ? (
                  <p className="text-xs text-[#FF7C91]">{attErrorObj instanceof Error ? attErrorObj.message : "Failed to load attachments"}</p>
                ) : attachments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No attachments yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {attachments.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/30 p-3 text-sm">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Paperclip className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{a.fileName}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {(a.sizeBytes / 1024).toFixed(1)} KB · {a.visibility === "internal" ? "Internal" : "Public"} · {nameOf(a.uploadedBy, pmap)}
                          </div>
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDownload(a)} title="Download">
                          <Download className="h-4 w-4" />
                        </Button>
                        {(a.uploadedBy === userId || canManageAttachments) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-[#FF7C91]"
                            onClick={() => deleteAttMut.mutate(a)}
                            disabled={deleteAttMut.isPending}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canUploadAttachments && (
                  <div className="pt-1">
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePick} />
                    <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploadMut.isPending}>
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      {uploadMut.isPending ? "Uploading…" : "Upload file"}
                    </Button>
                    <span className="ml-2 text-[10px] text-muted-foreground">Max 50 MB</span>
                  </div>
                )}
              </TabsContent>

              {internalAllowed && (
                <TabsContent value="activity">
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
                      if (toAssignee || fromAssignee) parts.push(`Assignee: ${fromAssignee ?? "—"} → ${toAssignee ?? "—"}`);
                      if (e.toTeam || e.fromTeam) parts.push(`Team: ${e.fromTeam ?? "—"} → ${e.toTeam ?? "—"}`);
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
                </TabsContent>
              )}

              <TabsContent value="related">
                {ticket.affectedService ? (
                  <div className="rounded-xl border border-border/40 bg-background/30 p-3 text-sm">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Affected service</div>
                    <div className="mt-0.5">{ticket.affectedService}</div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No related items yet.</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div className="space-y-5">
          <div className="glass-card rounded-2xl border border-border/50 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Ticket details</h3>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2.5 text-sm">
              <DetailRow k="Status" v={<StatusBadge label={labelStatus(ticket.status)} tone={STATUS_TONE[ticket.status]} />} />
              <DetailRow k="Priority" v={
                <span className="inline-flex items-center gap-1.5">
                  <Flag className={`h-3.5 w-3.5 ${priorityIconColor(ticket.priority)}`} />
                  {cap(ticket.priority)}
                </span>
              } />
              <DetailRow k="Category" v={
                <span className="inline-flex items-center gap-1.5">
                  <CategoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {ticket.category ?? "—"}
                </span>
              } />
              {ticket.subcategory && <DetailRow k="Subcategory" v={ticket.subcategory} />}
              <DetailRow k="Type" v={cap(ticket.type)} />
              <DetailRow k="Source" v={cap(ticket.source)} />
              <DetailRow k="Opened" v={<span suppressHydrationWarning>{formatDateTime(ticket.openedAt)}</span>} />
              <DetailRow k="Updated" v={<span suppressHydrationWarning>{timeAgo(ticket.updatedAt)}</span>} />
              {ticket.resolvedAt && <DetailRow k="Resolved" v={<span suppressHydrationWarning>{formatDateTime(ticket.resolvedAt)}</span>} />}
            </div>

            {!isRequesterView && canResolve && (
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/40 pt-4">
                <Select
                  value={ticket.status}
                  onValueChange={(v) => updateMut.mutate({ status: v as TicketStatus }, { onSuccess: () => toast.success(`Status: ${labelStatus(v as TicketStatus)}`) })}
                >
                  <SelectTrigger className="h-8 text-xs"><PlayCircle className="mr-1 h-3 w-3" /><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelStatus(s)}</SelectItem>)}</SelectContent>
                </Select>
                <Select
                  value={ticket.priority}
                  onValueChange={(v) => updateMut.mutate({ priority: v as TicketPriority }, { onSuccess: () => toast.success(`Priority: ${cap(v)}`) })}
                >
                  <SelectTrigger className="h-8 text-xs"><AlertTriangle className="mr-1 h-3 w-3" /><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{cap(p)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="glass-card rounded-2xl border border-border/50 p-5">
            <h3 className="mb-3 text-sm font-semibold">People</h3>
            <div className="space-y-3 text-sm">
              <PersonRow label="Requester" name={requesterName} tone="violet" />
              <PersonRow label="Assignee" name={assigneeName} tone="emerald" />
              <DetailRow k={<span className="inline-flex items-center gap-1.5"><UsersIcon className="h-3.5 w-3.5" /> Team</span>} v={ticket.assignedTeam ?? "—"} />
            </div>
            {!isRequesterView && canAssign && (
              <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
                <Select
                  value={ticket.assigneeId ?? "none"}
                  onValueChange={(v) => {
                    const next = v === "none" ? null : v;
                    updateMut.mutate({ assigneeId: next }, { onSuccess: () => toast.success(next ? `Assigned to ${nameOf(next, pmap)}` : "Unassigned") });
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
                    updateMut.mutate({ assignedTeam: next }, { onSuccess: () => toast.success(next ? `Team: ${next}` : "Team cleared") });
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
          </div>

          <div className="glass-card rounded-2xl border border-border/50 p-5">
            <h3 className="mb-3 text-sm font-semibold">Recent activity</h3>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-3">
                {recentActivity.map((a) => {
                  const Icon = a.icon;
                  return (
                    <li key={a.key} className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${activityToneBg(a.tone)}`}>
                        <Icon className={`h-3.5 w-3.5 ${activityToneFg(a.tone)}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-snug">{a.title}</p>
                        <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                          by {a.by} · {timeAgo(a.at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {ticket.tags.length > 0 && (
            <div className="glass-card rounded-2xl border border-border/50 p-5">
              <h3 className="mb-3 text-sm font-semibold">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {ticket.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]"><Tag className="mr-1 h-3 w-3" />{t}</Badge>
                ))}
              </div>
            </div>
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

// ---------- New presentation helpers ----------

function pickCategoryIcon(category: string | null | undefined): React.ComponentType<{ className?: string }> {
  const c = (category ?? "").toLowerCase();
  if (c.includes("hardware") || c.includes("laptop") || c.includes("device")) return Laptop;
  if (c.includes("software") || c.includes("app")) return AppWindow;
  if (c.includes("account") || c.includes("access") || c.includes("user")) return UserCircle2;
  if (c.includes("network") || c.includes("wifi") || c.includes("vpn")) return Wifi;
  if (c.includes("print")) return Printer;
  if (c.includes("mail") || c.includes("email")) return Mail;
  if (c.includes("security") || c.includes("incident")) return ShieldAlert;
  return HelpCircle;
}

function priorityIconColor(p: TicketPriority): string {
  return p === "critical" ? "text-[#FF7C91]"
    : p === "high" ? "text-[#FFC86B]"
    : p === "normal" ? "text-[#5B8CFF]"
    : "text-muted-foreground";
}

function HeroFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 truncate">{children}</div>
    </div>
  );
}

function Avatar({ text, tone = "violet" }: { text: string; tone?: "violet" | "emerald" | "blue" }) {
  const toneClass = tone === "emerald"
    ? "bg-[#52D6A4]/20 text-[#52D6A4] ring-[#52D6A4]/30"
    : tone === "blue"
      ? "bg-[#5B8CFF]/20 text-[#5B8CFF] ring-[#5B8CFF]/30"
      : "bg-[#A78BFA]/20 text-[#C4B5FD] ring-[#A78BFA]/30";
  return (
    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ${toneClass}`}>
      {text}
    </span>
  );
}

function TabPill({ value, icon: Icon, label, count }: { value: string; icon: React.ComponentType<{ className?: string }>; label: string; count?: number }) {
  return (
    <TabsTrigger
      value={value}
      className="gap-1.5 rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs text-muted-foreground transition data-[state=active]:border-primary/40 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="ml-1 rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground data-[state=active]:bg-primary/20">{count}</span>
      )}
    </TabsTrigger>
  );
}

function ConversationList({
  comments,
  pmap,
  userId,
}: {
  comments: { id: string; authorId: string | null; body: string; internal: boolean; createdAt: string }[];
  pmap: Map<string, { id: string; displayName: string }>;
  userId: string;
}) {
  if (comments.length === 0) {
    return <p className="text-xs text-muted-foreground">No messages yet.</p>;
  }
  return (
    <div className="space-y-3">
      {comments.map((c) => {
        const name = nameOf(c.authorId, pmap);
        const mine = c.authorId === userId;
        const initials = name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
        return (
          <div key={c.id} className="flex items-start gap-3">
            <Avatar text={initials} tone={mine ? "violet" : "blue"} />
            <div className={`min-w-0 flex-1 rounded-xl border p-3 ${c.internal ? "border-[#FFC86B]/30 bg-[#FFC86B]/5" : "border-border/40 bg-background/30"}`}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium">
                  {name}
                  {c.internal && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded bg-[#FFC86B]/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#FFC86B]">
                      <Lock className="h-2.5 w-2.5" /> Internal
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground" suppressHydrationWarning>{timeAgo(c.createdAt)}</span>
              </div>
              <p className="whitespace-pre-line text-sm">{c.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReplyComposer({
  value,
  onChange,
  onSend,
  pending,
  internal,
  setInternal,
  internalAllowed,
  me,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  pending: boolean;
  internal: boolean;
  setInternal: (v: boolean) => void;
  internalAllowed: boolean;
  me: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Avatar text={me} tone="violet" />
      <div className="min-w-0 flex-1 rounded-xl border border-border/50 bg-background/40 focus-within:border-primary/40">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={internal ? "Add an internal note (visible only to IT)…" : "Type your reply…"}
          rows={3}
          disabled={pending}
          className="resize-none border-0 bg-transparent px-3 py-2 text-sm shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-2 border-t border-border/40 px-2 py-1.5">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7"><Paperclip className="h-3.5 w-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7"><Smile className="h-3.5 w-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7"><AtSign className="h-3.5 w-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7"><ImageIcon className="h-3.5 w-3.5" /></Button>
            {internalAllowed && (
              <label className="ml-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-primary" />
                <Lock className="h-3 w-3" /> Internal
              </label>
            )}
          </div>
          <Button size="sm" onClick={onSend} disabled={pending} className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            {pending ? "Sending…" : "Send Reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-right text-sm">{v}</span>
    </div>
  );
}

function PersonRow({ label, name, tone }: { label: string; name: string | null; tone: "violet" | "emerald" }) {
  const initials = (name ?? "—").split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {name ? (
        <span className="inline-flex items-center gap-2 text-sm">
          <Avatar text={initials} tone={tone} />
          <span className="truncate">{name}</span>
        </span>
      ) : (
        <span className="text-sm text-[#FFC86B]">Unassigned</span>
      )}
    </div>
  );
}

function activityToneBg(tone: string) {
  switch (tone) {
    case "success": return "bg-[#52D6A4]/15";
    case "danger":  return "bg-[#FF7C91]/15";
    case "warning": return "bg-[#FFC86B]/15";
    case "info":    return "bg-[#5B8CFF]/15";
    default:        return "bg-muted/40";
  }
}
function activityToneFg(tone: string) {
  switch (tone) {
    case "success": return "text-[#52D6A4]";
    case "danger":  return "text-[#FF7C91]";
    case "warning": return "text-[#FFC86B]";
    case "info":    return "text-[#5B8CFF]";
    default:        return "text-muted-foreground";
  }
}
