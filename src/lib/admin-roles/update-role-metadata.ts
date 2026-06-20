import type { UpdateRoleMetadataInput, UpdateRoleMetadataResult } from "./types";

export async function updateRoleMetadata(
  input: UpdateRoleMetadataInput,
): Promise<UpdateRoleMetadataResult> {
  const { accessToken, ...body } = input;
  const response = await fetch("/api/admin-roles", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let result: UpdateRoleMetadataResult | null = null;
  try {
    result = (await response.json()) as UpdateRoleMetadataResult;
  } catch {
    // The server contract is JSON; keep proxy and infrastructure failures safe.
  }

  if (result && typeof result.ok === "boolean") return result;
  return { ok: false, error: "The server returned an invalid role metadata response." };
}
