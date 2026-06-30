import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type {
  AccessGrantSource,
  AdminUserAccessExplanationResult,
  AdminUserMutationResult,
  CreateAdminUserResult,
  ExplainedPermission,
} from "@/lib/admin-users/types";

const DISABLED_ACCOUNT_BAN = "876000h";

const createAdminUserInput = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(320),
  roleId: z.string().uuid().nullable(),
  teamId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});

const setAdminUserActiveInput = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

const updateAdminUserInput = z.object({
  userId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(120),
  isActive: z.boolean(),
});

const explainAccessInput = z.object({
  userId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
});

function json(
  result:
    | AdminUserMutationResult
    | CreateAdminUserResult
    | AdminUserAccessExplanationResult,
  status = 200,
): Response {
  return Response.json(result, { status });
}

type Row = Record<string, unknown>;
type ResolvedGrantSource = AccessGrantSource & { roleId: string };

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// The route tree generator adds this new path during the first build.
export const Route = createFileRoute("/api/admin-users")({
  server: {
    handlers: {
      // Read-only administrative explanation. This handler authenticates the
      // caller independently and never mutates access-control or profile rows.
      GET: async ({ request }) => {
        const failure = (error: string, status = 400) => json({ ok: false, error }, status);
        const authorization = request.headers.get("authorization") ?? "";
        const accessToken = authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : "";
        if (!accessToken) {
          return failure("Your session is no longer valid. Sign in again and retry.", 401);
        }

        const url = new URL(request.url);
        const parsed = explainAccessInput.safeParse({
          userId: url.searchParams.get("userId"),
          workspaceId: url.searchParams.get("workspaceId") || undefined,
          teamId: url.searchParams.get("teamId") || undefined,
        });
        if (!parsed.success) return failure("Select a valid user and access context.");

        const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
          return failure("User administration is not configured on the server.", 503);
        }

        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const { data: callerData, error: callerError } = await admin.auth.getUser(accessToken);
        if (callerError || !callerData.user) {
          return failure("Your session is no longer valid. Sign in again and retry.", 401);
        }

        const callerId = callerData.user.id;
        const [callerProfileResult, callerRoleResult] = await Promise.all([
          admin.from("profiles").select("is_active").eq("id", callerId).maybeSingle(),
          admin
            .from("user_global_roles")
            .select("roles!inner(role_key, role_scope)")
            .eq("user_id", callerId)
            .eq("roles.role_key", "platform_admin")
            .eq("roles.role_scope", "platform")
            .limit(1),
        ]);
        if (callerProfileResult.error || callerRoleResult.error) {
          return failure("Could not verify administrator access.", 500);
        }
        if (callerProfileResult.data?.is_active !== true || callerRoleResult.data.length === 0) {
          return failure("Only an active platform administrator can inspect user access.", 403);
        }

        const { userId, workspaceId = null, teamId = null } = parsed.data;
        const [
          profileResult,
          rolesResult,
          permissionsResult,
          grantsResult,
          globalRolesResult,
          teamMembersResult,
          teamRolesResult,
          teamsResult,
          workspaceMembersResult,
          workspaceRolesResult,
          workspacesResult,
          visibilityResult,
        ] = await Promise.all([
          admin
            .from("profiles")
            .select("id, is_active")
            .eq("id", userId)
            .maybeSingle(),
          admin.from("roles").select("id, role_key, name, role_scope"),
          admin.from("permissions").select("id, permission_key"),
          admin.from("role_permissions").select("role_id, permission_id"),
          admin.from("user_global_roles").select("role_id").eq("user_id", userId),
          admin
            .from("team_members")
            .select("team_id, membership_status")
            .eq("user_id", userId)
            .eq("membership_status", "active"),
          admin.from("team_member_roles").select("team_id, role_id").eq("user_id", userId),
          admin.from("teams").select("id, name"),
          admin
            .from("workspace_members")
            .select("id, workspace_id, status")
            .eq("user_id", userId)
            .eq("status", "active"),
          admin.from("workspace_member_roles").select("workspace_member_id, role_id"),
          admin.from("workspaces").select("id, name"),
          admin
            .from("role_page_visibility")
            .select("role_id, route_path, can_view")
            .eq("can_view", true),
        ]);

        const queryError = [
          profileResult.error,
          rolesResult.error,
          permissionsResult.error,
          grantsResult.error,
          globalRolesResult.error,
          teamMembersResult.error,
          teamRolesResult.error,
          teamsResult.error,
          workspaceMembersResult.error,
          workspaceRolesResult.error,
          workspacesResult.error,
          visibilityResult.error,
        ].find(Boolean);
        if (queryError) return failure("Could not resolve the selected user's access.", 500);
        if (!profileResult.data) return failure("The selected user does not exist.", 404);
        const targetProfile = profileResult.data as Row;

        const roleById = new Map(rows(rolesResult.data).map((role) => [text(role.id), role]));
        const permissionById = new Map(
          rows(permissionsResult.data).map((permission) => [text(permission.id), permission]),
        );
        const teamNameById = new Map(
          rows(teamsResult.data).map((team) => [text(team.id), text(team.name)]),
        );
        const workspaceNameById = new Map(
          rows(workspacesResult.data).map((workspace) => [
            text(workspace.id),
            text(workspace.name),
          ]),
        );
        const activeTeamIds = new Set(
          rows(teamMembersResult.data).map((membership) => text(membership.team_id)),
        );
        const activeWorkspaceMembers = new Map(
          rows(workspaceMembersResult.data).map((membership) => [
            text(membership.id),
            text(membership.workspace_id),
          ]),
        );

        const sourceFor = (
          roleId: string,
          assignment: AccessGrantSource["assignment"],
          contextId: string | null,
          contextName: string | null,
        ): ResolvedGrantSource | null => {
          const role = roleById.get(roleId);
          if (!role) return null;
          const scope = text(role.role_scope);
          if (scope !== "platform" && scope !== "workspace" && scope !== "team") return null;
          return {
            roleId,
            roleKey: text(role.role_key),
            roleName: text(role.name),
            roleScope: scope,
            assignment,
            contextId,
            contextName,
          };
        };

        const globalSources = rows(globalRolesResult.data)
          .map((assignment) => sourceFor(text(assignment.role_id), "global", null, null))
          .filter((source): source is ResolvedGrantSource => Boolean(source));
        const teamSources = rows(teamRolesResult.data)
          .filter(
            (assignment) =>
              activeTeamIds.has(text(assignment.team_id)) &&
              (!teamId || text(assignment.team_id) === teamId),
          )
          .map((assignment) => {
            const contextId = text(assignment.team_id);
            return sourceFor(
              text(assignment.role_id),
              "team",
              contextId,
              teamNameById.get(contextId) ?? null,
            );
          })
          .filter((source): source is ResolvedGrantSource => Boolean(source));
        const workspaceSources = rows(workspaceRolesResult.data)
          .map((assignment) => {
            const contextId = activeWorkspaceMembers.get(text(assignment.workspace_member_id));
            if (!contextId) return null;
            return sourceFor(
              text(assignment.role_id),
              "workspace",
              contextId,
              workspaceNameById.get(contextId) ?? null,
            );
          })
          .filter((source): source is ResolvedGrantSource => Boolean(source));
        const allSources = [...globalSources, ...teamSources, ...workspaceSources];
        const sourceByRoleId = new Map<string, ResolvedGrantSource[]>();
        for (const source of allSources) {
          const list = sourceByRoleId.get(source.roleId) ?? [];
          list.push(source);
          sourceByRoleId.set(source.roleId, list);
        }

        const isPlatformAdmin = globalSources.some(
          (source) => source.roleKey === "platform_admin",
        );
        const topLevelRoleIds = new Set(
          [...globalSources, ...teamSources].map((source) => source.roleId),
        );
        const selectedWorkspaceRoleIds = new Set(
          workspaceSources
            .filter((source) => workspaceId && source.contextId === workspaceId)
            .map((source) => source.roleId),
        );

        const explainPermissions = (roleIds: Set<string>): ExplainedPermission[] => {
          const sourcesByPermission = new Map<string, ResolvedGrantSource[]>();
          if (isPlatformAdmin && roleIds === topLevelRoleIds) {
            const adminSource = globalSources.find(
              (source) => source.roleKey === "platform_admin",
            );
            if (adminSource) {
              for (const permissionId of permissionById.keys()) {
                sourcesByPermission.set(permissionId, [adminSource]);
              }
            }
          }
          for (const grant of rows(grantsResult.data)) {
            const roleId = text(grant.role_id);
            if (!roleIds.has(roleId)) continue;
            const permissionId = text(grant.permission_id);
            const sources = sourceByRoleId.get(roleId) ?? [];
            if (sources.length === 0) continue;
            sourcesByPermission.set(permissionId, [
              ...(sourcesByPermission.get(permissionId) ?? []),
              ...sources,
            ]);
          }
          return Array.from(sourcesByPermission.entries())
            .flatMap(([permissionId, sources]) => {
              const permission = permissionById.get(permissionId);
              return permission
                ? [{
                    permissionKey: text(permission.permission_key),
                    sources: sources.map(({ roleId: _roleId, ...source }) => source),
                  }]
                : [];
            })
            .sort((left, right) => left.permissionKey.localeCompare(right.permissionKey));
        };

        const routes = new Map<string, ResolvedGrantSource[]>();
        for (const row of rows(visibilityResult.data)) {
          const roleId = text(row.role_id);
          const sources = globalSources.filter((source) => source.roleId === roleId);
          if (sources.length === 0) continue;
          const routePath = text(row.route_path);
          routes.set(routePath, [...(routes.get(routePath) ?? []), ...sources]);
        }

        return json({
          ok: true,
          explanation: {
            roles: allSources.map(({ roleId: _roleId, ...source }) => source),
            permissions: explainPermissions(topLevelRoleIds),
            workspacePermissions: explainPermissions(selectedWorkspaceRoleIds),
            visibleRoutes: Array.from(routes.entries())
              .map(([routePath, sources]) => ({
                routePath,
                sources: sources.map(({ roleId: _roleId, ...source }) => source),
              }))
              .sort((left, right) => left.routePath.localeCompare(right.routePath)),
            isPlatformAdmin,
            notes: [
              ...(targetProfile.is_active === true
                ? []
                : ["The account is inactive, so it cannot receive runtime access."]),
              "Visible routes currently come from global platform roles only.",
              teamId
                ? "Top-level permissions combine global roles with the selected active team role."
                : "Top-level permissions combine global and all active team-member roles.",
              "Workspace permissions remain scoped and are not flattened into top-level access.",
            ],
          },
        });
      },
      POST: async ({ request }) => {
        const failure = (error: string, status = 400) => json({ ok: false, error }, status);
        const authorization = request.headers.get("authorization") ?? "";
        const accessToken = authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : "";
        if (!accessToken)
          return failure("Your session is no longer valid. Sign in again and retry.", 401);

        let parsed: z.infer<typeof createAdminUserInput>;
        try {
          parsed = createAdminUserInput.parse(await request.json());
        } catch {
          return failure("Enter valid user details.");
        }

        const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
          return failure("User creation is not configured on the server.", 503);
        }

        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });

        const { data: callerData, error: callerError } = await admin.auth.getUser(accessToken);
        if (callerError || !callerData.user) {
          return failure("Your session is no longer valid. Sign in again and retry.", 401);
        }

        const callerId = callerData.user.id;
        const [callerProfileResult, callerRoleResult] = await Promise.all([
          admin.from("profiles").select("is_active").eq("id", callerId).maybeSingle(),
          admin
            .from("user_global_roles")
            .select("roles!inner(role_key, role_scope)")
            .eq("user_id", callerId)
            .eq("roles.role_key", "platform_admin")
            .eq("roles.role_scope", "platform")
            .limit(1),
        ]);

        if (callerProfileResult.error || callerRoleResult.error) {
          return failure("Could not verify administrator access.", 500);
        }
        if (callerProfileResult.data?.is_active !== true || callerRoleResult.data.length === 0) {
          return failure("Only an active platform administrator can create users.", 403);
        }

        let roleId: string | null = null;
        if (parsed.roleId) {
          const { data: role, error } = await admin
            .from("roles")
            .select("id")
            .eq("id", parsed.roleId)
            .eq("role_scope", "platform")
            .maybeSingle();
          if (error) return failure("Could not validate the selected role.", 500);
          if (!role) return failure("The selected global role is not valid.");
          roleId = role.id;
        }

        let teamId: string | null = null;
        if (parsed.teamId) {
          const { data: team, error } = await admin
            .from("teams")
            .select("id")
            .eq("id", parsed.teamId)
            .maybeSingle();
          if (error) return failure("Could not validate the selected team.", 500);
          if (!team) return failure("The selected team is not valid.");
          teamId = team.id;
        }

        const authResult = parsed.isActive
          ? await admin.auth.admin.inviteUserByEmail(parsed.email, {
              data: { display_name: parsed.displayName },
            })
          : await admin.auth.admin.createUser({
              email: parsed.email,
              email_confirm: false,
              ban_duration: DISABLED_ACCOUNT_BAN,
              user_metadata: { display_name: parsed.displayName },
            });

        if (authResult.error || !authResult.data.user) {
          const message = authResult.error?.message.toLowerCase().includes("already")
            ? "A user with this email already exists."
            : "Supabase could not create the user account.";
          return failure(message);
        }

        const userId = authResult.data.user.id;
        const rollbackFailure = async (setupFailure: string): Promise<Response> => {
          const { error } = await admin.auth.admin.deleteUser(userId);
          return failure(
            error
              ? `${setupFailure} The auth account also could not be removed; manual cleanup is required.`
              : `${setupFailure} The auth account was removed.`,
            500,
          );
        };

        const { error: profileError } = await admin.from("profiles").upsert({
          id: userId,
          email: parsed.email,
          display_name: parsed.displayName,
          is_active: parsed.isActive,
        });
        if (profileError) return rollbackFailure("The user profile could not be created.");

        if (roleId) {
          const { error } = await admin.from("user_global_roles").insert({
            user_id: userId,
            role_id: roleId,
            granted_by: callerId,
          });
          if (error) return rollbackFailure("The global role could not be assigned.");
        }

        if (teamId) {
          const { error } = await admin.from("team_members").insert({
            team_id: teamId,
            user_id: userId,
            membership_status: parsed.isActive ? "active" : "suspended",
            invited_by: callerId,
          });
          if (error) return rollbackFailure("The team membership could not be assigned.");
        }

        return json({ ok: true, userId, invited: parsed.isActive }, 201);
      },

      PUT: async ({ request }) => {
        const failure = (error: string, status = 400) => json({ ok: false, error }, status);
        const authorization = request.headers.get("authorization") ?? "";
        const accessToken = authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : "";

        if (!accessToken)
          return failure("Your session is no longer valid. Sign in again and retry.", 401);

        let parsed: z.infer<typeof updateAdminUserInput>;
        try {
          parsed = updateAdminUserInput.parse(await request.json());
        } catch {
          return failure("Enter valid user edit details.");
        }

        const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
          return failure("User administration is not configured on the server.", 503);
        }

        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });

        const { data: callerData, error: callerError } = await admin.auth.getUser(accessToken);
        if (callerError || !callerData.user) {
          return failure("Your session is no longer valid. Sign in again and retry.", 401);
        }

        const callerId = callerData.user.id;
        const [callerProfileResult, callerRoleResult] = await Promise.all([
          admin.from("profiles").select("is_active").eq("id", callerId).maybeSingle(),
          admin
            .from("user_global_roles")
            .select("roles!inner(role_key, role_scope)")
            .eq("user_id", callerId)
            .eq("roles.role_key", "platform_admin")
            .eq("roles.role_scope", "platform")
            .limit(1),
        ]);

        if (callerProfileResult.error || callerRoleResult.error) {
          return failure("Could not verify administrator access.", 500);
        }

        if (callerProfileResult.data?.is_active !== true || callerRoleResult.data.length === 0) {
          return failure("Only an active platform administrator can edit users.", 403);
        }

        if (parsed.userId === callerId && parsed.isActive === false) {
          return failure("You cannot disable your own administrator account.", 400);
        }

        const { data: existingProfile, error: existingProfileError } = await admin
          .from("profiles")
          .select("id")
          .eq("id", parsed.userId)
          .maybeSingle();

        if (existingProfileError) return failure("Could not verify the selected user.", 500);
        if (!existingProfile) return failure("The selected user does not exist.", 404);

        const { error: authError } = await admin.auth.admin.updateUserById(parsed.userId, {
          ban_duration: parsed.isActive ? "none" : DISABLED_ACCOUNT_BAN,
          user_metadata: { display_name: parsed.displayName },
        });

        if (authError) {
          return failure("Supabase could not update the auth account.", 500);
        }

        const { error: profileError } = await admin
          .from("profiles")
          .update({
            display_name: parsed.displayName,
            is_active: parsed.isActive,
          })
          .eq("id", parsed.userId);

        if (profileError) {
          return failure("The user profile could not be updated.", 500);
        }

        return json({ ok: true, userId: parsed.userId });
      },

      PATCH: async ({ request }) => {
        const failure = (error: string, status = 400) => json({ ok: false, error }, status);
        const authorization = request.headers.get("authorization") ?? "";
        const accessToken = authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : "";

        if (!accessToken)
          return failure("Your session is no longer valid. Sign in again and retry.", 401);

        let parsed: z.infer<typeof setAdminUserActiveInput>;
        try {
          parsed = setAdminUserActiveInput.parse(await request.json());
        } catch {
          return failure("Enter valid user status details.");
        }

        const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
          return failure("User administration is not configured on the server.", 503);
        }

        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });

        const { data: callerData, error: callerError } = await admin.auth.getUser(accessToken);
        if (callerError || !callerData.user) {
          return failure("Your session is no longer valid. Sign in again and retry.", 401);
        }

        const callerId = callerData.user.id;
        const [callerProfileResult, callerRoleResult] = await Promise.all([
          admin.from("profiles").select("is_active").eq("id", callerId).maybeSingle(),
          admin
            .from("user_global_roles")
            .select("roles!inner(role_key, role_scope)")
            .eq("user_id", callerId)
            .eq("roles.role_key", "platform_admin")
            .eq("roles.role_scope", "platform")
            .limit(1),
        ]);

        if (callerProfileResult.error || callerRoleResult.error) {
          return failure("Could not verify administrator access.", 500);
        }

        if (callerProfileResult.data?.is_active !== true || callerRoleResult.data.length === 0) {
          return failure("Only an active platform administrator can manage users.", 403);
        }

        if (parsed.userId === callerId && parsed.isActive === false) {
          return failure("You cannot disable your own administrator account.", 400);
        }

        const { data: existingProfile, error: existingProfileError } = await admin
          .from("profiles")
          .select("id")
          .eq("id", parsed.userId)
          .maybeSingle();

        if (existingProfileError) return failure("Could not verify the selected user.", 500);
        if (!existingProfile) return failure("The selected user does not exist.", 404);

        const { error: authError } = await admin.auth.admin.updateUserById(parsed.userId, {
          ban_duration: parsed.isActive ? "none" : DISABLED_ACCOUNT_BAN,
        });

        if (authError) {
          return failure("Supabase could not update the auth account status.", 500);
        }

        const { error: profileError } = await admin
          .from("profiles")
          .update({ is_active: parsed.isActive })
          .eq("id", parsed.userId);

        if (profileError) {
          return failure("The user profile status could not be updated.", 500);
        }

        return json({ ok: true, userId: parsed.userId });
      },
    },
  },
});
