export type AccessSubjectType = "user" | "team" | "workspace";
export type AccessResourceType = "permission" | "route";
export type AccessOverrideEffect = "allow" | "deny" | "inherit";

export interface AdminAccessInput {
  accessToken: string;
  action: "read" | "set";
  subjectType: AccessSubjectType;
  subjectId: string;
  workspaceId?: string | null;
  teamId?: string | null;
  resourceType?: AccessResourceType;
  resourceKey?: string;
  effect?: AccessOverrideEffect;
  reason?: string;
}

export interface AccessDecision {
  key: string;
  label: string;
  override: AccessOverrideEffect;
  effective: "allow" | "deny";
  source: string;
  reason: string | null;
}

export interface AccessAuditEntry {
  id: string;
  resourceType: AccessResourceType;
  resourceKey: string;
  previousEffect: "allow" | "deny" | null;
  newEffect: "allow" | "deny" | null;
  reason: string;
  createdAt: string;
}

export interface AdminAccessSnapshot {
  available: boolean;
  subjectType: AccessSubjectType;
  subjectId: string;
  permissions: AccessDecision[];
  routes: AccessDecision[];
  audit: AccessAuditEntry[];
  warning: string | null;
}

export type AdminAccessResult =
  | { ok: true; snapshot: AdminAccessSnapshot }
  | { ok: false; error: string };

export type IdentityAdminAction =
  | "identity.read"
  | "identity.set_global_role"
  | "identity.set_team_assignment"
  | "identity.create_workspace"
  | "identity.update_workspace"
  | "identity.set_workspace_member";

export interface IdentityAdminInput {
  accessToken: string;
  action: IdentityAdminAction;
  subjectType?: "user" | "workspace";
  subjectId?: string;
  userId?: string;
  teamId?: string;
  workspaceId?: string;
  roleKey?: string | null;
  name?: string;
  slug?: string;
  description?: string;
  workspaceType?: string;
  status?: string;
  reason?: string;
}

export interface IdentityAdminOption {
  id: string;
  key: string;
  name: string;
}

export interface IdentityAdminTeamAssignment {
  teamId: string;
  teamName: string;
  roleKey: string | null;
  roleName: string | null;
}

export interface IdentityAdminWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  status: string;
}

export interface IdentityAdminWorkspaceMember {
  userId: string;
  displayName: string;
  email: string | null;
  status: string;
  roleKey: string | null;
  roleName: string | null;
}

export interface IdentityAdminAuditEntry {
  id: string;
  action: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
  createdAt: string;
}

export interface IdentityAdminSnapshot {
  platformRoles: IdentityAdminOption[];
  teamRoles: IdentityAdminOption[];
  workspaceRoles: IdentityAdminOption[];
  teams: IdentityAdminOption[];
  profiles: IdentityAdminOption[];
  workspaces: IdentityAdminWorkspace[];
  globalRoleKey: string | null;
  teamAssignments: IdentityAdminTeamAssignment[];
  workspaceMembers: IdentityAdminWorkspaceMember[];
  audit: IdentityAdminAuditEntry[];
}

export type IdentityAdminResult =
  | { ok: true; snapshot: IdentityAdminSnapshot }
  | { ok: false; error: string };
