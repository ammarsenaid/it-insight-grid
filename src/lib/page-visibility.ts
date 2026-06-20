import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminRolePageVisibilityQuery } from "@/lib/admin-roles/queries";
import type { AdminRolePageVisibility } from "@/lib/admin-roles/types";
import {
  PAGE_VISIBILITY,
  ROLES,
  canSeePage as canSeeStaticPage,
  rolesForRoleKeys,
  type Role,
} from "@/lib/permissions";

const FRONTEND_ROLE_TO_DB_ROLE_KEY: Record<Role, string> = {
  super_admin: "platform_admin",
  it_admin: "it_admin",
  sd_lead: "sd_lead",
  helpdesk: "helpdesk",
  technician: "technician",
  network_admin: "network_admin",
  doc_editor: "doc_editor",
  auditor: "platform_auditor",
  employee: "employee",
};

const KNOWN_ROUTE_PATTERNS = Object.keys(PAGE_VISIBILITY);
const KNOWN_ROUTE_PATTERN_SET = new Set(KNOWN_ROUTE_PATTERNS);
const KNOWN_DB_ROLE_KEYS = new Set(Object.values(FRONTEND_ROLE_TO_DB_ROLE_KEY));
const EXPECTED_CELL_COUNT = KNOWN_ROUTE_PATTERNS.length * ROLES.length;

type VisibilityMatrix = ReadonlyMap<string, ReadonlyMap<string, boolean>>;

function routePatternMatches(pattern: string, path: string): boolean {
  if (!pattern.includes(":")) return pattern === path;

  const patternSegments = pattern.split("/");
  const pathSegments = path.split("/");
  if (patternSegments.length !== pathSegments.length) return false;

  return patternSegments.every((segment, index) =>
    segment.startsWith(":") ? pathSegments[index].length > 0 : segment === pathSegments[index],
  );
}

export function knownPageVisibilityPattern(path: string): string | null {
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) return null;
  if (KNOWN_ROUTE_PATTERN_SET.has(path)) return path;
  return KNOWN_ROUTE_PATTERNS.find((pattern) => routePatternMatches(pattern, path)) ?? null;
}

export function buildValidatedPageVisibilityMatrix(
  rows: readonly AdminRolePageVisibility[],
): VisibilityMatrix | null {
  if (rows.length !== EXPECTED_CELL_COUNT) return null;

  const cells = new Map<string, Map<string, boolean>>();
  for (const row of rows) {
    if (
      row.roleScope !== "platform" ||
      !KNOWN_ROUTE_PATTERN_SET.has(row.routePath) ||
      !KNOWN_DB_ROLE_KEYS.has(row.roleKey)
    ) {
      return null;
    }

    const routeCells = cells.get(row.routePath) ?? new Map<string, boolean>();
    if (routeCells.has(row.roleKey)) return null;
    routeCells.set(row.roleKey, row.canView);
    cells.set(row.routePath, routeCells);
  }

  for (const routePath of KNOWN_ROUTE_PATTERNS) {
    const routeCells = cells.get(routePath);
    if (!routeCells || routeCells.size !== ROLES.length) return null;
    for (const roleKey of KNOWN_DB_ROLE_KEYS) {
      if (!routeCells.has(roleKey)) return null;
    }
  }

  if (cells.get("/admin/roles")?.get("platform_admin") !== true) return null;
  for (const routePath of KNOWN_ROUTE_PATTERNS) {
    if (routePath.startsWith("/admin/") && cells.get(routePath)?.get("employee") !== false) {
      return null;
    }
  }

  return cells;
}

export function usePageVisibility(roleKeys: readonly string[], enabled: boolean) {
  const query = useQuery({
    ...adminRolePageVisibilityQuery(),
    enabled,
    staleTime: 30_000,
  });
  const matrix = useMemo(
    () => (query.isSuccess ? buildValidatedPageVisibilityMatrix(query.data) : null),
    [query.data, query.isSuccess],
  );
  const frontendRoles = useMemo(() => rolesForRoleKeys(roleKeys), [roleKeys]);
  const dbRoleKeys = useMemo(
    () => frontendRoles.map((role) => FRONTEND_ROLE_TO_DB_ROLE_KEY[role]),
    [frontendRoles],
  );
  const useLiveMatrix = matrix !== null && dbRoleKeys.length > 0;

  return {
    isUsingLiveMatrix: useLiveMatrix,
    hasRule: (path: string) => knownPageVisibilityPattern(path) !== null,
    canSeePage: (path: string) => {
      const pattern = knownPageVisibilityPattern(path);
      if (!pattern) return false;
      if (!useLiveMatrix) {
        return canSeeStaticPage(path, frontendRoles.length > 0 ? frontendRoles : undefined);
      }
      const routeCells = matrix.get(pattern);
      return dbRoleKeys.some((roleKey) => routeCells?.get(roleKey) === true);
    },
  };
}
