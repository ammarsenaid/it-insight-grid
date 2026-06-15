import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { CreateAdminUserResult } from "@/lib/admin-users/types";

const DISABLED_ACCOUNT_BAN = "876000h";

const createAdminUserInput = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(320),
  roleId: z.string().uuid().nullable(),
  teamId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});

function json(result: CreateAdminUserResult, status = 200): Response {
  return Response.json(result, { status });
}

// The route tree generator adds this new path during the first build.
export const Route = createFileRoute("/api/admin-users")({
  server: {
    handlers: {
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
    },
  },
});
