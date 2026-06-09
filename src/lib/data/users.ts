import type { User, UserStatus, ID } from "./types";
import { getState, setState, uid, logActivity } from "./store";
import { ROLES, type Role } from "@/lib/permissions";

export interface UserInput {
  username: string;
  displayName: string;
  email: string;
  department: string;
  team: string;
  role: Role;
  title?: string;
  notes?: string;
}

const now = () => new Date().toISOString();

export function listUsers(): User[] {
  return getState().users;
}

export function getUser(id: ID): User | undefined {
  return getState().users.find((u) => u.id === id);
}

export function createUser(input: UserInput): User {
  const u: User = {
    id: uid("usr"),
    username: input.username.trim(),
    displayName: input.displayName.trim(),
    email: input.email.trim(),
    department: input.department.trim() || "—",
    team: input.team || "—",
    role: input.role,
    title: input.title?.trim(),
    status: "active",
    notes: input.notes ?? "",
    createdAt: now(),
    updatedAt: now(),
  };
  setState((s) => ({ ...s, users: [u, ...s.users] }));
  logActivity("user.create", `Created user '${u.displayName}'`, "user", u.id);
  return u;
}

export function updateUser(id: ID, patch: Partial<UserInput & { status: UserStatus }>): void {
  setState((s) => ({
    ...s,
    users: s.users.map((u) => (u.id === id ? { ...u, ...patch, updatedAt: now() } : u)),
  }));
  logActivity("user.update", `Updated user`, "user", id);
}

export function archiveUser(id: ID): void {
  updateUser(id, { status: "archived" });
  logActivity("user.archive", `Archived user`, "user", id);
}

export function restoreUser(id: ID): void {
  updateUser(id, { status: "active" });
  logActivity("user.restore", `Restored user`, "user", id);
}

export interface UserStats {
  assignedTickets: number;
  assignedTasks: number;
  authoredDocuments: number;
  notes: number;
}

export function userStats(user: User): UserStats {
  const s = getState();
  return {
    assignedTickets: s.tickets.filter((t) => t.assignee === user.username || t.requester === user.username).length,
    assignedTasks: s.tasks.filter((t) => t.assignedTo === user.username || t.owner === user.username).length,
    authoredDocuments: s.documents.filter((d) => d.owner === user.username).length,
    notes: s.notes.filter((n) => n.owner === user.username).length,
  };
}

export function roleLabel(roleId: string): string {
  return ROLES.find((r) => r.id === roleId)?.label ?? roleId;
}
