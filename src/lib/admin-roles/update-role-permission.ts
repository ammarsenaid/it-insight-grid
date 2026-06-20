import type { UpdateRolePermissionInput, UpdateRolePermissionResult } from "./types";

export async function updateRolePermission(
  input: UpdateRolePermissionInput,
): Promise<UpdateRolePermissionResult> {
  const { accessToken, ...body } = input;
  const response = await fetch("/api/admin-roles", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let result: UpdateRolePermissionResult | null = null;
  try {
    result = (await response.json()) as UpdateRolePermissionResult;
  } catch {
    // The server contract is JSON; keep proxy and infrastructure failures safe.
  }

  if (result && typeof result.ok === "boolean") return result;
  return { ok: false, error: "The server returned an invalid role update response." };
}
