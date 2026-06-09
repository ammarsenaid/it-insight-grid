import type { Team, ID } from "./types";
import { getState, setState, uid, logActivity } from "./store";

export interface TeamInput {
  name: string;
  description: string;
  leadUserId?: ID;
  memberIds: ID[];
  queueOwnership: string[];
  assetScopes: string[];
}

const now = () => new Date().toISOString();

export function listTeams(): Team[] {
  return getState().teams;
}

export function getTeam(id: ID): Team | undefined {
  return getState().teams.find((t) => t.id === id);
}

export function createTeam(input: TeamInput): Team {
  const t: Team = {
    id: uid("team"),
    name: input.name.trim(),
    description: input.description.trim(),
    leadUserId: input.leadUserId,
    memberIds: [...input.memberIds],
    queueOwnership: [...input.queueOwnership],
    assetScopes: [...input.assetScopes],
    createdAt: now(),
    updatedAt: now(),
  };
  setState((s) => ({ ...s, teams: [t, ...s.teams] }));
  logActivity("team.create", `Created team '${t.name}'`, "team", t.id);
  return t;
}

export function updateTeam(id: ID, patch: Partial<TeamInput>): void {
  setState((s) => ({
    ...s,
    teams: s.teams.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now() } : t)),
  }));
  logActivity("team.update", `Updated team`, "team", id);
}

export function deleteTeam(id: ID): void {
  setState((s) => ({ ...s, teams: s.teams.filter((t) => t.id !== id) }));
  logActivity("team.delete", `Deleted team`, "team", id);
}

export interface TeamStats {
  openTickets: number;
  resolvedTickets: number;
  assetCount: number;
}

export function teamStats(team: Team): TeamStats {
  const s = getState();
  const open = s.tickets.filter((t) => t.team === team.name && t.status !== "resolved" && t.status !== "closed" && t.status !== "cancelled").length;
  const resolved = s.tickets.filter((t) => t.team === team.name && (t.status === "resolved" || t.status === "closed")).length;
  const assetCount = s.assets.filter((a) => team.assetScopes.includes(a.assetType)).length;
  return { openTickets: open, resolvedTickets: resolved, assetCount };
}
