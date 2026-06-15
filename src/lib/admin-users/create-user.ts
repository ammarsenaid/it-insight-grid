import type { CreateAdminUserInput, CreateAdminUserResult } from "./types";

export async function createAdminUser(input: CreateAdminUserInput): Promise<CreateAdminUserResult> {
  const { accessToken, ...body } = input;
  const response = await fetch("/api/admin-users", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let result: CreateAdminUserResult | null = null;
  try {
    result = (await response.json()) as CreateAdminUserResult;
  } catch {
    // The server contract always returns JSON; keep infrastructure failures safe.
  }

  if (result && typeof result.ok === "boolean") return result;
  return { ok: false, error: "The server returned an invalid user creation response." };
}
