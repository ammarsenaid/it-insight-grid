/**
 * relationService — frontend-only abstraction over per-module link operations.
 *
 * Each module already owns its link arrays (tickets.comments, task.linkedTicketIds,
 * knowledge node.relations, etc). This service provides a uniform read/add/remove
 * API the RelationshipPanel uses, so panels don't reach into module-specific
 * shapes.
 */
import { getState, setState, logActivity } from "@/lib/data/store";
import type { Task, Ticket, Note, CMDBAsset, IPAMEntry } from "@/lib/data/types";

export type EntityKind =
  | "ticket"
  | "task"
  | "asset"
  | "ipam"
  | "note"
  | "knowledge"
  | "protocol_run"
  | "protocol_template"
  | "user"
  | "team";

export interface RelationRef {
  kind: EntityKind;
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  route?: string;
}

const ROUTE_FOR: Record<EntityKind, (id: string) => string> = {
  ticket: (id) => `/tickets/${id}`,
  task: () => `/tasks`,
  asset: () => `/cmdb`,
  ipam: () => `/ipam`,
  note: () => `/notes`,
  knowledge: (id) => `/documents?k=${id}`,
  protocol_run: (id) => `/protocols/${id}`,
  protocol_template: () => `/protocols`,
  user: () => `/admin/users`,
  team: () => `/admin/teams`,
};

export function routeFor(kind: EntityKind, id: string): string {
  return ROUTE_FOR[kind](id);
}

function findRef(kind: EntityKind, id: string): RelationRef | null {
  const s = getState();
  switch (kind) {
    case "ticket": {
      const t = s.tickets.find((x) => x.id === id);
      return t ? { kind, id, title: t.subject, subtitle: `${t.number} · ${t.priority}`, status: t.status, route: routeFor(kind, id) } : null;
    }
    case "task": {
      const t = s.tasks.find((x) => x.id === id);
      return t ? { kind, id, title: t.title, subtitle: t.category, status: t.status, route: routeFor(kind, id) } : null;
    }
    case "asset": {
      const a = s.assets.find((x) => x.id === id);
      return a ? { kind, id, title: a.hostname, subtitle: `${a.displayName} · ${a.ipAddress}`, status: a.status, route: routeFor(kind, id) } : null;
    }
    case "ipam": {
      const i = s.ipam.find((x) => x.id === id);
      return i ? { kind, id, title: i.ipAddress, subtitle: `${i.hostname} · ${i.subnet}`, status: i.status, route: routeFor(kind, id) } : null;
    }
    case "note": {
      const n = s.notes.find((x) => x.id === id);
      return n ? { kind, id, title: n.title, subtitle: n.category, route: routeFor(kind, id) } : null;
    }
    case "user": {
      const u = s.users.find((x) => x.id === id);
      return u ? { kind, id, title: u.displayName, subtitle: u.email, status: u.status, route: routeFor(kind, id) } : null;
    }
    case "team": {
      const t = s.teams.find((x) => x.id === id);
      return t ? { kind, id, title: t.name, subtitle: t.description, route: routeFor(kind, id) } : null;
    }
    default:
      // knowledge / protocol_* live in other stores; callers resolve.
      return null;
  }
}

/** Resolve a list of (kind,id) pairs to RelationRef[], dropping unknowns. */
export function resolveRelations(refs: Array<{ kind: EntityKind; id: string }>): RelationRef[] {
  return refs.map((r) => findRef(r.kind, r.id)).filter((x): x is RelationRef => x !== null);
}

/**
 * Read all relations stored on a Task. Centralised so RelationshipPanel
 * doesn't need to know the field shape.
 */
export function getTaskRelations(task: Task): RelationRef[] {
  const refs: Array<{ kind: EntityKind; id: string }> = [];
  for (const id of task.linkedTicketIds ?? []) refs.push({ kind: "ticket", id });
  if (task.linkedAssetId) refs.push({ kind: "asset", id: task.linkedAssetId });
  for (const id of task.linkedIpamIds ?? []) refs.push({ kind: "ipam", id });
  for (const id of task.linkedNoteIds ?? []) refs.push({ kind: "note", id });
  for (const id of task.linkedUserIds ?? []) refs.push({ kind: "user", id });
  for (const id of task.linkedProtocolRunIds ?? []) refs.push({ kind: "protocol_run", id });
  if (task.linkedDocumentId) refs.push({ kind: "knowledge", id: task.linkedDocumentId });
  return resolveRelations(refs);
}

export function getTicketRelations(ticket: Ticket): RelationRef[] {
  const refs: Array<{ kind: EntityKind; id: string }> = [];
  if (ticket.linkedAssetId) refs.push({ kind: "asset", id: ticket.linkedAssetId });
  if (ticket.linkedIpamId) refs.push({ kind: "ipam", id: ticket.linkedIpamId });
  if (ticket.linkedDocumentId) refs.push({ kind: "knowledge", id: ticket.linkedDocumentId });
  return resolveRelations(refs);
}

export function getNoteRelations(note: Note): RelationRef[] {
  const refs: Array<{ kind: EntityKind; id: string }> = [];
  for (const id of note.linkedTicketIds ?? []) refs.push({ kind: "ticket", id });
  for (const id of note.linkedAssetIds ?? []) refs.push({ kind: "asset", id });
  for (const id of note.linkedIpamIds ?? []) refs.push({ kind: "ipam", id });
  for (const id of note.linkedTaskIds ?? []) refs.push({ kind: "task", id });
  for (const id of note.linkedUserIds ?? []) refs.push({ kind: "user", id });
  if (note.linkedDocumentId) refs.push({ kind: "knowledge", id: note.linkedDocumentId });
  return resolveRelations(refs);
}

export function getAssetRelations(asset: CMDBAsset): RelationRef[] {
  const refs: Array<{ kind: EntityKind; id: string }> = [];
  for (const id of asset.dependencyIds ?? []) refs.push({ kind: "asset", id });
  // tickets/tasks/ipam pointing at this asset
  const s = getState();
  for (const t of s.tickets) if (t.linkedAssetId === asset.id) refs.push({ kind: "ticket", id: t.id });
  for (const t of s.tasks) if (t.linkedAssetId === asset.id) refs.push({ kind: "task", id: t.id });
  for (const i of s.ipam) if (i.linkedAssetId === asset.id) refs.push({ kind: "ipam", id: i.id });
  return resolveRelations(refs);
}

export function getIpamRelations(ip: IPAMEntry): RelationRef[] {
  const refs: Array<{ kind: EntityKind; id: string }> = [];
  if (ip.linkedAssetId) refs.push({ kind: "asset", id: ip.linkedAssetId });
  return resolveRelations(refs);
}

// ---- Mutations (used by RelationshipPanel "Add link" / "Remove link") ----

export function linkTaskTo(taskId: string, kind: EntityKind, refId: string) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => {
      if (t.id !== taskId) return t;
      const u = { ...t };
      const push = (arr?: string[]) => Array.from(new Set([...(arr ?? []), refId]));
      switch (kind) {
        case "ticket": u.linkedTicketIds = push(u.linkedTicketIds); break;
        case "asset": u.linkedAssetId = refId; break;
        case "ipam": u.linkedIpamIds = push(u.linkedIpamIds); break;
        case "note": u.linkedNoteIds = push(u.linkedNoteIds); break;
        case "user": u.linkedUserIds = push(u.linkedUserIds); break;
        case "protocol_run": u.linkedProtocolRunIds = push(u.linkedProtocolRunIds); break;
        case "knowledge": u.linkedDocumentId = refId; break;
      }
      u.updatedAt = new Date().toISOString();
      return u;
    }),
  }));
  logActivity("relation.linked", `Linked ${kind} to task`, "task", taskId);
}

export function unlinkTaskFrom(taskId: string, kind: EntityKind, refId: string) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => {
      if (t.id !== taskId) return t;
      const u = { ...t };
      const drop = (arr?: string[]) => (arr ?? []).filter((x) => x !== refId);
      switch (kind) {
        case "ticket": u.linkedTicketIds = drop(u.linkedTicketIds); break;
        case "asset": if (u.linkedAssetId === refId) u.linkedAssetId = undefined; break;
        case "ipam": u.linkedIpamIds = drop(u.linkedIpamIds); break;
        case "note": u.linkedNoteIds = drop(u.linkedNoteIds); break;
        case "user": u.linkedUserIds = drop(u.linkedUserIds); break;
        case "protocol_run": u.linkedProtocolRunIds = drop(u.linkedProtocolRunIds); break;
        case "knowledge": if (u.linkedDocumentId === refId) u.linkedDocumentId = undefined; break;
      }
      u.updatedAt = new Date().toISOString();
      return u;
    }),
  }));
  logActivity("relation.removed", `Unlinked ${kind} from task`, "task", taskId);
}
