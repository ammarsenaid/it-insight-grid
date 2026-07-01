import { createFileRoute } from "@tanstack/react-router";

import {
  adminAccessInputSchema,
  adminIdentityInputSchema,
  handleAdminAccess,
  handleAdminIdentity,
} from "@/lib/admin-access/server";
import type {
  AdminAccessResult,
  IdentityAdminResult,
} from "@/lib/admin-access/types";

function json(
  result: AdminAccessResult | IdentityAdminResult,
  status = 200,
): Response {
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

        const requestBody =
          typeof body === "object" && body !== null
            ? (body as Record<string, unknown>)
            : {};
        const isIdentityAction =
          typeof requestBody.action === "string" &&
          requestBody.action.startsWith("identity.");
        if (isIdentityAction) {
          const parsed = adminIdentityInputSchema.safeParse({
            ...requestBody,
            accessToken,
          });
          if (!parsed.success) {
            return json(
              { ok: false, error: "A valid identity administration request is required." },
              400,
            );
          }
          const outcome = await handleAdminIdentity(parsed.data);
          return json(outcome.result, outcome.status);
        }

        const parsed = adminAccessInputSchema.safeParse({
          ...requestBody,
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
