import { ROLES, type Role } from "@/lib/permissions";

export interface PageEntry {
  path: string;
  label: string;
  area: string;
}

export const PAGES: PageEntry[] = [
  { path: "/", label: "Dashboard", area: "Workspace" },
  { path: "/documents", label: "Documents", area: "Knowledge" },
  { path: "/tickets", label: "Tickets", area: "Service Desk" },
  { path: "/my-requests", label: "My Requests", area: "Service Desk" },
  { path: "/service-catalog", label: "Service Catalog", area: "Service Desk" },
  { path: "/cmdb", label: "CMDB", area: "Infrastructure" },
  { path: "/ipam", label: "IPAM", area: "Infrastructure" },
  { path: "/tasks", label: "Tasks", area: "Workspace" },
  { path: "/notes", label: "Notes", area: "Workspace" },
  { path: "/audit", label: "Audit Log", area: "Governance" },
  { path: "/reports", label: "Reports", area: "Governance" },
  { path: "/admin/users", label: "Users", area: "Administration" },
  { path: "/admin/teams", label: "Teams", area: "Administration" },
  { path: "/admin/roles", label: "Roles", area: "Administration" },
  { path: "/admin/ticket-settings", label: "Ticket Configuration", area: "Administration" },
  { path: "/trash", label: "Recycle Bin", area: "Workspace" },
  { path: "/settings", label: "Settings", area: "Workspace" },
];

export const AREA_ORDER = [
  "Workspace",
  "Knowledge",
  "Service Desk",
  "Infrastructure",
  "Governance",
  "Administration",
];

export const GROUP_ORDER = [
  "documents",
  "knowledge",
  "tickets",
  "catalog",
  "cmdb",
  "ipam",
  "tasks",
  "notes",
  "protocols",
  "admin",
  "platform",
  "team",
  "audit",
  "reports",
  "recyclebin",
  "system",
  "notifications",
  "other",
];

export const NON_EMPLOYEE_RECOVERY_ROLE_KEYS = new Set([
  "platform_admin",
  "it_admin",
  "sd_lead",
  "helpdesk",
  "technician",
  "network_admin",
  "doc_editor",
  "platform_auditor",
]);

export const PAGE_VISIBILITY_ROLE_LABELS: Record<string, string> = {
  doc_editor: "Doc Editor",
  employee: "Employee",
  helpdesk: "Helpdesk",
  it_admin: "IT Admin",
  network_admin: "Network Admin",
  platform_admin: "Platform Admin",
  platform_auditor: "Platform Auditor",
  sd_lead: "SD Lead",
  technician: "Technician",
  super_admin: "Platform Admin",
  auditor: "Platform Auditor",
};

export function permissionGroup(permissionKey: string): string {
  const prefix = permissionKey.split(".", 1)[0]?.toLowerCase();
  return GROUP_ORDER.includes(prefix) ? prefix : "other";
}

export function staticRoleFor(roleKey: string): Role | null {
  const mapped =
    roleKey === "platform_admin"
      ? "super_admin"
      : roleKey === "platform_auditor"
        ? "auditor"
        : roleKey;
  return ROLES.some((role) => role.id === mapped) ? (mapped as Role) : null;
}

export function abbreviation(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export function formatGroupLabel(label: string): string {
  return label.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function pageArea(routePath: string): string {
  return PAGES.find((page) => page.path === routePath)?.area ?? "Other";
}

export function pageLabel(routePath: string): string {
  return PAGES.find((page) => page.path === routePath)?.label ?? "Unlisted route";
}

export function isProtectedVisibilityCell({
  roleKey,
  routePath,
  currentCanView,
}: {
  roleKey: string;
  routePath: string;
  currentCanView: boolean | undefined;
}): { protected: boolean; reason: string | null } {
  if (roleKey === "platform_admin" && routePath === "/admin/roles") {
    return {
      protected: true,
      reason: "Platform Admin must always keep access to role management.",
    };
  }
  if (roleKey === "employee" && (routePath === "/admin" || routePath.startsWith("/admin/"))) {
    return {
      protected: true,
      reason: "Employee access to admin pages is intentionally blocked.",
    };
  }
  const recoveryRoute =
    (routePath === "/" && NON_EMPLOYEE_RECOVERY_ROLE_KEYS.has(roleKey)) ||
    (routePath === "/my-requests" && roleKey === "employee");
  if (recoveryRoute && currentCanView === true) {
    return {
      protected: true,
      reason: "Required recovery destination. This route cannot be disabled.",
    };
  }
  return { protected: false, reason: null };
}

export const SCOPE_ACCENTS = {
  platform: {
    chip: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
    ring: "ring-cyan-500/25 bg-cyan-500/10 text-cyan-200",
    border: "border-cyan-500/20",
    text: "text-cyan-200",
    selectedRing: "ring-cyan-400/60",
  },
  team: {
    chip: "border-violet-500/30 bg-violet-500/10 text-violet-200",
    ring: "ring-violet-500/25 bg-violet-500/10 text-violet-200",
    border: "border-violet-500/20",
    text: "text-violet-200",
    selectedRing: "ring-violet-400/60",
  },
  static: {
    chip: "border-slate-500/30 bg-slate-500/10 text-slate-200",
    ring: "ring-slate-500/25 bg-slate-500/10 text-slate-200",
    border: "border-slate-500/20",
    text: "text-slate-200",
    selectedRing: "ring-slate-400/60",
  },
} as const;

export type ScopeAccent = keyof typeof SCOPE_ACCENTS;

export function scopeAccent(scope: string | undefined): ScopeAccent {
  if (scope === "platform") return "platform";
  if (scope === "team") return "team";
  return "static";
}

export function accessTierFor(permissionCount: number): {
  label: string;
  className: string;
  tone: "high" | "standard" | "limited";
} {
  if (permissionCount >= 30) {
    return {
      label: "High access",
      className: "border-rose-500/30 bg-rose-500/10 text-rose-200",
      tone: "high",
    };
  }
  if (permissionCount >= 10) {
    return {
      label: "Standard",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      tone: "standard",
    };
  }
  return {
    label: "Limited",
    className: "border-slate-500/30 bg-slate-500/10 text-slate-200",
    tone: "limited",
  };
}
