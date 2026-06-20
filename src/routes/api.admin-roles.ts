import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { UpdateRoleMetadataResult, UpdateRolePermissionResult } from "@/lib/admin-roles/types";

const updateRolePermissionInput = z.object({
  roleId: z.string().uuid(),
  permissionId: z.string().uuid(),
  action: z.enum(["grant", "revoke"]),
});

const updateRoleMetadataInput = z.object({
  roleId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable(),
});

function json(
  result: UpdateRolePermissionResult | UpdateRoleMetadataResult,
  status = 200,
): Response {
  return Response.json(result, { status });
}

export const Route = createFileRoute("/api/admin-roles")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const failure = (error: string, status = 400) => json({ ok: false, error }, status);
        const authorization = request.headers.get("authorization") ?? "";
        const accessToken = authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : "";
        if (!accessToken) {
          return failure("Your session is no longer valid. Sign in again and retry.", 401);
        }

        let parsed: z.infer<typeof updateRolePermissionInput>;
        try {
          parsed = updateRolePermissionInput.parse(await request.json());
        } catch {
          return failure("Select a valid role permission change.");
        }

        const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
          return failure("Role administration is not configured on the server.", 503);
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
          return failure("Only an active platform administrator can manage role permissions.", 403);
        }

        const [roleResult, permissionResult] = await Promise.all([
          admin.from("roles").select("id, role_key").eq("id", parsed.roleId).maybeSingle(),
          admin.from("permissions").select("id").eq("id", parsed.permissionId).maybeSingle(),
        ]);

        if (roleResult.error || permissionResult.error) {
          return failure("Could not validate the selected role permission.", 500);
        }
        if (!roleResult.data || !permissionResult.data) {
          return failure("The selected role or permission does not exist.", 404);
        }

        if (parsed.action === "revoke" && roleResult.data.role_key === "platform_admin") {
          return failure("platform_admin permissions cannot be revoked.");
        }

        if (parsed.action === "grant") {
          const { error } = await admin.from("role_permissions").insert({
            role_id: parsed.roleId,
            permission_id: parsed.permissionId,
          });
          if (error && error.code !== "23505") {
            return failure("The permission could not be granted.", 500);
          }
        } else {
          const { error } = await admin
            .from("role_permissions")
            .delete()
            .eq("role_id", parsed.roleId)
            .eq("permission_id", parsed.permissionId);
          if (error) return failure("The permission could not be revoked.", 500);
        }

        return json({ ok: true });
      },
      PATCH: async ({ request }) => {
        const failure = (error: string, status = 400) => json({ ok: false, error }, status);
        const authorization = request.headers.get("authorization") ?? "";
        const accessToken = authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : "";
        if (!accessToken) {
          return failure("Your session is no longer valid. Sign in again and retry.", 401);
        }

        let parsed: z.infer<typeof updateRoleMetadataInput>;
        try {
          parsed = updateRoleMetadataInput.parse(await request.json());
        } catch {
          return failure("Enter a valid role name and description.");
        }

        const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
          return failure("Role administration is not configured on the server.", 503);
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
          return failure("Only an active platform administrator can edit role metadata.", 403);
        }

        const description = parsed.description || null;
        const { data: updatedRole, error: updateError } = await admin
          .from("roles")
          .update({ name: parsed.name, description })
          .eq("id", parsed.roleId)
          .select("id")
          .maybeSingle();

        if (updateError) return failure("The role metadata could not be updated.", 500);
        if (!updatedRole) return failure("The selected role does not exist.", 404);

        return json({ ok: true });
      },
    },
  },
});
