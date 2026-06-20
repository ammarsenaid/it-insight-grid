import type { UpdateRolePageVisibilityInput, UpdateRolePageVisibilityResult } from "./types";

export async function updateRolePageVisibility(
  input: UpdateRolePageVisibilityInput,
): Promise<UpdateRolePageVisibilityResult> {
  const { accessToken, ...body } = input;
  const response = await fetch("/api/admin-role-page-visibility", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let result: UpdateRolePageVisibilityResult | null = null;
  try {
    result = (await response.json()) as UpdateRolePageVisibilityResult;
  } catch {
    // The server contract is JSON; keep proxy and infrastructure failures safe.
  }

  if (result && typeof result.ok === "boolean") return result;
  return { ok: false, error: "The server returned an invalid page visibility response." };
}
