import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAdminUser,
  updateAdminUser,
} from "@/lib/admin-users/create-user";
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
const ACCESS_DISABLED_TITLE = "Access editing is not available yet.";

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

  const users = Array.isArray(usersQuery.data) ? usersQuery.data : [];
  const teams = Array.isArray(teamListQuery.data) ? teamListQuery.data : [];
  const workspaces = Array.isArray(effectiveAccess?.workspaces)
    ? effectiveAccess.workspaces
    : [];
  const roleOptions = Array.isArray(userOptionsQuery.data?.roles)
    ? userOptionsQuery.data.roles
    : [];
  const teamOptions = Array.isArray(userOptionsQuery.data?.teams)
    ? userOptionsQuery.data.teams
    : [];
  const canManage = Boolean(session?.user && isPlatformAdmin);
  const accessStatusResult = accessStatusQuery.data;
  const accessSnapshot =
    accessStatusResult?.ok === true &&
    accessStatusResult.snapshot &&
    typeof accessStatusResult.snapshot === "object"
      ? accessStatusResult.snapshot
      : null;
  const accessOverrideActivated = accessSnapshot?.available === true;

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
        setUserMessage(result.error);
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
        setUserMessage(result.error);
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
    if (!window.confirm(`Delete team "${team.name}"? This cannot be undone.`)) {
      return;
    }
    deleteTeamMutation.mutate(team.id);
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
                    onClick={() => setActiveTab(tab.id)}
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
            {activeTab === "users" && (
              <UsersSection
                users={users}
                isLoading={usersQuery.isLoading}
                isError={usersQuery.isError}
                isPlatformAdmin={isPlatformAdmin}
                message={userMessage}
                showForm={showUserForm}
                editingUser={editingUser}
                draft={userDraft}
                roleOptions={roleOptions}
                teamOptions={teamOptions}
                isSaving={
                  createUserMutation.isPending || updateUserMutation.isPending
                }
                onRetry={() => usersQuery.refetch()}
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
              <DepartmentsSection workspaces={workspaces} />
            )}

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
  isLoading,
  isError,
  isPlatformAdmin,
  message,
  showForm,
  editingUser,
  draft,
  roleOptions,
  teamOptions,
  isSaving,
  onRetry,
  onCreate,
  onEdit,
  onCloseForm,
  onDraftChange,
  onSubmit,
}: {
  users: AdminUser[];
  isLoading: boolean;
  isError: boolean;
  isPlatformAdmin: boolean;
  message: string | null;
  showForm: boolean;
  editingUser: AdminUser | null;
  draft: UserDraft;
  roleOptions: Array<{ id: string; name: string }>;
  teamOptions: Array<{ id: string; name: string }>;
  isSaving: boolean;
  onRetry: () => void;
  onCreate: () => void;
  onEdit: (user: AdminUser) => void;
  onCloseForm: () => void;
  onDraftChange: (draft: UserDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
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
          disabled={!isPlatformAdmin}
          title={!isPlatformAdmin ? "Platform administrator access is required." : undefined}
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
              disabled={isSaving}
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
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : isError ? (
        <LoadError label="users" onRetry={onRetry} />
      ) : users.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No users are available.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {users.map((user) => {
            const roles = Array.isArray(user.roleNames) ? user.roleNames : [];
            const teams = Array.isArray(user.teamNames) ? user.teamNames : [];
            return (
              <article
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{user.displayName}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {user.email ?? "Email unavailable"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {roles.length > 0 ? roles.join(", ") : "No global role"} ·{" "}
                    {teams.length > 0 ? teams.join(", ") : "No team"} ·{" "}
                    {user.isActive ? "Active" : "Inactive"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!isPlatformAdmin}
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
  isLoading,
  isError,
  canManage,
  message,
  showForm,
  editingTeam,
  draft,
  isSaving,
  onRetry,
  onCreate,
  onEdit,
  onDelete,
  onCloseForm,
  onDraftChange,
  onSubmit,
}: {
  teams: TeamSummary[];
  isLoading: boolean;
  isError: boolean;
  canManage: boolean;
  message: string | null;
  showForm: boolean;
  editingTeam: TeamSummary | null;
  draft: TeamInput;
  isSaving: boolean;
  onRetry: () => void;
  onCreate: () => void;
  onEdit: (team: TeamSummary) => void;
  onDelete: (team: TeamSummary) => void;
  onCloseForm: () => void;
  onDraftChange: (draft: TeamInput) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
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
          disabled={!canManage}
          title={!canManage ? "Platform administrator access is required." : undefined}
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
        <p className="text-sm text-muted-foreground">Loading teams…</p>
      ) : isError ? (
        <LoadError label="teams" onRetry={onRetry} />
      ) : teams.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No teams are available.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {teams.map((team) => (
            <article
              key={team.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{team.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {team.description || "No description"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {team.slug} · {team.memberCount} members
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => onEdit(team)}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={isSaving || !canManage}
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
}: {
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    type: string;
  }>;
}) {
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

      {workspaces.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No departments are available.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {workspaces.map((workspace) => (
            <article
              key={workspace.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{workspace.name}</p>
                <p className="text-sm text-muted-foreground">
                  {workspace.slug} · {workspace.type} · {workspace.status}
                </p>
              </div>
              <div className="flex gap-2">
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

  return (
    <aside className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="text-sm font-medium">{statusMessage}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled
          title={ACCESS_DISABLED_TITLE}
          className="cursor-not-allowed rounded-md border px-3 py-2 text-sm opacity-50"
        >
          Edit permissions
        </button>
        <button
          type="button"
          disabled
          title={ACCESS_DISABLED_TITLE}
          className="cursor-not-allowed rounded-md border px-3 py-2 text-sm opacity-50"
        >
          Edit page visibility
        </button>
      </div>
    </aside>
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
