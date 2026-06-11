import { useSyncExternalStore, type ReactNode } from "react";

export type Role =
  | "super_admin"
  | "it_admin"
  | "sd_lead"
  | "helpdesk"
  | "technician"
  | "network_admin"
  | "doc_editor"
  | "auditor"
  | "employee";

export interface RoleDef {
  id: Role;
  label: string;
  description: string;
  group: "IT Leadership" | "Service Desk" | "Operations" | "Documentation" | "Read-only" | "Requester";
}

export const ROLES: RoleDef[] = [
  { id: "super_admin",   label: "Super Admin",        description: "Unrestricted access to every module and configuration.", group: "IT Leadership" },
  { id: "it_admin",      label: "IT Administrator",   description: "Full access to all IT modules. Cannot manage tenant-level keys.", group: "IT Leadership" },
  { id: "sd_lead",       label: "Service Desk Lead",  description: "Manages ticket queues, SLA policies, and team routing.", group: "Service Desk" },
  { id: "helpdesk",      label: "Helpdesk Agent",     description: "Handles incoming tickets and end-user requests.", group: "Service Desk" },
  { id: "technician",    label: "Technician",         description: "Field/desk technician — works tickets, CMDB and tasks.", group: "Operations" },
  { id: "network_admin", label: "Network Admin",      description: "Owns IPAM and network assets in CMDB.", group: "Operations" },
  { id: "doc_editor",    label: "Documentation Editor", description: "Authors and curates the knowledge base.", group: "Documentation" },
  { id: "auditor",       label: "Auditor / Read-only IT", description: "Read-only access to operational data, audit log and reports.", group: "Read-only" },
  { id: "employee",      label: "Employee / Requester", description: "Submits requests and reads approved documentation.", group: "Requester" },
];

const KEY = "ikc.role.v2";
const LEGACY_KEY = "ikc.role.v1";
const LEGACY_MAP: Record<string, Role> = {
  admin: "super_admin",
  agent: "helpdesk",
  user: "employee",
  viewer: "auditor",
};

const listeners = new Set<() => void>();
let role: Role = load();
// When a Supabase session is active, AuthProvider pushes the DB-derived role
// here. It takes precedence over the localStorage role, which is kept only as
// an unauthenticated preview fallback.
let sessionRole: Role | null = null;

function load(): Role {
  if (typeof window === "undefined") return "super_admin";
  const v = localStorage.getItem(KEY) as Role | null;
  if (v && ROLES.some((r) => r.id === v)) return v;
  // migrate from v1
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy && LEGACY_MAP[legacy]) {
    const next = LEGACY_MAP[legacy];
    localStorage.setItem(KEY, next);
    return next;
  }
  return "super_admin";
}

function notify() { listeners.forEach((l) => l()); }

function currentRole(): Role {
  return sessionRole ?? role;
}

export function setRole(next: Role) {
  role = next;
  if (typeof window !== "undefined") localStorage.setItem(KEY, next);
  notify();
}

/**
 * Push the authenticated DB role into the permissions store. Pass `null`
 * to clear (sign-out / unauthenticated preview). While a non-null session
 * role is set, it overrides the localStorage role returned by `useRole()`.
 */
export function setSessionRole(next: Role | null) {
  if (next !== null && !ROLES.some((r) => r.id === next)) return;
  if (sessionRole === next) return;
  sessionRole = next;
  notify();
}

export function hasSessionRole(): boolean {
  return sessionRole !== null;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRole(): Role {
  return useSyncExternalStore(subscribe, currentRole, currentRole);
}


// ---------- Capability matrix ----------
// Frontend-only. Backend enforcement will be added later via Lovable Cloud / RLS.

const ALL_IT: Role[] = ["super_admin", "it_admin", "sd_lead", "helpdesk", "technician", "network_admin", "doc_editor", "auditor"];
const IT_OPS: Role[] = ["super_admin", "it_admin", "sd_lead", "helpdesk", "technician", "network_admin"];
const INFRA_OPS: Role[] = ["super_admin", "it_admin", "technician", "network_admin"];
const ADMINS: Role[] = ["super_admin", "it_admin"];

export const CAPS: Record<string, Role[]> = {
  // Documents
  "documents.view.draft":      ["super_admin", "it_admin", "sd_lead", "helpdesk", "technician", "network_admin", "doc_editor", "auditor"],
  "documents.view.archived":   ALL_IT,
  "documents.view.restricted": ["super_admin", "it_admin", "sd_lead", "doc_editor"],
  "documents.create":          ["super_admin", "it_admin", "doc_editor"],
  "documents.edit":            ["super_admin", "it_admin", "doc_editor"],
  "documents.delete":          ADMINS,
  "documents.archive":         ["super_admin", "it_admin", "doc_editor"],
  "documents.changeStatus":    ["super_admin", "it_admin", "doc_editor"],
  "documents.move":            ["super_admin", "it_admin", "doc_editor"],
  "documents.bulk":            ["super_admin", "it_admin", "doc_editor"],
  "folders.write":             ["super_admin", "it_admin", "doc_editor"],
  "folders.delete":            ADMINS,

  // Tickets
  "tickets.create":            ["super_admin", "it_admin", "sd_lead", "helpdesk", "technician", "network_admin", "doc_editor", "employee"],
  "tickets.assign":            IT_OPS,
  "tickets.resolve":           IT_OPS,
  "tickets.viewInternal":      [...IT_OPS, "auditor"], // requester roles never see internal notes
  "tickets.viewQueue":         [...IT_OPS, "auditor"],
  "tickets.config":            [...ADMINS, "sd_lead"],

  // Operations
  "cmdb.write":                INFRA_OPS,
  "cmdb.view":                 [...ALL_IT],
  "ipam.write":                INFRA_OPS,
  "ipam.view":                 [...ALL_IT],
  "tasks.write":               ["super_admin", "it_admin", "sd_lead", "helpdesk", "technician", "network_admin", "doc_editor"],
  "tasks.view":                ALL_IT,
  "notes.write":               ["super_admin", "it_admin", "sd_lead", "helpdesk", "technician", "network_admin", "doc_editor"],
  "notes.view":                ALL_IT,

  // Administration
  "admin.users":               ADMINS,
  "admin.teams":               ADMINS,
  "admin.roles":               ADMINS,
  "audit.view":                [...ADMINS, "auditor"],
  "reports.view":              [...ADMINS, "sd_lead", "auditor"],
  "recyclebin.restore":        ADMINS,
  "settings.write":            ADMINS,
};

// Page visibility — drives sidebar and direct-route gating
const REQUESTER_PAGES: Role[] = ["employee"];
const NON_REQUESTER: Role[] = ROLES.map((r) => r.id).filter((r) => r !== "employee");

export const PAGE_VISIBILITY: Record<string, Role[]> = {
  "/": NON_REQUESTER,
  "/documents": ROLES.map((r) => r.id),
  "/search": NON_REQUESTER,
  "/tickets": [...IT_OPS, "auditor"],
  "/my-requests": ROLES.map((r) => r.id),
  "/service-catalog": ROLES.map((r) => r.id),
  "/notifications": ROLES.map((r) => r.id),
  "/cmdb": [...ALL_IT],
  "/ipam": [...ALL_IT],
  "/tasks": [...ALL_IT],
  "/notes": [...ALL_IT],
  "/protocols": [...ALL_IT],
  "/audit": [...ADMINS, "auditor"],
  "/reports": [...ADMINS, "sd_lead", "auditor"],
  "/admin/users": ADMINS,
  "/admin/teams": ADMINS,
  "/admin/roles": ADMINS,
  "/admin/ticket-settings": [...ADMINS, "sd_lead"],
  "/admin/mailbox": [...ADMINS, "sd_lead"],
  "/admin/templates": [...ADMINS, "sd_lead", "doc_editor"],
  "/admin/catalog": [...ADMINS, "sd_lead"],
  "/trash": ADMINS,
  "/settings": ROLES.map((r) => r.id),
};

// Silence unused-warning while keeping the named constant for clarity.
void REQUESTER_PAGES;

export function canSeePage(path: string, current?: Role): boolean {
  const r = current ?? currentRole();
  const list = PAGE_VISIBILITY[path];
  if (!list) return true;
  return list.includes(r);
}

export function can(capability: string, current?: Role): boolean {
  const r = current ?? currentRole();
  const list = CAPS[capability];
  if (!list) return true;
  return list.includes(r);
}


// Friendly capability groups for the permission matrix UI
export const CAPABILITY_GROUPS: { label: string; caps: { key: string; label: string }[] }[] = [
  {
    label: "Documents",
    caps: [
      { key: "documents.view.draft", label: "View draft / in-review docs" },
      { key: "documents.view.archived", label: "View archived docs" },
      { key: "documents.view.restricted", label: "View restricted docs" },
      { key: "documents.create", label: "Create document" },
      { key: "documents.edit", label: "Edit document" },
      { key: "documents.delete", label: "Delete document" },
      { key: "documents.archive", label: "Archive document" },
      { key: "documents.changeStatus", label: "Change lifecycle status" },
      { key: "folders.write", label: "Manage folders" },
      { key: "folders.delete", label: "Delete folders" },
    ],
  },
  {
    label: "Service Desk",
    caps: [
      { key: "tickets.viewQueue", label: "View ticket queue" },
      { key: "tickets.create", label: "Create ticket" },
      { key: "tickets.assign", label: "Assign / route tickets" },
      { key: "tickets.resolve", label: "Resolve / close tickets" },
      { key: "tickets.viewInternal", label: "Read internal notes" },
      { key: "tickets.config", label: "Configure SLAs & routing" },
    ],
  },
  {
    label: "Operations",
    caps: [
      { key: "cmdb.view", label: "View CMDB" },
      { key: "cmdb.write", label: "Edit CMDB assets" },
      { key: "ipam.view", label: "View IPAM" },
      { key: "ipam.write", label: "Edit IP records" },
      { key: "tasks.view", label: "View tasks" },
      { key: "tasks.write", label: "Edit tasks" },
      { key: "notes.view", label: "View notes" },
      { key: "notes.write", label: "Edit notes" },
    ],
  },
  {
    label: "Administration",
    caps: [
      { key: "admin.users", label: "Manage users" },
      { key: "admin.teams", label: "Manage teams" },
      { key: "admin.roles", label: "Manage roles" },
      { key: "audit.view", label: "View audit log" },
      { key: "reports.view", label: "View reports" },
      { key: "recyclebin.restore", label: "Restore from recycle bin" },
      { key: "settings.write", label: "Edit system settings" },
    ],
  },
];

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
