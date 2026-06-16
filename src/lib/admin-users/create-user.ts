import type {
  AdminUserMutationResult,
  CreateAdminUserInput,
  CreateAdminUserResult,
  SetAdminUserActiveInput,
  UpdateAdminUserInput,
} from "./types";

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

export async function updateAdminUser(
  input: UpdateAdminUserInput,
): Promise<AdminUserMutationResult> {
  const { accessToken, ...body } = input;
  const response = await fetch("/api/admin-users", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let result: AdminUserMutationResult | null = null;
  try {
    result = (await response.json()) as AdminUserMutationResult;
  } catch {
    // The server contract always returns JSON; keep infrastructure failures safe.
  }

  if (result && typeof result.ok === "boolean") return result;
  return { ok: false, error: "The server returned an invalid user edit response." };
}

export async function setAdminUserActive(
  input: SetAdminUserActiveInput,
): Promise<AdminUserMutationResult> {
  const { accessToken, ...body } = input;
  const response = await fetch("/api/admin-users", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let result: AdminUserMutationResult | null = null;
  try {
    result = (await response.json()) as AdminUserMutationResult;
  } catch {
    // The server contract always returns JSON; keep infrastructure failures safe.
  }

  if (result && typeof result.ok === "boolean") return result;
  return { ok: false, error: "The server returned an invalid user status response." };
}
