import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminAccess } from "@/lib/admin-access/functions";
import type {
  AccessDecision,
  AccessOverrideEffect,
  AccessResourceType,
  AccessSubjectType,
} from "@/lib/admin-access/types";
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
import type { TeamSummary } from "@/lib/teams/types";

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
  { id: "assignments", label: "Members / Assignments" },
  { id: "permissions", label: "Permissions" },
  { id: "visibility", label: "Page Visibility" },
  { id: "effective", label: "Effective Access / Why" },
  { id: "audit", label: "Audit / History" },
];

export function IdentityDetailPanel({
  subject,
  activationConfirmed,
  canManage,
  onEditUser,
  onToggleUser,
  onEditTeam,
  onDeleteTeam,
}: {
  subject: IdentitySubject;
  activationConfirmed: boolean;
  canManage: boolean;
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

  const result = accessQuery.data;
  const snapshot =
    result?.ok === true &&
    result.snapshot &&
    typeof result.snapshot === "object"
      ? result.snapshot
      : null;
  const permissions = Array.isArray(snapshot?.permissions)
    ? snapshot.permissions
    : [];
  const routes = Array.isArray(snapshot?.routes) ? snapshot.routes : [];
  const audit = Array.isArray(snapshot?.audit) ? snapshot.audit : [];
  const accessAvailable =
    activationConfirmed && snapshot?.available === true && canManage;
  const accessError =
    !canReadAccess ||
    accessQuery.isError ||
    (!accessQuery.isLoading && result?.ok === false);

  return (
    <section className="min-w-0 rounded-lg border bg-background">
      <header className="border-b p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {subject.type === "workspace" ? "Department" : subject.type}
        </p>
        <h2 className="mt-1 truncate text-lg font-semibold">{subject.name}</h2>
      </header>

      <div
        role="tablist"
        aria-label={`${subject.name} management`}
        className="flex gap-1 overflow-x-auto border-b px-3 pt-3"
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
              className={`whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-xs font-medium ${
                selected
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-w-0 p-4">
        {activeTab === "overview" && (
          <OverviewPanel
            subject={subject}
            canManage={canManage}
            onEditUser={onEditUser}
            onToggleUser={onToggleUser}
            onEditTeam={onEditTeam}
            onDeleteTeam={onDeleteTeam}
          />
        )}

        {activeTab === "assignments" && (
          <AssignmentsPanel subject={subject} canManage={canManage} />
        )}

        {(activeTab === "permissions" || activeTab === "visibility") && (
          <AccessDecisionPanel
            subject={subject}
            resourceType={
              activeTab === "permissions" ? "permission" : "route"
            }
            decisions={activeTab === "permissions" ? permissions : routes}
            queryKey={accessQueryKey}
            isLoading={accessQuery.isLoading}
            isError={accessError}
            canEdit={accessAvailable}
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
  onEditUser,
  onToggleUser,
  onEditTeam,
  onDeleteTeam,
}: {
  subject: IdentitySubject;
  canManage: boolean;
  onEditUser: (user: AdminUser) => void;
  onToggleUser: (user: AdminUser) => void;
  onEditTeam: (team: TeamSummary) => void;
  onDeleteTeam: (team: TeamSummary) => void;
}) {
  if (subject.type === "user") {
    const user = subject.value;
    const roles = Array.isArray(user.roleNames) ? user.roleNames : [];
    const teams = Array.isArray(user.teamNames) ? user.teamNames : [];
    return (
      <div className="space-y-4">
        <DefinitionGrid
          rows={[
            ["Email", user.email ?? "Unavailable"],
            ["Status", user.isActive ? "Active" : "Inactive"],
            ["Roles", roles.length > 0 ? roles.join(", ") : "No global role"],
            ["Teams", teams.length > 0 ? teams.join(", ") : "No team"],
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <ActionButton
            disabled={!canManage}
            onClick={() => onEditUser(user)}
          >
            Edit user
          </ActionButton>
          <ActionButton
            disabled={!canManage}
            onClick={() => onToggleUser(user)}
          >
            {user.isActive ? "Deactivate user" : "Activate user"}
          </ActionButton>
          <DisabledAction>User deletion unavailable</DisabledAction>
        </div>
      </div>
    );
  }

  if (subject.type === "team") {
    const team = subject.value;
    return (
      <div className="space-y-4">
        <DefinitionGrid
          rows={[
            ["Slug", team.slug || "Unavailable"],
            ["Members", String(team.memberCount ?? 0)],
            ["Description", team.description || "No description"],
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <ActionButton
            disabled={!canManage}
            onClick={() => onEditTeam(team)}
          >
            Edit team
          </ActionButton>
          <ActionButton
            disabled={!canManage}
            destructive
            onClick={() => onDeleteTeam(team)}
          >
            Delete team
          </ActionButton>
        </div>
      </div>
    );
  }

  const workspace = subject.value;
  return (
    <div className="space-y-4">
      <DefinitionGrid
        rows={[
          ["Slug", workspace.slug || "Unavailable"],
          ["Type", workspace.type || "Unavailable"],
          ["Status", workspace.status || "Unavailable"],
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <DisabledAction>Create department unavailable</DisabledAction>
        <DisabledAction>Edit department unavailable</DisabledAction>
        <DisabledAction>Delete / archive unavailable</DisabledAction>
      </div>
    </div>
  );
}

function AssignmentsPanel({
  subject,
  canManage,
}: {
  subject: IdentitySubject;
  canManage: boolean;
}) {
  if (subject.type === "team") {
    return <TeamAssignmentsPanel team={subject.value} canManage={canManage} />;
  }

  if (subject.type === "user") {
    const roles = Array.isArray(subject.value.roleNames)
      ? subject.value.roleNames
      : [];
    const teams = Array.isArray(subject.value.teamNames)
      ? subject.value.teamNames
      : [];
    return (
      <div className="space-y-4">
        <AssignmentList
          title="Global roles"
          values={roles}
          empty="No global role assigned."
        />
        <AssignmentList
          title="Teams"
          values={teams}
          empty="No team assigned."
        />
        <p className="text-sm text-muted-foreground">
          Existing user APIs expose assignment during creation, but no approved
          user-assignment mutation is available for this panel.
        </p>
      </div>
    );
  }

  const workspaceTeams = Array.isArray(subject.value.teams)
    ? subject.value.teams
    : [];
  const names = workspaceTeams.map((team) => team.name);
  return (
    <div className="space-y-4">
      <AssignmentList
        title="Teams in effective context"
        values={names}
        empty="No teams are visible in this department context."
      />
      <p className="text-sm text-muted-foreground">
        Department membership changes are disabled because no approved workspace
        membership mutation is available.
      </p>
    </div>
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
  const [userId, setUserId] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const membersQuery = useQuery(teamMembersQuery(team.id));
  const rolesQuery = useQuery(teamRolesQuery());
  const profilesQueryResult = useQuery(profilesQuery());
  const members = Array.isArray(membersQuery.data) ? membersQuery.data : [];
  const roles = Array.isArray(rolesQuery.data) ? rolesQuery.data : [];
  const profiles = Array.isArray(profilesQueryResult.data)
    ? profilesQueryResult.data
    : [];
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
  });
  const isSaving =
    addMutation.isPending || removeMutation.isPending || roleMutation.isPending;

  if (
    membersQuery.isLoading ||
    rolesQuery.isLoading ||
    profilesQueryResult.isLoading
  ) {
    return <p className="text-sm text-muted-foreground">Loading assignments…</p>;
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
          onClick={() => addMutation.mutate()}
        >
          Add member
        </ActionButton>
      </div>

      {members.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No team members.
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {members.map((member) => (
            <div
              key={member.userId}
              className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.7fr)_auto]"
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
                onChange={(event) =>
                  roleMutation.mutate({
                    memberUserId: member.userId,
                    nextRoleKey: event.target.value,
                  })
                }
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
                destructive
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove ${member.displayName} from ${team.name}?`,
                    )
                  ) {
                    removeMutation.mutate(member.userId);
                  }
                }}
              >
                Remove
              </ActionButton>
            </div>
          ))}
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
  onRetry,
}: {
  subject: IdentitySubject;
  resourceType: AccessResourceType;
  decisions: AccessDecision[];
  queryKey: readonly unknown[];
  isLoading: boolean;
  isError: boolean;
  canEdit: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading access…</p>;
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
          Access editing is disabled because activation or active platform
          administrator authorization was not confirmed.
        </p>
      )}
      {decisions.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No {resourceType === "permission" ? "permissions" : "routes"} returned
          by the backend.
        </p>
      ) : (
        <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
          {decisions.map((decision) => (
            <AccessDecisionRow
              key={`${subject.type}:${subject.id}:${resourceType}:${decision.key}`}
              subjectType={subject.type}
              subjectId={subject.id}
              resourceType={resourceType}
              decision={decision}
              queryKey={queryKey}
              canEdit={canEdit}
            />
          ))}
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
}: {
  subjectType: AccessSubjectType;
  subjectId: string;
  resourceType: AccessResourceType;
  decision: AccessDecision;
  queryKey: readonly unknown[];
  canEdit: boolean;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [effect, setEffect] = useState<AccessOverrideEffect>(
    decision.override === "allow" || decision.override === "deny"
      ? decision.override
      : "inherit",
  );
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!session?.access_token || !canEdit || reason.trim().length < 3) {
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
        reason: reason.trim(),
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setReason("");
      setMessage("Saved.");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({
        queryKey: ["admin-access", "activation-status"],
      });
    },
    onError: () =>
      setMessage("The access change could not be saved. Check the reason."),
  });

  return (
    <article className="rounded-md border p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(120px,0.55fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">
            {decision.label || decision.key}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Effective:{" "}
            <span className="font-medium text-foreground">
              {decision.effective === "allow" ? "Allow" : "Deny"}
            </span>
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            Source: {decision.source || "No provenance returned by backend."}
          </p>
          {decision.reason && (
            <p className="mt-1 break-words text-xs text-muted-foreground">
              Existing reason: {decision.reason}
            </p>
          )}
        </div>
        <label className="space-y-1 text-xs">
          <span>Override</span>
          <select
            value={effect}
            disabled={!canEdit || mutation.isPending}
            onChange={(event) =>
              setEffect(event.target.value as AccessOverrideEffect)
            }
            className="w-full rounded-md border bg-background px-2 py-2 text-sm"
          >
            <option value="inherit">Inherit</option>
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
        </label>
        <div className="space-y-2">
          <label className="block space-y-1 text-xs">
            <span>Audit reason</span>
            <input
              value={reason}
              disabled={!canEdit || mutation.isPending}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required before saving"
              className="w-full rounded-md border bg-background px-2 py-2 text-sm"
            />
          </label>
          <ActionButton
            disabled={
              !canEdit || mutation.isPending || reason.trim().length < 3
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save override"}
          </ActionButton>
          {message && (
            <p role="status" className="text-xs text-muted-foreground">
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
    return <p className="text-sm text-muted-foreground">Loading effective access…</p>;
  }
  if (isError) {
    return (
      <InlineError
        message="Effective access could not be loaded."
        onRetry={onRetry}
      />
    );
  }

  const combined = [
    ...permissions.map((decision) => ({
      ...decision,
      category: "Permission",
    })),
    ...routes.map((decision) => ({ ...decision, category: "Page" })),
  ];

  return (
    <div className="space-y-3">
      {warning && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          {warning}
        </p>
      )}
      {combined.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No effective access decisions returned by the backend.
        </p>
      ) : (
        <div className="max-h-[58vh] divide-y overflow-y-auto rounded-md border">
          {combined.map((decision) => (
            <article
              key={`${decision.category}:${decision.key}`}
              className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">
                  {decision.label || decision.key}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  {decision.category} ·{" "}
                  {decision.source || "No provenance returned by backend."}
                </p>
                {decision.reason && (
                  <p className="break-words text-xs text-muted-foreground">
                    Reason: {decision.reason}
                  </p>
                )}
              </div>
              <span
                className={`self-start rounded-full border px-2 py-1 text-xs font-medium ${
                  decision.effective === "allow"
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                    : "border-destructive/40 text-destructive"
                }`}
              >
                {decision.effective === "allow" ? "Allowed" : "Denied"}
              </span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditPanel({
  entries,
  isLoading,
  isError,
  onRetry,
}: {
  entries: Array<{
    id: string;
    resourceType: AccessResourceType;
    resourceKey: string;
    previousEffect: "allow" | "deny" | null;
    newEffect: "allow" | "deny" | null;
    reason: string;
    createdAt: string;
  }>;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading history…</p>;
  }
  if (isError) {
    return (
      <InlineError
        message="Access history could not be loaded."
        onRetry={onRetry}
      />
    );
  }
  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        No access changes recorded.
      </p>
    );
  }
  return (
    <div className="max-h-[58vh] divide-y overflow-y-auto rounded-md border">
      {entries.map((entry) => (
        <article key={entry.id} className="p-3">
          <p className="break-words text-sm font-medium">{entry.resourceKey}</p>
          <p className="text-xs text-muted-foreground">
            {entry.resourceType} · {entry.previousEffect ?? "inherit"} →{" "}
            {entry.newEffect ?? "inherit"}
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {entry.reason || "No reason returned by backend."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(entry.createdAt)}
          </p>
        </article>
      ))}
    </div>
  );
}

function DefinitionGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md border p-3">
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words text-sm">{value}</dd>
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
    <section className="rounded-md border p-3">
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

function ActionButton({
  children,
  disabled = false,
  destructive = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        destructive ? "border-destructive/50 text-destructive" : ""
      }`}
    >
      {children}
    </button>
  );
}

function DisabledAction({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      disabled
      title="Backend action not available yet."
      className="cursor-not-allowed rounded-md border px-3 py-2 text-sm opacity-50"
    >
      {children}
    </button>
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
