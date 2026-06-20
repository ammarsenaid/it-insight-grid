import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { UpdateRolePageVisibilityResult } from "@/lib/admin-roles/types";

const routePathPattern =
  /^\/(?:[a-z0-9-]+|:[a-z][a-z0-9_]*)(?:\/(?:[a-z0-9-]+|:[a-z][a-z0-9_]*))*\/?$/;

const nonEmployeeRecoveryRoleKeys = new Set([
  "platform_admin",
  "it_admin",
  "sd_lead",
  "helpdesk",
  "technician",
  "network_admin",
  "doc_editor",
  "platform_auditor",
]);

const updateRolePageVisibilityInput = z.object({
  roleId: z.string().uuid(),
  routePath: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((path) => path === "/" || routePathPattern.test(path)),
  canView: z.boolean(),
});

function json(result: UpdateRolePageVisibilityResult, status = 200): Response {
  return Response.json(result, { status });
}

export const Route = createFileRoute("/api/admin-role-page-visibility")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        const failure = (error: string, status = 400) => json({ ok: false, error }, status);
        const authorization = request.headers.get("authorization") ?? "";
        const accessToken = authorization.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length).trim()
          : "";
        if (!accessToken) {
          return failure("Your session is no longer valid. Sign in again and retry.", 401);
        }

        let parsed: z.infer<typeof updateRolePageVisibilityInput>;
        try {
          parsed = updateRolePageVisibilityInput.parse(await request.json());
        } catch {
          return failure("Select a valid page visibility change.");
        }

        const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceRoleKey) {
          return failure("Page visibility administration is not configured on the server.", 503);
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
          return failure("Only an active platform administrator can edit page visibility.", 403);
        }

        const { data: targetRow, error: targetError } = await admin
          .from("role_page_visibility")
          .select("id, role_id, route_path, roles!inner(role_key, role_scope)")
          .eq("role_id", parsed.roleId)
          .eq("route_path", parsed.routePath)
          .maybeSingle();

        if (targetError) return failure("Could not validate the selected visibility row.", 500);
        if (!targetRow) return failure("The selected visibility row does not exist.", 404);

        const joinedRole = Array.isArray(targetRow.roles) ? targetRow.roles[0] : targetRow.roles;
        if (!joinedRole || joinedRole.role_scope !== "platform") {
          return failure("Only platform role visibility can be edited.");
        }
        if (
          joinedRole.role_key === "platform_admin" &&
          targetRow.route_path === "/admin/roles" &&
          parsed.canView === false
        ) {
          return failure("Platform Administrator access to role management is protected.");
        }
        if (
          joinedRole.role_key === "employee" &&
          (targetRow.route_path === "/admin" || targetRow.route_path.startsWith("/admin/")) &&
          parsed.canView === true
        ) {
          return failure("Employee access to administration pages is protected.");
        }
        if (
          parsed.canView === false &&
          ((targetRow.route_path === "/" && nonEmployeeRecoveryRoleKeys.has(joinedRole.role_key)) ||
            (targetRow.route_path === "/my-requests" && joinedRole.role_key === "employee"))
        ) {
          return failure("This recovery destination cannot be disabled.");
        }

        const { data: updatedRow, error: updateError } = await admin
          .from("role_page_visibility")
          .update({ can_view: parsed.canView, updated_by: callerId })
          .eq("id", targetRow.id)
          .eq("role_id", parsed.roleId)
          .eq("route_path", parsed.routePath)
          .select("id")
          .maybeSingle();

        if (updateError) return failure("The page visibility row could not be updated.", 500);
        if (!updatedRow) return failure("The selected visibility row no longer exists.", 409);

        return json({ ok: true });
      },
    },
  },
});
