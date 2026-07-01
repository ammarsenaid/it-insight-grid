import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  describeRouteRequirement,
  roleHasRouteRequirement,
} from "@/lib/auth/effective-access";
import type {
  AccessDecision,
  AccessOverrideEffect,
  AccessResourceType,
  AccessSubjectType,
  AdminAccessResult,
  AdminAccessSnapshot,
  IdentityAdminResult,
  IdentityAdminSnapshot,
} from "./types";

const routePattern =
  /^\/(?:[a-z0-9-]+|:[a-z][a-z0-9_]*)(?:\/(?:[a-z0-9-]+|:[a-z][a-z0-9_]*))*\/?$/;
const protectedRoutes = new Set(["/", "/my-requests", "/admin/identity", "/admin/roles"]);

export const adminAccessInputSchema = z.object({
  accessToken: z.string().min(1),
  action: z.enum(["read", "set"]),
  subjectType: z.enum(["user", "team", "workspace"]),
  subjectId: z.string().uuid(),
  workspaceId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  resourceType: z.enum(["permission", "route"]).optional(),
  resourceKey: z.string().trim().min(1).max(255).optional(),
  effect: z.enum(["allow", "deny", "inherit"]).optional(),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict();

const identityReason = z.string().trim().min(3).max(500);
const nullableRoleKey = z.string().trim().max(80).nullable();
const workspaceType = z.enum([
  "department",
  "project",
  "service",
  "partner",
  "management",
  "system",
]);

export const adminIdentityInputSchema = z.discriminatedUnion("action", [
  z.object({
    accessToken: z.string().min(1),
    action: z.literal("identity.read"),
    subjectType: z.enum(["user", "workspace"]),
    subjectId: z.string().uuid(),
  }).strict(),
  z.object({
    accessToken: z.string().min(1),
    action: z.literal("identity.set_global_role"),
    userId: z.string().uuid(),
    roleKey: nullableRoleKey,
    reason: identityReason,
  }).strict(),
  z.object({
    accessToken: z.string().min(1),
    action: z.literal("identity.set_team_assignment"),
    userId: z.string().uuid(),
    teamId: z.string().uuid(),
    roleKey: nullableRoleKey,
    reason: identityReason,
  }).strict(),
  z.object({
    accessToken: z.string().min(1),
    action: z.literal("identity.create_workspace"),
    name: z.string().trim().min(1).max(160),
    slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
    description: z.string().trim().max(2000),
    workspaceType,
    reason: identityReason,
  }).strict(),
  z.object({
    accessToken: z.string().min(1),
    action: z.literal("identity.update_workspace"),
    workspaceId: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
    description: z.string().trim().max(2000),
    workspaceType,
    status: z.enum(["active", "suspended", "archived"]),
    reason: identityReason,
  }).strict(),
  z.object({
    accessToken: z.string().min(1),
    action: z.literal("identity.set_workspace_member"),
    workspaceId: z.string().uuid(),
    userId: z.string().uuid(),
    roleKey: nullableRoleKey,
    reason: identityReason,
  }).strict(),
]);

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const createServiceClient = (url: string, key: string) =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
const createUserClient = (url: string, key: string, token: string) =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
type AdminClient = ReturnType<typeof createServiceClient>;

const tableFor = (
  subjectType: AccessSubjectType,
  resourceType: AccessResourceType,
): string => `${subjectType}_${resourceType === "route" ? "page_visibility" : "permission"}_overrides`;

const subjectColumn = (subjectType: AccessSubjectType): string =>
  subjectType === "user" ? "user_id" : subjectType === "team" ? "team_id" : "workspace_id";

async function verifyAdmin(admin: AdminClient, token: string) {
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return null;
  const userId = authData.user.id;
  const [profile, role] = await Promise.all([
    admin.from("profiles").select("is_active").eq("id", userId).maybeSingle(),
    admin
      .from("user_global_roles")
      .select("roles!inner(role_key, role_scope)")
      .eq("user_id", userId)
      .eq("roles.role_key", "platform_admin")
      .eq("roles.role_scope", "platform")
      .limit(1),
  ]);
  const profileData = profile.data as Row | null;
  return !profile.error && !role.error && profileData?.is_active === true && role.data.length > 0
    ? userId
    : null;
}

async function readSnapshot(
  admin: AdminClient,
  input: z.infer<typeof adminAccessInputSchema>,
): Promise<AdminAccessSnapshot | null> {
  const { subjectType, subjectId } = input;
  const subjectKey = subjectColumn(subjectType);
  const permissionTable = tableFor(subjectType, "permission");
  const routeTable = tableFor(subjectType, "route");

  const readiness = await admin.rpc("get_access_control_status");
  if (
    readiness.error &&
    ["42P01", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(readiness.error.code)
  ) {
    return {
      available: false,
      subjectType,
      subjectId,
      permissions: [],
      routes: [],
      audit: [],
      warning:
        "The complete access-control migration chain is pending human review and activation.",
    };
  }
  const readinessData = readiness.data as Row | null;
  if (
    readiness.error ||
    readinessData?.version !== 1 ||
    readinessData?.overrides !== true ||
    readinessData?.runtime_resolution !== true ||
    readinessData?.permission_enforcement !== true
  ) return null;

  const subjectTable =
    subjectType === "user" ? "profiles" : subjectType === "team" ? "teams" : "workspaces";
  const subjectResult = await admin
    .from(subjectTable)
    .select("id")
    .eq("id", subjectId)
    .maybeSingle();
  if (subjectResult.error || !subjectResult.data) return null;

  const [
    permissionsResult,
    rolesResult,
    grantsResult,
    visibilityResult,
    directPermissionsResult,
    directRoutesResult,
    userRolesResult,
    teamMembersResult,
    teamRolesResult,
    workspaceMembersResult,
    workspaceRolesResult,
    auditResult,
  ] = await Promise.all([
    admin.from("permissions").select("id, permission_key, name").order("permission_key"),
    admin.from("roles").select("id, role_key, name, role_scope"),
    admin.from("role_permissions").select("role_id, permission_id"),
    admin.from("role_page_visibility").select("role_id, route_path, can_view"),
    admin.from(permissionTable).select("permission_id, effect, reason").eq(subjectKey, subjectId),
    admin.from(routeTable).select("route_path, effect, reason").eq(subjectKey, subjectId),
    subjectType === "user"
      ? admin.from("user_global_roles").select("role_id").eq("user_id", subjectId)
      : Promise.resolve({ data: [], error: null }),
    subjectType === "user"
      ? admin.from("team_members").select("team_id").eq("user_id", subjectId).eq("membership_status", "active")
      : Promise.resolve({ data: [], error: null }),
    subjectType === "user"
      ? admin.from("team_member_roles").select("team_id, role_id").eq("user_id", subjectId)
      : Promise.resolve({ data: [], error: null }),
    subjectType === "user"
      ? admin.from("workspace_members").select("id, workspace_id").eq("user_id", subjectId).eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
    subjectType === "user"
      ? admin.from("workspace_member_roles").select("workspace_member_id, role_id")
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("access_control_audit_log")
      .select("id, resource_type, resource_key, previous_effect, new_effect, reason, created_at")
      .eq("subject_type", subjectType)
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const allResults = [
    permissionsResult, rolesResult, grantsResult, visibilityResult,
    directPermissionsResult, directRoutesResult, userRolesResult, teamMembersResult,
    teamRolesResult, workspaceMembersResult, workspaceRolesResult,
    auditResult,
  ];
  if (allResults.some((result) => result.error)) return null;

  const permissionById = new Map(rows(permissionsResult.data).map((row) => [text(row.id), row]));
  const roleById = new Map(rows(rolesResult.data).map((row) => [text(row.id), row]));
  const activeTeamIds = new Set(rows(teamMembersResult.data).map((row) => text(row.team_id)));
  const activeWorkspaceMemberRows = rows(workspaceMembersResult.data);
  const activeWorkspaceIds = new Set(
    activeWorkspaceMemberRows.map((row) => text(row.workspace_id)),
  );
  const applicableTeamIds =
    subjectType === "user"
      ? Array.from(activeTeamIds).filter((id) => !input.teamId || id === input.teamId)
      : subjectType === "team"
        ? [subjectId]
        : [];
  const applicableWorkspaceIds =
    subjectType === "user"
      ? Array.from(activeWorkspaceIds).filter(
          (id) => !input.workspaceId || id === input.workspaceId,
        )
      : subjectType === "workspace"
        ? [subjectId]
        : [];
  const emptyResult = { data: [] as Row[], error: null };
  const [
    teamPermissionOverridesResult,
    workspacePermissionOverridesResult,
    teamRouteOverridesResult,
    workspaceRouteOverridesResult,
    teamNamesResult,
    workspaceNamesResult,
  ] = await Promise.all([
    applicableTeamIds.length
      ? admin
          .from("team_permission_overrides")
          .select("team_id, permission_id, effect, reason")
          .in("team_id", applicableTeamIds)
      : Promise.resolve(emptyResult),
    applicableWorkspaceIds.length
      ? admin
          .from("workspace_permission_overrides")
          .select("workspace_id, permission_id, effect, reason")
          .in("workspace_id", applicableWorkspaceIds)
      : Promise.resolve(emptyResult),
    applicableTeamIds.length
      ? admin
          .from("team_page_visibility_overrides")
          .select("team_id, route_path, effect, reason")
          .in("team_id", applicableTeamIds)
      : Promise.resolve(emptyResult),
    applicableWorkspaceIds.length
      ? admin
          .from("workspace_page_visibility_overrides")
          .select("workspace_id, route_path, effect, reason")
          .in("workspace_id", applicableWorkspaceIds)
      : Promise.resolve(emptyResult),
    applicableTeamIds.length
      ? admin.from("teams").select("id, name").in("id", applicableTeamIds)
      : Promise.resolve(emptyResult),
    applicableWorkspaceIds.length
      ? admin.from("workspaces").select("id, name").in("id", applicableWorkspaceIds)
      : Promise.resolve(emptyResult),
  ]);
  if (
    [
      teamPermissionOverridesResult,
      workspacePermissionOverridesResult,
      teamRouteOverridesResult,
      workspaceRouteOverridesResult,
      teamNamesResult,
      workspaceNamesResult,
    ].some((result) => result.error)
  ) return null;

  const teamNameById = new Map(
    rows(teamNamesResult.data).map((row) => [text(row.id), text(row.name)]),
  );
  const workspaceNameById = new Map(
    rows(workspaceNamesResult.data).map((row) => [text(row.id), text(row.name)]),
  );
  const overrideMap = (values: Row[], key: string) => {
    const result = new Map<string, Row>();
    values.forEach((row) => {
      const resourceKey = text(row[key]);
      const current = result.get(resourceKey);
      if (!current || text(row.effect) === "deny") result.set(resourceKey, row);
    });
    return result;
  };
  const directPermission = new Map(rows(directPermissionsResult.data).map((row) => [text(row.permission_id), row]));
  const teamPermission = overrideMap(rows(teamPermissionOverridesResult.data), "permission_id");
  const workspacePermission = overrideMap(
    rows(workspacePermissionOverridesResult.data),
    "permission_id",
  );
  const directRoute = new Map(rows(directRoutesResult.data).map((row) => [text(row.route_path), row]));
  const teamRoute = overrideMap(rows(teamRouteOverridesResult.data), "route_path");
  const workspaceRoute = overrideMap(
    rows(workspaceRouteOverridesResult.data),
    "route_path",
  );

  const roleIds = new Set<string>();
  if (subjectType === "user") {
    rows(userRolesResult.data).forEach((row) => roleIds.add(text(row.role_id)));
    rows(teamRolesResult.data)
      .filter((row) => activeTeamIds.has(text(row.team_id)) && (!input.teamId || text(row.team_id) === input.teamId))
      .forEach((row) => roleIds.add(text(row.role_id)));
    const activeWorkspaceMemberIds = new Set(
      activeWorkspaceMemberRows
        .filter((row) => !input.workspaceId || text(row.workspace_id) === input.workspaceId)
        .map((row) => text(row.id)),
    );
    rows(workspaceRolesResult.data)
      .filter((row) => activeWorkspaceMemberIds.has(text(row.workspace_member_id)))
      .forEach((row) => roleIds.add(text(row.role_id)));
  }

  const grantedPermissionIds = new Set(
    rows(grantsResult.data)
      .filter((row) => roleIds.has(text(row.role_id)))
      .map((row) => text(row.permission_id)),
  );
  const isPlatformAdmin = Array.from(roleIds).some(
    (roleId) => text(roleById.get(roleId)?.role_key) === "platform_admin",
  );
  if (isPlatformAdmin) {
    permissionById.forEach((_permission, permissionId) => grantedPermissionIds.add(permissionId));
  }
  const roleSourceForPermission = (permissionId: string) =>
    rows(grantsResult.data)
      .filter((row) => text(row.permission_id) === permissionId && roleIds.has(text(row.role_id)))
      .map((row) => text(roleById.get(text(row.role_id))?.name))
      .filter(Boolean)
      .join(", ");

  const decide = (
    key: string,
    label: string,
    direct: Map<string, Row>,
    team: Map<string, Row>,
    workspace: Map<string, Row>,
    roleAllow: boolean,
    roleSource: string,
  ): AccessDecision => {
    const inheritedSource = (
      label: string,
      row: Row | undefined,
      idColumn: "team_id" | "workspace_id",
      names: Map<string, string>,
    ) => {
      const name = names.get(text(row?.[idColumn]));
      return name ? `${label} · ${name}` : label;
    };
    const levels = [
      [`${subjectType[0].toUpperCase()}${subjectType.slice(1)} override`, direct.get(key)],
      [
        inheritedSource("Team override", team.get(key), "team_id", teamNameById),
        team.get(key),
      ],
      [
        inheritedSource(
          "Workspace override",
          workspace.get(key),
          "workspace_id",
          workspaceNameById,
        ),
        workspace.get(key),
      ],
    ] as const;
    for (const [source, row] of levels) {
      const effect = text(row?.effect);
      if (effect === "allow" || effect === "deny") {
        const directEffect = text(direct.get(key)?.effect);
        return {
          key,
          label,
          override:
            directEffect === "allow" || directEffect === "deny" ? directEffect : "inherit",
          effective: effect, source, reason: text(row?.reason) || null,
        };
      }
    }
    return {
      key,
      label,
      override: (() => {
        const effect = text(direct.get(key)?.effect);
        return effect === "allow" || effect === "deny" ? effect : "inherit";
      })(),
      effective: roleAllow ? "allow" : "deny",
      source: roleAllow ? roleSource || "Role grant" : "No inherited grant",
      reason: null,
    };
  };

  const permissions = Array.from(permissionById.entries()).map(([id, row]) => {
    const permissionKey = text(row.permission_key);
    return {
      ...decide(
      id,
      permissionKey,
      directPermission,
      teamPermission,
      workspacePermission,
      grantedPermissionIds.has(id),
      roleSourceForPermission(id),
      ),
      key: permissionKey,
    };
  });
  const effectivePermissionKeys = new Set(
    permissions.filter((permission) => permission.effective === "allow").map((permission) => permission.key),
  );

  const routePaths = Array.from(
    new Set([
      ...rows(visibilityResult.data).map((row) => text(row.route_path)),
      ...directRoute.keys(), ...teamRoute.keys(), ...workspaceRoute.keys(),
    ]),
  ).sort();
  const routes = routePaths.map((routePath) => {
    const allowingRoles = rows(visibilityResult.data)
      .filter((row) => text(row.route_path) === routePath && row.can_view === true && roleIds.has(text(row.role_id)))
      .map((row) => text(roleById.get(text(row.role_id))?.name))
      .filter(Boolean);
    const visibilityDecision = decide(
      routePath,
      routePath,
      directRoute,
      teamRoute,
      workspaceRoute,
      allowingRoles.length > 0,
      allowingRoles.join(", "),
    );
    const contractAllowed = roleHasRouteRequirement(
      routePath,
      effectivePermissionKeys,
      isPlatformAdmin ? "platform_admin" : "",
    );
    return visibilityDecision.effective === "allow" && !contractAllowed
      ? {
          ...visibilityDecision,
          effective: "deny" as const,
          source: `Hard safety · ${describeRouteRequirement(routePath)}`,
        }
      : visibilityDecision;
  });

  return {
    available: true,
    subjectType,
    subjectId,
    permissions,
    routes,
    audit: rows(auditResult.data).map((row) => ({
      id: String(row.id ?? ""),
      resourceType: text(row.resource_type) as AccessResourceType,
      resourceKey: text(row.resource_key),
      previousEffect: (text(row.previous_effect) || null) as "allow" | "deny" | null,
      newEffect: (text(row.new_effect) || null) as "allow" | "deny" | null,
      reason: text(row.reason),
      createdAt: text(row.created_at),
    })),
    warning: subjectType === "user"
      ? null
      : "Team and workspace effective results show direct overrides; role inheritance is user-context dependent.",
  };
}

export async function handleAdminAccess(
  data: z.infer<typeof adminAccessInputSchema>,
): Promise<AdminAccessResult> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, error: "Access administration is unavailable." };
  }
  const admin = createServiceClient(supabaseUrl, serviceRoleKey);
  const actorId = await verifyAdmin(admin, data.accessToken);
  if (!actorId) return { ok: false, error: "Administrator access is required." };

  if (data.action === "set") {
    const readiness = await admin.rpc("get_access_control_status");
    const readinessData = readiness.data as Row | null;
    if (
      readiness.error ||
      readinessData?.version !== 1 ||
      readinessData?.overrides !== true ||
      readinessData?.runtime_resolution !== true ||
      readinessData?.permission_enforcement !== true
    ) {
      return { ok: false, error: "Access administration is unavailable." };
    }
      if (!data.resourceType || !data.resourceKey || !data.effect || !data.reason) {
        return { ok: false, error: "A complete access change is required." };
      }
      if (
        data.resourceType === "route" &&
        !(data.resourceKey === "/" || routePattern.test(data.resourceKey))
      ) return { ok: false, error: "A valid route is required." };
      if (
        data.resourceType === "route" &&
        data.effect === "deny" &&
        protectedRoutes.has(data.resourceKey)
      ) return { ok: false, error: "That recovery route is protected." };

      let permissionId: string | null = null;
      if (data.resourceType === "permission") {
        const permission = await admin
          .from("permissions")
          .select("id")
          .eq("permission_key", data.resourceKey)
          .maybeSingle();
        if (permission.error || !permission.data) {
          return { ok: false, error: "The selected permission is invalid." };
        }
        permissionId = permission.data.id;
      }

      const table = tableFor(data.subjectType, data.resourceType);
      const subjectKey = subjectColumn(data.subjectType);
      const resourceColumn = data.resourceType === "permission" ? "permission_id" : "route_path";
      const resourceValue = permissionId ?? data.resourceKey;
      let mutation;
      if (data.effect === "inherit") {
        mutation = await admin.rpc("clear_access_override", {
          requested_subject_type: data.subjectType,
          requested_subject_id: data.subjectId,
          requested_resource_type: data.resourceType,
          requested_resource_key: String(resourceValue),
          requested_reason: data.reason,
          requested_actor_id: actorId,
        });
        if (!mutation.error && mutation.data !== true) {
          return { ok: false, error: "The access change could not be saved." };
        }
      } else {
        mutation = await admin.from(table).upsert(
              {
                [subjectKey]: data.subjectId,
                [resourceColumn]: resourceValue,
                effect: data.effect,
                reason: data.reason,
                updated_by: actorId,
              },
              { onConflict: `${subjectKey},${resourceColumn}` },
            );
      }
      if (mutation.error) return { ok: false, error: "The access change could not be saved." };
  }

  const snapshot = await readSnapshot(admin, data);
  return snapshot
    ? { ok: true, snapshot }
    : { ok: false, error: "Access configuration could not be loaded." };
}

type IdentityInput = z.infer<typeof adminIdentityInputSchema>;
export type IdentityAdminOutcome = {
  result: IdentityAdminResult;
  status: number;
};

async function readIdentityAdminSnapshot(
  admin: AdminClient,
  input: Extract<IdentityInput, { action: "identity.read" }>,
): Promise<IdentityAdminSnapshot | null> {
  const [
    rolesResult,
    teamsResult,
    profilesResult,
    workspacesResult,
    organizationMembersResult,
    globalRolesResult,
    teamMembersResult,
    teamMemberRolesResult,
    workspaceMembersResult,
    workspaceMemberRolesResult,
    identityAuditResult,
  ] = await Promise.all([
    admin.from("roles").select("id, role_key, name, role_scope").order("name"),
    admin.from("teams").select("id, name").order("name"),
    admin.from("profiles").select("id, display_name, email").order("display_name"),
    admin
      .from("workspaces")
      .select("id, organization_id, name, slug, description, type, status")
      .order("name"),
    admin
      .from("organization_members")
      .select("organization_id, user_id")
      .eq("status", "active"),
    input.subjectType === "user"
      ? admin
          .from("user_global_roles")
          .select("role_id")
          .eq("user_id", input.subjectId)
      : Promise.resolve({ data: [], error: null }),
    input.subjectType === "user"
      ? admin
          .from("team_members")
          .select("team_id, membership_status")
          .eq("user_id", input.subjectId)
          .eq("membership_status", "active")
      : Promise.resolve({ data: [], error: null }),
    input.subjectType === "user"
      ? admin
          .from("team_member_roles")
          .select("team_id, role_id")
          .eq("user_id", input.subjectId)
      : Promise.resolve({ data: [], error: null }),
    input.subjectType === "workspace"
      ? admin
          .from("workspace_members")
          .select("id, user_id, status")
          .eq("workspace_id", input.subjectId)
          .neq("status", "removed")
      : Promise.resolve({ data: [], error: null }),
    input.subjectType === "workspace"
      ? admin.from("workspace_member_roles").select("workspace_member_id, role_id")
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("identity_admin_audit_log")
      .select("id, action, previous_value, new_value, reason, created_at")
      .eq("subject_type", input.subjectType)
      .eq("subject_id", input.subjectId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  if (
    [
      rolesResult,
      teamsResult,
      profilesResult,
      workspacesResult,
      organizationMembersResult,
      globalRolesResult,
      teamMembersResult,
      teamMemberRolesResult,
      workspaceMembersResult,
      workspaceMemberRolesResult,
      identityAuditResult,
    ].some((result) => result.error)
  ) {
    return null;
  }

  const roleRows = rows(rolesResult.data);
  const roleById = new Map(roleRows.map((role) => [text(role.id), role]));
  const teamById = new Map(
    rows(teamsResult.data).map((team) => [text(team.id), text(team.name)]),
  );
  const profileById = new Map(
    rows(profilesResult.data).map((profile) => [text(profile.id), profile]),
  );
  const selectedWorkspaceOrganizationId =
    input.subjectType === "workspace"
      ? text(
          rows(workspacesResult.data).find(
            (workspace) => text(workspace.id) === input.subjectId,
          )?.organization_id,
        )
      : "";
  const eligibleWorkspaceUserIds = new Set(
    rows(organizationMembersResult.data)
      .filter(
        (membership) =>
          !selectedWorkspaceOrganizationId ||
          text(membership.organization_id) === selectedWorkspaceOrganizationId,
      )
      .map((membership) => text(membership.user_id)),
  );
  const roleOptions = (scope: string) =>
    roleRows
      .filter((role) => text(role.role_scope) === scope)
      .map((role) => ({
        id: text(role.id),
        key: text(role.role_key),
        name: text(role.name) || text(role.role_key),
      }))
      .filter((role) => role.id && role.key);

  const globalRoleId = text(rows(globalRolesResult.data)[0]?.role_id);
  const teamRoleByTeam = new Map(
    rows(teamMemberRolesResult.data).map((assignment) => [
      text(assignment.team_id),
      roleById.get(text(assignment.role_id)),
    ]),
  );
  const workspaceRoleByMember = new Map(
    rows(workspaceMemberRolesResult.data).map((assignment) => [
      text(assignment.workspace_member_id),
      roleById.get(text(assignment.role_id)),
    ]),
  );

  return {
    platformRoles: roleOptions("platform"),
    teamRoles: roleOptions("team"),
    workspaceRoles: roleOptions("workspace"),
    teams: rows(teamsResult.data).map((team) => ({
      id: text(team.id),
      key: text(team.id),
      name: text(team.name),
    })),
    profiles: rows(profilesResult.data)
      .filter(
        (profile) =>
          input.subjectType !== "workspace" ||
          eligibleWorkspaceUserIds.has(text(profile.id)),
      )
      .map((profile) => ({
        id: text(profile.id),
        key: text(profile.id),
        name:
          text(profile.display_name) ||
          text(profile.email) ||
          text(profile.id).slice(0, 8),
      })),
    workspaces: rows(workspacesResult.data).map((workspace) => ({
      id: text(workspace.id),
      name: text(workspace.name),
      slug: text(workspace.slug),
      description: text(workspace.description) || null,
      type: text(workspace.type),
      status: text(workspace.status),
    })),
    globalRoleKey: text(roleById.get(globalRoleId)?.role_key) || null,
    teamAssignments: rows(teamMembersResult.data).map((membership) => {
      const teamId = text(membership.team_id);
      const role = teamRoleByTeam.get(teamId);
      return {
        teamId,
        teamName: teamById.get(teamId) ?? teamId.slice(0, 8),
        roleKey: text(role?.role_key) || null,
        roleName: text(role?.name) || null,
      };
    }),
    workspaceMembers: rows(workspaceMembersResult.data).map((member) => {
      const profile = profileById.get(text(member.user_id));
      const role = workspaceRoleByMember.get(text(member.id));
      return {
        userId: text(member.user_id),
        displayName:
          text(profile?.display_name) ||
          text(profile?.email) ||
          text(member.user_id).slice(0, 8),
        email: text(profile?.email) || null,
        status: text(member.status),
        roleKey: text(role?.role_key) || null,
        roleName: text(role?.name) || null,
      };
    }),
    audit: rows(identityAuditResult.data).map((entry) => ({
      id: String(entry.id ?? ""),
      action: text(entry.action),
      previousValue: entry.previous_value ?? null,
      newValue: entry.new_value ?? null,
      reason: text(entry.reason),
      createdAt: text(entry.created_at),
    })),
  };
}

export async function handleAdminIdentity(
  data: IdentityInput,
): Promise<IdentityAdminOutcome> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return {
      result: { ok: false, error: "Identity administration is unavailable." },
      status: 503,
    };
  }
  const admin = createServiceClient(supabaseUrl, serviceRoleKey);
  const actorId = await verifyAdmin(admin, data.accessToken);
  if (!actorId) {
    return {
      result: { ok: false, error: "Active platform administrator access is required." },
      status: 403,
    };
  }

  if (data.action === "identity.read") {
    const snapshot = await readIdentityAdminSnapshot(admin, data);
    return snapshot
      ? { result: { ok: true, snapshot }, status: 200 }
      : {
          result: { ok: false, error: "Identity assignments could not be loaded." },
          status: 500,
        };
  }

  const userClient = createUserClient(supabaseUrl, anonKey, data.accessToken);
  let mutation;
  switch (data.action) {
    case "identity.set_global_role":
      mutation = await userClient.rpc("set_user_global_role_admin", {
        p_user_id: data.userId,
        p_role_key: data.roleKey ?? "",
        p_reason: data.reason,
      });
      break;
    case "identity.set_team_assignment":
      mutation = await userClient.rpc("set_user_team_assignment_admin", {
        p_user_id: data.userId,
        p_team_id: data.teamId,
        p_role_key: data.roleKey ?? "",
        p_reason: data.reason,
      });
      break;
    case "identity.create_workspace":
      mutation = await userClient.rpc("create_workspace_admin", {
        p_name: data.name,
        p_slug: data.slug,
        p_description: data.description,
        p_type: data.workspaceType,
        p_reason: data.reason,
      });
      break;
    case "identity.update_workspace":
      mutation = await userClient.rpc("update_workspace_admin", {
        p_workspace_id: data.workspaceId,
        p_name: data.name,
        p_slug: data.slug,
        p_description: data.description,
        p_type: data.workspaceType,
        p_status: data.status,
        p_reason: data.reason,
      });
      break;
    case "identity.set_workspace_member":
      mutation = await userClient.rpc("set_workspace_member_admin", {
        p_workspace_id: data.workspaceId,
        p_user_id: data.userId,
        p_role_key: data.roleKey ?? "",
        p_reason: data.reason,
      });
      break;
  }
  if (mutation.error) {
    return {
      result: { ok: false, error: "The identity administration change could not be saved." },
      status: mutation.error.code === "42501" ? 403 : 400,
    };
  }
  const createdWorkspaceRow = Array.isArray(mutation.data)
    ? (mutation.data[0] as Row | undefined)
    : isRecord(mutation.data)
      ? mutation.data
      : undefined;
  const createdWorkspaceId = text(createdWorkspaceRow?.id);
  const readSubject =
    data.action === "identity.set_global_role" ||
    data.action === "identity.set_team_assignment"
      ? { subjectType: "user" as const, subjectId: data.userId }
      : data.action === "identity.set_workspace_member" ||
          data.action === "identity.update_workspace"
        ? { subjectType: "workspace" as const, subjectId: data.workspaceId }
        : data.action === "identity.create_workspace" && createdWorkspaceId
          ? { subjectType: "workspace" as const, subjectId: createdWorkspaceId }
          : null;
  const snapshot = readSubject
    ? await readIdentityAdminSnapshot(admin, {
        accessToken: data.accessToken,
        action: "identity.read",
        ...readSubject,
      })
    : null;
  return snapshot
    ? { result: { ok: true, snapshot }, status: 200 }
    : {
        result: { ok: false, error: "The change was saved but refresh failed." },
        status: 500,
      };
}
