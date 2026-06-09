import type { CatalogItem, Ticket, TicketPriority, TicketSLA, TicketSavedView, TicketStatus, NotificationItem } from "./types";
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
  logActivity("ticket.create", `Created ticket ${ticket.number} — ${ticket.subject}`, "ticket", ticket.id);
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
