import { getSupabase } from "@/integrations/supabase/client";
import type {
  Task,
  TaskBulkPatch,
  TaskChecklistItem,
  TaskComment,
  TaskInput,
  TaskLinks,
  TaskPriority,
  TaskRecurrence,
  TaskScope,
  TaskSource,
  TaskStatus,
} from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapChecklistItem(value: unknown): TaskChecklistItem {
  const row = record(value);
  const notes = typeof row.notes === "string" ? row.notes : "";
  return {
    id: text(row.id),
    title: text(row.title),
    completed: row.completed === true,
    required: row.required === true,
    ...(notes ? { notes } : {}),
  };
}

function mapChecklist(value: unknown): TaskChecklistItem[] {
  return Array.isArray(value) ? value.map(mapChecklistItem) : [];
}

function mapRecurring(value: unknown): TaskRecurrence | null {
  const row = record(value);
  const freq = row.freq;
  if (typeof freq !== "string" || !["daily", "weekly", "monthly", "quarterly"].includes(freq)) return null;
  const interval = Number(row.interval);
  return { freq: freq as TaskRecurrence["freq"], interval: Number.isFinite(interval) && interval > 0 ? interval : 1 };
}

function mapLinks(value: unknown): TaskLinks {
  const row = record(value);
  const links: TaskLinks = {};
  const documentId = nullableText(row.linkedDocumentId);
  if (documentId) links.linkedDocumentId = documentId;
  const assetId = nullableText(row.linkedAssetId);
  if (assetId) links.linkedAssetId = assetId;
  const ticketIds = stringArray(row.linkedTicketIds);
  if (ticketIds.length) links.linkedTicketIds = ticketIds;
  const ipamIds = stringArray(row.linkedIpamIds);
  if (ipamIds.length) links.linkedIpamIds = ipamIds;
  const noteIds = stringArray(row.linkedNoteIds);
  if (noteIds.length) links.linkedNoteIds = noteIds;
  const userIds = stringArray(row.linkedUserIds);
  if (userIds.length) links.linkedUserIds = userIds;
  const protocolRunIds = stringArray(row.linkedProtocolRunIds);
  if (protocolRunIds.length) links.linkedProtocolRunIds = protocolRunIds;
  const protocolTemplateId = nullableText(row.linkedProtocolTemplateId);
  if (protocolTemplateId) links.linkedProtocolTemplateId = protocolTemplateId;
  const sourceTicketId = nullableText(row.sourceTicketId);
  if (sourceTicketId) links.sourceTicketId = sourceTicketId;
  const dependencyIds = stringArray(row.dependencyIds);
  if (dependencyIds.length) links.dependencyIds = dependencyIds;
  return links;
}

function mapComment(value: unknown): TaskComment {
  const row = record(value);
  return {
    id: text(row.id),
    author: nullableText(row.author),
    authorName: text(row.authorName),
    body: text(row.body),
    at: text(row.at),
  };
}

function mapComments(value: unknown): TaskComment[] {
  return Array.isArray(value) ? value.map(mapComment) : [];
}

function mapTask(value: unknown): Task {
  const row = record(value);
  return {
    id: text(row.id),
    title: text(row.title),
    description: text(row.description),
    category: text(row.category),
    priority: text(row.priority) as TaskPriority,
    status: text(row.status) as TaskStatus,
    scope: text(row.scope) as TaskScope,
    source: text(row.source) as TaskSource,
    dueDate: nullableText(row.due_date),
    reminderAt: nullableText(row.reminder_at),
    assignedTo: text(row.assigned_to),
    owner: text(row.owner),
    team: text(row.team),
    tags: stringArray(row.tags),
    watchers: stringArray(row.watchers),
    recurring: mapRecurring(row.recurring),
    escalated: row.escalated === true,
    archived: row.archived === true,
    checklist: mapChecklist(row.checklist),
    links: mapLinks(row.links),
    notes: text(row.notes),
    completedAt: nullableText(row.completed_at),
    comments: mapComments(row.comments),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    deletedAt: nullableText(row.deleted_at),
  };
}

function toPayload(input: TaskInput): Record<string, unknown> {
  return {
    title: input.title,
    description: input.description,
    category: input.category,
    priority: input.priority,
    ...(input.status ? { status: input.status } : {}),
    scope: input.scope,
    source: input.source,
    due_date: input.dueDate,
    reminder_at: input.reminderAt,
    assigned_to: input.assignedTo,
    owner: input.owner,
    team: input.team,
    tags: input.tags,
    watchers: input.watchers,
    recurring: input.recurring,
    checklist: input.checklist,
    notes: input.notes,
  };
}

export async function listTasks(includeDeleted = false): Promise<Task[]> {
  const { data, error } = await getSupabase().rpc("list_tasks", { p_include_deleted: includeDeleted });
  if (error) throw error;
  return (data ?? []).map(mapTask);
}

export async function saveTask(id: string | null, input: TaskInput): Promise<string> {
  const { data, error } = await getSupabase().rpc("save_task", {
    p_task_id: id,
    p_input: toPayload(input),
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<string | null> {
  const { data, error } = await getSupabase().rpc("set_task_status", { p_task_id: id, p_status: status });
  if (error) throw error;
  return data ? String(data) : null;
}

export async function escalateTask(id: string): Promise<TaskPriority> {
  const { data, error } = await getSupabase().rpc("escalate_task", { p_task_id: id });
  if (error) throw error;
  return String(data) as TaskPriority;
}

export async function setTaskArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await getSupabase().rpc("set_task_archived", { p_task_id: id, p_archived: archived });
  if (error) throw error;
}

export async function duplicateTask(id: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("duplicate_task", { p_task_id: id });
  if (error) throw error;
  return String(data ?? "");
}

export async function saveTaskLinks(id: string, links: TaskLinks): Promise<void> {
  const { error } = await getSupabase().rpc("save_task_links", {
    p_task_id: id,
    p_links: links as Record<string, unknown>,
  });
  if (error) throw error;
}

export async function setTaskReminder(id: string, reminderAt: string | null): Promise<void> {
  const { error } = await getSupabase().rpc("set_task_reminder", { p_task_id: id, p_reminder_at: reminderAt });
  if (error) throw error;
}

export async function addTaskComment(id: string, body: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("add_task_comment", { p_task_id: id, p_body: body });
  if (error) throw error;
  return String(data ?? "");
}

export async function softDeleteTask(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("soft_delete_task", { p_task_id: id });
  if (error) throw error;
}

export async function restoreTask(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("restore_task", { p_task_id: id });
  if (error) throw error;
}

export async function bulkUpdateTasks(ids: string[], patch: TaskBulkPatch): Promise<number> {
  const payload: Record<string, unknown> = {};
  if (patch.assignedTo !== undefined) payload.assigned_to = patch.assignedTo;
  if (patch.team !== undefined) payload.team = patch.team;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.priority !== undefined) payload.priority = patch.priority;
  if (patch.dueDate !== undefined) payload.due_date = patch.dueDate ?? "";

  const { data, error } = await getSupabase().rpc("bulk_update_tasks", { p_task_ids: ids, p_patch: payload });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function bulkAddTaskTag(ids: string[], tag: string): Promise<number> {
  const { data, error } = await getSupabase().rpc("bulk_add_task_tag", { p_task_ids: ids, p_tag: tag });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function bulkSetTasksArchived(ids: string[], archived: boolean): Promise<number> {
  const { data, error } = await getSupabase().rpc("bulk_set_tasks_archived", {
    p_task_ids: ids,
    p_archived: archived,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function bulkSoftDeleteTasks(ids: string[]): Promise<number> {
  const { data, error } = await getSupabase().rpc("bulk_soft_delete_tasks", { p_task_ids: ids });
  if (error) throw error;
  return Number(data ?? 0);
}

export function publicTaskError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "23505") return "That task already exists.";
  if (["22P02", "22023", "23514"].includes(code)) return "One or more task values are invalid.";
  if (code === "42501") return "You do not have permission to manage tasks.";
  if (code === "P0002") return "That task could not be found. It may have been deleted.";
  return "The task operation failed. Try again or contact an administrator.";
}

export function isOverdue(t: Task): boolean {
  return !!t.dueDate && t.status !== "done" && new Date(t.dueDate) < new Date();
}

export function checklistProgress(t: Task): { done: number; total: number; pct: number } {
  const done = t.checklist.filter((c) => c.completed).length;
  const total = t.checklist.length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function blockedByOpen(t: Task, all: Task[]): boolean {
  const deps = t.links.dependencyIds ?? [];
  if (!deps.length) return false;
  return deps.some((id) => {
    const dep = all.find((x) => x.id === id);
    return !!dep && dep.status !== "done";
  });
}
