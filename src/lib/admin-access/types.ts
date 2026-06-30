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
