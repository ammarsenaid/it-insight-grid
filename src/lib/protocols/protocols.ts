import { getSupabase } from "@/integrations/supabase/client";
import type {
  ProtocolApproval,
  ProtocolComment,
  ProtocolRecurrence,
  ProtocolRun,
  ProtocolRunStep,
  ProtocolRunStepPatch,
  ProtocolStatus,
  ProtocolStep,
  ProtocolTemplate,
  ProtocolTemplateInput,
  StartProtocolRunInput,
} from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const str = text(value);
  return str === "" ? undefined : str;
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapStep(value: unknown): ProtocolStep {
  const row = record(value);
  return {
    id: text(row.id),
    title: text(row.title),
    instructions: text(row.instructions),
    required: row.required === true,
    notesAllowed: row.notesAllowed === true,
    evidenceAllowed: row.evidenceAllowed === true,
    approvalCheckpoint: row.approvalCheckpoint === true,
    relatedKnowledgeId: optionalText(row.relatedKnowledgeId),
    relatedAssetId: optionalText(row.relatedAssetId),
    snippet: optionalText(row.snippet),
    expectedResult: optionalText(row.expectedResult),
  };
}

function mapRunStep(value: unknown): ProtocolRunStep {
  const row = record(value);
  return {
    stepId: text(row.stepId),
    completed: row.completed === true,
    completedBy: optionalText(row.completedBy),
    completedAt: optionalText(row.completedAt),
    notes: optionalText(row.notes),
    evidence: optionalText(row.evidence),
    skipped: row.skipped === true ? true : undefined,
    approvalState: row.approvalState === "approved" || row.approvalState === "rejected" || row.approvalState === "pending"
      ? row.approvalState
      : undefined,
    approvalComment: optionalText(row.approvalComment),
  };
}

function mapApproval(value: unknown): ProtocolApproval {
  const row = record(value);
  return {
    id: text(row.id),
    by: text(row.by),
    decision: row.decision === "rejected" ? "rejected" : "approved",
    comment: optionalText(row.comment),
    at: text(row.at),
  };
}

function mapComment(value: unknown): ProtocolComment {
  const row = record(value);
  return {
    id: text(row.id),
    author: text(row.author),
    body: text(row.body),
    at: text(row.at),
  };
}

function mapTemplate(value: unknown): ProtocolTemplate {
  const row = record(value);
  return {
    id: text(row.id),
    title: text(row.title),
    category: text(row.category),
    description: text(row.description),
    purpose: optionalText(row.purpose),
    scope: optionalText(row.scope),
    preconditions: optionalText(row.preconditions),
    assignedTeam: optionalText(row.assigned_team),
    estimatedMinutes: row.estimated_minutes === null || row.estimated_minutes === undefined
      ? undefined
      : Number(row.estimated_minutes),
    approvalRequired: row.approval_required === true,
    defaultApproverRole: optionalText(row.default_approver_role),
    recurrence: (row.recurrence as ProtocolRecurrence) ?? "none",
    requiredAssetIds: stringArray(row.required_asset_ids),
    requiredKnowledgeIds: stringArray(row.required_knowledge_ids),
    relatedTaskTemplate: optionalText(row.related_task_template),
    tags: stringArray(row.tags),
    visibility: row.visibility === "restricted" ? "restricted" : "internal",
    steps: Array.isArray(row.steps) ? row.steps.map(mapStep) : [],
    archived: row.archived === true,
    lastRunAt: optionalText(row.last_run_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    deletedAt: nullableText(row.deleted_at),
  };
}

function mapRun(value: unknown): ProtocolRun {
  const row = record(value);
  const links = record(row.links);
  return {
    id: text(row.id),
    runNumber: text(row.run_number),
    templateId: text(row.template_id),
    templateTitle: text(row.template_title),
    status: (row.status as ProtocolStatus) ?? "planned",
    assignedUser: optionalText(row.assigned_user),
    team: optionalText(row.team),
    startedAt: optionalText(row.started_at),
    dueDate: optionalText(row.due_date),
    completedAt: optionalText(row.completed_at),
    linkedTicketId: optionalText(links.linkedTicketId),
    linkedAssetId: optionalText(links.linkedAssetId),
    linkedTaskId: optionalText(links.linkedTaskId),
    steps: Array.isArray(row.steps) ? row.steps.map(mapRunStep) : [],
    approvals: Array.isArray(row.approvals) ? row.approvals.map(mapApproval) : [],
    comments: Array.isArray(row.comments) ? row.comments.map(mapComment) : [],
    finalSummary: optionalText(row.final_summary),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function templatePayload(input: ProtocolTemplateInput): Record<string, unknown> {
  return {
    title: input.title,
    category: input.category,
    description: input.description,
    purpose: input.purpose ?? "",
    scope: input.scope ?? "",
    preconditions: input.preconditions ?? "",
    assignedTeam: input.assignedTeam ?? "",
    estimatedMinutes: input.estimatedMinutes ?? null,
    approvalRequired: input.approvalRequired,
    defaultApproverRole: input.defaultApproverRole ?? "",
    recurrence: input.recurrence,
    requiredAssetIds: input.requiredAssetIds,
    requiredKnowledgeIds: input.requiredKnowledgeIds,
    relatedTaskTemplate: input.relatedTaskTemplate ?? "",
    tags: input.tags,
    visibility: input.visibility,
    steps: input.steps,
  };
}

function startRunPayload(input: StartProtocolRunInput): Record<string, unknown> {
  return {
    assignedUser: input.assignedUser ?? "",
    dueDate: input.dueDate ?? null,
    linkedTicketId: input.linkedTicketId ?? null,
    linkedAssetId: input.linkedAssetId ?? null,
    linkedTaskId: input.linkedTaskId ?? null,
  };
}

export async function listProtocolTemplates(includeDeleted = false): Promise<ProtocolTemplate[]> {
  const { data, error } = await getSupabase().rpc("list_protocol_templates", { p_include_deleted: includeDeleted });
  if (error) throw error;
  return (data ?? []).map(mapTemplate);
}

export async function listProtocolRuns(): Promise<ProtocolRun[]> {
  const { data, error } = await getSupabase().rpc("list_protocol_runs");
  if (error) throw error;
  return (data ?? []).map(mapRun);
}

export async function saveProtocolTemplate(id: string | null, input: ProtocolTemplateInput): Promise<string> {
  const { data, error } = await getSupabase().rpc("save_protocol_template", {
    p_template_id: id,
    p_input: templatePayload(input),
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function setProtocolTemplateArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await getSupabase().rpc("set_protocol_template_archived", {
    p_template_id: id,
    p_archived: archived,
  });
  if (error) throw error;
}

export async function duplicateProtocolTemplate(id: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("duplicate_protocol_template", { p_template_id: id });
  if (error) throw error;
  return String(data ?? "");
}

export async function softDeleteProtocolTemplate(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("soft_delete_protocol_template", { p_template_id: id });
  if (error) throw error;
}

export async function restoreProtocolTemplate(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("restore_protocol_template", { p_template_id: id });
  if (error) throw error;
}

export async function startProtocolRun(templateId: string, input: StartProtocolRunInput): Promise<string> {
  const { data, error } = await getSupabase().rpc("start_protocol_run", {
    p_template_id: templateId,
    p_input: startRunPayload(input),
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function setProtocolRunStatus(id: string, status: ProtocolStatus, summary?: string): Promise<void> {
  const { error } = await getSupabase().rpc("set_protocol_run_status", {
    p_run_id: id,
    p_status: status,
    p_summary: summary ?? null,
  });
  if (error) throw error;
}

export async function updateProtocolRunStep(runId: string, stepId: string, patch: ProtocolRunStepPatch): Promise<void> {
  const { error } = await getSupabase().rpc("update_protocol_run_step", {
    p_run_id: runId,
    p_step_id: stepId,
    p_patch: patch as Record<string, unknown>,
  });
  if (error) throw error;
}

export async function addProtocolRunApproval(runId: string, decision: "approved" | "rejected", comment?: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("add_protocol_run_approval", {
    p_run_id: runId,
    p_decision: decision,
    p_comment: comment ?? null,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function addProtocolRunComment(runId: string, body: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("add_protocol_run_comment", {
    p_run_id: runId,
    p_body: body,
  });
  if (error) throw error;
  return String(data ?? "");
}

export function runProgress(run: ProtocolRun): number {
  if (run.steps.length === 0) return 0;
  const done = run.steps.filter((s) => s.completed || s.skipped).length;
  return Math.round((done / run.steps.length) * 100);
}

export function publicProtocolError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (["22P02", "22023", "23514"].includes(code)) return "One or more protocol values are invalid.";
  if (code === "42501") return "You do not have permission to manage protocols.";
  if (code === "P0002") return "That protocol record could not be found. It may have been deleted.";
  return "The protocol operation failed. Try again or contact an administrator.";
}
