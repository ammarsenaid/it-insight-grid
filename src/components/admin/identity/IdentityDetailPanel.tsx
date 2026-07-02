import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminAccess, adminIdentity } from "@/lib/admin-access/functions";
import type {
  AccessAuditEntry,
  AccessDecision,
  AccessOverrideEffect,
  AccessResourceType,
  AccessSubjectType,
  IdentityAdminSnapshot,
  IdentityAdminAuditEntry,
} from "@/lib/admin-access/types";
import { adminUsersKeys } from "@/lib/admin-users/queries";
import type { AdminUser } from "@/lib/admin-users/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  profilesQuery,
  teamMembersQuery,
  teamRolesQuery,
  teamsKeys,
} from "@/lib/teams/queries";
import {
  addTeamMember,
  removeTeamMember,
  setTeamMemberRole,
} from "@/lib/teams/teams";
import type {
  ProfileOption,
  TeamMember,
  TeamRoleOption,
  TeamSummary,
} from "@/lib/teams/types";

export interface IdentityWorkspace {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  teams: Array<{ id: string; name: string; slug: string | null }>;
}

export type IdentitySubject =
  | { type: "user"; id: string; name: string; value: AdminUser }
  | { type: "team"; id: string; name: string; value: TeamSummary }
  | { type: "workspace"; id: string; name: string; value: IdentityWorkspace };

type DetailTab =
  | "overview"
  | "assignments"
  | "permissions"
  | "visibility"
  | "effective"
  | "audit";

const detailTabs: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "assignments", label: "Assignments" },
  { id: "permissions", label: "Permissions" },
  { id: "visibility", label: "Visibility" },
  { id: "effective", label: "Effective" },
  { id: "audit", label: "Audit" },
];

export function IdentityDetailPanel({
  subject,
  activationConfirmed,
  canManage,
  managementPending,
  onEditUser,
  onToggleUser,
  onEditTeam,
  onDeleteTeam,
}: {
  subject: IdentitySubject;
  activationConfirmed: boolean;
  canManage: boolean;
  managementPending: boolean;
  onEditUser: (user: AdminUser) => void;
  onToggleUser: (user: AdminUser) => void;
  onEditTeam: (team: TeamSummary) => void;
  onDeleteTeam: (team: TeamSummary) => void;
}) {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const canReadAccess = Boolean(
    session?.access_token && canManage && subject.id,
  );
  const accessQueryKey = [
    "admin-access",
    "snapshot",
    subject.type,
    subject.id,
  ] as const;
  const accessQuery = useQuery({
    queryKey: accessQueryKey,
    enabled: canReadAccess,
    retry: false,
    queryFn: async () => {
      if (!session?.access_token) {
        throw new Error("Administrator access is unavailable.");
      }
      return adminAccess({
        accessToken: session.access_token,
        action: "read",
        subjectType: subject.type,
        subjectId: subject.id,
      });
    },
  });
  const identityQueryKey = [
    "admin-identity",
    subject.type,
    subject.id,
  ] as const;
  const identityQuery = useQuery({
    queryKey: identityQueryKey,
    enabled: canReadAccess && subject.type !== "team",
    retry: false,
    queryFn: async () => {
      if (!session?.access_token || subject.type === "team") {
        throw new Error("Identity administration is unavailable.");
      }
      return adminIdentity({
        accessToken: session.access_token,
        action: "identity.read",
        subjectType: subject.type,
        subjectId: subject.id,
      });
    },
  });
  const identitySnapshot =
    identityQuery.data?.ok === true ? identityQuery.data.snapshot : null;

  const result = accessQuery.data;
  const snapshot =
    result?.ok === true &&
    isRecord(result.snapshot) &&
    typeof result.snapshot.available === "boolean"
      ? result.snapshot
      : null;
  const permissions = Array.isArray(snapshot?.permissions)
    ? snapshot.permissions.filter(isAccessDecision)
    : [];
  const routes = Array.isArray(snapshot?.routes)
    ? snapshot.routes.filter(isAccessDecision)
    : [];
  const audit = Array.isArray(snapshot?.audit)
    ? snapshot.audit.filter(isAccessAuditEntry)
    : [];
  const accessAvailable =
    activationConfirmed && snapshot?.available === true && canManage;
  const accessDisabledReason = !canManage
    ? "Active platform administrator access is required."
    : !activationConfirmed
      ? "Access override database activation is required."
      : "Access configuration is unavailable for this subject.";
  const accessError =
    !canReadAccess ||
    accessQuery.isError ||
    (!accessQuery.isLoading &&
      result !== undefined &&
      (result.ok === false || snapshot === null));

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-background shadow-sm">
      <header className="flex min-w-0 flex-wrap items-center gap-3 border-b bg-gradient-to-r from-muted/50 to-transparent px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background text-sm font-semibold text-primary shadow-sm">
          {subject.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="mr-auto min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {subject.type === "workspace" ? "Department" : subject.type}
          </p>
          <h2 className="truncate text-lg font-semibold leading-tight">
            {subject.name}
          </h2>
          <div className="mt-1 flex flex-wrap gap-1">
            {subject.type === "user" && (
              <SubjectStatusChip
                tone={subject.value.isActive ? "success" : "muted"}
              >
                {subject.value.isActive ? "Active" : "Inactive"}
              </SubjectStatusChip>
            )}
            {subject.type === "team" && (
              <SubjectStatusChip>
                {subject.value.memberCount ?? 0} members
              </SubjectStatusChip>
            )}
            {subject.type === "workspace" && (
              <>
                <SubjectStatusChip
                  tone={
                    subject.value.status === "active" ? "success" : "muted"
                  }
                >
                  {subject.value.status}
                </SubjectStatusChip>
                <SubjectStatusChip>{subject.value.type}</SubjectStatusChip>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {subject.type === "user" && (
            <>
              <ActionButton
                disabled={!canManage || managementPending}
                disabledReason={
                  !canManage
                    ? "Active platform administrator access is required."
                    : "A user change is in progress."
                }
                onClick={() => onEditUser(subject.value)}
              >
                Edit
              </ActionButton>
              <ActionButton
                disabled={!canManage || managementPending}
                disabledReason={
                  !canManage
                    ? "Active platform administrator access is required."
                    : "A user change is in progress."
                }
                onClick={() => onToggleUser(subject.value)}
              >
                {subject.value.isActive ? "Deactivate" : "Activate"}
              </ActionButton>
              <DisabledAction>Delete</DisabledAction>
            </>
          )}
          {subject.type === "team" && (
            <>
              <ActionButton
                disabled={!canManage || managementPending}
                disabledReason={
                  !canManage
                    ? "Active platform administrator access is required."
                    : "A team change is in progress."
                }
                onClick={() => onEditTeam(subject.value)}
              >
                Edit
              </ActionButton>
              <ActionButton
                disabled={!canManage || managementPending}
                disabledReason={
                  !canManage
                    ? "Active platform administrator access is required."
                    : "A team change is in progress."
                }
                destructive
                onClick={() => onDeleteTeam(subject.value)}
              >
                Delete
              </ActionButton>
            </>
          )}
        </div>
      </header>

      <div
        role="tablist"
        aria-label={`${subject.name} management`}
        className="grid grid-cols-2 gap-1 border-b bg-muted/10 p-2 sm:grid-cols-3 min-[900px]:grid-cols-6"
      >
        {detailTabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              className={`min-w-0 rounded-md border px-2 py-1.5 text-center text-[11px] font-medium leading-tight ${
                selected
                  ? "border-primary/30 bg-primary/10 text-primary shadow-sm"
                  : "border-transparent bg-background/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-w-0 p-3.5">
        {activeTab === "overview" && (
          <OverviewPanel
            subject={subject}
            canManage={canManage}
            identitySnapshot={identitySnapshot}
            identityQueryKey={identityQueryKey}
          />
        )}

        {activeTab === "assignments" && (
          <AssignmentsPanel
            subject={subject}
            canManage={canManage}
            snapshot={identitySnapshot}
            isLoading={identityQuery.isLoading}
            isError={identityQuery.isError || identityQuery.data?.ok === false}
            queryKey={identityQueryKey}
            onRetry={() => identityQuery.refetch()}
          />
        )}

        {(activeTab === "permissions" || activeTab === "visibility") && (
          <AccessDecisionPanel
            key={activeTab}
            subject={subject}
            resourceType={
              activeTab === "permissions" ? "permission" : "route"
            }
            decisions={activeTab === "permissions" ? permissions : routes}
            queryKey={accessQueryKey}
            isLoading={accessQuery.isLoading}
            isError={accessError}
            canEdit={accessAvailable}
            disabledReason={accessDisabledReason}
            onRetry={() => accessQuery.refetch()}
          />
        )}

        {activeTab === "effective" && (
          <EffectiveAccessPanel
            permissions={permissions}
            routes={routes}
            warning={
              !activationConfirmed
                ? "Access override activation was not confirmed."
                : typeof snapshot?.warning === "string"
                  ? snapshot.warning
                  : null
            }
            isLoading={accessQuery.isLoading}
            isError={accessError}
            onRetry={() => accessQuery.refetch()}
          />
        )}

        {activeTab === "audit" && (
          <AuditPanel
            entries={audit}
            identityEntries={
              Array.isArray(identitySnapshot?.audit)
                ? identitySnapshot.audit
                : []
            }
            isLoading={accessQuery.isLoading}
            isError={accessError}
            onRetry={() => accessQuery.refetch()}
          />
        )}
      </div>
    </section>
  );
}

function OverviewPanel({
  subject,
  canManage,
  identitySnapshot,
  identityQueryKey,
}: {
  subject: IdentitySubject;
  canManage: boolean;
  identitySnapshot: IdentityAdminSnapshot | null;
  identityQueryKey: readonly unknown[];
}) {
  if (subject.type === "user") {
    const user = subject.value;
    const roles = Array.isArray(user.roleNames) ? user.roleNames : [];
    const teams = Array.isArray(user.teamNames) ? user.teamNames : [];
    return (
      <div className="space-y-3">
        <DefinitionGrid
          rows={[
            ["Email", user.email ?? "Unavailable"],
            ["Status", user.isActive ? "Active" : "Inactive"],
            ["Roles", roles.length > 0 ? roles.join(", ") : "No global role"],
            ["Teams", teams.length > 0 ? teams.join(", ") : "No team"],
          ]}
        />
      </div>
    );
  }

  if (subject.type === "team") {
    const team = subject.value;
    return (
      <div className="space-y-3">
        <DefinitionGrid
          rows={[
            ["Slug", team.slug || "Unavailable"],
            ["Members", String(team.memberCount ?? 0)],
            ["Description", team.description || "No description"],
          ]}
        />
      </div>
    );
  }

  const workspace = subject.value;
  return (
    <div className="space-y-3">
      <DefinitionGrid
        rows={[
          ["Slug", workspace.slug || "Unavailable"],
          ["Type", workspace.type || "Unavailable"],
          ["Status", workspace.status || "Unavailable"],
        ]}
      />
      <WorkspaceManagementPanel
        workspace={workspace}
        canManage={canManage}
        snapshot={identitySnapshot}
        queryKey={identityQueryKey}
      />
    </div>
  );
}

function AssignmentsPanel({
  subject,
  canManage,
  snapshot,
  isLoading,
  isError,
  queryKey,
  onRetry,
}: {
  subject: IdentitySubject;
  canManage: boolean;
  snapshot: IdentityAdminSnapshot | null;
  isLoading: boolean;
  isError: boolean;
  queryKey: readonly unknown[];
  onRetry: () => void;
}) {
  if (subject.type === "team") {
    return <TeamAssignmentsPanel team={subject.value} canManage={canManage} />;
  }

  if (subject.type === "user") {
    return (
      <UserAssignmentsPanel
        user={subject.value}
        canManage={canManage}
        snapshot={snapshot}
        isLoading={isLoading}
        isError={isError}
        queryKey={queryKey}
        onRetry={onRetry}
      />
    );
  }

  return (
    <WorkspaceAssignmentsPanel
      workspace={subject.value}
      canManage={canManage}
      snapshot={snapshot}
      isLoading={isLoading}
      isError={isError}
      queryKey={queryKey}
      onRetry={onRetry}
    />
  );
}

function UserAssignmentsPanel({
  user,
  canManage,
  snapshot,
  isLoading,
  isError,
  queryKey,
  onRetry,
}: {
  user: AdminUser;
  canManage: boolean;
  snapshot: IdentityAdminSnapshot | null;
  isLoading: boolean;
  isError: boolean;
  queryKey: readonly unknown[];
  onRetry: () => void;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [globalRole, setGlobalRole] = useState<string | null>(null);
  const [teamId, setTeamId] = useState("");
  const [teamRole, setTeamRole] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const platformRoles = Array.isArray(snapshot?.platformRoles)
    ? snapshot.platformRoles
    : [];
  const teamRoles = Array.isArray(snapshot?.teamRoles) ? snapshot.teamRoles : [];
  const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : [];
  const assignments = Array.isArray(snapshot?.teamAssignments)
    ? snapshot.teamAssignments
    : [];
  const selectedGlobalRole = globalRole ?? snapshot?.globalRoleKey ?? "";
  const globalRoleChanged =
    globalRole !== null && globalRole !== (snapshot?.globalRoleKey ?? "");
  const mutation = useMutation({
    mutationFn: async (
      change:
        | { kind: "global"; roleKey: string | null }
        | { kind: "team"; teamId: string; roleKey: string | null },
    ) => {
      if (!session?.access_token || !canManage || reason.trim().length < 3) {
        throw new Error("A valid administrator session and audit reason are required.");
      }
      return adminIdentity(
        change.kind === "global"
          ? {
              accessToken: session.access_token,
              action: "identity.set_global_role",
              userId: user.id,
              roleKey: change.roleKey,
              reason: reason.trim(),
            }
          : {
              accessToken: session.access_token,
              action: "identity.set_team_assignment",
              userId: user.id,
              teamId: change.teamId,
              roleKey: change.roleKey,
              reason: reason.trim(),
            },
      );
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setMessage(result.error || "The assignment could not be saved.");
        return;
      }
      setMessage("Assignment saved.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey, exact: true }),
        queryClient.invalidateQueries({ queryKey: adminUsersKeys.all }),
        queryClient.invalidateQueries({ queryKey: teamsKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["admin-access"] }),
      ]);
    },
    onError: () => setMessage("The assignment could not be saved."),
  });

  if (isLoading) return <LoadingState label="Loading user assignments…" />;
  if (isError || !snapshot) {
    return <InlineError message="User assignments could not be loaded." onRetry={onRetry} />;
  }
  const disabled = !canManage || mutation.isPending || reason.trim().length < 3;
  const disabledReason = !canManage
    ? "Active platform administrator access is required."
    : mutation.isPending
      ? "An assignment change is in progress."
      : "Enter an audit reason of at least three characters.";

  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-xs">
        <span className="font-medium">Audit reason</span>
        <input
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          placeholder="Required for assignment changes"
        />
      </label>
      {message && <p role="status" className="rounded-md border bg-muted/30 p-2 text-xs">{message}</p>}
      <section className="space-y-2 rounded-lg border p-3">
        <p className="text-xs font-semibold">Global role</p>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <select
            value={selectedGlobalRole}
            onChange={(event) => setGlobalRole(event.target.value)}
            className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">No global role</option>
            {platformRoles.map((role) => <option key={role.id} value={role.key}>{role.name}</option>)}
          </select>
          <ActionButton
            disabled={disabled || !globalRoleChanged}
            disabledReason={
              !globalRoleChanged ? "Select a different global role." : disabledReason
            }
            onClick={() => mutation.mutate({ kind: "global", roleKey: selectedGlobalRole || null })}
          >
            Save role
          </ActionButton>
        </div>
      </section>
      <section className="space-y-2 rounded-lg border p-3">
        <p className="text-xs font-semibold">Add or change team assignment</p>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm">
            <option value="">Select team</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <select value={teamRole} onChange={(event) => setTeamRole(event.target.value)} className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm">
            <option value="">Select role</option>
            {teamRoles.map((role) => <option key={role.id} value={role.key}>{role.name}</option>)}
          </select>
          <ActionButton
            disabled={disabled || !teamId || !teamRole}
            disabledReason={!teamId || !teamRole ? "Select a team and role." : disabledReason}
            onClick={() => mutation.mutate({ kind: "team", teamId, roleKey: teamRole })}
          >
            Apply
          </ActionButton>
        </div>
        <div className="divide-y rounded-md border">
          {assignments.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No active team assignments.</p>
          ) : assignments.map((assignment) => (
            <div key={assignment.teamId} className="flex flex-wrap items-center gap-2 p-2">
              <div className="mr-auto min-w-0">
                <p className="truncate text-sm font-medium">{assignment.teamName}</p>
                <p className="text-xs text-muted-foreground">{assignment.roleName || "No team role"}</p>
              </div>
              <ActionButton
                destructive
                disabled={disabled}
                disabledReason={disabledReason}
                onClick={() => mutation.mutate({ kind: "team", teamId: assignment.teamId, roleKey: null })}
              >
                Remove
              </ActionButton>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function WorkspaceAssignmentsPanel({
  workspace,
  canManage,
  snapshot,
  isLoading,
  isError,
  queryKey,
  onRetry,
}: {
  workspace: IdentityWorkspace;
  canManage: boolean;
  snapshot: IdentityAdminSnapshot | null;
  isLoading: boolean;
  isError: boolean;
  queryKey: readonly unknown[];
  onRetry: () => void;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const profiles = Array.isArray(snapshot?.profiles) ? snapshot.profiles : [];
  const roles = Array.isArray(snapshot?.workspaceRoles) ? snapshot.workspaceRoles : [];
  const members = Array.isArray(snapshot?.workspaceMembers) ? snapshot.workspaceMembers : [];
  const mutation = useMutation({
    mutationFn: async ({ memberUserId, nextRole }: { memberUserId: string; nextRole: string | null }) => {
      if (!session?.access_token || !canManage || reason.trim().length < 3) throw new Error();
      return adminIdentity({
        accessToken: session.access_token,
        action: "identity.set_workspace_member",
        workspaceId: workspace.id,
        userId: memberUserId,
        roleKey: nextRole,
        reason: reason.trim(),
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setMessage(result.error || "The workspace membership could not be saved.");
        return;
      }
      setMessage("Workspace membership saved.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey, exact: true }),
        queryClient.invalidateQueries({ queryKey: ["admin-access"] }),
      ]);
    },
    onError: () => setMessage("The workspace membership could not be saved."),
  });
  if (isLoading) return <LoadingState label="Loading workspace members…" />;
  if (isError || !snapshot) return <InlineError message="Workspace members could not be loaded." onRetry={onRetry} />;
  const disabled = !canManage || mutation.isPending || reason.trim().length < 3;
  const disabledReason = !canManage
    ? "Active platform administrator access is required."
    : mutation.isPending ? "A membership change is in progress." : "Enter an audit reason of at least three characters.";
  return (
    <div className="space-y-3">
      <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Audit reason required" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
      {message && <p role="status" className="rounded-md border bg-muted/30 p-2 text-xs">{message}</p>}
      <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]">
        <select value={userId} onChange={(event) => setUserId(event.target.value)} className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm">
          <option value="">Select user</option>
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
        <select value={roleKey} onChange={(event) => setRoleKey(event.target.value)} className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm">
          <option value="">Select workspace role</option>
          {roles.map((role) => <option key={role.id} value={role.key}>{role.name}</option>)}
        </select>
        <ActionButton disabled={disabled || !userId || !roleKey} disabledReason={!userId || !roleKey ? "Select a user and workspace role." : disabledReason} onClick={() => mutation.mutate({ memberUserId: userId, nextRole: roleKey })}>Add member</ActionButton>
      </div>
      <div className="divide-y rounded-lg border">
        {members.length === 0 ? <p className="p-4 text-xs text-muted-foreground">No workspace members.</p> : members.map((member) => (
          <div key={member.userId} className="flex flex-wrap items-center gap-2 p-2.5">
            <div className="mr-auto min-w-0">
              <p className="truncate text-sm font-medium">{member.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{member.roleName || "No workspace role"} · {member.status}</p>
            </div>
            <select
              value={member.roleKey ?? ""}
              disabled={disabled}
              onChange={(event) => mutation.mutate({ memberUserId: member.userId, nextRole: event.target.value })}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="" disabled>Select role</option>
              {roles.map((role) => <option key={role.id} value={role.key}>{role.name}</option>)}
            </select>
            <ActionButton destructive disabled={disabled} disabledReason={disabledReason} onClick={() => mutation.mutate({ memberUserId: member.userId, nextRole: null })}>Remove</ActionButton>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkspaceManagementPanel({
  workspace,
  canManage,
  snapshot,
  queryKey,
}: {
  workspace: IdentityWorkspace;
  canManage: boolean;
  snapshot: IdentityAdminSnapshot | null;
  queryKey: readonly unknown[];
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const fullWorkspace = Array.isArray(snapshot?.workspaces)
    ? snapshot.workspaces.find((item) => item.id === workspace.id)
    : null;
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [description, setDescription] = useState(fullWorkspace?.description ?? "");
  const [type, setType] = useState(workspace.type || "department");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    setName(workspace.name);
    setSlug(workspace.slug);
    setDescription(fullWorkspace?.description ?? "");
    setType(workspace.type || "department");
  }, [
    fullWorkspace?.description,
    workspace.id,
    workspace.name,
    workspace.slug,
    workspace.type,
  ]);
  const persistedStatus =
    workspace.status === "suspended" || workspace.status === "archived"
      ? workspace.status
      : "active";
  const mutation = useMutation({
    mutationFn: async (status: "active" | "suspended" | "archived") => {
      if (!session?.access_token || !canManage || reason.trim().length < 3) throw new Error();
      return adminIdentity({
        accessToken: session.access_token,
        action: "identity.update_workspace",
        workspaceId: workspace.id,
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
        workspaceType: type,
        status,
        reason: reason.trim(),
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setMessage(result.error || "The department could not be updated.");
        return;
      }
      setMessage("Department updated.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey, exact: true }),
        queryClient.invalidateQueries({ queryKey: ["admin-identity"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-access"] }),
      ]);
    },
    onError: () => setMessage("The department could not be updated."),
  });
  const disabled = !canManage || mutation.isPending || reason.trim().length < 3 || !name.trim() || !slug.trim();
  const disabledReason = !canManage ? "Active platform administrator access is required." : "Complete the fields and enter an audit reason.";
  return (
    <section className="space-y-2 rounded-lg border p-3">
      <p className="text-xs font-semibold">Department management</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="h-9 rounded-md border bg-background px-2 text-sm" />
        <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="Slug" className="h-9 rounded-md border bg-background px-2 text-sm" />
        <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="h-9 rounded-md border bg-background px-2 text-sm" />
        <select value={type} onChange={(event) => setType(event.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
          {["department", "project", "service", "partner", "management", "system"].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Audit reason required" className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <ActionButton disabled={disabled} disabledReason={disabledReason} onClick={() => mutation.mutate(persistedStatus)}>{mutation.isPending ? "Saving…" : "Save department"}</ActionButton>
        <ActionButton destructive disabled={disabled || workspace.status === "archived"} disabledReason={workspace.status === "archived" ? "Department is already archived." : disabledReason} onClick={() => mutation.mutate("archived")}>Archive</ActionButton>
      </div>
    </section>
  );
}

function TeamAssignmentsPanel({
  team,
  canManage,
}: {
  team: TeamSummary;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const assignmentInFlight = useRef(false);
  const [userId, setUserId] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const membersQuery = useQuery(teamMembersQuery(team.id));
  const rolesQuery = useQuery(teamRolesQuery());
  const profilesQueryResult = useQuery(profilesQuery());
  const members = normalizeTeamMembers(membersQuery.data);
  const roles = normalizeTeamRoles(rolesQuery.data);
  const profiles = normalizeProfiles(profilesQueryResult.data);
  const memberIds = new Set(members.map((member) => member.userId));
  const availableProfiles = profiles.filter(
    (profile) => !memberIds.has(profile.id),
  );
  const selectedRole =
    roleKey || (roles.length > 0 ? roles[0]?.roleKey ?? "" : "");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: teamsKeys.members(team.id) });
    queryClient.invalidateQueries({ queryKey: teamsKeys.list() });
  }

  function beginAssignmentMutation(): boolean {
    if (assignmentInFlight.current) return false;
    assignmentInFlight.current = true;
    return true;
  }

  const addMutation = useMutation({
    mutationFn: () => {
      if (!canManage || !userId || !selectedRole) {
        throw new Error("Select a user and role.");
      }
      return addTeamMember(team.id, userId, selectedRole);
    },
    onSuccess: () => {
      invalidate();
      setUserId("");
      setMessage("Team member added.");
    },
    onError: () => setMessage("The team member could not be added."),
    onSettled: () => {
      assignmentInFlight.current = false;
    },
  });
  const removeMutation = useMutation({
    mutationFn: (memberUserId: string) => {
      if (!canManage) throw new Error("Team management is unavailable.");
      return removeTeamMember(team.id, memberUserId);
    },
    onSuccess: () => {
      invalidate();
      setMessage("Team member removed.");
    },
    onError: () => setMessage("The team member could not be removed."),
    onSettled: () => {
      assignmentInFlight.current = false;
    },
  });
  const roleMutation = useMutation({
    mutationFn: ({
      memberUserId,
      nextRoleKey,
    }: {
      memberUserId: string;
      nextRoleKey: string;
    }) => {
      if (!canManage || !nextRoleKey) {
        throw new Error("Team management is unavailable.");
      }
      return setTeamMemberRole(team.id, memberUserId, nextRoleKey);
    },
    onSuccess: () => {
      invalidate();
      setMessage("Team member role updated.");
    },
    onError: () => setMessage("The team member role could not be updated."),
    onSettled: () => {
      assignmentInFlight.current = false;
    },
  });
  const isSaving =
    addMutation.isPending || removeMutation.isPending || roleMutation.isPending;

  if (
    membersQuery.isLoading ||
    rolesQuery.isLoading ||
    profilesQueryResult.isLoading
  ) {
    return <LoadingState label="Loading assignments…" />;
  }

  if (
    membersQuery.isError ||
    rolesQuery.isError ||
    profilesQueryResult.isError
  ) {
    return (
      <InlineError
        message="Could not load team assignments."
        onRetry={() => {
          membersQuery.refetch();
          rolesQuery.refetch();
          profilesQueryResult.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {message && (
        <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
          {message}
        </p>
      )}

      <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]">
        <select
          aria-label="User to add"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          disabled={!canManage || isSaving}
          title={
            !canManage
              ? "Active platform administrator access is required."
              : isSaving
                ? "An assignment change is in progress."
                : undefined
          }
          className="min-w-0 rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">Select user</option>
          {availableProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.displayName}
            </option>
          ))}
        </select>
        <select
          aria-label="Team role"
          value={selectedRole}
          onChange={(event) => setRoleKey(event.target.value)}
          disabled={!canManage || isSaving}
          title={
            !canManage
              ? "Active platform administrator access is required."
              : isSaving
                ? "An assignment change is in progress."
                : undefined
          }
          className="min-w-0 rounded-md border bg-background px-3 py-2 text-sm"
        >
          {roles.map((role) => (
            <option key={role.roleKey} value={role.roleKey}>
              {role.name}
            </option>
          ))}
        </select>
        <ActionButton
          disabled={
            !canManage || isSaving || !userId || !selectedRole
          }
          disabledReason={
            !canManage
              ? "Active platform administrator access is required."
              : isSaving
                ? "An assignment change is in progress."
                : "Select a user and team role first."
          }
          onClick={() => {
            if (beginAssignmentMutation()) addMutation.mutate();
          }}
        >
          Add member
        </ActionButton>
      </div>

      {members.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/10 p-5 text-center">
          <p className="text-sm font-medium">No team members</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add an available user and assign a team role above.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(150px,0.7fr)_auto] gap-2 border-b bg-muted/25 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Member</span>
            <span>Team role</span>
            <span className="sr-only">Actions</span>
          </div>
          <div className="divide-y">
            {members.map((member) => (
              <div
                key={member.userId}
                className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.7fr)_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {member.displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email ?? "Email unavailable"}
                  </p>
                </div>
                <select
                  aria-label={`Role for ${member.displayName}`}
                  value={member.roleKey ?? ""}
                  disabled={!canManage || isSaving}
                  title={
                    !canManage
                      ? "Active platform administrator access is required."
                      : isSaving
                        ? "An assignment change is in progress."
                        : undefined
                  }
                  onChange={(event) => {
                    if (!beginAssignmentMutation()) return;
                    roleMutation.mutate({
                      memberUserId: member.userId,
                      nextRoleKey: event.target.value,
                    });
                  }}
                  className="min-w-0 rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="" disabled>
                    Select role
                  </option>
                  {roles.map((role) => (
                    <option key={role.roleKey} value={role.roleKey}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <ActionButton
                  disabled={!canManage || isSaving}
                  disabledReason={
                    !canManage
                      ? "Active platform administrator access is required."
                      : "An assignment change is in progress."
                  }
                  destructive
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${member.displayName} from ${team.name}?`,
                      )
                    ) {
                      if (beginAssignmentMutation()) {
                        removeMutation.mutate(member.userId);
                      }
                    }
                  }}
                >
                  Remove
                </ActionButton>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccessDecisionPanel({
  subject,
  resourceType,
  decisions,
  queryKey,
  isLoading,
  isError,
  canEdit,
  disabledReason,
  onRetry,
}: {
  subject: IdentitySubject;
  resourceType: AccessResourceType;
  decisions: AccessDecision[];
  queryKey: readonly unknown[];
  isLoading: boolean;
  isError: boolean;
  canEdit: boolean;
  disabledReason: string;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "all" | "allowed" | "denied" | "overridden"
  >("all");
  const [auditReason, setAuditReason] = useState("");
  const [draftEffects, setDraftEffects] = useState<
    Record<string, AccessOverrideEffect>
  >({});
  const needle = search.trim().toLowerCase();
  const effectFor = (decision: AccessDecision): AccessOverrideEffect =>
    draftEffects[decision.key] ?? decision.override;
  const changedCount = decisions.filter(
    (decision) => effectFor(decision) !== decision.override,
  ).length;
  const visibleDecisions = decisions.filter((decision) => {
    if (filter === "allowed" && decision.effective !== "allow") return false;
    if (filter === "denied" && decision.effective !== "deny") return false;
    if (filter === "overridden" && effectFor(decision) === "inherit") {
      return false;
    }
    if (!needle) return true;
    return [decision.label, decision.key, decision.source].some((value) =>
      value.toLowerCase().includes(needle),
    );
  });

  if (isLoading) {
    return <LoadingState label="Loading access decisions…" />;
  }
  if (isError) {
    return (
      <InlineError
        message="Access configuration could not be loaded."
        onRetry={onRetry}
      />
    );
  }
  return (
    <div className="space-y-3">
      {!canEdit && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          Access editing is disabled. {disabledReason}
        </p>
      )}
      <div className="sticky top-0 z-10 space-y-2 rounded-lg border bg-background/95 p-2.5 shadow-sm backdrop-blur">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              resourceType === "permission"
                ? "Search permissions"
                : "Search routes"
            }
            className="h-8 min-w-0 rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          />
          <select
            aria-label="Access decision filter"
            value={filter}
            onChange={(event) =>
              setFilter(
                event.target.value as
                  | "all"
                  | "allowed"
                  | "denied"
                  | "overridden",
              )
            }
            className="h-8 rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary/50"
          >
            <option value="all">All ({decisions.length})</option>
            <option value="allowed">Allowed</option>
            <option value="denied">Denied</option>
            <option value="overridden">Overridden</option>
          </select>
        </div>
        <div className="grid items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <label
            htmlFor={`${resourceType}-audit-reason`}
            className="text-[11px] font-medium text-muted-foreground"
          >
            Audit reason
          </label>
          <input
            id={`${resourceType}-audit-reason`}
            value={auditReason}
            disabled={!canEdit}
            maxLength={500}
            onChange={(event) => setAuditReason(event.target.value)}
            placeholder="Required when applying a changed override"
            title={!canEdit ? disabledReason : undefined}
            className="h-8 min-w-0 rounded-md border bg-background px-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span
            className={`whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-medium ${
              changedCount > 0
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-border/70 bg-muted/30 text-muted-foreground"
            }`}
          >
            {changedCount} pending
          </span>
        </div>
      </div>
      {decisions.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No {resourceType === "permission" ? "permissions" : "routes"} returned
          by the backend.
        </p>
      ) : (
        <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
          {visibleDecisions.map((decision) => (
            <AccessDecisionRow
              key={`${subject.type}:${subject.id}:${resourceType}:${decision.key}`}
              subjectType={subject.type}
              subjectId={subject.id}
              resourceType={resourceType}
              decision={decision}
              queryKey={queryKey}
              canEdit={canEdit}
              disabledReason={disabledReason}
              auditReason={auditReason}
              effect={effectFor(decision)}
              onEffectChange={(nextEffect) =>
                setDraftEffects((current) => ({
                  ...current,
                  [decision.key]: nextEffect,
                }))
              }
              onSaved={() =>
                setDraftEffects((current) => {
                  const next = { ...current };
                  delete next[decision.key];
                  return next;
                })
              }
            />
          ))}
          {visibleDecisions.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No access decisions match this search and filter.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AccessDecisionRow({
  subjectType,
  subjectId,
  resourceType,
  decision,
  queryKey,
  canEdit,
  disabledReason,
  auditReason,
  effect,
  onEffectChange,
  onSaved,
}: {
  subjectType: AccessSubjectType;
  subjectId: string;
  resourceType: AccessResourceType;
  decision: AccessDecision;
  queryKey: readonly unknown[];
  canEdit: boolean;
  disabledReason: string;
  auditReason: string;
  effect: AccessOverrideEffect;
  onEffectChange: (effect: AccessOverrideEffect) => void;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const saveInFlight = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const isChanged = effect !== decision.override;

  const mutation = useMutation({
    mutationFn: async () => {
      if (
        !session?.access_token ||
        !canEdit ||
        !isChanged ||
        auditReason.trim().length < 3
      ) {
        throw new Error("A reason of at least three characters is required.");
      }
      return adminAccess({
        accessToken: session.access_token,
        action: "set",
        subjectType,
        subjectId,
        resourceType,
        resourceKey: decision.key,
        effect,
        reason: auditReason.trim(),
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setMessage(
          typeof result.error === "string" && result.error.trim()
            ? result.error
            : "The access change could not be saved.",
        );
        return;
      }
      if (
        !isRecord(result.snapshot) ||
        result.snapshot.available !== true
      ) {
        setMessage("The server returned an invalid access response.");
        return;
      }
      setMessage("Saved. Refreshing access…");
      await queryClient.invalidateQueries({ queryKey, exact: true });
      onSaved();
      setMessage("Saved.");
      queryClient.invalidateQueries({
        queryKey: ["admin-access", "activation-status"],
      });
    },
    onError: () =>
      setMessage("The access change could not be saved. Check the reason."),
    onSettled: () => {
      saveInFlight.current = false;
    },
  });

  function saveOverride() {
    if (
      saveInFlight.current ||
      !canEdit ||
      mutation.isPending ||
      !isChanged ||
      auditReason.trim().length < 3
    ) {
      return;
    }
    saveInFlight.current = true;
    mutation.mutate();
  }

  return (
    <article
      className={`rounded-lg border px-3 py-2 transition-colors ${
        isChanged
          ? "border-amber-500/35 bg-amber-500/[0.05] shadow-sm"
          : "bg-card/40"
      }`}
    >
      <div className="grid items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_105px_auto]">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">
            {decision.label || decision.key}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                decision.effective === "allow"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-destructive"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  decision.effective === "allow"
                    ? "bg-emerald-500"
                    : "bg-destructive"
                }`}
              />
              {decision.effective === "allow" ? "Allowed" : "Denied"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Override: {decision.override}
            </span>
            {isChanged && (
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Pending
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 break-words text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium">Source:</span>{" "}
            {decision.source || "No provenance returned by backend."}
          </p>
          {decision.reason && (
            <p className="mt-1 break-words text-xs text-muted-foreground">
              Existing reason: {decision.reason}
            </p>
          )}
        </div>
        <label className="space-y-1 text-[10px] text-muted-foreground">
          <span>Override</span>
          <select
            value={effect}
            disabled={!canEdit || mutation.isPending}
            onChange={(event) => {
              setMessage(null);
              onEffectChange(event.target.value as AccessOverrideEffect);
            }}
            className={`h-8 w-full rounded-md border px-2 text-xs font-medium outline-none ${
              effect === "allow"
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                : effect === "deny"
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : "bg-background text-foreground"
            }`}
          >
            <option value="inherit">Inherit</option>
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
        </label>
        <div className="flex min-w-[76px] flex-col items-end gap-1">
          {isChanged ? (
            <ActionButton
              disabled={
                !canEdit ||
                mutation.isPending ||
                auditReason.trim().length < 3
              }
              disabledReason={
                !canEdit
                  ? disabledReason
                  : mutation.isPending
                    ? "The access change is being saved."
                    : "Enter an audit reason of at least three characters."
              }
              onClick={saveOverride}
            >
              {mutation.isPending ? "Saving…" : "Apply"}
            </ActionButton>
          ) : (
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">
              Current
            </span>
          )}
          {message && (
            <p
              role="status"
              className="max-w-28 text-right text-[10px] leading-tight text-muted-foreground"
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function EffectiveAccessPanel({
  permissions,
  routes,
  warning,
  isLoading,
  isError,
  onRetry,
}: {
  permissions: AccessDecision[];
  routes: AccessDecision[];
  warning: string | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <LoadingState label="Loading effective access…" />;
  }
  if (isError) {
    return (
      <InlineError
        message="Effective access could not be loaded."
        onRetry={onRetry}
      />
    );
  }

  const allowedPermissions = permissions.filter(
    (decision) => decision.effective === "allow",
  );
  const deniedPermissions = permissions.filter(
    (decision) => decision.effective === "deny",
  );
  const visiblePages = routes.filter(
    (decision) => decision.effective === "allow",
  );
  const hiddenPages = routes.filter(
    (decision) => decision.effective === "deny",
  );
  const allowedDecisions = [
    ...allowedPermissions.map((decision) => ({
      decision,
      category: "Permission",
    })),
    ...visiblePages.map((decision) => ({ decision, category: "Page" })),
  ];
  const deniedDecisions = [
    ...deniedPermissions.map((decision) => ({
      decision,
      category: "Permission",
    })),
    ...hiddenPages.map((decision) => ({ decision, category: "Page" })),
  ];

  return (
    <div className="space-y-3">
      {warning && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          {warning}
        </p>
      )}
      {permissions.length === 0 && routes.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No effective access decisions returned by the backend.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <AccessMetric
              label="Allowed permissions"
              value={allowedPermissions.length}
              tone="allow"
            />
            <AccessMetric
              label="Denied permissions"
              value={deniedPermissions.length}
              tone="deny"
            />
            <AccessMetric
              label="Visible pages"
              value={visiblePages.length}
              tone="allow"
            />
            <AccessMetric
              label="Hidden pages"
              value={hiddenPages.length}
              tone="deny"
            />
          </div>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            <EffectiveDecisionGroup
              title="Allowed"
              items={allowedDecisions}
              tone="allow"
            />
            <EffectiveDecisionGroup
              title="Denied"
              items={deniedDecisions}
              tone="deny"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EffectiveDecisionGroup({
  title,
  items,
  tone,
}: {
  title: string;
  items: Array<{ decision: AccessDecision; category: string }>;
  tone: "allow" | "deny";
}) {
  if (items.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-lg border bg-card/40">
      <header className="flex items-center justify-between border-b bg-muted/20 px-3 py-2">
        <h3
          className={`text-xs font-semibold ${
            tone === "allow"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-destructive"
          }`}
        >
          {title}
        </h3>
        <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
          {items.length}
        </span>
      </header>
      <div className="divide-y">
        {items.map(({ decision, category }) => (
          <article
            key={`${category}:${decision.key}`}
            className="grid gap-2 p-2.5 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="break-words text-sm font-medium">
                  {decision.label || decision.key}
                </p>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  {category}
                </span>
              </div>
              <p className="mt-0.5 break-words text-xs text-muted-foreground">
                Source:{" "}
                {decision.source || "No provenance returned by backend."}
              </p>
              {decision.reason && (
                <p className="mt-0.5 break-words text-xs text-muted-foreground">
                  Reason: {decision.reason}
                </p>
              )}
            </div>
            <span className="self-start text-[10px] font-medium text-muted-foreground">
              {decision.override === "inherit"
                ? "Inherited"
                : `Override: ${decision.override}`}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function AccessMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "allow" | "deny";
}) {
  return (
    <div className="rounded-lg border bg-card/40 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold leading-none ${
          tone === "allow"
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-destructive"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function AuditPanel({
  entries,
  identityEntries,
  isLoading,
  isError,
  onRetry,
}: {
  entries: AccessAuditEntry[];
  identityEntries: IdentityAdminAuditEntry[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <LoadingState label="Loading access history…" />;
  }
  if (isError) {
    return (
      <InlineError
        message="Access history could not be loaded."
        onRetry={onRetry}
      />
    );
  }
  if (entries.length === 0 && identityEntries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/10 p-6 text-center">
        <div className="mx-auto mb-2 h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <p className="text-sm font-medium">No access changes recorded</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Audited permission and page-visibility changes will appear here.
        </p>
      </div>
    );
  }
  return (
    <div className="max-h-[58vh] divide-y overflow-y-auto rounded-lg border bg-card/40">
      {identityEntries.map((entry) => (
        <article
          key={`identity:${entry.id}`}
          className="relative p-2.5 pl-5 before:absolute before:left-2.5 before:top-4 before:h-1.5 before:w-1.5 before:rounded-full before:bg-amber-500/60"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-medium">
              {entry.action.replaceAll("_", " ")}
            </p>
            <time className="whitespace-nowrap text-xs text-muted-foreground">
              {formatDate(entry.createdAt)}
            </time>
          </div>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            Reason: {entry.reason || "No reason returned by backend."}
          </p>
        </article>
      ))}
      {entries.map((entry, index) => (
        <article
          key={
            entry.id ||
            `${entry.resourceType}:${entry.resourceKey}:${entry.createdAt}:${index}`
          }
          className="relative p-2.5 pl-5 before:absolute before:left-2.5 before:top-4 before:h-1.5 before:w-1.5 before:rounded-full before:bg-primary/50"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-medium">
              {entry.resourceKey}
            </p>
            <time className="whitespace-nowrap text-xs text-muted-foreground">
              {formatDate(entry.createdAt)}
            </time>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {entry.resourceType === "route" ? "Page visibility" : "Permission"} ·{" "}
            {entry.previousEffect ?? "inherit"} → {entry.newEffect ?? "inherit"}
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            Reason: {entry.reason || "No reason returned by backend."}
          </p>
        </article>
      ))}
    </div>
  );
}

function DefinitionGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="min-w-0 rounded-lg border bg-card/40 px-3 py-2 shadow-sm"
        >
          <dt className="text-[11px] font-medium text-muted-foreground">
            {label}
          </dt>
          <dd className="mt-0.5 break-words text-sm leading-snug">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AssignmentList({
  title,
  values,
  empty,
}: {
  title: string;
  values: string[];
  empty: string;
}) {
  return (
    <section className="rounded-lg border bg-card/40 p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {values.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={value}
              className="rounded-full border px-2 py-1 text-xs"
            >
              {value}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function SubjectStatusChip({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "muted";
}) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
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

function ActionButton({
  children,
  disabled = false,
  disabledReason,
  destructive = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        destructive ? "border-destructive/50 text-destructive" : ""
      }`}
    >
      {children}
    </button>
  );
}

function BackendUnavailableNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/15 p-3">
      <span
        aria-hidden="true"
        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50"
      />
      <div>
        <p className="text-xs font-medium">Read-only</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {children}
        </p>
      </div>
    </div>
  );
}

function DisabledAction({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      disabled
      title="Backend action not available yet."
      className="cursor-not-allowed rounded-md border border-transparent bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground opacity-70"
    >
      {children}
    </button>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="rounded-md border bg-muted/30 px-3 py-4 text-sm text-muted-foreground"
    >
      <span className="inline-block animate-pulse">{label}</span>
    </div>
  );
}

function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-md border border-destructive/30 p-4">
      <p className="text-sm">{message}</p>
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

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAccessDecision(value: unknown): value is AccessDecision {
  if (!isRecord(value)) return false;
  return (
    typeof value.key === "string" &&
    typeof value.label === "string" &&
    (value.override === "allow" ||
      value.override === "deny" ||
      value.override === "inherit") &&
    (value.effective === "allow" || value.effective === "deny") &&
    typeof value.source === "string" &&
    (value.reason === null || typeof value.reason === "string")
  );
}

function isAccessAuditEntry(value: unknown): value is AccessAuditEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.resourceType === "permission" || value.resourceType === "route") &&
    typeof value.resourceKey === "string" &&
    (value.previousEffect === null ||
      value.previousEffect === "allow" ||
      value.previousEffect === "deny") &&
    (value.newEffect === null ||
      value.newEffect === "allow" ||
      value.newEffect === "deny") &&
    typeof value.reason === "string" &&
    typeof value.createdAt === "string"
  );
}

function normalizeTeamMembers(value: unknown): TeamMember[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.userId !== "string" || !item.userId) {
      return [];
    }
    return [
      {
        userId: item.userId,
        displayName:
          typeof item.displayName === "string" && item.displayName.trim()
            ? item.displayName
            : item.userId.slice(0, 8),
        email: typeof item.email === "string" ? item.email : null,
        membershipStatus:
          typeof item.membershipStatus === "string"
            ? item.membershipStatus
            : "unknown",
        roleKey: typeof item.roleKey === "string" ? item.roleKey : null,
        roleName: typeof item.roleName === "string" ? item.roleName : null,
        joinedAt: typeof item.joinedAt === "string" ? item.joinedAt : "",
      },
    ];
  });
}

function normalizeTeamRoles(value: unknown): TeamRoleOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    isRecord(item) &&
    typeof item.roleKey === "string" &&
    item.roleKey &&
    typeof item.name === "string" &&
    item.name
      ? [{ roleKey: item.roleKey, name: item.name }]
      : [],
  );
}

function normalizeProfiles(value: unknown): ProfileOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) return [];
    return [
      {
        id: item.id,
        displayName:
          typeof item.displayName === "string" && item.displayName.trim()
            ? item.displayName
            : item.id.slice(0, 8),
        email: typeof item.email === "string" ? item.email : null,
      },
    ];
  });
}
