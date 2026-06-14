export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskStatus = "open" | "in_progress" | "blocked" | "done";
export type TaskScope = "personal" | "team" | "shared";
export type TaskSource = "manual" | "ticket" | "protocol" | "note" | "template" | "maintenance";

export interface TaskRecurrence {
  freq: "daily" | "weekly" | "monthly" | "quarterly";
  interval: number;
}

export interface TaskChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  required: boolean;
  notes?: string;
}

export interface TaskComment {
  id: string;
  author: string | null;
  authorName: string;
  body: string;
  at: string;
}

export interface TaskLinks {
  linkedDocumentId?: string;
  linkedAssetId?: string;
  linkedTicketIds?: string[];
  linkedIpamIds?: string[];
  linkedNoteIds?: string[];
  linkedUserIds?: string[];
  linkedProtocolRunIds?: string[];
  linkedProtocolTemplateId?: string;
  sourceTicketId?: string;
  dependencyIds?: string[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: TaskPriority;
  status: TaskStatus;
  scope: TaskScope;
  source: TaskSource;
  dueDate: string | null;
  reminderAt: string | null;
  assignedTo: string;
  owner: string;
  team: string;
  tags: string[];
  watchers: string[];
  recurring: TaskRecurrence | null;
  escalated: boolean;
  archived: boolean;
  checklist: TaskChecklistItem[];
  links: TaskLinks;
  notes: string;
  completedAt: string | null;
  comments: TaskComment[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TaskInput {
  title: string;
  description: string;
  category: string;
  priority: TaskPriority;
  status?: TaskStatus;
  scope: TaskScope;
  source: TaskSource;
  dueDate: string | null;
  reminderAt: string | null;
  assignedTo: string;
  owner: string;
  team: string;
  tags: string[];
  watchers: string[];
  recurring: TaskRecurrence | null;
  checklist: TaskChecklistItem[];
  notes: string;
}

export interface TaskBulkPatch {
  assignedTo?: string;
  team?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
}
