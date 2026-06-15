import { queryOptions } from "@tanstack/react-query";
import { listProfiles, listTeamMembers, listTeamRoles, listTeams } from "./teams";

export const teamsKeys = {
  all: ["teams"] as const,
  list: () => [...teamsKeys.all, "list"] as const,
  members: (teamId: string) => [...teamsKeys.all, "members", teamId] as const,
  roles: () => [...teamsKeys.all, "roles"] as const,
  profiles: () => [...teamsKeys.all, "profiles"] as const,
};

export const teamsQuery = () =>
  queryOptions({
    queryKey: teamsKeys.list(),
    queryFn: listTeams,
  });

export const teamMembersQuery = (teamId: string) =>
  queryOptions({
    queryKey: teamsKeys.members(teamId),
    queryFn: () => listTeamMembers(teamId),
    enabled: Boolean(teamId),
  });

export const teamRolesQuery = () =>
  queryOptions({
    queryKey: teamsKeys.roles(),
    queryFn: listTeamRoles,
    staleTime: 5 * 60_000,
  });

export const profilesQuery = () =>
  queryOptions({
    queryKey: teamsKeys.profiles(),
    queryFn: listProfiles,
    staleTime: 5 * 60_000,
  });
