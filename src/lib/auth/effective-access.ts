export interface EffectiveAccessOrganization {
  id: string;
  slug: string;
  name: string;
  status: string;
}

export interface EffectiveAccessTeam {
  id: string;
  slug: string | null;
  name: string;
}

export interface EffectiveAccessWorkspace {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  type: string;
  status: string;
  membershipStatus: string;
  roleKeys: string[];
  permissionKeys: string[];
  teams: EffectiveAccessTeam[];
}

export interface EffectiveAccess {
  roleKeys: string[];
  permissionKeys: string[];
  visibleRoutes: string[];
  safeRecoveryRoute: string;
  isPlatformAdmin: boolean;
  activeOrganization: EffectiveAccessOrganization | null;
  workspaces: EffectiveAccessWorkspace[];
}

type RouteRequirement =
  | { kind: "permission"; anyOf: readonly string[] }
  | { kind: "self-service" }
  | { kind: "self-scoped" }
  | { kind: "platform-admin" }
  | { kind: "missing"; reason: string };

/**
 * Route policy is deliberately permission-key based, never role based. The keys
 * below exist in the RBAC migrations and correspond to RLS/RPC checks. A
 * `missing` entry is visible in the Roles UI but fails closed at runtime until a
 * backend authorization contract is added.
 */
export const ROUTE_REQUIREMENTS: Record<string, RouteRequirement> = {
  "/": { kind: "permission", anyOf: ["knowledge.read"] },
  "/dashboard": { kind: "permission", anyOf: ["knowledge.read"] },
  "/documents": { kind: "permission", anyOf: ["knowledge.read"] },
  "/search": { kind: "permission", anyOf: ["knowledge.read"] },
  "/tickets": { kind: "permission", anyOf: ["tickets.view_all"] },
  "/tickets/": { kind: "permission", anyOf: ["tickets.view_all"] },
  "/tickets/:id": { kind: "self-scoped" },
  "/my-requests": { kind: "self-scoped" },
  "/requests/new": { kind: "self-scoped" },
  "/service-catalog": { kind: "permission", anyOf: ["catalog.request"] },
  "/service-catalog/:id": { kind: "permission", anyOf: ["catalog.request"] },
  "/notifications": { kind: "permission", anyOf: ["notifications.view_own"] },
  "/cmdb": { kind: "permission", anyOf: ["cmdb.view", "cmdb.manage"] },
  "/ipam": { kind: "permission", anyOf: ["ipam.view", "ipam.manage"] },
  "/tasks": { kind: "permission", anyOf: ["tasks.view", "tasks.manage"] },
  "/notes": { kind: "permission", anyOf: ["notes.view", "notes.manage"] },
  "/protocols": { kind: "permission", anyOf: ["protocols.view", "protocols.manage"] },
  "/protocols/": { kind: "permission", anyOf: ["protocols.view", "protocols.manage"] },
  "/protocols/:id": { kind: "permission", anyOf: ["protocols.view", "protocols.manage"] },
  "/audit": { kind: "permission", anyOf: ["audit.view", "platform.view_audit"] },
  "/reports": { kind: "permission", anyOf: ["reports.view"] },
  "/admin/identity": { kind: "platform-admin" },
  "/admin/users": { kind: "platform-admin" },
  "/admin/teams": { kind: "platform-admin" },
  "/admin/roles": { kind: "platform-admin" },
  "/admin/ticket-settings": { kind: "permission", anyOf: ["tickets.config"] },
  "/admin/mailbox": { kind: "permission", anyOf: ["tickets.config"] },
  "/admin/templates": { kind: "missing", reason: "No backend template-management permission exists." },
  "/admin/catalog": { kind: "missing", reason: "No backend catalog-management permission exists." },
  "/recycle-bin": { kind: "missing", reason: "No backend recycle-bin permission exists." },
  "/trash": { kind: "missing", reason: "No backend recycle-bin permission exists." },
  "/settings": { kind: "self-service" },
};

function routeMatches(pattern: string, path: string): boolean {
  if (!pattern.includes(":")) return pattern === path;
  const patternSegments = pattern.split("/");
  const pathSegments = path.split("/");
  return patternSegments.length === pathSegments.length && patternSegments.every(
    (segment, index) => segment.startsWith(":") ? pathSegments[index].length > 0 : segment === pathSegments[index],
  );
}

export function routeRequirementFor(path: string): RouteRequirement | null {
  const match = Object.entries(ROUTE_REQUIREMENTS).find(([pattern]) => routeMatches(pattern, path));
  return match?.[1] ?? null;
}

function hasVisibleRoute(access: EffectiveAccess, path: string): boolean {
  if (access.visibleRoutes.some((pattern) => routeMatches(pattern, path))) {
    return true;
  }
  return path === "/requests/new" &&
    access.visibleRoutes.some((pattern) => routeMatches(pattern, "/my-requests"));
}

export function canAccessRoute(access: EffectiveAccess | null, path: string): boolean {
  if (!access || !hasVisibleRoute(access, path)) return false;
  const requirement = routeRequirementFor(path);
  if (!requirement || requirement.kind === "missing") return false;
  if (requirement.kind === "self-service") return true;
  if (requirement.kind === "self-scoped") return true;
  if (requirement.kind === "platform-admin") return access.isPlatformAdmin;
  if (access.isPlatformAdmin) return true;
  const granted = new Set(access.permissionKeys);
  return requirement.anyOf.some((permission) => granted.has(permission));
}

export function describeRouteRequirement(path: string): string {
  const requirement = routeRequirementFor(path);
  if (!requirement) return "Unknown route: no backend authorization contract exists.";
  if (requirement.kind === "missing") return requirement.reason;
  if (requirement.kind === "self-service") return "Authenticated self-service route; backend route visibility still controls exposure.";
  if (requirement.kind === "self-scoped") return "Backend access is restricted to the signed-in user's own records.";
  if (requirement.kind === "platform-admin") return "Requires the platform_admin backend role.";
  return `Requires any of: ${requirement.anyOf.join(", ")}.`;
}

export function roleHasRouteRequirement(
  path: string,
  permissionKeys: ReadonlySet<string>,
  roleKey: string,
): boolean {
  const requirement = routeRequirementFor(path);
  if (!requirement || requirement.kind === "missing") return false;
  if (requirement.kind === "self-service") return true;
  if (requirement.kind === "self-scoped") return true;
  if (requirement.kind === "platform-admin") return roleKey === "platform_admin";
  if (roleKey === "platform_admin") return true;
  return requirement.anyOf.some((permission) => permissionKeys.has(permission));
}
