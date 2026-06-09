import { useSyncExternalStore, type ReactNode } from "react";

export type Role = "admin" | "agent" | "user" | "viewer";

export const ROLES: { id: Role; label: string; description: string }[] = [
  { id: "admin", label: "IT Administrator", description: "Full access to all modules and configuration" },
  { id: "agent", label: "IT Agent", description: "Operate tickets, CMDB, IPAM, tasks" },
  { id: "user", label: "End User", description: "Submit requests and read approved documentation" },
  { id: "viewer", label: "Read-only Viewer", description: "Read-only access to approved content" },
];

const KEY = "ikc.role.v1";
const listeners = new Set<() => void>();
let role: Role = load();

function load(): Role {
  if (typeof window === "undefined") return "admin";
  const v = localStorage.getItem(KEY) as Role | null;
  return v && ROLES.some((r) => r.id === v) ? v : "admin";
}

function notify() {
  listeners.forEach((l) => l());
}

export function setRole(next: Role) {
  role = next;
  if (typeof window !== "undefined") localStorage.setItem(KEY, next);
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRole(): Role {
  return useSyncExternalStore(subscribe, () => role, () => role);
}

// Capability matrix (frontend-only mock)
const CAPS: Record<string, Role[]> = {
  "documents.create": ["admin", "agent"],
  "documents.delete": ["admin"],
  "tickets.create": ["admin", "agent", "user"],
  "tickets.assign": ["admin", "agent"],
  "tickets.resolve": ["admin", "agent"],
  "tickets.config": ["admin"],
  "cmdb.write": ["admin", "agent"],
  "ipam.write": ["admin", "agent"],
  "tasks.write": ["admin", "agent"],
  "notes.write": ["admin", "agent"],
  "admin.users": ["admin"],
  "admin.teams": ["admin"],
  "admin.roles": ["admin"],
  "audit.view": ["admin"],
  "reports.view": ["admin", "agent"],
  "recyclebin.restore": ["admin"],
  "settings.write": ["admin"],
};

export function can(capability: string, current?: Role): boolean {
  const r = current ?? role;
  const list = CAPS[capability];
  if (!list) return true;
  return list.includes(r);
}

export function PermissionGuard({
  capability,
  fallback = null,
  children,
}: {
  capability: string;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const r = useRole();
  return <>{can(capability, r) ? children : fallback}</>;
}
