import { useState, type FormEvent, type ReactNode } from "react";
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
import { adminAccess, adminIdentity } from "@/lib/admin-access/functions";
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

type WorkspaceDraft = {
  name: string;
  slug: string;
  description: string;
  type: string;
  reason: string;
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

const EMPTY_WORKSPACE: WorkspaceDraft = {
  name: "",
  slug: "",
  description: "",
  type: "department",
  reason: "",
};

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
  const [workspaceDraft, setWorkspaceDraft] =
    useState<WorkspaceDraft>(EMPTY_WORKSPACE);
  const [showWorkspaceForm, setShowWorkspaceForm] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);

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
  const identityCatalogQuery = useQuery({
    queryKey: ["admin-identity", "catalog", session?.user?.id ?? ""],
    enabled: canCheckAccessStatus,
    retry: false,
    queryFn: async () => {
      if (!session?.access_token || !session.user?.id) {
        throw new Error("Administrator access is unavailable.");
      }
      return adminIdentity({
        accessToken: session.access_token,
        action: "identity.read",
        subjectType: "user",
        subjectId: session.user.id,
      });
    },
  });

  const users = normalizeAdminUsers(usersQuery.data);
  const teams = normalizeTeams(teamListQuery.data);
  const apiWorkspaces =
    identityCatalogQuery.data?.ok === true
      ? normalizeWorkspaces(identityCatalogQuery.data.snapshot.workspaces)
      : [];
  const workspaces =
    apiWorkspaces.length > 0
      ? apiWorkspaces
      : normalizeWorkspaces(effectiveAccess?.workspaces);
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
  const accessStatusUnavailable =
    !canCheckAccessStatus ||
    accessStatusQuery.isError ||
    (!accessStatusQuery.isLoading && accessStatusResult?.ok === false);
  const subjectCounts: Record<IdentityTab, number> = {
    users: users.length,
    teams: teams.length,
    departments: workspaces.length,
  };
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
  const createWorkspaceMutation = useMutation({
    mutationFn: async (draft: WorkspaceDraft) => {
      if (!session?.access_token || !canManage) throw new Error();
      return adminIdentity({
        accessToken: session.access_token,
        action: "identity.create_workspace",
        name: draft.name.trim(),
        slug: slugify(draft.slug || draft.name).slice(0, 63),
        description: draft.description.trim(),
        workspaceType: draft.type,
        reason: draft.reason.trim(),
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setWorkspaceMessage(result.error || "The department could not be created.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-identity"] });
      setShowWorkspaceForm(false);
      setWorkspaceDraft(EMPTY_WORKSPACE);
      setWorkspaceMessage("Department created successfully.");
    },
    onError: () => setWorkspaceMessage("The department could not be created."),
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
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Administration
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Identity &amp; Access
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Manage people, teams, departments, and effective access from one
              control center.
            </p>
          </div>
          <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
            <HeaderMetric label="Users" value={subjectCounts.users} />
            <HeaderMetric label="Teams" value={subjectCounts.teams} />
            <HeaderMetric
              label="Departments"
              value={subjectCounts.departments}
            />
            <span
              className={`inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[11px] font-medium shadow-sm ${
                accessOverrideActivated
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : accessStatusUnavailable
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  accessOverrideActivated
                    ? "bg-emerald-500"
                    : accessStatusUnavailable
                      ? "bg-destructive"
                      : "bg-amber-500"
                }`}
              />
              {accessStatusQuery.isLoading
                ? "Checking access"
                : accessOverrideActivated
                  ? "Access active"
                  : accessStatusUnavailable
                    ? "Access unavailable"
                    : "Access pending"}
            </span>
          </div>
        </header>

        <section className="overflow-hidden rounded-xl border bg-card/80 text-card-foreground shadow-sm">
          <div className="border-b bg-muted/20 p-2.5">
            <div
              role="tablist"
              aria-label="Access control subjects"
              className="inline-flex max-w-full gap-1 rounded-lg border bg-background/70 p-1"
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
                    className={`whitespace-nowrap rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-border bg-card text-foreground shadow-sm"
                        : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {subjectCounts[tab.id]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid min-w-0 gap-4 min-[900px]:grid-cols-[minmax(270px,0.52fr)_minmax(0,1fr)]">
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
                    canManage={canManage}
                    message={workspaceMessage}
                    showForm={showWorkspaceForm}
                    draft={workspaceDraft}
                    isSaving={createWorkspaceMutation.isPending}
                    onSelect={(workspace) => setSelectedId(workspace.id)}
                    onCreate={() => {
                      setWorkspaceMessage(null);
                      setWorkspaceDraft(EMPTY_WORKSPACE);
                      setShowWorkspaceForm(true);
                    }}
                    onCloseForm={() => setShowWorkspaceForm(false)}
                    onDraftChange={setWorkspaceDraft}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (
                        workspaceDraft.name.trim() &&
                        workspaceDraft.reason.trim().length >= 3
                      ) {
                        createWorkspaceMutation.mutate(workspaceDraft);
                      }
                    }}
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
                  <section className="rounded-xl border border-dashed bg-muted/10 p-8 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border bg-background text-lg font-semibold text-primary shadow-sm">
                      ↗
                    </div>
                    <h2 className="mt-3 text-sm font-semibold">
                      Select a user, team, or department
                    </h2>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                      Choose a user, team, or department to manage overview,
                      assignments, access, and audit history.
                    </p>
                    <div className="mx-auto mt-5 grid max-w-xl gap-2 sm:grid-cols-3">
                      {[
                        ["Review access", "Understand effective permissions"],
                        ["Manage assignments", "Review roles and memberships"],
                        ["Audit changes", "Trace access decisions"],
                      ].map(([title, description]) => (
                        <div
                          key={title}
                          className="rounded-lg border bg-card/50 p-3 text-left"
                        >
                          <p className="text-xs font-medium">{title}</p>
                          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                            {description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>

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
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Users</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Create and update real user accounts.
          </p>
        </div>
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
          onClick={onCreate}
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
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
          className="h-9 min-w-0 rounded-md border bg-background px-3 text-sm shadow-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
        />
        <select
          aria-label="User status filter"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value as "all" | "active" | "inactive",
            )
          }
          className="h-9 rounded-md border bg-background px-3 text-sm shadow-sm outline-none focus:border-primary/50"
        >
          <option value="all">All users</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <DirectorySummary
        total={users.length}
        visible={visibleUsers.length}
        selected={Boolean(
          selectedId && users.some((user) => user.id === selectedId),
        )}
        filterLabel={
          statusFilter === "all"
            ? "All users"
            : statusFilter === "active"
              ? "Active only"
              : "Inactive only"
        }
      />

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
        <div className="max-h-[62vh] divide-y overflow-y-auto rounded-lg border bg-background/50">
          {visibleUsers.map((user) => {
            const roles = Array.isArray(user.roleNames) ? user.roleNames : [];
            const teams = Array.isArray(user.teamNames) ? user.teamNames : [];
            return (
              <article
                key={user.id}
                className={`border-l-2 px-3 py-2.5 ${
                  selectedId === user.id
                    ? "border-primary bg-primary/[0.06]"
                    : "border-transparent hover:bg-muted/30"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={selectedId === user.id}
                  onClick={() => onSelect(user)}
                  className="flex w-full min-w-0 items-start gap-2.5 text-left"
                >
                  <DirectoryAvatar
                    name={user.displayName}
                    selected={selectedId === user.id}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{user.displayName}</p>
                      {selectedId === user.id && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email ?? "Email unavailable"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <MetadataChip tone={user.isActive ? "success" : "muted"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </MetadataChip>
                      <MetadataChip>{roles[0] ?? "No global role"}</MetadataChip>
                      <MetadataChip>{teams[0] ?? "No team"}</MetadataChip>
                      {roles.length + teams.length > 2 && (
                        <MetadataChip>
                          +{roles.length + teams.length - 2}
                        </MetadataChip>
                      )}
                    </div>
                  </div>
                </button>
                {selectedId === user.id && (
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
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
                      className="rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Edit
                    </button>
                  </div>
                )}
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
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Teams</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Create, update, and delete teams using the existing team API.
          </p>
        </div>
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
          onClick={onCreate}
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
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
          className="h-9 min-w-0 rounded-md border bg-background px-3 text-sm shadow-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
        />
        <select
          aria-label="Team membership filter"
          value={memberFilter}
          onChange={(event) =>
            setMemberFilter(
              event.target.value as "all" | "with-members" | "empty",
            )
          }
          className="h-9 rounded-md border bg-background px-3 text-sm shadow-sm outline-none focus:border-primary/50"
        >
          <option value="all">All teams</option>
          <option value="with-members">With members</option>
          <option value="empty">Empty teams</option>
        </select>
      </div>
      <DirectorySummary
        total={teams.length}
        visible={visibleTeams.length}
        selected={Boolean(
          selectedId && teams.some((team) => team.id === selectedId),
        )}
        filterLabel={
          memberFilter === "all"
            ? "All teams"
            : memberFilter === "with-members"
              ? "With members"
              : "Empty teams"
        }
      />

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
        <div className="max-h-[62vh] divide-y overflow-y-auto rounded-lg border bg-background/50">
          {visibleTeams.map((team) => (
            <article
              key={team.id}
              className={`border-l-2 px-3 py-2.5 ${
                selectedId === team.id
                  ? "border-primary bg-primary/[0.06]"
                  : "border-transparent hover:bg-muted/30"
              }`}
            >
              <button
                type="button"
                aria-pressed={selectedId === team.id}
                onClick={() => onSelect(team)}
                className="flex w-full min-w-0 items-start gap-2.5 text-left"
              >
                <DirectoryAvatar
                  name={team.name}
                  selected={selectedId === team.id}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{team.name}</p>
                    {selectedId === team.id && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {team.description || "No description"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <MetadataChip>{team.slug || "No slug"}</MetadataChip>
                    <MetadataChip>
                      {typeof team.memberCount === "number" &&
                      Number.isFinite(team.memberCount) &&
                      team.memberCount >= 0
                        ? team.memberCount
                        : 0}{" "}
                      members
                    </MetadataChip>
                  </div>
                </div>
              </button>
              {selectedId === team.id && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
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
                    className="rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              )}
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
  canManage,
  message,
  showForm,
  draft,
  isSaving,
  onSelect,
  onCreate,
  onCloseForm,
  onDraftChange,
  onSubmit,
}: {
  workspaces: IdentityWorkspace[];
  selectedId: string | null;
  canManage: boolean;
  message: string | null;
  showForm: boolean;
  draft: WorkspaceDraft;
  isSaving: boolean;
  onSelect: (workspace: IdentityWorkspace) => void;
  onCreate: () => void;
  onCloseForm: () => void;
  onDraftChange: (draft: WorkspaceDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
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
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Departments</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Workspaces available in your effective access context.
          </p>
        </div>
        <button
          type="button"
          disabled={!canManage || isSaving}
          title={
            !canManage
              ? "Active platform administrator access is required."
              : isSaving
                ? "A department change is in progress."
                : undefined
          }
          onClick={onCreate}
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          New department
        </button>
      </div>
      {message && (
        <p role="status" className="rounded-md border bg-muted/30 p-2 text-xs">
          {message}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search departments"
          className="h-9 min-w-0 rounded-md border bg-background px-3 text-sm shadow-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
        />
        <select
          aria-label="Department status filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm shadow-sm outline-none focus:border-primary/50"
        >
          <option value="all">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      <DirectorySummary
        total={workspaces.length}
        visible={visibleWorkspaces.length}
        selected={Boolean(
          selectedId &&
            workspaces.some((workspace) => workspace.id === selectedId),
        )}
        filterLabel={
          statusFilter === "all" ? "All statuses" : statusFilter
        }
      />
      {showForm && (
        <form onSubmit={onSubmit} className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">New department</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={draft.name}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  name: event.target.value,
                  slug: draft.slug || slugify(event.target.value).slice(0, 63),
                })
              }
              placeholder="Name"
              maxLength={160}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            />
            <input
              value={draft.slug}
              onChange={(event) =>
                onDraftChange({ ...draft, slug: event.target.value })
              }
              placeholder="Slug"
              maxLength={63}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            />
            <input
              value={draft.description}
              onChange={(event) =>
                onDraftChange({ ...draft, description: event.target.value })
              }
              placeholder="Description"
              maxLength={2000}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            />
            <select
              value={draft.type}
              onChange={(event) =>
                onDraftChange({ ...draft, type: event.target.value })
              }
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {["department", "project", "service", "partner", "management", "system"].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
          <input
            value={draft.reason}
            onChange={(event) =>
              onDraftChange({ ...draft, reason: event.target.value })
            }
            placeholder="Audit reason required"
            maxLength={500}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={
                isSaving ||
                !draft.name.trim() ||
                !draft.slug.trim() ||
                draft.reason.trim().length < 3
              }
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {isSaving ? "Creating…" : "Create department"}
            </button>
            <button type="button" disabled={isSaving} onClick={onCloseForm} className="rounded-md border px-3 py-1.5 text-xs">
              Cancel
            </button>
          </div>
        </form>
      )}

      {visibleWorkspaces.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No departments match the current search and filter.
        </p>
      ) : (
        <div className="max-h-[62vh] divide-y overflow-y-auto rounded-lg border bg-background/50">
          {visibleWorkspaces.map((workspace) => (
            <article
              key={workspace.id}
              className={`border-l-2 px-3 py-2.5 ${
                selectedId === workspace.id
                  ? "border-primary bg-primary/[0.06]"
                  : "border-transparent hover:bg-muted/30"
              }`}
            >
              <button
                type="button"
                aria-pressed={selectedId === workspace.id}
                onClick={() => onSelect(workspace)}
                className="flex w-full min-w-0 items-start gap-2.5 text-left"
              >
                <DirectoryAvatar
                  name={workspace.name}
                  selected={selectedId === workspace.id}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{workspace.name}</p>
                    {selectedId === workspace.id && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {workspace.slug || "No slug"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <MetadataChip>{workspace.type}</MetadataChip>
                    <MetadataChip
                      tone={
                        workspace.status === "active" ? "success" : "muted"
                      }
                    >
                      {workspace.status}
                    </MetadataChip>
                  </div>
                </div>
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function HeaderMetric({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card/70 px-2.5 text-[11px] text-muted-foreground shadow-sm">
      {label}
      <strong className="font-semibold text-foreground">{value}</strong>
    </span>
  );
}

function DirectorySummary({
  total,
  visible,
  selected,
  filterLabel,
}: {
  total: number;
  visible: number;
  selected: boolean;
  filterLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/20 px-2.5 py-1.5 text-[10px] text-muted-foreground">
      <span>
        <strong className="font-semibold text-foreground">{visible}</strong> of{" "}
        {total}
      </span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>{filterLabel}</span>
      <span className="ml-auto inline-flex items-center gap-1">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            selected ? "bg-primary" : "bg-muted-foreground/40"
          }`}
        />
        {selected ? "1 selected" : "None selected"}
      </span>
    </div>
  );
}

function DirectoryAvatar({
  name,
  selected,
}: {
  name: string;
  selected: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold ${
        selected
          ? "border-primary/30 bg-primary/10 text-primary"
          : "bg-muted/30 text-muted-foreground"
      }`}
    >
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

function MetadataChip({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "muted";
}) {
  return (
    <span
      className={`max-w-full truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
        tone === "success"
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : tone === "muted"
            ? "border-transparent bg-muted text-muted-foreground"
            : "border-border/70 bg-background/60 text-muted-foreground"
      }`}
    >
      {children}
    </span>
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
