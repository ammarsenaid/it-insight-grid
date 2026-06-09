import { useSyncExternalStore } from "react";
import type { ProtocolState, ProtocolTemplate, ProtocolRun, ProtocolStep, ProtocolRunStep, ProtocolStatus } from "./types";
import { buildProtocolSeed } from "./seed";

const KEY = "ikc.protocols.v1";

let state: ProtocolState = load();
const listeners = new Set<() => void>();

function load(): ProtocolState {
  if (typeof window === "undefined") return buildProtocolSeed();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const seeded = buildProtocolSeed();
      localStorage.setItem(KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as ProtocolState;
    if (!parsed.templates || !parsed.runs) return buildProtocolSeed();
    return parsed;
  } catch {
    return buildProtocolSeed();
  }
}

function persist() {
  if (typeof window !== "undefined") {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.error(e); }
  }
}
function notify() { listeners.forEach((l) => l()); }
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function set(updater: (s: ProtocolState) => ProtocolState) {
  state = updater(state); persist(); notify();
}

export const uid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

export function useProtocols(): ProtocolState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
export function getProtocols(): ProtocolState { return state; }

export function resetProtocolDemo() { state = buildProtocolSeed(); persist(); notify(); }

// ---- Templates ----
export function createTemplate(input: Omit<ProtocolTemplate, "id" | "createdAt" | "updatedAt" | "steps"> & { steps?: ProtocolStep[] }): ProtocolTemplate {
  const t: ProtocolTemplate = {
    ...input,
    id: uid("ptpl"),
    steps: input.steps ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  set((s) => ({ ...s, templates: [t, ...s.templates] }));
  return t;
}

export function updateTemplate(id: string, patch: Partial<ProtocolTemplate>) {
  set((s) => ({
    ...s,
    templates: s.templates.map((t) => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t),
  }));
}

export function deleteTemplate(id: string) {
  set((s) => ({ ...s, templates: s.templates.filter((t) => t.id !== id) }));
}

export function duplicateTemplate(id: string): ProtocolTemplate | null {
  const t = state.templates.find((x) => x.id === id);
  if (!t) return null;
  const copy = createTemplate({
    ...t,
    title: `${t.title} (Copy)`,
    steps: t.steps.map((s) => ({ ...s, id: uid("pst") })),
  } as any);
  return copy;
}

export function addStep(templateId: string, step?: Partial<ProtocolStep>) {
  const newStep: ProtocolStep = {
    id: uid("pst"),
    title: step?.title ?? "New step",
    instructions: step?.instructions ?? "",
    required: step?.required ?? true,
    notesAllowed: step?.notesAllowed ?? true,
    evidenceAllowed: step?.evidenceAllowed ?? true,
    approvalCheckpoint: step?.approvalCheckpoint ?? false,
    expectedResult: step?.expectedResult,
    snippet: step?.snippet,
  };
  set((s) => ({
    ...s,
    templates: s.templates.map((t) => t.id === templateId ? { ...t, steps: [...t.steps, newStep], updatedAt: new Date().toISOString() } : t),
  }));
}
export function updateStep(templateId: string, stepId: string, patch: Partial<ProtocolStep>) {
  set((s) => ({
    ...s,
    templates: s.templates.map((t) => t.id === templateId
      ? { ...t, steps: t.steps.map((st) => st.id === stepId ? { ...st, ...patch } : st), updatedAt: new Date().toISOString() }
      : t),
  }));
}
export function deleteStep(templateId: string, stepId: string) {
  set((s) => ({
    ...s,
    templates: s.templates.map((t) => t.id === templateId
      ? { ...t, steps: t.steps.filter((st) => st.id !== stepId), updatedAt: new Date().toISOString() }
      : t),
  }));
}
export function moveStep(templateId: string, stepId: string, dir: -1 | 1) {
  set((s) => ({
    ...s,
    templates: s.templates.map((t) => {
      if (t.id !== templateId) return t;
      const idx = t.steps.findIndex((st) => st.id === stepId);
      if (idx < 0) return t;
      const target = idx + dir;
      if (target < 0 || target >= t.steps.length) return t;
      const next = [...t.steps];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...t, steps: next, updatedAt: new Date().toISOString() };
    }),
  }));
}

// ---- Runs ----
function nextRunNumber(): string {
  const max = state.runs.reduce((m, r) => {
    const n = parseInt(r.runNumber.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 1000);
  return `PR-${String(max + 1).padStart(4, "0")}`;
}

export function startRun(templateId: string, opts?: { assignedUser?: string; dueDate?: string; linkedTicketId?: string; linkedAssetId?: string; linkedTaskId?: string }): ProtocolRun | null {
  const t = state.templates.find((x) => x.id === templateId);
  if (!t) return null;
  const run: ProtocolRun = {
    id: uid("prun"),
    runNumber: nextRunNumber(),
    templateId: t.id,
    templateTitle: t.title,
    status: "in_progress",
    assignedUser: opts?.assignedUser,
    team: t.assignedTeam,
    startedAt: new Date().toISOString(),
    dueDate: opts?.dueDate,
    linkedTicketId: opts?.linkedTicketId,
    linkedAssetId: opts?.linkedAssetId,
    linkedTaskId: opts?.linkedTaskId,
    steps: t.steps.map((s) => ({ stepId: s.id, completed: false })),
    approvals: [],
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  set((s) => ({
    ...s,
    runs: [run, ...s.runs],
    templates: s.templates.map((tt) => tt.id === t.id ? { ...tt, lastRunAt: run.createdAt } : tt),
  }));
  return run;
}

export function updateRun(id: string, patch: Partial<ProtocolRun>) {
  set((s) => ({
    ...s,
    runs: s.runs.map((r) => r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r),
  }));
}

export function updateRunStep(runId: string, stepId: string, patch: Partial<ProtocolRunStep>) {
  set((s) => ({
    ...s,
    runs: s.runs.map((r) => r.id === runId
      ? { ...r, steps: r.steps.map((st) => st.stepId === stepId ? { ...st, ...patch } : st), updatedAt: new Date().toISOString() }
      : r),
  }));
}

export function setRunStatus(runId: string, status: ProtocolStatus, summary?: string) {
  set((s) => ({
    ...s,
    runs: s.runs.map((r) => r.id === runId ? {
      ...r,
      status,
      completedAt: ["completed","completed_with_issues","failed","cancelled"].includes(status) ? new Date().toISOString() : r.completedAt,
      finalSummary: summary ?? r.finalSummary,
      updatedAt: new Date().toISOString(),
    } : r),
  }));
}

export function addApproval(runId: string, decision: "approved" | "rejected", by: string, comment?: string) {
  set((s) => ({
    ...s,
    runs: s.runs.map((r) => r.id === runId ? {
      ...r,
      approvals: [...r.approvals, { id: uid("apv"), by, decision, comment, at: new Date().toISOString() }],
      status: decision === "approved" ? "in_progress" : "failed",
      updatedAt: new Date().toISOString(),
    } : r),
  }));
}

export function addRunComment(runId: string, body: string, author: string) {
  set((s) => ({
    ...s,
    runs: s.runs.map((r) => r.id === runId ? {
      ...r,
      comments: [...r.comments, { id: uid("cmt"), body, author, at: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    } : r),
  }));
}

export function deleteRun(id: string) {
  set((s) => ({ ...s, runs: s.runs.filter((r) => r.id !== id) }));
}

export function runProgress(run: ProtocolRun): number {
  if (run.steps.length === 0) return 0;
  const done = run.steps.filter((s) => s.completed || s.skipped).length;
  return Math.round((done / run.steps.length) * 100);
}
