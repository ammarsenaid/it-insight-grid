import { getSupabase } from "@/integrations/supabase/client";
import { asRow, asRows, type SbRow } from "@/lib/service-desk/sb";
import { normalizeTeamsError } from "./errors";
import type { ProfileOption, TeamInput, TeamMember, TeamRoleOption, TeamSummary } from "./types";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function mapTeam(row: SbRow, memberCount: number): TeamSummary {
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    description: strOrNull(row.description),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    memberCount,
  };
}

export async function listTeams(): Promise<TeamSummary[]> {
  const sb = getSupabase();
  const [{ data, error }, { data: memberRows, error: memberError }] = await Promise.all([
    sb.from("teams").select("id, name, slug, description, created_at, updated_at").order("name"),
    sb.from("team_members").select("team_id"),
  ]);
  if (error) throw normalizeTeamsError(error, "Failed to load teams");
  if (memberError) throw normalizeTeamsError(memberError, "Failed to load team member counts");

  const counts = new Map<string, number>();
  for (const row of asRows<SbRow>(memberRows)) {
    const teamId = str(row.team_id);
    counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
  }

  return asRows<SbRow>(data).map((row) => mapTeam(row, counts.get(str(row.id)) ?? 0));
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const sb = getSupabase();
  const [{ data: memberRows, error: memberError }, { data: roleRows, error: roleError }] =
    await Promise.all([
      sb.from("team_members").select("user_id, membership_status, joined_at").eq("team_id", teamId),
      sb.from("team_member_roles").select("user_id, roles(role_key, name)").eq("team_id", teamId),
    ]);
  if (memberError) throw normalizeTeamsError(memberError, "Failed to load team members");
  if (roleError) throw normalizeTeamsError(roleError, "Failed to load team member roles");

  const members = asRows<SbRow>(memberRows);
  const userIds = members.map((row) => str(row.user_id)).filter(Boolean);

  let profiles: SbRow[] = [];
  if (userIds.length > 0) {
    const { data: profileRows, error: profileError } = await sb
      .from("profiles")
      .select("id, display_name, email")
      .in("id", userIds);
    if (profileError) {
      throw normalizeTeamsError(profileError, "Failed to load team member profiles");
    }
    profiles = asRows<SbRow>(profileRows);
  }
  const profileMap = new Map(profiles.map((row) => [str(row.id), row]));

  const roleMap = new Map<string, { roleKey: string; roleName: string }>();
  for (const row of asRows<SbRow>(roleRows)) {
    const joined = Array.isArray(row.roles) ? asRow<SbRow>(row.roles[0]) : asRow<SbRow>(row.roles);
    if (!joined?.role_key) continue;
    roleMap.set(str(row.user_id), { roleKey: str(joined.role_key), roleName: str(joined.name) });
  }

  return members.map((row) => {
    const userId = str(row.user_id);
    const profile = profileMap.get(userId);
    const role = roleMap.get(userId);
    return {
      userId,
      displayName: profile?.display_name ? str(profile.display_name) : userId.slice(0, 8),
      email: profile ? strOrNull(profile.email) : null,
      membershipStatus: str(row.membership_status),
      roleKey: role?.roleKey ?? null,
      roleName: role?.roleName ?? null,
      joinedAt: str(row.joined_at),
    };
  });
}

export async function listTeamRoles(): Promise<TeamRoleOption[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("roles")
    .select("role_key, name")
    .eq("role_scope", "team")
    .order("name");
  if (error) throw normalizeTeamsError(error, "Failed to load team roles");
  return asRows<SbRow>(data).map((row) => ({ roleKey: str(row.role_key), name: str(row.name) }));
}

export async function listProfiles(): Promise<ProfileOption[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name, email")
    .order("display_name");
  if (error) throw normalizeTeamsError(error, "Failed to load profiles");
  return asRows<SbRow>(data).map((row) => ({
    id: str(row.id),
    displayName: row.display_name ? str(row.display_name) : str(row.id).slice(0, 8),
    email: strOrNull(row.email),
  }));
}

export async function createTeam(input: TeamInput): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("create_team", {
    requested_name: input.name,
    requested_slug: input.slug,
    requested_description: input.description,
  });
  if (error) throw normalizeTeamsError(error, "Failed to create team");
}

export async function updateTeam(id: string, input: TeamInput): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("update_team", {
    p_team_id: id,
    p_name: input.name,
    p_slug: input.slug,
    p_description: input.description,
  });
  if (error) throw normalizeTeamsError(error, "Failed to update team");
}

export async function deleteTeam(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("delete_team", { p_team_id: id });
  if (error) throw normalizeTeamsError(error, "Failed to delete team");
}

export async function addTeamMember(
  teamId: string,
  userId: string,
  roleKey: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("add_team_member", {
    p_team_id: teamId,
    p_user_id: userId,
    p_role_key: roleKey,
  });
  if (error) throw normalizeTeamsError(error, "Failed to add team member");
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("remove_team_member", { p_team_id: teamId, p_user_id: userId });
  if (error) throw normalizeTeamsError(error, "Failed to remove team member");
}

export async function setTeamMemberRole(
  teamId: string,
  userId: string,
  roleKey: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("set_team_member_role", {
    p_team_id: teamId,
    p_user_id: userId,
    p_role_key: roleKey,
  });
  if (error) throw normalizeTeamsError(error, "Failed to update team member role");
}
