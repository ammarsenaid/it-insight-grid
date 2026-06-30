import { createFileRoute } from "@tanstack/react-router";

import {
  adminAccessInputSchema,
  handleAdminAccess,
} from "@/lib/admin-access/server";
import type { AdminAccessResult } from "@/lib/admin-access/types";

function json(result: AdminAccessResult, status = 200): Response {
  return Response.json(result, { status });
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export const Route = createFileRoute("/api/admin-access")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const accessToken = bearerToken(request);
        if (!accessToken) {
          return json({ ok: false, error: "Administrator access is required." }, 401);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "A valid access request is required." }, 400);
        }

        const parsed = adminAccessInputSchema.safeParse({
          ...(typeof body === "object" && body !== null ? body : {}),
          accessToken,
        });
        if (!parsed.success) {
          return json({ ok: false, error: "A valid access request is required." }, 400);
        }

        const result = await handleAdminAccess(parsed.data);
        return json(result, result.ok ? 200 : 400);
      },
    },
  },
});
