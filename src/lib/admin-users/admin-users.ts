import { getSupabase } from "@/integrations/supabase/client";
import { asRow, asRows, type SbRow } from "@/lib/service-desk/sb";
import type { AdminUser, AdminUserFormOptions } from "./types";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  const text = str(value).trim();
  return text || null;
}

function joinedRow(value: unknown): SbRow | null {
  return Array.isArray(value) ? asRow<SbRow>(value[0]) : asRow<SbRow>(value);
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const sb = getSupabase();
  const [profilesResult, rolesResult, membershipsResult] = await Promise.all([
    sb
      .from("profiles")
      .select("id, email, display_name, is_active, created_at, updated_at")
      .order("display_name", { ascending: true }),
    sb
      .from("user_global_roles")
      .select("user_id, roles!inner(role_key, name)")
      .order("created_at", { ascending: true }),
    sb
      .from("team_members")
      .select("user_id, teams!inner(name)")
      .order("joined_at", { ascending: true }),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (rolesResult.error) throw rolesResult.error;
  if (membershipsResult.error) throw membershipsResult.error;

  const rolesByUser = new Map<string, Array<{ key: string; name: string }>>();
  for (const row of asRows<SbRow>(rolesResult.data)) {
    const userId = str(row.user_id);
    const role = joinedRow(row.roles);
    const key = str(role?.role_key);
    if (!userId || !key) continue;
    const roles = rolesByUser.get(userId) ?? [];
    roles.push({ key, name: str(role?.name) || key });
    rolesByUser.set(userId, roles);
  }

  const teamsByUser = new Map<string, string[]>();
  for (const row of asRows<SbRow>(membershipsResult.data)) {
    const userId = str(row.user_id);
    const teamName = str(joinedRow(row.teams)?.name);
    if (!userId || !teamName) continue;
    const teams = teamsByUser.get(userId) ?? [];
    teams.push(teamName);
    teamsByUser.set(userId, teams);
  }

  return asRows<SbRow>(profilesResult.data).map((row) => {
    const id = str(row.id);
    const email = strOrNull(row.email);
    const roles = rolesByUser.get(id) ?? [];
    return {
      id,
      displayName: strOrNull(row.display_name) ?? email ?? id.slice(0, 8),
      email,
      isActive: row.is_active === true,
      roleKeys: roles.map((role) => role.key),
      roleNames: roles.map((role) => role.name),
      teamNames: teamsByUser.get(id) ?? [],
      createdAt: str(row.created_at),
      updatedAt: str(row.updated_at),
    };
  });
}

export async function listAdminUserFormOptions(): Promise<AdminUserFormOptions> {
  const sb = getSupabase();
  const [rolesResult, teamsResult] = await Promise.all([
    sb
      .from("roles")
      .select("id, name")
      .eq("role_scope", "platform")
      .order("name", { ascending: true }),
    sb.from("teams").select("id, name").order("name", { ascending: true }),
  ]);

  if (rolesResult.error) throw rolesResult.error;
  if (teamsResult.error) throw teamsResult.error;

  return {
    roles: asRows<SbRow>(rolesResult.data)
      .map((row) => ({ id: str(row.id), name: str(row.name) }))
      .filter((option) => option.id && option.name),
    teams: asRows<SbRow>(teamsResult.data)
      .map((row) => ({ id: str(row.id), name: str(row.name) }))
      .filter((option) => option.id && option.name),
  };
}
