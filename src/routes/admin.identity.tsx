import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAdminUser,
  setAdminUserActive,
  updateAdminUser,
} from "@/lib/admin-users/create-user";
import {
  IdentityDetailPanel,
  type IdentitySubject,
  type IdentityWorkspace,
} from "@/components/admin/identity/IdentityDetailPanel";
import { adminAccess } from "@/lib/admin-access/functions";
import {
  adminUserFormOptionsQuery,
  adminUsersKeys,
  adminUsersQuery,
} from "@/lib/admin-users/queries";
import type { AdminUser } from "@/lib/admin-users/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { teamsKeys, teamsQuery } from "@/lib/teams/queries";
import {
  createTeam,
  deleteTeam,
  slugify,
  updateTeam,
} from "@/lib/teams/teams";
import type { TeamInput, TeamSummary } from "@/lib/teams/types";

type IdentityTab = "users" | "teams" | "departments";

type UserDraft = {
  displayName: string;
  email: string;
  roleId: string;
  teamId: string;
  isActive: boolean;
};

const EMPTY_USER: UserDraft = {
  displayName: "",
  email: "",
  roleId: "",
  teamId: "",
  isActive: true,
};

const EMPTY_TEAM: TeamInput = {
  name: "",
  slug: "",
  description: "",
};

const DISABLED_TITLE = "Backend action not available yet.";

const tabs: Array<{ id: IdentityTab; label: string }> = [
  { id: "users", label: "Users" },
  { id: "teams", label: "Teams" },
  { id: "departments", label: "Departments" },
];

export const Route = createFileRoute("/admin/identity")({
  head: () => ({
    meta: [{ title: "Identity & Access · IT Knowledge Center" }],
  }),
  component: IdentityAndAccessPage,
  errorComponent: IdentityRouteError,
});

function IdentityRouteError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  console.error("Identity & Access route error", error);

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background p-4 sm:p-6">
      <section className="mx-auto max-w-3xl rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-xl font-semibold">
          Identity &amp; Access could not be rendered
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "Unknown route error."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Try again
        </button>
      </section>
    </main>
  );
}

function IdentityAndAccessPage() {
  const { session, effectiveAccess, isPlatformAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<IdentityTab>("users");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState<UserDraft>(EMPTY_USER);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [userMessage, setUserMessage] = useState<string | null>(null);
  const [teamDraft, setTeamDraft] = useState<TeamInput>(EMPTY_TEAM);
  const [editingTeam, setEditingTeam] = useState<TeamSummary | null>(null);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);

  const queryEnabled = Boolean(session?.user);
  const usersQuery = useQuery({
    ...adminUsersQuery(),
    enabled: queryEnabled,
  });
  const userOptionsQuery = useQuery({
    ...adminUserFormOptionsQuery(),
    enabled: queryEnabled && isPlatformAdmin,
  });
  const teamListQuery = useQuery({
    ...teamsQuery(),
    enabled: queryEnabled,
  });
  const canCheckAccessStatus = Boolean(
    session?.access_token && session?.user?.id && isPlatformAdmin,
  );
  const accessStatusQuery = useQuery({
    queryKey: ["admin-access", "activation-status", session?.user?.id ?? ""],
    enabled: canCheckAccessStatus,
    retry: false,
    queryFn: async () => {
      if (!session?.access_token || !session.user?.id) {
        throw new Error("Administrator access is unavailable.");
      }
      return adminAccess({
        accessToken: session.access_token,
        action: "read",
        subjectType: "user",
        subjectId: session.user.id,
      });
    },
  });

  const users = normalizeAdminUsers(usersQuery.data);
  const teams = normalizeTeams(teamListQuery.data);
  const workspaces = normalizeWorkspaces(effectiveAccess?.workspaces);
  const roleOptions = normalizeFormOptions(userOptionsQuery.data?.roles);
  const teamOptions = normalizeFormOptions(userOptionsQuery.data?.teams);
  const canManage = Boolean(session?.user && isPlatformAdmin);
  const accessStatusResult = accessStatusQuery.data;
  const accessSnapshot =
    accessStatusResult?.ok === true &&
    accessStatusResult.snapshot &&
    typeof accessStatusResult.snapshot === "object"
      ? accessStatusResult.snapshot
      : null;
  const accessOverrideActivated = accessSnapshot?.available === true;
  const selectedUser =
    activeTab === "users" && selectedId
      ? users.find((user) => user.id === selectedId) ?? null
      : null;
  const selectedTeam =
    activeTab === "teams" && selectedId
      ? teams.find((team) => team.id === selectedId) ?? null
      : null;
  const selectedWorkspace =
    activeTab === "departments" && selectedId
      ? workspaces.find((workspace) => workspace.id === selectedId) ?? null
      : null;
  const selectedSubject: IdentitySubject | null = selectedUser
    ? {
        type: "user",
        id: selectedUser.id,
        name: selectedUser.displayName,
        value: selectedUser,
      }
    : selectedTeam
      ? {
          type: "team",
          id: selectedTeam.id,
          name: selectedTeam.name,
          value: selectedTeam,
        }
      : selectedWorkspace
        ? {
            type: "workspace",
            id: selectedWorkspace.id,
            name: selectedWorkspace.name,
            value: {
              id: selectedWorkspace.id,
              name: selectedWorkspace.name,
              slug: selectedWorkspace.slug,
              status: selectedWorkspace.status,
              type: selectedWorkspace.type,
              teams: Array.isArray(selectedWorkspace.teams)
                ? selectedWorkspace.teams
                : [],
            },
          }
        : null;

  const createUserMutation = useMutation({
    mutationFn: async (draft: UserDraft) => {
      if (!session?.access_token || !isPlatformAdmin) {
        throw new Error("An active platform administrator session is required.");
      }
      return createAdminUser({
        accessToken: session.access_token,
        displayName: draft.displayName.trim(),
        email: draft.email.trim(),
        roleId: draft.roleId || null,
        teamId: draft.teamId || null,
        isActive: draft.isActive,
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setUserMessage(safeMessage(result.error, "The user could not be created."));
        return;
      }
      if (typeof result.userId !== "string" || !result.userId) {
        setUserMessage("The server returned an invalid user creation response.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: adminUsersKeys.all });
      setShowUserForm(false);
      setUserDraft(EMPTY_USER);
      setUserMessage("User created successfully.");
    },
    onError: () => setUserMessage("The user could not be created."),
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({
      user,
      draft,
    }: {
      user: AdminUser;
      draft: UserDraft;
    }) => {
      if (!session?.access_token || !isPlatformAdmin) {
        throw new Error("An active platform administrator session is required.");
      }
      return updateAdminUser({
        accessToken: session.access_token,
        userId: user.id,
        displayName: draft.displayName.trim(),
        isActive: draft.isActive,
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setUserMessage(safeMessage(result.error, "The user could not be updated."));
        return;
      }
      if (typeof result.userId !== "string" || !result.userId) {
        setUserMessage("The server returned an invalid user update response.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: adminUsersKeys.all });
      setEditingUser(null);
      setShowUserForm(false);
      setUserDraft(EMPTY_USER);
      setUserMessage("User updated successfully.");
    },
    onError: () => setUserMessage("The user could not be updated."),
  });

  const setUserActiveMutation = useMutation({
    mutationFn: async (user: AdminUser) => {
      if (!session?.access_token || !isPlatformAdmin) {
        throw new Error("An active platform administrator session is required.");
      }
      return setAdminUserActive({
        accessToken: session.access_token,
        userId: user.id,
        isActive: !user.isActive,
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setUserMessage(
          safeMessage(result.error, "The user status could not be updated."),
        );
        return;
      }
      if (typeof result.userId !== "string" || !result.userId) {
        setUserMessage("The server returned an invalid user status response.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: adminUsersKeys.all });
      setUserMessage("User status updated successfully.");
    },
    onError: () => setUserMessage("The user status could not be updated."),
  });

  const createTeamMutation = useMutation({
    mutationFn: (draft: TeamInput) => {
      if (!canManage) {
        throw new Error("An active platform administrator session is required.");
      }
      return createTeam({
        name: draft.name.trim(),
        slug: slugify(draft.slug || draft.name),
        description: draft.description.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamsKeys.list() });
      setShowTeamForm(false);
      setTeamDraft(EMPTY_TEAM);
      setTeamMessage("Team created successfully.");
    },
    onError: () => setTeamMessage("The team could not be created."),
  });

  const updateTeamMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: TeamInput }) => {
      if (!canManage) {
        throw new Error("An active platform administrator session is required.");
      }
      return updateTeam(id, {
        name: draft.name.trim(),
        slug: slugify(draft.slug || draft.name),
        description: draft.description.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamsKeys.list() });
      setEditingTeam(null);
      setShowTeamForm(false);
      setTeamDraft(EMPTY_TEAM);
      setTeamMessage("Team updated successfully.");
    },
    onError: () => setTeamMessage("The team could not be updated."),
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (id: string) => {
      if (!canManage) {
        throw new Error("An active platform administrator session is required.");
      }
      return deleteTeam(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamsKeys.list() });
      setSelectedId(null);
      setTeamMessage("Team deleted successfully.");
    },
    onError: () => setTeamMessage("The team could not be deleted."),
  });

  function openCreateUser() {
    setEditingUser(null);
    setUserDraft(EMPTY_USER);
    setUserMessage(null);
    setShowUserForm(true);
  }

  function openEditUser(user: AdminUser) {
    setEditingUser(user);
    setUserDraft({
      displayName: user.displayName,
      email: user.email ?? "",
      roleId: "",
      teamId: "",
      isActive: user.isActive,
    });
    setUserMessage(null);
    setShowUserForm(true);
  }

  function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createUserMutation.isPending || updateUserMutation.isPending) return;
    if (!userDraft.displayName.trim()) {
      setUserMessage("Display name is required.");
      return;
    }
    if (
      !editingUser &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userDraft.email.trim())
    ) {
      setUserMessage("Enter a valid email address.");
      return;
    }
    setUserMessage(null);
    if (editingUser) {
      updateUserMutation.mutate({ user: editingUser, draft: userDraft });
    } else {
      createUserMutation.mutate(userDraft);
    }
  }

  function openCreateTeam() {
    setEditingTeam(null);
    setTeamDraft(EMPTY_TEAM);
    setTeamMessage(null);
    setShowTeamForm(true);
  }

  function openEditTeam(team: TeamSummary) {
    setEditingTeam(team);
    setTeamDraft({
      name: team.name,
      slug: team.slug,
      description: team.description ?? "",
    });
    setTeamMessage(null);
    setShowTeamForm(true);
  }

  function submitTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createTeamMutation.isPending || updateTeamMutation.isPending) return;
    if (!teamDraft.name.trim() || !slugify(teamDraft.slug || teamDraft.name)) {
      setTeamMessage("Team name and a valid slug are required.");
      return;
    }
    setTeamMessage(null);
    if (editingTeam) {
      updateTeamMutation.mutate({ id: editingTeam.id, draft: teamDraft });
    } else {
      createTeamMutation.mutate(teamDraft);
    }
  }

  function confirmDeleteTeam(team: TeamSummary) {
    if (deleteTeamMutation.isPending) return;
    if (!window.confirm(`Delete team "${team.name}"? This cannot be undone.`)) {
      return;
    }
    deleteTeamMutation.mutate(team.id);
  }

  function confirmToggleUser(user: AdminUser) {
    if (setUserActiveMutation.isPending) return;
    const action = user.isActive ? "deactivate" : "activate";
    if (!window.confirm(`Do you want to ${action} ${user.displayName}?`)) {
      return;
    }
    setUserActiveMutation.mutate(user);
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            Identity &amp; Access
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Access Control</p>
        </header>

        <section className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="border-b px-4 pt-4">
            <div
              role="tablist"
              aria-label="Access control subjects"
              className="flex gap-1 overflow-x-auto"
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setSelectedId(null);
                    }}
                    className={`whitespace-nowrap rounded-t-md border-b-2 px-4 py-2 text-sm font-medium ${
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-5 p-4 sm:p-6">
            <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.4fr)]">
              <div className="min-w-0">
                {activeTab === "users" && (
                  <UsersSection
                    users={users}
                    selectedId={selectedId}
                    isLoading={usersQuery.isLoading}
                    isError={usersQuery.isError}
                    isPlatformAdmin={isPlatformAdmin}
                    message={userMessage}
                    showForm={showUserForm}
                    editingUser={editingUser}
                    draft={userDraft}
                    roleOptions={roleOptions}
                    teamOptions={teamOptions}
                    optionsLoading={userOptionsQuery.isLoading}
                    optionsError={userOptionsQuery.isError}
                    isSaving={
                      createUserMutation.isPending ||
                      updateUserMutation.isPending ||
                      setUserActiveMutation.isPending
                    }
                    onRetry={() => usersQuery.refetch()}
                    onRetryOptions={() => userOptionsQuery.refetch()}
                    onSelect={(user) => setSelectedId(user.id)}
                    onCreate={openCreateUser}
                    onEdit={openEditUser}
                    onCloseForm={() => {
                      setShowUserForm(false);
                      setEditingUser(null);
                    }}
                    onDraftChange={setUserDraft}
                    onSubmit={submitUser}
                  />
                )}

                {activeTab === "teams" && (
                  <TeamsSection
                    teams={teams}
                    selectedId={selectedId}
                    isLoading={teamListQuery.isLoading}
                    isError={teamListQuery.isError}
                    canManage={canManage}
                    message={teamMessage}
                    showForm={showTeamForm}
                    editingTeam={editingTeam}
                    draft={teamDraft}
                    isSaving={
                      createTeamMutation.isPending ||
                      updateTeamMutation.isPending ||
                      deleteTeamMutation.isPending
                    }
                    onRetry={() => teamListQuery.refetch()}
                    onSelect={(team) => setSelectedId(team.id)}
                    onCreate={openCreateTeam}
                    onEdit={openEditTeam}
                    onDelete={confirmDeleteTeam}
                    onCloseForm={() => {
                      setShowTeamForm(false);
                      setEditingTeam(null);
                    }}
                    onDraftChange={setTeamDraft}
                    onSubmit={submitTeam}
                  />
                )}

                {activeTab === "departments" && (
                  <DepartmentsSection
                    workspaces={workspaces}
                    selectedId={selectedId}
                    onSelect={(workspace) => setSelectedId(workspace.id)}
                  />
                )}
              </div>

              <div className="min-w-0">
                {selectedSubject ? (
                  <IdentityDetailPanel
                    key={`${selectedSubject.type}:${selectedSubject.id}`}
                    subject={selectedSubject}
                    activationConfirmed={accessOverrideActivated}
                    canManage={canManage}
                    managementPending={
                      selectedSubject.type === "user"
                        ? createUserMutation.isPending ||
                          updateUserMutation.isPending ||
                          setUserActiveMutation.isPending
                        : selectedSubject.type === "team"
                          ? createTeamMutation.isPending ||
                            updateTeamMutation.isPending ||
                            deleteTeamMutation.isPending
                          : false
                    }
                    onEditUser={openEditUser}
                    onToggleUser={confirmToggleUser}
                    onEditTeam={openEditTeam}
                    onDeleteTeam={confirmDeleteTeam}
                  />
                ) : (
                  <section className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    Select a user, team, or department to manage overview,
                    assignments, access, and audit history.
                  </section>
                )}
              </div>
            </div>

            <AccessOverrideNotice
              isLoading={accessStatusQuery.isLoading}
              isActivated={accessOverrideActivated}
              isUnavailable={
                !canCheckAccessStatus ||
                accessStatusQuery.isError ||
                (!accessStatusQuery.isLoading && accessStatusResult?.ok === false)
              }
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function UsersSection({
  users,
  selectedId,
  isLoading,
  isError,
  isPlatformAdmin,
  message,
  showForm,
  editingUser,
  draft,
  roleOptions,
  teamOptions,
  optionsLoading,
  optionsError,
  isSaving,
  onRetry,
  onRetryOptions,
  onSelect,
  onCreate,
  onEdit,
  onCloseForm,
  onDraftChange,
  onSubmit,
}: {
  users: AdminUser[];
  selectedId: string | null;
  isLoading: boolean;
  isError: boolean;
  isPlatformAdmin: boolean;
  message: string | null;
  showForm: boolean;
  editingUser: AdminUser | null;
  draft: UserDraft;
  roleOptions: Array<{ id: string; name: string }>;
  teamOptions: Array<{ id: string; name: string }>;
  optionsLoading: boolean;
  optionsError: boolean;
  isSaving: boolean;
  onRetry: () => void;
  onRetryOptions: () => void;
  onSelect: (user: AdminUser) => void;
  onCreate: () => void;
  onEdit: (user: AdminUser) => void;
  onCloseForm: () => void;
  onDraftChange: (draft: UserDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const needle = search.trim().toLowerCase();
  const visibleUsers = users.filter((user) => {
    if (statusFilter === "active" && !user.isActive) return false;
    if (statusFilter === "inactive" && user.isActive) return false;
    if (!needle) return true;
    const roleNames = Array.isArray(user.roleNames) ? user.roleNames : [];
    const teamNames = Array.isArray(user.teamNames) ? user.teamNames : [];
    return [
      user.displayName,
      user.email ?? "",
      ...roleNames,
      ...teamNames,
    ].some((value) => value.toLowerCase().includes(needle));
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">
            Create and update real user accounts.
          </p>
        </div>
        <button
          type="button"
          disabled={!isPlatformAdmin || isSaving}
          title={
            !isPlatformAdmin
              ? "Platform administrator access is required."
              : isSaving
                ? "A user change is in progress."
                : undefined
          }
          onClick={onCreate}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add user
        </button>
      </div>

      {message && (
        <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
          {message}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search users"
          className="min-w-0 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <select
          aria-label="User status filter"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value as "all" | "active" | "inactive",
            )
          }
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All users</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">
            {editingUser ? `Edit ${editingUser.displayName}` : "Add user"}
          </h3>
          <label className="block space-y-1 text-sm">
            <span>Display name</span>
            <input
              value={draft.displayName}
              onChange={(event) =>
                onDraftChange({ ...draft, displayName: event.target.value })
              }
              maxLength={120}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          {!editingUser && (
            <>
              {optionsLoading && (
                <ListLoading label="Loading roles and teams…" />
              )}
              {optionsError && (
                <LoadError
                  label="user role and team options"
                  onRetry={onRetryOptions}
                />
              )}
              <label className="block space-y-1 text-sm">
                <span>Email</span>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    onDraftChange({ ...draft, email: event.target.value })
                  }
                  maxLength={320}
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>Initial global role</span>
                <select
                  value={draft.roleId}
                  onChange={(event) =>
                    onDraftChange({ ...draft, roleId: event.target.value })
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="">No global role</option>
                  {roleOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span>Initial team</span>
                <select
                  value={draft.teamId}
                  onChange={(event) =>
                    onDraftChange({ ...draft, teamId: event.target.value })
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="">No team</option>
                  {teamOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) =>
                onDraftChange({ ...draft, isActive: event.target.checked })
              }
            />
            Active account
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={
                isSaving || (!editingUser && (optionsLoading || optionsError))
              }
              title={
                !editingUser && optionsError
                  ? "Reload role and team options before creating a user."
                  : undefined
              }
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {isSaving ? "Saving…" : editingUser ? "Save user" : "Create user"}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={onCloseForm}
              className="rounded-md border px-3 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <ListLoading label="Loading users…" />
      ) : isError ? (
        <LoadError label="users" onRetry={onRetry} />
      ) : visibleUsers.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No users match the current search and filter.
        </p>
      ) : (
        <div className="max-h-[62vh] divide-y overflow-y-auto rounded-lg border">
          {visibleUsers.map((user) => {
            const roles = Array.isArray(user.roleNames) ? user.roleNames : [];
            const teams = Array.isArray(user.teamNames) ? user.teamNames : [];
            return (
              <article
                key={user.id}
                className={`border-l-2 p-3 ${
                  selectedId === user.id
                    ? "border-primary bg-primary/10"
                    : "border-transparent"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selectedId === user.id}
                  onClick={() => onSelect(user)}
                  className="block w-full min-w-0 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{user.displayName}</p>
                    {selectedId === user.id && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {user.email ?? "Email unavailable"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {roles.length > 0 ? roles.join(", ") : "No global role"} ·{" "}
                    {teams.length > 0 ? teams.join(", ") : "No team"} ·{" "}
                    {user.isActive ? "Active" : "Inactive"}
                  </p>
                </button>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    aria-pressed={selectedId === user.id}
                    onClick={() => onSelect(user)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      selectedId === user.id ? "border-primary text-primary" : ""
                    }`}
                  >
                    Manage
                  </button>
                  <button
                    type="button"
                    disabled={!isPlatformAdmin || isSaving}
                    title={
                      !isPlatformAdmin
                        ? "Active platform administrator access is required."
                        : isSaving
                          ? "A user change is in progress."
                          : undefined
                    }
                    onClick={() => onEdit(user)}
                    className="rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled
                    title={DISABLED_TITLE}
                    className="cursor-not-allowed rounded-md border px-3 py-1.5 text-sm opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TeamsSection({
  teams,
  selectedId,
  isLoading,
  isError,
  canManage,
  message,
  showForm,
  editingTeam,
  draft,
  isSaving,
  onRetry,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  onCloseForm,
  onDraftChange,
  onSubmit,
}: {
  teams: TeamSummary[];
  selectedId: string | null;
  isLoading: boolean;
  isError: boolean;
  canManage: boolean;
  message: string | null;
  showForm: boolean;
  editingTeam: TeamSummary | null;
  draft: TeamInput;
  isSaving: boolean;
  onRetry: () => void;
  onSelect: (team: TeamSummary) => void;
  onCreate: () => void;
  onEdit: (team: TeamSummary) => void;
  onDelete: (team: TeamSummary) => void;
  onCloseForm: () => void;
  onDraftChange: (draft: TeamInput) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<
    "all" | "with-members" | "empty"
  >("all");
  const needle = search.trim().toLowerCase();
  const visibleTeams = teams.filter((team) => {
    const memberCount =
      typeof team.memberCount === "number" &&
      Number.isFinite(team.memberCount) &&
      team.memberCount >= 0
        ? team.memberCount
        : 0;
    if (memberFilter === "with-members" && memberCount <= 0) return false;
    if (memberFilter === "empty" && memberCount > 0) return false;
    return [team.name, team.slug, team.description ?? ""].some((value) =>
      value.toLowerCase().includes(needle),
    );
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Teams</h2>
          <p className="text-sm text-muted-foreground">
            Create, update, and delete teams using the existing team API.
          </p>
        </div>
        <button
          type="button"
          disabled={!canManage || isSaving}
          title={
            !canManage
              ? "Platform administrator access is required."
              : isSaving
                ? "A team change is in progress."
                : undefined
          }
          onClick={onCreate}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          New team
        </button>
      </div>

      {message && (
        <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
          {message}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search teams"
          className="min-w-0 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <select
          aria-label="Team membership filter"
          value={memberFilter}
          onChange={(event) =>
            setMemberFilter(
              event.target.value as "all" | "with-members" | "empty",
            )
          }
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All teams</option>
          <option value="with-members">With members</option>
          <option value="empty">Empty teams</option>
        </select>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">
            {editingTeam ? `Edit ${editingTeam.name}` : "New team"}
          </h3>
          <label className="block space-y-1 text-sm">
            <span>Team name</span>
            <input
              value={draft.name}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  name: event.target.value,
                  slug: draft.slug || slugify(event.target.value),
                })
              }
              maxLength={120}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Slug</span>
            <input
              value={draft.slug}
              onChange={(event) =>
                onDraftChange({ ...draft, slug: event.target.value })
              }
              maxLength={80}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Description</span>
            <textarea
              value={draft.description}
              onChange={(event) =>
                onDraftChange({ ...draft, description: event.target.value })
              }
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {isSaving ? "Saving…" : editingTeam ? "Save team" : "Create team"}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={onCloseForm}
              className="rounded-md border px-3 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <ListLoading label="Loading teams…" />
      ) : isError ? (
        <LoadError label="teams" onRetry={onRetry} />
      ) : visibleTeams.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No teams match the current search.
        </p>
      ) : (
        <div className="max-h-[62vh] divide-y overflow-y-auto rounded-lg border">
          {visibleTeams.map((team) => (
            <article
              key={team.id}
              className={`border-l-2 p-3 ${
                selectedId === team.id
                  ? "border-primary bg-primary/10"
                  : "border-transparent"
              }`}
            >
              <button
                type="button"
                aria-pressed={selectedId === team.id}
                onClick={() => onSelect(team)}
                className="block w-full min-w-0 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{team.name}</p>
                  {selectedId === team.id && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      Selected
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {team.description || "No description"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {team.slug} ·{" "}
                  {typeof team.memberCount === "number" &&
                  Number.isFinite(team.memberCount) &&
                  team.memberCount >= 0
                    ? team.memberCount
                    : 0}{" "}
                  members
                </p>
              </button>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  aria-pressed={selectedId === team.id}
                  onClick={() => onSelect(team)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    selectedId === team.id ? "border-primary text-primary" : ""
                  }`}
                >
                  Manage
                </button>
                <button
                  type="button"
                  disabled={!canManage || isSaving}
                  title={
                    !canManage
                      ? "Active platform administrator access is required."
                      : isSaving
                        ? "A team change is in progress."
                        : undefined
                  }
                  onClick={() => onEdit(team)}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={isSaving || !canManage}
                  title={
                    !canManage
                      ? "Active platform administrator access is required."
                      : isSaving
                        ? "A team change is in progress."
                        : undefined
                  }
                  onClick={() => onDelete(team)}
                  className="rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DepartmentsSection({
  workspaces,
  selectedId,
  onSelect,
}: {
  workspaces: IdentityWorkspace[];
  selectedId: string | null;
  onSelect: (workspace: IdentityWorkspace) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const needle = search.trim().toLowerCase();
  const visibleWorkspaces = workspaces.filter((workspace) => {
    if (statusFilter !== "all" && workspace.status !== statusFilter) {
      return false;
    }
    return [workspace.name, workspace.slug, workspace.type, workspace.status].some(
      (value) => value.toLowerCase().includes(needle),
    );
  });
  const statuses = Array.from(
    new Set(workspaces.map((workspace) => workspace.status).filter(Boolean)),
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Departments</h2>
          <p className="text-sm text-muted-foreground">
            Workspaces available in your effective access context.
          </p>
        </div>
        <button
          type="button"
          disabled
          title={DISABLED_TITLE}
          className="cursor-not-allowed rounded-md border px-3 py-2 text-sm font-medium opacity-50"
        >
          New department
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search departments"
          className="min-w-0 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <select
          aria-label="Department status filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {visibleWorkspaces.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No departments match the current search and filter.
        </p>
      ) : (
        <div className="max-h-[62vh] divide-y overflow-y-auto rounded-lg border">
          {visibleWorkspaces.map((workspace) => (
            <article
              key={workspace.id}
              className={`border-l-2 p-3 ${
                selectedId === workspace.id
                  ? "border-primary bg-primary/10"
                  : "border-transparent"
              }`}
            >
              <button
                type="button"
                aria-pressed={selectedId === workspace.id}
                onClick={() => onSelect(workspace)}
                className="block w-full min-w-0 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{workspace.name}</p>
                  {selectedId === workspace.id && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      Selected
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {workspace.slug} · {workspace.type} · {workspace.status}
                </p>
              </button>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  aria-pressed={selectedId === workspace.id}
                  onClick={() => onSelect(workspace)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    selectedId === workspace.id
                      ? "border-primary text-primary"
                      : ""
                  }`}
                >
                  Manage
                </button>
                <button
                  type="button"
                  disabled
                  title={DISABLED_TITLE}
                  className="cursor-not-allowed rounded-md border px-3 py-1.5 text-sm opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled
                  title={DISABLED_TITLE}
                  className="cursor-not-allowed rounded-md border px-3 py-1.5 text-sm opacity-50"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AccessOverrideNotice({
  isLoading,
  isActivated,
  isUnavailable,
}: {
  isLoading: boolean;
  isActivated: boolean;
  isUnavailable: boolean;
}) {
  const statusMessage = isLoading
    ? "Checking access override database activation…"
    : isActivated
      ? "Access override database is activated."
      : isUnavailable
        ? "Access override activation status is unavailable."
        : "Access override database is not activated yet.";
  const statusClass = isActivated
    ? "border-emerald-500/30 bg-emerald-500/5"
    : isUnavailable
      ? "border-destructive/30 bg-destructive/5"
      : isLoading
        ? "border-border bg-muted/30"
        : "border-amber-500/30 bg-amber-500/5";

  return (
    <aside
      role="status"
      className={`space-y-3 rounded-lg border p-4 ${statusClass}`}
    >
      <p className="text-sm font-medium">{statusMessage}</p>
      {isActivated && (
        <p className="text-xs text-muted-foreground">
          Select a subject and use its Permissions or Page Visibility tab to
          manage audited overrides.
        </p>
      )}
    </aside>
  );
}

function ListLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="rounded-md border bg-muted/30 px-4 py-5 text-sm text-muted-foreground"
    >
      <span className="inline-block animate-pulse">{label}</span>
    </div>
  );
}

function LoadError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border border-destructive/30 p-4">
      <p className="text-sm">Could not load {label}.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-md border px-3 py-1.5 text-sm"
      >
        Retry
      </button>
    </div>
  );
}

function normalizeAdminUsers(value: unknown): AdminUser[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) return [];
    const email = typeof item.email === "string" ? item.email : null;
    return [
      {
        id: item.id,
        displayName:
          typeof item.displayName === "string" && item.displayName.trim()
            ? item.displayName
            : email || item.id.slice(0, 8),
        email,
        isActive: item.isActive === true,
        roleKeys: stringArray(item.roleKeys),
        roleNames: stringArray(item.roleNames),
        teamNames: stringArray(item.teamNames),
        createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
      },
    ];
  });
}

function normalizeTeams(value: unknown): TeamSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) return [];
    const memberCount =
      typeof item.memberCount === "number" &&
      Number.isFinite(item.memberCount) &&
      item.memberCount >= 0
        ? item.memberCount
        : 0;
    return [
      {
        id: item.id,
        name:
          typeof item.name === "string" && item.name.trim()
            ? item.name
            : item.id.slice(0, 8),
        slug: typeof item.slug === "string" ? item.slug : "",
        description:
          typeof item.description === "string" ? item.description : null,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
        memberCount,
      },
    ];
  });
}

function normalizeWorkspaces(value: unknown): IdentityWorkspace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) return [];
    const teams = Array.isArray(item.teams)
      ? item.teams.flatMap((team) => {
          if (!isRecord(team) || typeof team.id !== "string" || !team.id) {
            return [];
          }
          return [
            {
              id: team.id,
              name:
                typeof team.name === "string" && team.name.trim()
                  ? team.name
                  : team.id.slice(0, 8),
              slug: typeof team.slug === "string" ? team.slug : null,
            },
          ];
        })
      : [];
    return [
      {
        id: item.id,
        name:
          typeof item.name === "string" && item.name.trim()
            ? item.name
            : item.id.slice(0, 8),
        slug: typeof item.slug === "string" ? item.slug : "",
        status: typeof item.status === "string" ? item.status : "unknown",
        type: typeof item.type === "string" ? item.type : "workspace",
        teams,
      },
    ];
  });
}

function normalizeFormOptions(
  value: unknown,
): Array<{ id: string; name: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    isRecord(item) &&
    typeof item.id === "string" &&
    item.id &&
    typeof item.name === "string" &&
    item.name
      ? [{ id: item.id, name: item.name }]
      : [],
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeMessage(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}
