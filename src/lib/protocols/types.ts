export type ID = string;

export type ProtocolStatus =
  | "planned"
  | "in_progress"
  | "waiting"
  | "waiting_approval"
  | "completed"
  | "completed_with_issues"
  | "failed"
  | "cancelled";

export type ProtocolRecurrence = "none" | "daily" | "weekly" | "monthly" | "quarterly";

export interface ProtocolStep {
  id: ID;
  title: string;
  instructions: string;
  required: boolean;
  notesAllowed: boolean;
  evidenceAllowed: boolean;
  approvalCheckpoint: boolean;
  relatedKnowledgeId?: ID;
  relatedAssetId?: ID;
  snippet?: string;
  expectedResult?: string;
}

export interface ProtocolTemplate {
  id: ID;
  title: string;
  category: string;
  description: string;
  purpose?: string;
  scope?: string;
  preconditions?: string;
  assignedTeam?: string;
  estimatedMinutes?: number;
  approvalRequired: boolean;
  defaultApproverRole?: string;
  recurrence: ProtocolRecurrence;
  requiredAssetIds: ID[];
  requiredKnowledgeIds: ID[];
  relatedTaskTemplate?: string;
  tags: string[];
  visibility: "internal" | "restricted";
  steps: ProtocolStep[];
  archived: boolean;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProtocolRunStep {
  stepId: ID;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
  evidence?: string;
  skipped?: boolean;
  approvalState?: "pending" | "approved" | "rejected";
  approvalComment?: string;
}

export interface ProtocolApproval {
  id: ID;
  by: string;
  decision: "approved" | "rejected";
  comment?: string;
  at: string;
}

export interface ProtocolComment {
  id: ID;
  author: string;
  body: string;
  at: string;
}

export interface ProtocolRun {
  id: ID;
  runNumber: string;
  templateId: ID;
  templateTitle: string;
  status: ProtocolStatus;
  assignedUser?: string;
  team?: string;
  startedAt?: string;
  dueDate?: string;
  completedAt?: string;
  linkedTicketId?: ID;
  linkedAssetId?: ID;
  linkedTaskId?: ID;
  steps: ProtocolRunStep[];
  approvals: ProtocolApproval[];
  comments: ProtocolComment[];
  finalSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProtocolTemplateInput = Omit<ProtocolTemplate, "id" | "archived" | "lastRunAt" | "createdAt" | "updatedAt" | "deletedAt">;

export interface StartProtocolRunInput {
  assignedUser?: string;
  dueDate?: string;
  linkedTicketId?: string;
  linkedAssetId?: string;
  linkedTaskId?: string;
}

export type ProtocolRunStepPatch = Partial<Omit<ProtocolRunStep, "stepId">>;

// Legacy browser-local store shape, retained for the non-authoritative
// cross-module reads in src/routes/index.tsx and src/routes/search.tsx.
export interface ProtocolState {
  templates: ProtocolTemplate[];
  runs: ProtocolRun[];
}
