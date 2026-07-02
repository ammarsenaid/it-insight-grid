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

const DB_ROLE_ALIASES: Record<string, Role> = {
  platform_admin: "super_admin",
  platform_auditor: "auditor",
};

// Display precedence only. Authorization always evaluates every effective role.
export const ROLE_DISPLAY_PRECEDENCE: Role[] = [
  "super_admin",
  "it_admin",
  "sd_lead",
  "helpdesk",
  "technician",
  "network_admin",
  "doc_editor",
  "auditor",
  "employee",
];

const listeners = new Set<() => void>();
let role: Role = load();
// When a Supabase session is active, AuthProvider pushes the DB-derived role
// here. It takes precedence over the localStorage role, which is kept only as
// an unauthenticated preview fallback.
let sessionRole: Role | null = null;
let sessionRoles: Role[] | null = null;

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
  setSessionRoles(next === null ? null : [next], next);
}

export function rolesForRoleKeys(roleKeys: readonly string[]): Role[] {
  const validRoles = new Set(ROLES.map((roleDef) => roleDef.id));
  const mappedRoles = new Set(roleKeys
    .map((roleKey) => DB_ROLE_ALIASES[roleKey] ?? roleKey)
    .filter((roleKey): roleKey is Role => validRoles.has(roleKey as Role)));
  return ROLE_DISPLAY_PRECEDENCE.filter((candidate) => mappedRoles.has(candidate));
}

export function pickDisplayRole(effectiveRoles: readonly Role[]): Role | null {
  return ROLE_DISPLAY_PRECEDENCE.find((candidate) => effectiveRoles.includes(candidate)) ?? null;
}

/**
 * Publish all authenticated roles for additive authorization while retaining a
 * single deterministic role for labels and other display-only consumers.
 */
export function setSessionRoles(next: readonly Role[] | null, displayRole?: Role | null) {
  const effectiveRoles = next === null ? null : rolesForRoleKeys(next);
  const nextDisplayRole = effectiveRoles === null
    ? null
    : displayRole ?? pickDisplayRole(effectiveRoles) ?? "employee";
  if (
    sessionRole === nextDisplayRole &&
    JSON.stringify(sessionRoles) === JSON.stringify(effectiveRoles)
  ) return;
  sessionRole = nextDisplayRole;
  sessionRoles = effectiveRoles;
  notify();
}

export function hasSessionRole(): boolean {
  return sessionRoles !== null;
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
const TICKET_OPERATORS: Role[] = ["super_admin", "it_admin", "sd_lead", "helpdesk", "technician"];
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
  "tickets.assign":            TICKET_OPERATORS,
  "tickets.resolve":           TICKET_OPERATORS,
  "tickets.commentPublic":      ["super_admin", "it_admin", "sd_lead", "helpdesk", "technician", "network_admin", "doc_editor", "employee"],
  "tickets.commentInternal":    IT_OPS,
  "tickets.attachments.view":   ROLES.map((r) => r.id),
  "tickets.attachments.upload": ["super_admin", "it_admin", "sd_lead", "helpdesk", "technician", "network_admin", "doc_editor", "employee"],
  "tickets.attachments.manage": ["super_admin", "it_admin", "sd_lead"],
  "tickets.viewInternal":      [...IT_OPS, "auditor"], // requester roles never see internal notes
  "tickets.viewQueue":         [...IT_OPS, "auditor"],
  "tickets.config":            [...ADMINS, "sd_lead"],
  "tickets.cannedResponses.delete": ["super_admin"],

  // Operations
  "cmdb.manage":               INFRA_OPS,
  "cmdb.view":                 [...ALL_IT],
  "ipam.manage":               ["super_admin", "it_admin", "network_admin"],
  "ipam.view":                 [...ALL_IT],
  "tasks.write":               ["super_admin", "it_admin", "sd_lead", "helpdesk", "technician", "network_admin", "doc_editor"],
  "tasks.view":                ALL_IT,
  "notes.write":               ["super_admin", "it_admin", "sd_lead", "helpdesk", "technician", "network_admin", "doc_editor"],
  "notes.view":                ALL_IT,
  "protocols.manage":          ["super_admin", "it_admin", "sd_lead", "helpdesk", "technician", "network_admin", "doc_editor"],
  "protocols.view":            ALL_IT,

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
  "/dashboard": NON_REQUESTER,
  "/documents": ROLES.map((r) => r.id),
  "/search": NON_REQUESTER,
  "/tickets": [...IT_OPS, "auditor"],
  "/tickets/": [...IT_OPS, "auditor"],
  "/tickets/:id": ROLES.map((r) => r.id),
  "/my-requests": ROLES.map((r) => r.id),
  "/service-catalog": ROLES.map((r) => r.id),
  "/service-catalog/:id": ROLES.map((r) => r.id),
  "/notifications": ROLES.map((r) => r.id),
  "/cmdb": [...ALL_IT],
  "/ipam": [...ALL_IT],
  "/tasks": [...ALL_IT],
  "/notes": [...ALL_IT],
  "/protocols": [...ALL_IT],
  "/protocols/": [...ALL_IT],
  "/protocols/:id": [...ALL_IT],
  "/audit": [...ADMINS, "auditor"],
  "/reports": [...ADMINS, "sd_lead", "auditor"],
  "/admin/identity": ADMINS,
  "/admin/users": ADMINS,
  "/admin/teams": ADMINS,
  "/admin/roles": ADMINS,
  "/admin/ticket-settings": [...ADMINS, "sd_lead"],
  "/admin/mailbox": [...ADMINS, "sd_lead"],
  "/admin/templates": [...ADMINS, "sd_lead"],
  "/admin/catalog": [...ADMINS, "sd_lead"],
  "/admin/diagnostics": ["super_admin"],
  "/recycle-bin": ADMINS,
  "/trash": ADMINS,
  "/settings": ROLES.map((r) => r.id),
};

// Silence unused-warning while keeping the named constant for clarity.
void REQUESTER_PAGES;

function pageRuleMatches(pattern: string, path: string): boolean {
  if (!pattern.includes(":")) return pattern === path;

  const patternSegments = pattern.split("/");
  const pathSegments = path.split("/");
  if (patternSegments.length !== pathSegments.length) return false;

  return patternSegments.every((segment, index) =>
    segment.startsWith(":") ? pathSegments[index].length > 0 : segment === pathSegments[index],
  );
}

export function pageVisibilityFor(path: string): Role[] | undefined {
  const exact = PAGE_VISIBILITY[path];
  if (exact) return exact;

  const dynamicRule = Object.entries(PAGE_VISIBILITY).find(([pattern]) =>
    pageRuleMatches(pattern, path),
  );
  return dynamicRule?.[1];
}

export function hasPageVisibilityRule(path: string): boolean {
  return pageVisibilityFor(path) !== undefined;
}

function authorizationRoles(current?: Role | readonly Role[]): readonly Role[] {
  if (current !== undefined && typeof current !== "string") return current;
  return sessionRoles ?? [current ?? currentRole()];
}

export function canSeePage(path: string, current?: Role | readonly Role[]): boolean {
  const allowedRoles = pageVisibilityFor(path);
  if (!allowedRoles) return false;
  return authorizationRoles(current).some((candidate) => allowedRoles.includes(candidate));
}

export function can(capability: string, current?: Role | readonly Role[]): boolean {
  const list = CAPS[capability];
  if (!list) return false;
  return authorizationRoles(current).some((candidate) => list.includes(candidate));
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
      { key: "tickets.commentPublic", label: "Post public replies" },
      { key: "tickets.commentInternal", label: "Post internal notes" },
      { key: "tickets.attachments.view", label: "View ticket attachments" },
      { key: "tickets.attachments.upload", label: "Upload ticket attachments" },
      { key: "tickets.attachments.manage", label: "Manage ticket attachments" },
      { key: "tickets.viewInternal", label: "Read internal notes" },
      { key: "tickets.config", label: "Configure SLAs & routing" },
      { key: "tickets.cannedResponses.delete", label: "Delete canned responses" },
    ],
  },
  {
    label: "Operations",
    caps: [
      { key: "cmdb.view", label: "View CMDB" },
      { key: "cmdb.manage", label: "Manage CMDB assets" },
      { key: "ipam.view", label: "View IPAM" },
      { key: "ipam.manage", label: "Manage IPAM" },
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
