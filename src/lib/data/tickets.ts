import type { CatalogItem, Ticket, TicketPriority, TicketSLA, TicketSavedView, TicketSource, TicketStatus, NotificationItem } from "./types";
import { getState, setState, uid, logActivity, trashItem } from "./store";

function pushNotification(n: Omit<NotificationItem, "id" | "createdAt">) {
  const item: NotificationItem = {
    ...n,
    id: uid("ntf"),
    createdAt: new Date().toISOString(),
    read: false,
  };
  setState((s) => ({ ...s, notifications: [item, ...s.notifications].slice(0, 50) }));
}

export type NewTicketInput = {
  requester: string;
  subject: string;
  description: string;
  type: Ticket["type"];
  category: string;
  subcategory?: string;
  priority: TicketPriority;
  affectedService?: string;
  linkedAssetId?: string;
  linkedIpamId?: string;
  team?: string;
  assignee?: string;
  tags?: string[];
  attachments?: string[];
  source?: TicketSource;
  sourceEmail?: string;
  sourceFlagged?: boolean;
};

function nextNumber(): string {
  const all = getState().tickets;
  const max = all.reduce((m, t) => {
    const n = parseInt(t.number.replace(/\D+/g, ""), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 1024);
  return "INC-" + String(max + 1).padStart(5, "0");
}

function slaForPriority(p: TicketPriority): { hours: number } {
  switch (p) {
    case "critical": return { hours: 4 };
    case "high": return { hours: 8 };
    case "normal": return { hours: 24 };
    case "low": return { hours: 72 };
  }
}

export function recomputeSla(t: Ticket): Ticket {
  if (t.status === "resolved" || t.status === "closed" || t.status === "cancelled") {
    return { ...t, sla: "ok" };
  }
  if (!t.slaDueAt) return t;
  const remaining = new Date(t.slaDueAt).getTime() - Date.now();
  let sla: TicketSLA = "ok";
  if (remaining < 0) sla = "breached";
  else if (remaining < 2 * 3600_000) sla = "warning";
  return { ...t, sla };
}

export function createTicket(input: NewTicketInput): Ticket {
  const now = new Date().toISOString();
  const { hours } = slaForPriority(input.priority);
  const slaDueAt = new Date(Date.now() + hours * 3600_000).toISOString();
  const ticket: Ticket = {
    id: uid("tkt"),
    number: nextNumber(),
    subject: input.subject.trim(),
    description: input.description.trim(),
    requester: input.requester.trim(),
    type: input.type,
    category: input.category,
    subcategory: input.subcategory,
    priority: input.priority,
    status: "open",
    sla: "ok",
    slaDueAt,
    affectedService: input.affectedService,
    assignee: input.assignee,
    team: input.team,
    linkedAssetId: input.linkedAssetId,
    linkedIpamId: input.linkedIpamId,
    tags: input.tags ?? [],
    attachments: input.attachments ?? [],
    watchers: [],
    source: input.source ?? "manual",
    sourceEmail: input.sourceEmail,
    sourceFlagged: input.sourceFlagged,
    comments: [
      {
        id: uid("cmt"),
        author: input.requester,
        body: input.description,
        internal: false,
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  setState((s) => ({ ...s, tickets: [ticket, ...s.tickets] }));
  logActivity("ticket.create", `Created ticket ${ticket.number} — ${ticket.subject} (source: ${ticket.source})`, "ticket", ticket.id);
  pushNotification({ title: `New ticket ${ticket.number}`, message: ticket.subject, type: "info" });
  return ticket;
}

export function addComment(ticketId: string, author: string, body: string, internal: boolean) {
  const trimmed = body.trim();
  if (!trimmed) return;
  setState((s) => ({
    ...s,
    tickets: s.tickets.map((t) =>
      t.id === ticketId
        ? {
            ...t,
            comments: [
              ...t.comments,
              { id: uid("cmt"), author, body: trimmed, internal, createdAt: new Date().toISOString() },
            ],
            updatedAt: new Date().toISOString(),
          }
        : t,
    ),
  }));
  const t = getState().tickets.find((x) => x.id === ticketId);
  if (t && !internal) {
    pushNotification({ title: `Reply on ${t.number}`, message: trimmed.slice(0, 80), type: "info" });
  }
  logActivity("ticket.comment", `${internal ? "Internal note" : "Reply"} on ${t?.number ?? ticketId}`, "ticket", ticketId);
}

export function addAttachment(ticketId: string, fileName: string) {
  setState((s) => ({
    ...s,
    tickets: s.tickets.map((t) =>
      t.id === ticketId
        ? { ...t, attachments: [...t.attachments, fileName], updatedAt: new Date().toISOString() }
        : t,
    ),
  }));
  logActivity("ticket.attach", `Attached ${fileName}`, "ticket", ticketId);
}

export function setWatchers(ticketId: string, watchers: string[]) {
  updateTicket(ticketId, { watchers });
}

export function escalate(ticketId: string) {
  const t = getState().tickets.find((x) => x.id === ticketId);
  if (!t) return;
  const next: TicketPriority = t.priority === "low" ? "normal" : t.priority === "normal" ? "high" : "critical";
  const { hours } = slaForPriority(next);
  updateTicket(ticketId, { priority: next, slaDueAt: new Date(Date.now() + hours * 3600_000).toISOString() });
  pushNotification({ title: `Ticket escalated`, message: `${t.number} → ${next.toUpperCase()}`, type: "warning" });
  logActivity("ticket.escalate", `Escalated ${t.number} to ${next}`, "ticket", ticketId);
}

export function resolveTicket(ticketId: string, resolution: string, agent: string) {
  addComment(ticketId, agent, `Resolution: ${resolution}`, false);
  updateTicket(ticketId, { status: "resolved", resolvedAt: new Date().toISOString() });
  const t = getState().tickets.find((x) => x.id === ticketId);
  if (t) pushNotification({ title: `Ticket resolved`, message: `${t.number} — ${t.subject}`, type: "success" });
}

export function reopenTicket(ticketId: string, reason: string, actor: string) {
  addComment(ticketId, actor, `Reopened: ${reason}`, false);
  updateTicket(ticketId, { status: "open", resolvedAt: undefined });
  const t = getState().tickets.find((x) => x.id === ticketId);
  if (t) pushNotification({ title: `Ticket reopened`, message: t.number, type: "warning" });
}

export function updateTicket(id: string, patch: Partial<Ticket>) {
  setState((s) => ({
    ...s,
    tickets: s.tickets.map((t) =>
      t.id === id ? recomputeSla({ ...t, ...patch, updatedAt: new Date().toISOString() }) : t,
    ),
  }));
}

export function bulkUpdate(ids: string[], patch: Partial<Ticket>) {
  const set = new Set(ids);
  setState((s) => ({
    ...s,
    tickets: s.tickets.map((t) =>
      set.has(t.id) ? recomputeSla({ ...t, ...patch, updatedAt: new Date().toISOString() }) : t,
    ),
  }));
  logActivity("ticket.bulk", `Updated ${ids.length} tickets`);
}

export function archiveTickets(ids: string[]) {
  const set = new Set(ids);
  const targets = getState().tickets.filter((t) => set.has(t.id));
  targets.forEach((t) => trashItem("task", `${t.number} — ${t.subject}`, "Tickets", t, 1024));
  setState((s) => ({ ...s, tickets: s.tickets.filter((t) => !set.has(t.id)) }));
  logActivity("ticket.archive", `Archived ${targets.length} tickets`);
}

export function assignTickets(ids: string[], assignee: string) {
  bulkUpdate(ids, { assignee });
}

export function setStatus(ids: string[], status: TicketStatus) {
  bulkUpdate(ids, { status, ...(status === "resolved" ? { resolvedAt: new Date().toISOString() } : {}) });
}

export function setPriority(ids: string[], priority: TicketPriority) {
  const { hours } = slaForPriority(priority);
  const slaDueAt = new Date(Date.now() + hours * 3600_000).toISOString();
  bulkUpdate(ids, { priority, slaDueAt });
}

export function setTeam(ids: string[], team: string) {
  bulkUpdate(ids, { team });
}

export function addTag(ids: string[], tag: string) {
  const t = tag.trim().toLowerCase();
  if (!t) return;
  setState((s) => ({
    ...s,
    tickets: s.tickets.map((tk) =>
      ids.includes(tk.id) && !tk.tags.includes(t)
        ? { ...tk, tags: [...tk.tags, t], updatedAt: new Date().toISOString() }
        : tk,
    ),
  }));
  logActivity("ticket.tag", `Added tag '${t}' to ${ids.length} tickets`);
}

export function saveView(view: Omit<TicketSavedView, "id">): TicketSavedView {
  const v: TicketSavedView = { ...view, id: uid("vw") };
  setState((s) => ({ ...s, ticketViews: [...s.ticketViews, v] }));
  return v;
}

export function deleteView(id: string) {
  setState((s) => ({ ...s, ticketViews: s.ticketViews.filter((v) => v.id !== id) }));
}

export const TICKET_CATEGORIES = ["Network", "Applications", "Hardware", "Storage", "Infrastructure", "Identity", "Security", "Backup", "Other"];
export const TICKET_TEAMS = ["Service Desk", "Network", "Infrastructure", "Security", "Applications"];
export const TICKET_PRIORITIES: TicketPriority[] = ["low", "normal", "high", "critical"];
export const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "waiting", "resolved", "closed", "cancelled"];
export const TICKET_TYPES: Ticket["type"][] = ["incident", "request", "change", "problem"];
export const SERVICES = ["Email", "Active Directory", "File Storage", "Backup", "Identity", "Remote Access", "Wi-Fi", "LAN", "Printing", "Storage", "Software", "Collaboration", "Onboarding", "Patching"];
export const AGENTS = ["jordan.lee", "morgan.diaz", "sasha.patel", "leo.nguyen", "ivy.brooks"];

export const TICKET_SOURCES: TicketSource[] = ["email", "portal", "service_catalog", "manual", "internal", "protocol", "task"];

export function labelSource(s: TicketSource): string {
  switch (s) {
    case "email": return "Email";
    case "portal": return "Portal";
    case "service_catalog": return "Service Catalog";
    case "manual": return "Manual";
    case "internal": return "Internal";
    case "protocol": return "Protocol";
    case "task": return "Task";
  }
}

export function submitCatalogRequest(item: CatalogItem, requester: string, values: Record<string, string>): Ticket {
  const subject = `${item.name} — ${requester}`;
  const lines = item.fields.map((f) => `- **${f.label}**: ${values[f.key] || "—"}`).join("\n");
  const description = `Service catalog request: ${item.name}\n\n${item.description}\n\n${lines}`;
  return createTicket({
    requester,
    subject,
    description,
    type: "request",
    category: item.category,
    subcategory: item.name,
    priority: item.defaultPriority,
    affectedService: item.category,
    team: item.defaultTeam,
    tags: ["catalog", item.category.toLowerCase()],
    source: "service_catalog",
  });
}

export type EmailIntakeInput = {
  fromEmail: string;
  fromName?: string;
  subject: string;
  body: string;
  receivedAt?: string;
};

export type EmailIntakeResult =
  | { outcome: "linked" | "fallback" | "temp" | "flagged"; ticket: Ticket; matchedRequester?: string }
  | { outcome: "ignored"; reason: string };

export function intakeEmail(input: EmailIntakeInput): EmailIntakeResult {
  const state = getState();
  const mailbox = state.ticketSettings.mailbox;
  if (!mailbox.enabled) {
    logActivity("ticket.email.ignored", `Email from ${input.fromEmail} ignored — mailbox disabled`);
    return { outcome: "ignored", reason: "Mailbox is disabled" };
  }
  const cleanEmail = input.fromEmail.trim().toLowerCase();
  const match = state.users.find((u) => u.email.toLowerCase() === cleanEmail);

  if (match) {
    const t = createTicket({
      requester: match.username,
      subject: input.subject || "(no subject)",
      description: input.body || "(empty email body)",
      type: "incident",
      category: mailbox.defaultCategory,
      priority: mailbox.defaultPriority,
      team: mailbox.defaultTeam,
      tags: ["email"],
      source: "email",
      sourceEmail: cleanEmail,
    });
    return { outcome: "linked", ticket: t, matchedRequester: match.username };
  }

  switch (mailbox.unknownFallback) {
    case "ignore":
      logActivity("ticket.email.ignored", `Email from unknown sender ${cleanEmail} ignored`);
      return { outcome: "ignored", reason: "Unknown sender — configured to ignore" };
    case "assign_fallback": {
      const t = createTicket({
        requester: mailbox.fallbackRequester,
        subject: `[Unknown sender ${cleanEmail}] ${input.subject || "(no subject)"}`,
        description: `Original sender: ${cleanEmail}\n\n${input.body || "(empty email body)"}`,
        type: "incident",
        category: mailbox.defaultCategory,
        priority: mailbox.defaultPriority,
        team: mailbox.defaultTeam,
        tags: ["email", "unknown-sender"],
        source: "email",
        sourceEmail: cleanEmail,
      });
      return { outcome: "fallback", ticket: t };
    }
    case "flag_review": {
      const t = createTicket({
        requester: mailbox.fallbackRequester,
        subject: `[Needs review] ${input.subject || "(no subject)"}`,
        description: `Sender ${cleanEmail} could not be matched to an employee. Please review and reassign.\n\n${input.body || "(empty email body)"}`,
        type: "incident",
        category: mailbox.defaultCategory,
        priority: mailbox.defaultPriority,
        team: mailbox.defaultTeam,
        tags: ["email", "needs-review"],
        source: "email",
        sourceEmail: cleanEmail,
        sourceFlagged: true,
      });
      return { outcome: "flagged", ticket: t };
    }
    case "create_temp":
    default: {
      const tempUsername = `guest:${cleanEmail}`;
      const t = createTicket({
        requester: tempUsername,
        subject: input.subject || "(no subject)",
        description: `Temporary requester created from email.\nSender: ${cleanEmail}\n\n${input.body || "(empty email body)"}`,
        type: "incident",
        category: mailbox.defaultCategory,
        priority: mailbox.defaultPriority,
        team: mailbox.defaultTeam,
        tags: ["email", "temp-requester"],
        source: "email",
        sourceEmail: cleanEmail,
      });
      return { outcome: "temp", ticket: t };
    }
  }
}

// Current "logged-in" requester depends on role: end-users see their own slice.
export function currentRequesterFor(role: string): string {
  if (role === "user" || role === "viewer") return "alice.morgan";
  return "jordan.lee";
}

export function slaLabel(t: Ticket): { label: string; tone: "success" | "warning" | "danger" | "muted" | "info" } {
  if (t.status === "waiting") return { label: "Paused", tone: "muted" };
  if (t.status === "resolved" || t.status === "closed") return { label: "Resolved", tone: "info" };
  if (t.sla === "breached") return { label: "Breached", tone: "danger" };
  if (t.sla === "warning") return { label: "At risk", tone: "warning" };
  return { label: "Healthy", tone: "success" };
}
