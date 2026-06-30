import type { AdminAccessInput, AdminAccessResult } from "./types";

export async function adminAccess(input: AdminAccessInput): Promise<AdminAccessResult> {
  const { accessToken, ...body } = input;
  const response = await fetch("/api/admin-access", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  try {
    const result = (await response.json()) as AdminAccessResult;
    if (typeof result?.ok === "boolean") return result;
  } catch {
    // Keep infrastructure and non-JSON failures generic.
  }
  return { ok: false, error: "The server returned an invalid access response." };
}
