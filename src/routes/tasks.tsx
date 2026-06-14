import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Plus, CheckSquare, AlertTriangle, Calendar as CalendarIcon, Flame, CheckCircle2,
  MoreHorizontal, Edit, Trash2, PlayCircle, Copy, TrendingUp, Archive,
  Bookmark, Repeat, RotateCcw, Search, FileCode, ChevronLeft, ChevronRight, Layers, Users,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormDrawer } from "@/components/common/FormDrawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useData } from "@/lib/data/store";
import {
  CURRENT_TEAM, CURRENT_USER, TASK_CATEGORIES, TASK_OWNERS, TASK_TEAMS, TASK_SOURCES,
  deleteTaskView, saveTaskView,
} from "@/lib/data/tasks";
import { getTaskTemplate } from "@/lib/data/task-templates";
import { useTemplates, incrementUsage } from "@/lib/templates/store";
import type { RegistryTemplate } from "@/lib/templates/types";
import { tasksKeys, tasksQuery } from "@/lib/tasks/queries";
import {
  bulkAddTaskTag, bulkSetTasksArchived, bulkSoftDeleteTasks, bulkUpdateTasks,
  checklistProgress, duplicateTask, escalateTask, isOverdue, publicTaskError,
  saveTask, saveTaskLinks, setTaskArchived, setTaskReminder, setTaskStatus, softDeleteTask,
} from "@/lib/tasks/tasks";
import type {
  Task, TaskBulkPatch, TaskInput, TaskLinks, TaskPriority, TaskRecurrence, TaskScope, TaskSource, TaskStatus,
} from "@/lib/tasks/types";
import { toast } from "sonner";
import { formatDate } from "@/components/common/format";
import { can, useRole } from "@/lib/permissions";
import { TaskDetailsDrawer } from "@/components/tasks/TaskDetailsDrawer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks · IT Knowledge Center" },
      { name: "description", content: "Operational task tracking for the IT department." },
    ],
  }),
  component: TasksPage,
});

type ScopeTab = "my" | "team" | "all" | "ticket" | "maintenance" | "recurring" | "protocol" | "completed" | "calendar";

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "critical"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "blocked", "done"];
const PRIO_TONE = { low: "muted", normal: "info", high: "warning", critical: "danger" } as const;

interface FormState {
  title: string;
  description: string;
  category: string;
  priority: TaskPriority;
  status: TaskStatus;
  scope: TaskScope;
  source: TaskSource;
  dueDate: string;
  reminderAt: string;
  assignedTo: string;
  team: string;
  tags: string;
  watchers: string;
  recurringFreq: "none" | "daily" | "weekly" | "monthly" | "quarterly";
  recurringInterval: number;
  notes: string;
}

const empty = (): FormState => ({
  title: "", description: "", category: "General", priority: "normal", status: "open",
  scope: "personal", source: "manual", dueDate: "", reminderAt: "", assignedTo: CURRENT_USER,
  team: CURRENT_TEAM, tags: "", watchers: "",
  recurringFreq: "none", recurringInterval: 1, notes: "",
});

function applyTemplateToForm(templateId: string, prev: FormState, registry: RegistryTemplate[]): FormState {
  // Try built-in by id (legacy) or via registry sourceId.
  const reg = registry.find((t) => t.id === templateId);
  const builtinId = reg?.sourceId ?? templateId;
  const tpl = getTaskTemplate(builtinId);
  if (tpl) {
    return {
      ...prev,
      title: tpl.name,
      description: tpl.description ?? prev.description,
      category: tpl.category,
      priority: tpl.priority,
      team: tpl.defaultTeam ?? prev.team,
      tags: (tpl.tags ?? []).join(", "),
      recurringFreq: tpl.recurring?.freq ?? "none",
      recurringInterval: tpl.recurring?.interval ?? 1,
      source: "template",
    };
  }
  if (!reg) return prev;
  return {
    ...prev,
    title: reg.name,
    description: reg.description ?? prev.description,
    category: reg.category,
    team: reg.defaultTeam ?? prev.team,
    tags: reg.tags.join(", "),
    source: "template",
  };
}

function resolveChecklistForTemplate(templateId: string, registry: RegistryTemplate[]) {
  const reg = registry.find((t) => t.id === templateId);
  const builtinId = reg?.sourceId ?? templateId;
  const builtin = getTaskTemplate(builtinId);
  if (builtin?.checklist?.length) return builtin.checklist;
  return reg?.checklist ?? null;
}

function TasksPage() {
  const data = useData();
  const role = useRole();
  const writable = can("tasks.write", role);
  const canSeeAll = can("tasks.view", role);
  const qc = useQueryClient();

  const tasksQ = useQuery({ ...tasksQuery(), enabled: canSeeAll });
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const invalidate = () => qc.invalidateQueries({ queryKey: tasksKeys.all });

  const [scope, setScope] = useState<ScopeTab>("my");
  const [query, setQuery] = useState("");
  const [fCat, setFCat] = useState("all");
  const [fPrio, setFPrio] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fTeam, setFTeam] = useState("all");
  const [fAssignee, setFAssignee] = useState("all");
  const [fSource, setFSource] = useState("all");
  const [fDue, setFDue] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState<string | null>(null);
  const [editOriginalStatus, setEditOriginalStatus] = useState<TaskStatus | null>(null);
  const [templateId, setTemplateId] = useState<string>("none");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [calCursor, setCalCursor] = useState<Date>(new Date());
  const allRegistryTemplates = useTemplates();
  const taskRegistryTemplates = useMemo(
    () => allRegistryTemplates.filter((t) => t.type === "task" && !t.archived),
    [allRegistryTemplates],
  );

  const cats = useMemo(() => {
    const set = new Set(TASK_CATEGORIES);
    tasks.forEach((t) => set.add(t.category));
    return Array.from(set);
  }, [tasks]);

  const visibleByTab = (t: Task) => {
    if (!showArchived && t.archived) return false;
    switch (scope) {
      case "my":
        return t.assignedTo === CURRENT_USER || t.owner === CURRENT_USER;
      case "team":
        return (t.team || CURRENT_TEAM) === CURRENT_TEAM;
      case "all":
        return canSeeAll;
      case "ticket":
        return (t.links.linkedTicketIds?.length ?? 0) > 0 || !!t.links.sourceTicketId;
      case "maintenance":
        return t.category === "Maintenance" || t.category === "Patching" || t.category === "Backup";
      case "recurring":
        return !!t.recurring;
      case "protocol":
        return (t.links.linkedProtocolRunIds?.length ?? 0) > 0 || t.source === "protocol" || t.category === "Protocol";
      case "completed":
        return t.status === "done";
      case "calendar":
        return !!t.dueDate;
    }
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const now = Date.now();
    return tasks.filter((t) => {
      if (!visibleByTab(t)) return false;
      if (fCat !== "all" && t.category !== fCat) return false;
      if (fPrio !== "all" && t.priority !== fPrio) return false;
      if (fStatus !== "all" && t.status !== fStatus) return false;
      if (fTeam !== "all" && t.team !== fTeam) return false;
      if (fAssignee !== "all" && t.assignedTo !== fAssignee) return false;
      if (fSource !== "all" && t.source !== fSource) return false;
      if (fDue !== "all" && t.dueDate) {
        const days = (new Date(t.dueDate).getTime() - now) / 86400000;
        if (fDue === "overdue" && !(days < 0 && t.status !== "done")) return false;
        if (fDue === "today" && !(days >= -1 && days <= 1)) return false;
        if (fDue === "week" && !(days >= 0 && days <= 7)) return false;
        if (fDue === "month" && !(days >= 0 && days <= 30)) return false;
      } else if (fDue !== "all" && !t.dueDate) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [tasks, query, fCat, fPrio, fStatus, fTeam, fAssignee, fSource, fDue, scope, showArchived, canSeeAll]);

  // metrics
  const all = tasks.filter((t) => !t.archived);
  const open = all.filter((t) => t.status !== "done").length;
  const mine = all.filter((t) => t.assignedTo === CURRENT_USER && t.status !== "done").length;
  const teamTasks = all.filter((t) => (t.team || CURRENT_TEAM) === CURRENT_TEAM && t.status !== "done").length;
  const overdue = all.filter(isOverdue).length;
  const dueSoon = all.filter((t) => {
    if (t.status === "done" || !t.dueDate) return false;
    const days = (new Date(t.dueDate).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 3;
  }).length;
  const dueToday = all.filter((t) => {
    if (t.status === "done" || !t.dueDate) return false;
    return new Date(t.dueDate).toDateString() === new Date().toDateString();
  }).length;
  const blocked = all.filter((t) => t.status === "blocked").length;
  const critical = all.filter((t) => t.priority === "critical" && t.status !== "done").length;
  const weekAgo = Date.now() - 7 * 86400_000;
  const completedThisWeek = tasks.filter((t) => t.status === "done" && t.completedAt && new Date(t.completedAt).getTime() >= weekAgo).length;
  const [showMoreMetrics, setShowMoreMetrics] = useState(false);

  const allowedTabs: { value: ScopeTab; label: string; show: boolean }[] = [
    { value: "my", label: "My Tasks", show: true },
    { value: "team", label: `Team`, show: writable || canSeeAll },
    { value: "all", label: "All", show: canSeeAll },
    { value: "ticket", label: "Tickets", show: true },
    { value: "maintenance", label: "Maintenance", show: true },
    { value: "recurring", label: "Recurring", show: true },
    { value: "protocol", label: "Protocols", show: true },
    { value: "completed", label: "Completed", show: true },
    { value: "calendar", label: "Calendar", show: true },
  ];

  const openCreate = (presetTpl?: string) => {
    if (!writable) { toast.error("Read-only role"); return; }
    setEditId(null);
    setEditOriginalStatus(null);
    const base = empty();
    setForm(presetTpl ? applyTemplateToForm(presetTpl, base, taskRegistryTemplates) : base);
    if (presetTpl) incrementUsage(presetTpl);
    setTemplateId(presetTpl ?? "none");
    setDrawerOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditId(t.id);
    setEditOriginalStatus(t.status);
    setTemplateId("none");
    setForm({
      title: t.title, description: t.description, category: t.category,
      priority: t.priority, status: t.status, scope: t.scope,
      source: t.source,
      dueDate: t.dueDate?.slice(0, 10) ?? "", reminderAt: t.reminderAt?.slice(0, 16) ?? "",
      assignedTo: t.assignedTo, team: t.team || CURRENT_TEAM,
      tags: t.tags.join(", "),
      watchers: t.watchers.join(", "),
      recurringFreq: t.recurring?.freq ?? "none",
      recurringInterval: t.recurring?.interval ?? 1,
      notes: t.notes,
    });
    setDrawerOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (input: TaskInput) => saveTask(editId, input),
    onSuccess: async (_id, input) => {
      await invalidate();
      if (editId && editOriginalStatus && input.status && input.status !== editOriginalStatus) {
        try {
          await setTaskStatus(editId, input.status);
          await invalidate();
        } catch (error) {
          toast.error(publicTaskError(error));
        }
      }
      toast.success(editId ? "Task updated" : "Task created");
      setDrawerOpen(false);
    },
    onError: (error) => toast.error(publicTaskError(error)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => setTaskStatus(id, status),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(publicTaskError(error)),
  });
  const escalateMutation = useMutation({
    mutationFn: (id: string) => escalateTask(id),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(publicTaskError(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => setTaskArchived(id, archived),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(publicTaskError(error)),
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateTask(id),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(publicTaskError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteTask(id),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(publicTaskError(error)),
  });
  const reminderMutation = useMutation({
    mutationFn: ({ id, reminderAt }: { id: string; reminderAt: string }) => setTaskReminder(id, reminderAt),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(publicTaskError(error)),
  });
  const linksMutation = useMutation({
    mutationFn: ({ id, links }: { id: string; links: TaskLinks }) => saveTaskLinks(id, links),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(publicTaskError(error)),
  });
  const bulkUpdateMutation = useMutation({
    mutationFn: (patch: TaskBulkPatch) => bulkUpdateTasks(selIds(), patch),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(publicTaskError(error)),
  });
  const bulkAddTagMutation = useMutation({
    mutationFn: (tag: string) => bulkAddTaskTag(selIds(), tag),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(publicTaskError(error)),
  });
  const bulkArchiveMutation = useMutation({
    mutationFn: () => bulkSetTasksArchived(selIds(), true),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(publicTaskError(error)),
  });
  const bulkDeleteMutation = useMutation({
    mutationFn: () => bulkSoftDeleteTasks(selIds()),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(publicTaskError(error)),
  });

  const save = () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const recurring: TaskRecurrence | null = form.recurringFreq === "none"
      ? null
      : { freq: form.recurringFreq, interval: Math.max(1, form.recurringInterval) };
    const tags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
    const watchers = form.watchers.split(",").map((s) => s.trim()).filter(Boolean);
    const checklistSrc = templateId !== "none" ? resolveChecklistForTemplate(templateId, taskRegistryTemplates) : null;
    const existing = editId ? tasks.find((x) => x.id === editId) : null;
    const checklist = editId
      ? existing?.checklist ?? []
      : checklistSrc
        ? checklistSrc.map((c, i) => ({ id: `ck_${Date.now()}_${i}`, title: c.title, completed: false, required: !!c.required }))
        : [];
    const input: TaskInput = {
      title: form.title.trim(),
      description: form.description,
      category: form.category,
      priority: form.priority,
      status: form.status,
      scope: form.scope,
      source: form.source,
      dueDate: form.dueDate || null,
      reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : null,
      assignedTo: form.assignedTo,
      owner: existing?.owner ?? "",
      team: form.team,
      tags,
      watchers,
      recurring,
      checklist,
      notes: form.notes,
    };
    saveMutation.mutate(input);
  };

  const applyView = (id: string) => {
    const v = data.taskViews.find((x) => x.id === id);
    if (!v) return;
    if (["my","team","all"].includes(v.scope)) setScope(v.scope as ScopeTab);
    setQuery(v.query);
    setFCat(v.filters.category ?? "all");
    setFPrio(v.filters.priority ?? "all");
    setFStatus(v.filters.status ?? "all");
    setFTeam(v.filters.team ?? "all");
    setFAssignee(v.filters.assignee ?? "all");
    setFSource(v.filters.source ?? "all");
  };
  const persistView = () => {
    if (!newViewName.trim()) { toast.error("Name required"); return; }
    saveTaskView({
      name: newViewName.trim(),
      scope: (["my","team","all"].includes(scope) ? scope : "my") as "my"|"team"|"all",
      query,
      filters: { category: fCat, priority: fPrio, status: fStatus, team: fTeam, assignee: fAssignee, source: fSource },
    });
    setSaveViewOpen(false); setNewViewName("");
    toast.success("View saved");
  };

  const resetFilters = () => {
    setQuery(""); setFCat("all"); setFPrio("all"); setFStatus("all");
    setFTeam("all"); setFAssignee("all"); setFSource("all"); setFDue("all");
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((t) => t.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const selIds = () => Array.from(selected);

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Plan, assign and track operational work."
        actions={writable ? (
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary"><FileCode className="mr-1.5 h-4 w-4" /> From template</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto">
                <DropdownMenuLabel className="text-[10px] uppercase">Task templates</DropdownMenuLabel>
                {taskRegistryTemplates.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => openCreate(t.id)}>
                    <span className="truncate">{t.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{t.category}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => openCreate()}><Plus className="mr-1.5 h-4 w-4" /> New task</Button>
          </div>
        ) : null}
      />

      {/* Metric cards — five primary, with reveal for the rest */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <button onClick={() => { setScope("all"); setFStatus("open"); }} className="text-left">
          <MetricCard icon={CheckSquare} label="Open tasks" value={open} accent="primary" />
        </button>
        <button onClick={() => setScope("my")} className="text-left">
          <MetricCard icon={Users} label="Assigned to me" value={mine} accent="primary" />
        </button>
        <button onClick={() => { setScope("all"); setFDue("today"); }} className="text-left">
          <MetricCard icon={CalendarIcon} label="Due today" value={dueToday} accent="warning" />
        </button>
        <button onClick={() => { setScope("all"); setFDue("overdue"); }} className="text-left">
          <MetricCard icon={AlertTriangle} label="Overdue" value={overdue} accent="danger" />
        </button>
        <button onClick={() => setScope("completed")} className="text-left">
          <MetricCard icon={CheckCircle2} label="Completed this week" value={completedThisWeek} accent="success" />
        </button>
      </div>
      {showMoreMetrics && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button onClick={() => setScope("team")} className="text-left">
            <MetricCard icon={Users} label="Team tasks" value={teamTasks} accent="primary" />
          </button>
          <button onClick={() => { setScope("all"); setFDue("week"); }} className="text-left">
            <MetricCard icon={CalendarIcon} label="Due soon" value={dueSoon} accent="warning" />
          </button>
          <button onClick={() => { setScope("all"); setFStatus("blocked"); }} className="text-left">
            <MetricCard icon={Layers} label="Blocked" value={blocked} accent="warning" />
          </button>
          <button onClick={() => { setScope("all"); setFPrio("critical"); }} className="text-left">
            <MetricCard icon={Flame} label="Critical" value={critical} accent="danger" />
          </button>
        </div>
      )}
      <div className="mt-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setShowMoreMetrics((v) => !v)}>
          {showMoreMetrics ? "Hide extra metrics" : "Show more metrics"}
        </Button>
      </div>

      <div className="mt-6 glass-card rounded-2xl p-4">
        <Tabs value={scope} onValueChange={(v) => setScope(v as ScopeTab)}>
          <TabsList className="flex h-auto flex-wrap bg-background/40">
            {allowedTabs.filter((t) => t.show).map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.value === "team" ? `Team (${CURRENT_TEAM})` : t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search tasks..." className="w-full sm:w-64" />
          <Select value={fCat} onValueChange={setFCat}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All categories</SelectItem>{cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fPrio} onValueChange={setFPrio}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All priority</SelectItem>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All status</SelectItem>{STATUSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fTeam} onValueChange={setFTeam}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Team" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All teams</SelectItem>{TASK_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fAssignee} onValueChange={setFAssignee}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All assignees</SelectItem>{TASK_OWNERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fSource} onValueChange={setFSource}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All sources</SelectItem>{TASK_SOURCES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fDue} onValueChange={setFDue}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Due" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any time</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-9" onClick={() => setShowArchived((v) => !v)}>
            <Archive className="mr-1 h-3.5 w-3.5" /> {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          <Button variant="ghost" size="sm" className="h-9" onClick={resetFilters}>Reset</Button>
          <div className="ml-auto flex items-center gap-2">
            <Select value="" onValueChange={applyView}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Saved views" /></SelectTrigger>
              <SelectContent>
                {data.taskViews.length === 0 && <SelectItem value="__none" disabled>No views</SelectItem>}
                {data.taskViews.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setSaveViewOpen(true)}>
              <Bookmark className="mr-1.5 h-3.5 w-3.5" /> Save view
            </Button>
            {data.taskViews.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {data.taskViews.map((v) => (
                    <DropdownMenuItem key={v.id} className="text-destructive" onClick={() => { deleteTaskView(v.id); toast.success("View removed"); }}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete '{v.name}'
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {writable && selected.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            <span className="font-medium">{selected.size} selected</span>
            <Select onValueChange={(v) => bulkUpdateMutation.mutate({ assignedTo: v }, { onSuccess: () => { toast.success(`Assigned to ${v}`); setSelected(new Set()); } })}>
              <SelectTrigger className="h-7 w-[140px]"><SelectValue placeholder="Assign user" /></SelectTrigger>
              <SelectContent>{TASK_OWNERS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
            <Select onValueChange={(v) => bulkUpdateMutation.mutate({ team: v }, { onSuccess: () => { toast.success(`Team: ${v}`); setSelected(new Set()); } })}>
              <SelectTrigger className="h-7 w-[140px]"><SelectValue placeholder="Assign team" /></SelectTrigger>
              <SelectContent>{TASK_TEAMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
            <Select onValueChange={(v) => bulkUpdateMutation.mutate({ status: v as TaskStatus }, { onSuccess: () => { toast.success(`Status: ${v}`); setSelected(new Set()); } })}>
              <SelectTrigger className="h-7 w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>{STATUSES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
            <Select onValueChange={(v) => bulkUpdateMutation.mutate({ priority: v as TaskPriority }, { onSuccess: () => { toast.success(`Priority: ${v}`); setSelected(new Set()); } })}>
              <SelectTrigger className="h-7 w-[120px]"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="date" className="h-7 w-[140px]" onChange={(e) => {
              if (!e.target.value) return;
              bulkUpdateMutation.mutate({ dueDate: e.target.value }, { onSuccess: () => { toast.success("Due date set"); setSelected(new Set()); } });
            }} />
            <Button size="sm" variant="ghost" className="h-7" onClick={() => {
              const t = prompt("Tag to add:");
              if (t) bulkAddTagMutation.mutate(t, { onSuccess: () => { toast.success("Tag added"); setSelected(new Set()); } });
            }}>Add tag</Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => bulkArchiveMutation.mutate(undefined, { onSuccess: () => { toast.success("Archived"); setSelected(new Set()); } })}>
              <Archive className="mr-1 h-3 w-3" /> Archive
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => bulkDeleteMutation.mutate(undefined, { onSuccess: () => { toast.success("Moved to recycle bin"); setSelected(new Set()); } })}>
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-7 ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        {/* Body */}
        {scope === "calendar" ? (
          <CalendarView tasks={filtered} cursor={calCursor} setCursor={setCalCursor} onOpen={(id) => setDetailId(id)} />
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-border/40">
            {filtered.length === 0 ? (
              (query || fCat !== "all" || fPrio !== "all" || fStatus !== "all" || fTeam !== "all" || fAssignee !== "all" || fSource !== "all" || fDue !== "all") ? (
                <EmptyState
                  icon={CheckSquare}
                  title="No matching records"
                  description="No records match the selected filters."
                  actionLabel="Clear filters"
                  onAction={resetFilters}
                />
              ) : (
                <EmptyState
                  icon={CheckSquare}
                  title={tasksQ.isLoading ? "Loading tasks" : "No tasks yet"}
                  description={tasksQ.isLoading ? "Loading shared task data." : "Create the first task to begin tracking operational work."}
                  actionLabel={writable ? "Create task" : undefined}
                  onAction={writable ? () => openCreate() : undefined}
                />
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-card/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="w-8 px-2 py-2">
                        <Checkbox checked={selected.size > 0 && selected.size === filtered.length} onCheckedChange={toggleAll} />
                      </th>
                      <th className="px-2 py-2 text-left">Task</th>
                      <th className="px-2 py-2 text-left">Category</th>
                      <th className="px-2 py-2 text-left">Priority</th>
                      <th className="px-2 py-2 text-left">Status</th>
                      <th className="px-2 py-2 text-left">Assignee</th>
                      <th className="px-2 py-2 text-left">Team</th>
                      <th className="px-2 py-2 text-left">Due</th>
                      <th className="px-2 py-2 text-left">Source</th>
                      <th className="px-2 py-2 text-left">Linked</th>
                      <th className="px-2 py-2 text-left">Progress</th>
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => {
                      const over = isOverdue(t);
                      const prog = checklistProgress(t);
                      const linkedCount = (t.links.linkedTicketIds?.length ?? 0) + (t.links.linkedProtocolRunIds?.length ?? 0) + (t.links.linkedAssetId ? 1 : 0) + (t.links.linkedNoteIds?.length ?? 0);
                      return (
                        <tr key={t.id} className="border-t border-border/30 hover:bg-white/[0.02]">
                          <td className="px-2 py-2"><Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} /></td>
                          <td className="px-2 py-2">
                            <button onClick={() => setDetailId(t.id)} className="text-left">
                              <div className="font-medium text-foreground hover:text-primary">{t.title}</div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                {t.recurring && <Repeat className="h-3 w-3" />}
                                {t.escalated && <TrendingUp className="h-3 w-3 text-[#FF7C91]" />}
                                {t.tags.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}
                              </div>
                            </button>
                          </td>
                          <td className="px-2 py-2"><StatusBadge tone="muted" label={t.category} /></td>
                          <td className="px-2 py-2"><StatusBadge tone={PRIO_TONE[t.priority]} label={t.priority} /></td>
                          <td className="px-2 py-2"><StatusBadge tone={statusTone(t.status)} label={t.status.replace("_", " ")} /></td>
                          <td className="px-2 py-2 text-xs">{t.assignedTo || "—"}</td>
                          <td className="px-2 py-2 text-xs text-muted-foreground">{t.team || "—"}</td>
                          <td className="px-2 py-2 text-xs">
                            {t.dueDate ? <span className={over ? "text-[#FF7C91]" : "text-muted-foreground"}>{formatDate(t.dueDate)}</span> : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-2 py-2 text-xs text-muted-foreground">{t.source}</td>
                          <td className="px-2 py-2 text-xs text-muted-foreground">{linkedCount > 0 ? linkedCount : "—"}</td>
                          <td className="px-2 py-2">
                            {prog.total > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <Progress value={prog.pct} className="h-1.5 w-14" />
                                <span className="text-[10px] text-muted-foreground">{prog.done}/{prog.total}</span>
                              </div>
                            ) : <span className="text-[10px] text-muted-foreground">—</span>}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <RowMenu
                              task={t}
                              writable={writable}
                              onOpen={() => setDetailId(t.id)}
                              onEdit={() => openEdit(t)}
                              onDelete={() => setConfirmDelete(t.id)}
                              onComplete={() => statusMutation.mutate({ id: t.id, status: "done" }, { onSuccess: () => toast.success("Completed") })}
                              onReopen={() => statusMutation.mutate({ id: t.id, status: "open" }, { onSuccess: () => toast.success("Reopened") })}
                              onStart={() => statusMutation.mutate({ id: t.id, status: "in_progress" }, { onSuccess: () => toast.success("Started") })}
                              onMarkBlocked={() => statusMutation.mutate({ id: t.id, status: "blocked" }, { onSuccess: () => toast.success("Marked blocked") })}
                              onDuplicate={() => duplicateMutation.mutate(t.id, { onSuccess: () => toast.success("Duplicated") })}
                              onEscalate={() => escalateMutation.mutate(t.id, { onSuccess: () => toast.success("Escalated") })}
                              onArchive={() => archiveMutation.mutate({ id: t.id, archived: true }, { onSuccess: () => toast.success("Archived") })}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit drawer */}
      <FormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={editId ? "Edit task" : "New task"} onSubmit={save} submitLabel={editId ? "Save changes" : "Create"}>
        {!editId && (
          <div>
            <Label className="text-xs">Use template</Label>
            <Select value={templateId} onValueChange={(v) => { setTemplateId(v); if (v !== "none") { setForm((p) => applyTemplateToForm(v, p, taskRegistryTemplates)); incrementUsage(v); } }}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {taskRegistryTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Scope</Label>
            <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as TaskScope })}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="shared">Shared</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Assigned to</Label>
            <Select value={form.assignedTo} onValueChange={(v) => setForm({ ...form, assignedTo: v })}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{TASK_OWNERS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Team</Label>
            <Select value={form.team} onValueChange={(v) => setForm({ ...form, team: v })}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{TASK_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Due date</Label>
            <Input type="date" className="mt-1 h-9" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Reminder</Label>
            <Input type="datetime-local" className="mt-1 h-9" value={form.reminderAt} onChange={(e) => setForm({ ...form, reminderAt: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Recurrence</Label>
            <Select value={form.recurringFreq} onValueChange={(v) => setForm({ ...form, recurringFreq: v as FormState["recurringFreq"] })}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Repeat every (n)</Label>
            <Input type="number" min={1} className="mt-1 h-9" value={form.recurringInterval} onChange={(e) => setForm({ ...form, recurringInterval: Math.max(1, parseInt(e.target.value || "1", 10)) })} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Tags (comma separated)</Label>
          <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="mt-1 h-9" />
        </div>
        <div>
          <Label className="text-xs">Watchers (comma separated)</Label>
          <Input value={form.watchers} onChange={(e) => setForm({ ...form, watchers: e.target.value })} className="mt-1 h-9" />
        </div>
        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" />
        </div>
      </FormDrawer>

      {/* Save view dialog */}
      <FormDrawer open={saveViewOpen} onOpenChange={setSaveViewOpen} title="Save current view" onSubmit={persistView} submitLabel="Save view">
        <div>
          <Label className="text-xs">View name</Label>
          <Input value={newViewName} onChange={(e) => setNewViewName(e.target.value)} className="mt-1 h-9" />
        </div>
      </FormDrawer>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete task?"
        destructive
        confirmLabel="Delete"
        onConfirm={() => {
          if (!confirmDelete) return;
          const id = confirmDelete;
          deleteMutation.mutate(id, { onSuccess: () => toast.success("Moved to recycle bin") });
          setConfirmDelete(null);
        }}
      />

      <TaskDetailsDrawer
        task={tasks.find((t) => t.id === detailId) ?? null}
        allTasks={tasks}
        open={!!detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
        onEdit={(t) => { setDetailId(null); openEdit(t); }}
        onComplete={(id) => statusMutation.mutateAsync({ id, status: "done" })}
        onReopen={(id) => statusMutation.mutateAsync({ id, status: "open" })}
        onDuplicate={(id) => duplicateMutation.mutateAsync(id)}
        onEscalate={(id) => escalateMutation.mutateAsync(id)}
        onArchive={(id) => archiveMutation.mutateAsync({ id, archived: true })}
        onDelete={(id) => deleteMutation.mutateAsync(id)}
        onSetReminder={(id, reminderAt) => reminderMutation.mutateAsync({ id, reminderAt })}
        onSaveLinks={(id, links) => linksMutation.mutateAsync({ id, links })}
      />
    </div>
  );
}

function RowMenu({
  task, writable, onOpen, onEdit, onDelete,
  onComplete, onReopen, onStart, onMarkBlocked, onDuplicate, onEscalate, onArchive,
}: {
  task: Task;
  writable: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onStart: () => void;
  onMarkBlocked: () => void;
  onDuplicate: () => void;
  onEscalate: () => void;
  onArchive: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onOpen}><Search className="mr-2 h-3.5 w-3.5" /> Open</DropdownMenuItem>
        {writable && <DropdownMenuItem onClick={onEdit}><Edit className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>}
        {writable && task.status !== "done" && (
          <DropdownMenuItem onClick={onComplete}>
            <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Mark done
          </DropdownMenuItem>
        )}
        {writable && task.status === "done" && (
          <DropdownMenuItem onClick={onReopen}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reopen
          </DropdownMenuItem>
        )}
        {writable && task.status === "open" && (
          <DropdownMenuItem onClick={onStart}>
            <PlayCircle className="mr-2 h-3.5 w-3.5" /> Start
          </DropdownMenuItem>
        )}
        {writable && (
          <>
            <DropdownMenuItem onClick={onMarkBlocked}>
              <Layers className="mr-2 h-3.5 w-3.5" /> Mark blocked
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEscalate}>
              <TrendingUp className="mr-2 h-3.5 w-3.5" /> Escalate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onArchive}>
              <Archive className="mr-2 h-3.5 w-3.5" /> Archive
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- Calendar ----
function CalendarView({ tasks, cursor, setCursor, onOpen }: { tasks: Task[]; cursor: Date; setCursor: (d: Date) => void; onOpen: (id: string) => void }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay(); // 0..6
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date | null }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d) });
  while (cells.length % 7 !== 0) cells.push({ date: null });

  const byDay = new Map<string, Task[]>();
  tasks.forEach((t) => {
    if (!t.dueDate) return;
    const key = new Date(t.dueDate).toDateString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(t);
  });

  const today = new Date().toDateString();
  const monthLabel = first.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="mt-3 rounded-xl border border-border/40">
      <div className="flex items-center justify-between border-b border-border/40 p-3">
        <div className="text-sm font-medium">{monthLabel}</div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setCursor(new Date())}>Today</Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-border/30 bg-card/40 text-[10px] uppercase tracking-wider text-muted-foreground">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          if (!c.date) return <div key={i} className="h-24 border-b border-r border-border/20 bg-background/20" />;
          const list = byDay.get(c.date.toDateString()) ?? [];
          const isToday = c.date.toDateString() === today;
          return (
            <div key={i} className={cn("h-24 border-b border-r border-border/20 p-1 text-xs", isToday && "bg-primary/5")}>
              <div className={cn("mb-0.5 text-[10px]", isToday ? "font-bold text-primary" : "text-muted-foreground")}>{c.date.getDate()}</div>
              <div className="space-y-0.5 overflow-hidden">
                {list.slice(0, 3).map((t) => {
                  const over = isOverdue(t);
                  return (
                    <button key={t.id} onClick={() => onOpen(t.id)} className={cn(
                      "block w-full truncate rounded px-1 py-0.5 text-left text-[10px]",
                      t.priority === "critical" ? "bg-[#FF7C91]/20 text-[#FF7C91]" :
                      t.priority === "high" ? "bg-[#FFC86B]/20 text-[#FFC86B]" :
                      over ? "bg-[#FF7C91]/15 text-[#FF7C91]" : "bg-white/[0.04] text-foreground/80",
                    )}>
                      {t.title}
                    </button>
                  );
                })}
                {list.length > 3 && <div className="text-[10px] text-muted-foreground">+{list.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
