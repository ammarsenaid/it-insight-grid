import type {
  ID,
  NotificationItem,
  Task,
  TaskPriority,
  TaskRecurrence,
  TaskSavedView,
  TaskScope,
  TaskStatus,
  Ticket,
} from "./types";
import { getState, setState, uid, logActivity, trashItem } from "./store";

// Mock current user — would come from auth in a real backend.
export const CURRENT_USER = "alice.it";
export const CURRENT_TEAM = "Infrastructure";

export const TASK_OWNERS = ["alice.it", "bob.admin", "carol.netops", "david.secops"];
export const TASK_TEAMS = ["Service Desk", "Network", "Infrastructure", "Security", "Applications"];
export const TASK_CATEGORIES = [
  "Patching",
  "Security",
  "Backup",
  "Documentation",
  "Hardware",
  "Network",
  "Onboarding",
  "Active Directory",
  "General",
];

function pushNotification(n: Omit<NotificationItem, "id" | "createdAt">) {
  const item: NotificationItem = {
    ...n,
    id: uid("ntf"),
    createdAt: new Date().toISOString(),
    read: false,
  };
  setState((s) => ({ ...s, notifications: [item, ...s.notifications].slice(0, 50) }));
}

export type NewTaskInput = Partial<Omit<Task, "id" | "createdAt" | "updatedAt">> & {
  title: string;
};

export function createTask(input: NewTaskInput): Task {
  const ts = new Date().toISOString();
  const task: Task = {
    id: uid("tsk"),
    title: input.title.trim(),
    description: input.description ?? "",
    category: input.category ?? "General",
    priority: input.priority ?? "normal",
    status: input.status ?? "open",
    scope: input.scope ?? "personal",
    dueDate: input.dueDate,
    reminderAt: input.reminderAt,
    assignedTo: input.assignedTo ?? CURRENT_USER,
    owner: input.owner ?? CURRENT_USER,
    team: input.team,
    tags: input.tags ?? [],
    recurring: input.recurring ?? null,
    dependencyIds: input.dependencyIds ?? [],
    escalated: input.escalated ?? false,
    archived: false,
    watchers: input.watchers ?? [],
    linkedDocumentId: input.linkedDocumentId,
    linkedAssetId: input.linkedAssetId,
    linkedTicketIds: input.linkedTicketIds ?? [],
    linkedIpamIds: input.linkedIpamIds ?? [],
    linkedNoteIds: input.linkedNoteIds ?? [],
    linkedUserIds: input.linkedUserIds ?? [],
    sourceTicketId: input.sourceTicketId,
    notes: input.notes ?? "",
    createdAt: ts,
    updatedAt: ts,
  };
  setState((s) => ({ ...s, tasks: [task, ...s.tasks] }));
  logActivity("task.create", `Created task '${task.title}'`, "task", task.id);
  return task;
}

export function updateTask(id: ID, patch: Partial<Task>) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
    ),
  }));
  logActivity("task.update", `Updated task`, "task", id);
}

export function duplicateTask(id: ID): Task | null {
  const src = getState().tasks.find((t) => t.id === id);
  if (!src) return null;
  return createTask({
    ...src,
    title: src.title + " (copy)",
    status: "open",
    completedAt: undefined,
  });
}

function nextOccurrence(dateISO: string, rec: TaskRecurrence): string {
  const d = new Date(dateISO);
  const n = Math.max(1, rec.interval);
  if (rec.freq === "daily") d.setDate(d.getDate() + n);
  else if (rec.freq === "weekly") d.setDate(d.getDate() + 7 * n);
  else d.setMonth(d.getMonth() + n);
  return d.toISOString();
}

export function completeTask(id: ID) {
  const t = getState().tasks.find((x) => x.id === id);
  if (!t) return;
  const ts = new Date().toISOString();
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((x) =>
      x.id === id ? { ...x, status: "done", completedAt: ts, updatedAt: ts } : x,
    ),
  }));
  logActivity("task.complete", `Completed task '${t.title}'`, "task", id);
  // Spawn next occurrence if recurring
  if (t.recurring && t.dueDate) {
    const next = createTask({
      ...t,
      title: t.title,
      status: "open",
      completedAt: undefined,
      dueDate: nextOccurrence(t.dueDate, t.recurring),
      reminderAt: t.reminderAt ? nextOccurrence(t.reminderAt, t.recurring) : undefined,
    });
    pushNotification({
      title: "Recurring task scheduled",
      message: `${next.title} → ${new Date(next.dueDate!).toLocaleDateString()}`,
      type: "info",
    });
  }
}

export function reopenTask(id: ID) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id
        ? { ...t, status: "open", completedAt: undefined, updatedAt: new Date().toISOString() }
        : t,
    ),
  }));
  logActivity("task.reopen", `Reopened task`, "task", id);
}

export function setTaskStatus(id: ID, status: TaskStatus) {
  if (status === "done") return completeTask(id);
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t,
    ),
  }));
  logActivity("task.status", `Task status → ${status}`, "task", id);
}

export function archiveTask(id: ID) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === id ? { ...t, archived: true } : t)),
  }));
  logActivity("task.archive", `Archived task`, "task", id);
}

export function unarchiveTask(id: ID) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === id ? { ...t, archived: false } : t)),
  }));
}

export function deleteTask(id: ID) {
  const t = getState().tasks.find((x) => x.id === id);
  if (!t) return;
  trashItem("task", t.title, "Tasks", t, 512);
  setState((s) => ({ ...s, tasks: s.tasks.filter((x) => x.id !== id) }));
  logActivity("task.delete", `Deleted task '${t.title}'`, "task", id);
}

export function escalateTask(id: ID) {
  const t = getState().tasks.find((x) => x.id === id);
  if (!t) return;
  const nextPrio: TaskPriority =
    t.priority === "low"
      ? "normal"
      : t.priority === "normal"
        ? "high"
        : "critical";
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((x) =>
      x.id === id
        ? { ...x, priority: nextPrio, escalated: true, updatedAt: new Date().toISOString() }
        : x,
    ),
  }));
  pushNotification({
    title: "Task escalated",
    message: `${t.title} → ${nextPrio.toUpperCase()}`,
    type: "warning",
  });
  logActivity("task.escalate", `Escalated task '${t.title}'`, "task", id);
}

export function scheduleReminder(id: ID, whenISO: string) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id ? { ...t, reminderAt: whenISO, updatedAt: new Date().toISOString() } : t,
    ),
  }));
  const t = getState().tasks.find((x) => x.id === id);
  pushNotification({
    title: "Reminder set",
    message: `${t?.title ?? "Task"} · ${new Date(whenISO).toLocaleString()}`,
    type: "info",
  });
}

// --- Saved views ---
export function saveTaskView(view: Omit<TaskSavedView, "id">): TaskSavedView {
  const v: TaskSavedView = { ...view, id: uid("tvw") };
  setState((s) => ({ ...s, taskViews: [v, ...s.taskViews] }));
  return v;
}

export function deleteTaskView(id: ID) {
  setState((s) => ({ ...s, taskViews: s.taskViews.filter((v) => v.id !== id) }));
}

// --- Conversion ---
export function convertTicketToTask(ticket: Ticket): Task {
  return createTask({
    title: `[${ticket.number}] ${ticket.subject}`,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority as TaskPriority,
    status: "open",
    scope: "team",
    team: ticket.team,
    assignedTo: ticket.assignee ?? CURRENT_USER,
    owner: ticket.assignee ?? CURRENT_USER,
    linkedTicketIds: [ticket.id],
    linkedAssetId: ticket.linkedAssetId,
    linkedIpamIds: ticket.linkedIpamId ? [ticket.linkedIpamId] : [],
    linkedDocumentId: ticket.linkedDocumentId,
    sourceTicketId: ticket.id,
    tags: ["from-ticket", ...ticket.tags],
  });
}

export function isOverdue(t: Task): boolean {
  return !!t.dueDate && t.status !== "done" && new Date(t.dueDate) < new Date();
}

export function blockedByOpen(t: Task, all: Task[]): boolean {
  if (!t.dependencyIds?.length) return false;
  return t.dependencyIds.some((id) => {
    const dep = all.find((x) => x.id === id);
    return dep && dep.status !== "done";
  });
}

export const TASK_SCOPES: TaskScope[] = ["personal", "team", "shared"];
