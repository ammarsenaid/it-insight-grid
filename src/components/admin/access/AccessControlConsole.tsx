import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  History,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { can, useRole } from "@/lib/permissions";
import { adminAccess } from "@/lib/admin-access/functions";
import type {
  AccessOverrideEffect,
  AccessResourceType,
  AccessSubjectType,
  AdminAccessSnapshot,
} from "@/lib/admin-access/types";
import {
  createAdminUser,
  setAdminUserActive,
  updateAdminUser,
} from "@/lib/admin-users/create-user";
import {
  adminUserFormOptionsQuery,
  adminUsersKeys,
  adminUsersQuery,
} from "@/lib/admin-users/queries";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  removeTeamMember,
  setTeamMemberRole,
  slugify,
  updateTeam,
} from "@/lib/teams/teams";
import {
  profilesQuery,
  teamMembersQuery,
  teamRolesQuery,
  teamsKeys,
  teamsQuery,
} from "@/lib/teams/queries";
import type { TeamInput } from "@/lib/teams/types";
import { cn } from "@/lib/utils";

type SubjectKind = AccessSubjectType;
type DetailTab =
  | "overview"
  | "assignments"
  | "permissions"
  | "pages"
  | "effective"
  | "audit";

interface SubjectItem {
  id: string;
  name: string;
  secondary: string;
  status: string;
  search: string;
  memberCount?: number;
}

const DETAIL_TABS: Array<{ key: DetailTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "assignments", label: "Members / Assignments" },
  { key: "permissions", label: "Permissions" },
  { key: "pages", label: "Page Visibility" },
  { key: "effective", label: "Effective Access" },
  { key: "audit", label: "Audit / History" },
];

export function AccessControlConsole() {
  const { session, effectiveAccess, isPlatformAdmin } = useAuth();
  const role = useRole();
  const canManageTeams = can("admin.teams", role);
  const queryClient = useQueryClient();
  const usersQ = useQuery(adminUsersQuery());
  const teamsQ = useQuery(teamsQuery());
  const formOptionsQ = useQuery(adminUserFormOptionsQuery());
  const [kind, setKind] = useState<SubjectKind>("user");
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<DetailTab>("overview");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState<"create" | "edit" | null>(null);

  const workspaces = useMemo(
    () => effectiveAccess?.workspaces ?? [],
    [effectiveAccess?.workspaces],
  );
  const items = useMemo<SubjectItem[]>(() => {
    if (kind === "user") {
      return (usersQ.data ?? []).map((user) => ({
        id: user.id,
        name: user.displayName,
        secondary: user.email ?? "Email unavailable",
        status: user.isActive ? "active" : "inactive",
        search: [user.displayName, user.email ?? "", ...user.roleNames, ...user.teamNames]
          .join(" ")
          .toLowerCase(),
      }));
    }
    if (kind === "team") {
      return (teamsQ.data ?? []).map((team) => ({
        id: team.id,
        name: team.name,
        secondary: `${team.memberCount} member${team.memberCount === 1 ? "" : "s"} · ${team.slug}`,
        status: "active",
        memberCount: team.memberCount,
        search: [team.name, team.slug, team.description ?? ""].join(" ").toLowerCase(),
      }));
    }
    return workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      secondary: `${workspace.type} · ${workspace.teams.length} team${workspace.teams.length === 1 ? "" : "s"}`,
      status: workspace.status,
      search: [workspace.name, workspace.slug, workspace.type, workspace.status]
        .join(" ")
        .toLowerCase(),
    }));
  }, [kind, teamsQ.data, usersQ.data, workspaces]);
  const visibleItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      const filterMatches =
        filter === "all" ||
        (filter === "active" && item.status === "active") ||
        (filter === "inactive" && item.status !== "active") ||
        (filter === "with-members" && (item.memberCount ?? 0) > 0) ||
        (filter === "empty" && (item.memberCount ?? 0) === 0);
      return filterMatches && (!needle || item.search.includes(needle));
    });
  }, [filter, items, search]);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const canCreate =
    kind === "user" ? isPlatformAdmin : kind === "team" ? canManageTeams : false;

  useEffect(() => {
    setSearch("");
    setFilter("all");
    setEditor(null);
    setTab("overview");
    setSelectedId("");
  }, [kind]);
  useEffect(() => {
    if (!editor && !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id ?? "");
    }
  }, [editor, items, selectedId]);

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: adminUsersKeys.all });
  const invalidateTeams = () =>
    queryClient.invalidateQueries({ queryKey: teamsKeys.all });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-card/50 p-2">
        {(["user", "team", "workspace"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm",
              kind === value
                ? "bg-primary/15 font-medium text-primary"
                : "text-muted-foreground hover:bg-background/60",
            )}
          >
            {value === "user" ? "Users" : value === "team" ? "Teams" : "Departments"}
          </button>
        ))}
        <Button
          className="ml-auto gap-2"
          size="sm"
          disabled={!canCreate}
          title={
            kind === "workspace"
              ? "Backend action not available yet."
              : !canCreate
                ? "You are not authorized for this backend action."
                : undefined
          }
          onClick={() => setEditor("create")}
        >
          <Plus className="h-4 w-4" />
          {kind === "workspace" ? "Backend action not available yet." : `Create ${kind}`}
        </Button>
      </div>

      <div className="grid min-h-[680px] min-w-0 overflow-hidden rounded-xl border border-border/50 bg-card/30 lg:grid-cols-[minmax(250px,320px)_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-border/50 lg:border-b-0 lg:border-r">
          <div className="space-y-2 border-b border-border/40 p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${kind === "workspace" ? "departments" : `${kind}s`}…`}
                className="h-9 w-full rounded-md border border-border/60 bg-background pl-8 pr-2 text-sm"
              />
            </div>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs"
            >
              {kind === "team" ? (
                <>
                  <option value="all">All teams</option>
                  <option value="with-members">With members</option>
                  <option value="empty">No members</option>
                </>
              ) : (
                <>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                </>
              )}
            </select>
          </div>
          <div className="max-h-[620px] overflow-auto p-2">
            {visibleItems.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">No matching items.</p>
            ) : (
              visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(item.id);
                    setEditor(null);
                  }}
                  className={cn(
                    "mb-1 w-full rounded-lg border px-3 py-2.5 text-left",
                    selectedId === item.id && !editor
                      ? "border-primary/35 bg-primary/10"
                      : "border-transparent hover:bg-background/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{item.name}</span>
                    <Badge variant="outline" className="ml-auto h-5 text-[10px]">
                      {item.status}
                    </Badge>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {item.secondary}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="min-w-0">
          {editor ? (
            <SubjectEditor
              kind={kind}
              mode={editor}
              selectedId={selectedId}
              accessToken={session?.access_token ?? ""}
              users={usersQ.data ?? []}
              teams={teamsQ.data ?? []}
              roleOptions={formOptionsQ.data?.roles ?? []}
              teamOptions={formOptionsQ.data?.teams ?? []}
              onCancel={() => setEditor(null)}
              onSaved={(id) => {
                if (kind === "user") void invalidateUsers();
                if (kind === "team") void invalidateTeams();
                setSelectedId(id);
                setEditor(null);
              }}
            />
          ) : selected ? (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-border/40 p-4">
                <SubjectIcon kind={kind} />
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{selected.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">{selected.secondary}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  disabled={
                    kind === "workspace" ||
                    (kind === "user" && !isPlatformAdmin) ||
                    (kind === "team" && !canManageTeams)
                  }
                  title={
                    kind === "workspace"
                      ? "Backend action not available yet."
                      : undefined
                  }
                  onClick={() => setEditor("edit")}
                >
                  {kind === "workspace" ? "Backend action not available yet." : "Edit"}
                </Button>
                {kind === "user" && isPlatformAdmin && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const user = usersQ.data?.find((entry) => entry.id === selected.id);
                        if (!user || !session?.access_token) return;
                        const result = await setAdminUserActive({
                          accessToken: session.access_token,
                          userId: user.id,
                          isActive: !user.isActive,
                        });
                        if (!result.ok) return toast.error(result.error);
                        await invalidateUsers();
                        toast.success(user.isActive ? "User deactivated" : "User activated");
                      }}
                    >
                      {selected.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      title="Backend action not available yet."
                    >
                      Backend action not available yet.
                    </Button>
                  </>
                )}
                {kind === "team" && canManageTeams && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      if (!window.confirm(`Delete ${selected.name}?`)) return;
                      try {
                        await deleteTeam(selected.id);
                        await invalidateTeams();
                        setSelectedId("");
                        toast.success("Team deleted");
                      } catch {
                        toast.error("Team could not be deleted.");
                      }
                    }}
                  >
                    Delete
                  </Button>
                )}
                {kind === "workspace" && (
                  <Button variant="outline" size="sm" disabled title="Backend action not available yet.">
                    Backend action not available yet.
                  </Button>
                )}
              </div>
              <div className="flex max-w-full gap-1 overflow-x-auto border-b border-border/40 px-3 pt-2">
                {DETAIL_TABS.map((detailTab) => (
                  <button
                    key={detailTab.key}
                    type="button"
                    onClick={() => setTab(detailTab.key)}
                    className={cn(
                      "whitespace-nowrap border-b-2 px-3 py-2 text-xs",
                      tab === detailTab.key
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground",
                    )}
                  >
                    {detailTab.label}
                  </button>
                ))}
              </div>
              <SubjectDetails
                kind={kind}
                selectedId={selected.id}
                tab={tab}
                accessToken={session?.access_token ?? ""}
                users={usersQ.data ?? []}
                teams={teamsQ.data ?? []}
                workspaces={workspaces}
                canManageTeams={canManageTeams}
                canMutateAccess={isPlatformAdmin}
              />
            </>
          ) : (
            <div className="grid h-full place-items-center p-8 text-sm text-muted-foreground">
              Select an item to manage.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SubjectIcon({ kind }: { kind: SubjectKind }) {
  const Icon = kind === "user" ? UserRound : kind === "team" ? UsersRound : Building2;
  return (
    <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
      <Icon className="h-4 w-4" />
    </div>
  );
}

function SubjectEditor({
  kind,
  mode,
  selectedId,
  accessToken,
  users,
  teams,
  roleOptions,
  teamOptions,
  onCancel,
  onSaved,
}: {
  kind: SubjectKind;
  mode: "create" | "edit";
  selectedId: string;
  accessToken: string;
  users: Array<{ id: string; displayName: string; email: string | null; isActive: boolean }>;
  teams: Array<{ id: string; name: string; slug: string; description: string | null }>;
  roleOptions: Array<{ id: string; name: string }>;
  teamOptions: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onSaved: (id: string) => void;
}) {
  const existingUser = users.find((user) => user.id === selectedId);
  const existingTeam = teams.find((team) => team.id === selectedId);
  const [name, setName] = useState(
    kind === "user" ? existingUser?.displayName ?? "" : existingTeam?.name ?? "",
  );
  const [email, setEmail] = useState(existingUser?.email ?? "");
  const [slug, setSlug] = useState(existingTeam?.slug ?? "");
  const [description, setDescription] = useState(existingTeam?.description ?? "");
  const [roleId, setRoleId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [active, setActive] = useState(existingUser?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  if (kind === "workspace") {
    return (
      <div className="p-6">
        <h2 className="font-semibold">
          {mode === "create" ? "Create department" : "Edit department"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Backend action not available yet. Workspace CRUD has no approved mutation API.
        </p>
        <Button className="mt-4" variant="outline" onClick={onCancel}>Back</Button>
      </div>
    );
  }

  const save = async () => {
    if (!name.trim() || !accessToken) return;
    setSaving(true);
    try {
      if (kind === "user") {
        const result =
          mode === "create"
            ? await createAdminUser({
                accessToken,
                displayName: name,
                email,
                roleId: roleId || null,
                teamId: teamId || null,
                isActive: active,
              })
            : await updateAdminUser({
                accessToken,
                userId: selectedId,
                displayName: name,
                isActive: active,
              });
        if (!result.ok) return toast.error(result.error);
        onSaved(result.userId);
      } else {
        const input: TeamInput = {
          name: name.trim(),
          slug: slugify(slug || name),
          description,
        };
        if (mode === "create") {
          await createTeam(input);
          onSaved("");
        } else {
          await updateTeam(selectedId, input);
          onSaved(selectedId);
        }
      }
      toast.success(`${kind === "user" ? "User" : "Team"} saved`);
    } catch {
      toast.error(`${kind === "user" ? "User" : "Team"} could not be saved.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4 p-6">
      <div>
        <h2 className="font-semibold">
          {mode === "create" ? "Create" : "Edit"} {kind}
        </h2>
        <p className="text-xs text-muted-foreground">Changes use the existing backend mutation.</p>
      </div>
      <label className="block space-y-1 text-xs">
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3" />
      </label>
      {kind === "user" ? (
        <>
          <label className="block space-y-1 text-xs">
            <span>Email</span>
            <input value={email} disabled={mode === "edit"} onChange={(event) => setEmail(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 disabled:opacity-60" />
          </label>
          {mode === "create" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span>Initial role</span>
                <select value={roleId} onChange={(event) => setRoleId(event.target.value)} className="h-9 w-full rounded-md border bg-background px-2">
                  <option value="">No global role</option>
                  {roleOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span>Initial team</span>
                <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="h-9 w-full rounded-md border bg-background px-2">
                  <option value="">No team</option>
                  {teamOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </label>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            Active account
          </label>
        </>
      ) : (
        <>
          <label className="block space-y-1 text-xs">
            <span>Slug</span>
            <input value={slug} onChange={(event) => setSlug(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3" />
          </label>
          <label className="block space-y-1 text-xs">
            <span>Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24 w-full rounded-md border bg-background p-3" />
          </label>
        </>
      )}
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save"}</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function SubjectDetails({
  kind,
  selectedId,
  tab,
  accessToken,
  users,
  teams,
  workspaces,
  canManageTeams,
  canMutateAccess,
}: {
  kind: SubjectKind;
  selectedId: string;
  tab: DetailTab;
  accessToken: string;
  users: Array<{ id: string; displayName: string; email: string | null; roleNames: string[]; teamNames: string[]; isActive: boolean }>;
  teams: Array<{ id: string; name: string; description: string | null; memberCount: number }>;
  workspaces: Array<{ id: string; name: string; type: string; status: string; teams: Array<{ id: string; name: string }> }>;
  canManageTeams: boolean;
  canMutateAccess: boolean;
}) {
  const snapshotQ = useQuery({
    queryKey: ["admin-access", kind, selectedId],
    enabled: Boolean(accessToken && selectedId && canMutateAccess),
    queryFn: async () => {
      const result = await adminAccess({
        accessToken,
        action: "read",
        subjectType: kind,
        subjectId: selectedId,
        workspaceId: kind === "workspace" ? selectedId : null,
        teamId: kind === "team" ? selectedId : null,
      });
      if (!result.ok) throw new Error(result.error);
      return result.snapshot;
    },
  });
  const user = users.find((entry) => entry.id === selectedId);
  const team = teams.find((entry) => entry.id === selectedId);
  const workspace = workspaces.find((entry) => entry.id === selectedId);

  if (tab === "overview") {
    return (
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <OverviewValue label="Type" value={kind === "workspace" ? "Department / workspace" : kind} />
        <OverviewValue label="Status" value={user ? (user.isActive ? "Active" : "Inactive") : workspace?.status ?? "Active"} />
        <OverviewValue label="Description" value={team?.description ?? workspace?.type ?? "No description"} />
        <OverviewValue label="Assignments" value={user ? `${user.roleNames.length} role(s), ${user.teamNames.length} team(s)` : team ? `${team.memberCount} member(s)` : `${workspace?.teams.length ?? 0} team(s)`} />
      </div>
    );
  }
  if (tab === "assignments") {
    return kind === "team" ? (
      <TeamAssignments teamId={selectedId} canManage={canManageTeams} />
    ) : (
      <div className="space-y-3 p-4">
        {user && (
          <>
            <OverviewValue label="Roles" value={user.roleNames.join(", ") || "No global role"} />
            <OverviewValue label="Teams" value={user.teamNames.join(", ") || "No team"} />
          </>
        )}
        {workspace?.teams.map((entry) => (
          <div key={entry.id} className="rounded-lg border p-3 text-sm">{entry.name}</div>
        ))}
        <Button disabled variant="outline" title="Backend action not available yet.">
          Manage assignments — Backend action not available yet.
        </Button>
      </div>
    );
  }
  if (tab === "permissions" || tab === "pages") {
    return (
      <PolicyEditor
        kind={kind}
        selectedId={selectedId}
        resourceType={tab === "permissions" ? "permission" : "route"}
        accessToken={accessToken}
        snapshot={snapshotQ.data}
        loading={snapshotQ.isLoading}
        onRefresh={() => snapshotQ.refetch()}
        canMutate={canMutateAccess}
      />
    );
  }
  if (tab === "effective") {
    if (!canMutateAccess) return <AdminAccessRequired />;
    return <EffectivePanel snapshot={snapshotQ.data} loading={snapshotQ.isLoading} />;
  }
  if (!canMutateAccess) return <AdminAccessRequired />;
  return <AuditPanel snapshot={snapshotQ.data} loading={snapshotQ.isLoading} />;
}

function TeamAssignments({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const membersQ = useQuery(teamMembersQuery(teamId));
  const profilesQ = useQuery(profilesQuery());
  const rolesQ = useQuery(teamRolesQuery());
  const [profileId, setProfileId] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: teamsKeys.all });
  const addMutation = useMutation({
    mutationFn: () => addTeamMember(teamId, profileId, roleKey),
    onSuccess: () => {
      setProfileId("");
      void refresh();
      toast.success("Team member added");
    },
    onError: () => toast.error("Team member could not be added."),
  });
  useEffect(() => {
    if (!roleKey && rolesQ.data?.[0]) setRoleKey(rolesQ.data[0].roleKey);
  }, [roleKey, rolesQ.data]);

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap gap-2 rounded-lg border p-3">
        <select disabled={!canManage} value={profileId} onChange={(event) => setProfileId(event.target.value)} className="h-9 min-w-48 flex-1 rounded-md border bg-background px-2 text-xs">
          <option value="">Select user</option>
          {(profilesQ.data ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}
        </select>
        <select disabled={!canManage} value={roleKey} onChange={(event) => setRoleKey(event.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs">
          {(rolesQ.data ?? []).map((role) => <option key={role.roleKey} value={role.roleKey}>{role.name}</option>)}
        </select>
        <Button size="sm" title={!canManage ? "You are not authorized for this backend action." : undefined} disabled={!canManage || !profileId || !roleKey || addMutation.isPending} onClick={() => addMutation.mutate()}>Add member</Button>
      </div>
      {(membersQ.data ?? []).map((member) => (
        <div key={member.userId} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{member.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">{member.email ?? member.userId}</div>
          </div>
          <select
            value={member.roleKey ?? ""}
            disabled={!canManage}
            onChange={async (event) => {
              try {
                await setTeamMemberRole(teamId, member.userId, event.target.value);
                await refresh();
                toast.success("Member role updated");
              } catch {
                toast.error("Member role could not be updated.");
              }
            }}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            {(rolesQ.data ?? []).map((role) => <option key={role.roleKey} value={role.roleKey}>{role.name}</option>)}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!canManage}
            onClick={async () => {
              try {
                await removeTeamMember(teamId, member.userId);
                await refresh();
                toast.success("Team member removed");
              } catch {
                toast.error("Team member could not be removed.");
              }
            }}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}

function PolicyEditor({
  kind,
  selectedId,
  resourceType,
  accessToken,
  snapshot,
  loading,
  onRefresh,
  canMutate,
}: {
  kind: SubjectKind;
  selectedId: string;
  resourceType: AccessResourceType;
  accessToken: string;
  snapshot: AdminAccessSnapshot | undefined;
  loading: boolean;
  onRefresh: () => Promise<unknown>;
  canMutate: boolean;
}) {
  const [reason, setReason] = useState("");
  const [drafts, setDrafts] = useState<Record<string, AccessOverrideEffect>>({});
  const mutation = useMutation({
    mutationFn: async ({ key, effect }: { key: string; effect: AccessOverrideEffect }) => {
      const result = await adminAccess({
        accessToken,
        action: "set",
        subjectType: kind,
        subjectId: selectedId,
        workspaceId: kind === "workspace" ? selectedId : null,
        teamId: kind === "team" ? selectedId : null,
        resourceType,
        resourceKey: key,
        effect,
        reason,
      });
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess: async () => {
      setDrafts({});
      setReason("");
      await onRefresh();
      toast.success("Access override saved");
    },
    onError: () => toast.error("Access override could not be saved."),
  });
  if (!canMutate) return <AdminAccessRequired />;
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading access policy…</div>;
  if (!snapshot?.available) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        <Lock className="mb-2 h-4 w-4" />
        Editable controls are blocked until the backend activation marker is available.
      </div>
    );
  }
  const entries = resourceType === "permission" ? snapshot.permissions : snapshot.routes;
  return (
    <div className="space-y-3 p-4">
      <label className="block space-y-1 text-xs">
        <span>Audit reason required for save</span>
        <input value={reason} onChange={(event) => setReason(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3" placeholder="Why is this access change required?" />
      </label>
      <div className="max-h-[500px] max-w-full overflow-auto rounded-lg border">
        <table className="w-full min-w-[680px] text-xs">
          <thead className="sticky top-0 z-20 bg-card">
            <tr>
              <th className="sticky left-0 z-30 w-52 bg-card px-3 py-2 text-left">Resource</th>
              <th className="px-3 py-2 text-left">Override</th>
              <th className="px-3 py-2 text-left">Effective</th>
              <th className="px-3 py-2 text-left">Source / reason</th>
              <th className="px-3 py-2 text-right">Save</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const draft = drafts[entry.key] ?? entry.override;
              return (
                <tr key={entry.key} className="border-t">
                  <td className="sticky left-0 bg-card px-3 py-2 font-mono">{entry.label}</td>
                  <td className="px-3 py-2">
                    <select disabled={!canMutate} value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [entry.key]: event.target.value as AccessOverrideEffect }))} className="h-8 rounded border bg-background px-2">
                      <option value="inherit">Inherit</option>
                      <option value="allow">Allow</option>
                      <option value="deny">Deny</option>
                    </select>
                  </td>
                  <td className="px-3 py-2"><Badge variant="outline">{entry.effective}</Badge></td>
                  <td className="max-w-64 truncate px-3 py-2 text-muted-foreground" title={`${entry.source}${entry.reason ? ` · ${entry.reason}` : ""}`}>
                    {entry.source}{entry.reason ? ` · ${entry.reason}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button title={!canMutate ? "Only an active platform administrator can change access." : undefined} size="sm" disabled={!canMutate || draft === entry.override || reason.trim().length < 3 || mutation.isPending} onClick={() => mutation.mutate({ key: entry.key, effect: draft })}>Save</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EffectivePanel({ snapshot, loading }: { snapshot?: AdminAccessSnapshot; loading: boolean }) {
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Resolving effective access…</div>;
  if (!snapshot?.available) return <div className="p-6 text-sm text-muted-foreground">Effective access is unavailable until backend activation.</div>;
  return (
    <div className="grid gap-4 p-4 xl:grid-cols-2">
      <DecisionList title="Permissions" items={snapshot.permissions} />
      <DecisionList title="Page visibility" items={snapshot.routes} />
    </div>
  );
}

function DecisionList({ title, items }: { title: string; items: AdminAccessSnapshot["permissions"] }) {
  return (
    <section className="rounded-lg border p-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" />{title}</h3>
      <div className="max-h-96 space-y-1 overflow-auto">
        {items.map((item) => (
          <div key={item.key} className="rounded border p-2 text-xs">
            <div className="flex gap-2"><span className="truncate font-mono">{item.label}</span><Badge className="ml-auto" variant="outline">{item.effective}</Badge></div>
            <div className="mt-1 truncate text-muted-foreground">{item.source}{item.reason ? ` · ${item.reason}` : ""}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AuditPanel({ snapshot, loading }: { snapshot?: AdminAccessSnapshot; loading: boolean }) {
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading history…</div>;
  return (
    <div className="space-y-2 p-4">
      {(snapshot?.audit ?? []).map((entry) => (
        <div key={entry.id} className="flex gap-3 rounded-lg border p-3 text-xs">
          <History className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-mono">{entry.resourceKey}</div>
            <div className="text-muted-foreground">{entry.previousEffect ?? "inherit"} → {entry.newEffect ?? "inherit"} · {entry.reason}</div>
          </div>
        </div>
      ))}
      {snapshot?.audit.length === 0 && <p className="text-sm text-muted-foreground">No access changes recorded.</p>}
    </div>
  );
}

function OverviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function AdminAccessRequired() {
  return (
    <div className="p-6 text-sm text-muted-foreground">
      <Lock className="mb-2 h-4 w-4" />
      Only an active platform administrator can inspect or change access overrides.
    </div>
  );
}
