import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus, CheckSquare, Clock, AlertTriangle, Calendar, Flame, CheckCircle2,
  MoreHorizontal, Edit, Trash2, PlayCircle, Copy, TrendingUp, Bell, Archive,
  Bookmark, Repeat, RotateCcw, Search,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/common/SearchInput";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormDrawer } from "@/components/common/FormDrawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useData } from "@/lib/data/store";
import {
  CURRENT_TEAM, CURRENT_USER, TASK_CATEGORIES, TASK_OWNERS, TASK_TEAMS,
  archiveTask, completeTask, convertTicketToTask, createTask, deleteTask, deleteTaskView,
  duplicateTask, escalateTask, isOverdue, reopenTask, saveTaskView, setTaskStatus, updateTask,
} from "@/lib/data/tasks";
import type { Task, TaskPriority, TaskScope, TaskStatus } from "@/lib/data/types";
import { toast } from "sonner";
import { formatDate } from "@/components/common/format";
import { can, useRole } from "@/lib/permissions";
import { TaskDetailsDrawer } from "@/components/tasks/TaskDetailsDrawer";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks · IT Knowledge Center" },
      { name: "description", content: "Operational task tracking for the IT department." },
    ],
  }),
  component: TasksPage,
});

type ScopeTab = "my" | "team" | "all";

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
  dueDate: string;
  reminderAt: string;
  assignedTo: string;
  team: string;
  tags: string;
  recurringFreq: "none" | "daily" | "weekly" | "monthly";
  recurringInterval: number;
  linkedDocumentId?: string;
  linkedAssetId?: string;
  sourceTicketId?: string;
  dependencyIds: string[];
  notes: string;
}

const empty = (): FormState => ({
  title: "", description: "", category: "General", priority: "normal", status: "open",
  scope: "personal", dueDate: "", reminderAt: "", assignedTo: CURRENT_USER, team: CURRENT_TEAM,
  tags: "", recurringFreq: "none", recurringInterval: 1, dependencyIds: [], notes: "",
});

function TasksPage() {
  const data = useData();
  const role = useRole();
  const writable = can("tasks.write", role);
  const canSeeAll = can("tasks.view", role);

  const [scope, setScope] = useState<ScopeTab>("my");
  const [query, setQuery] = useState("");
  const [fCat, setFCat] = useState("all");
  const [fPrio, setFPrio] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [convertTicketId, setConvertTicketId] = useState("");

  const cats = useMemo(() => {
    const set = new Set(TASK_CATEGORIES);
    data.tasks.forEach((t) => set.add(t.category));
    return Array.from(set);
  }, [data.tasks]);

  const visibleByScope = (t: Task) => {
    if (!showArchived && t.archived) return false;
    if (scope === "my") return t.assignedTo === CURRENT_USER || t.owner === CURRENT_USER;
    if (scope === "team") return (t.team ?? CURRENT_TEAM) === CURRENT_TEAM;
    return canSeeAll;
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return data.tasks.filter((t) => {
      if (!visibleByScope(t)) return false;
      if (fCat !== "all" && t.category !== fCat) return false;
      if (fPrio !== "all" && t.priority !== fPrio) return false;
      if (fStatus !== "all" && t.status !== fStatus) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.notes ?? "").toLowerCase().includes(q) ||
        (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [data.tasks, query, fCat, fPrio, fStatus, scope, showArchived, canSeeAll]);

  // metrics across the current scope
  const scopeTasks = data.tasks.filter(visibleByScope);
  const open = scopeTasks.filter((t) => t.status === "open").length;
  const inProgress = scopeTasks.filter((t) => t.status === "in_progress").length;
  const overdue = scopeTasks.filter(isOverdue).length;
  const dueSoon = scopeTasks.filter((t) => {
    if (t.status === "done" || !t.dueDate) return false;
    const days = (new Date(t.dueDate).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 3;
  }).length;
  const critical = scopeTasks.filter((t) => t.priority === "critical" && t.status !== "done").length;
  const done = scopeTasks.filter((t) => t.status === "done").length;

  const openCreate = () => {
    if (!writable) { toast.error("Read-only role"); return; }
    setEditId(null); setForm(empty()); setDrawerOpen(true);
  };
  const openEdit = (t: Task) => {
    setEditId(t.id);
    setForm({
      title: t.title, description: t.description ?? "", category: t.category,
      priority: t.priority, status: t.status, scope: t.scope ?? "personal",
      dueDate: t.dueDate?.slice(0, 10) ?? "", reminderAt: t.reminderAt?.slice(0, 16) ?? "",
      assignedTo: t.assignedTo, team: t.team ?? CURRENT_TEAM,
      tags: (t.tags ?? []).join(", "),
      recurringFreq: t.recurring?.freq ?? "none",
      recurringInterval: t.recurring?.interval ?? 1,
      linkedDocumentId: t.linkedDocumentId, linkedAssetId: t.linkedAssetId,
      dependencyIds: t.dependencyIds ?? [],
      notes: t.notes ?? "",
    });
    setDrawerOpen(true);
  };

  const save = () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const recurring = form.recurringFreq === "none"
      ? null
      : { freq: form.recurringFreq, interval: Math.max(1, form.recurringInterval) };
    const tags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
    if (editId) {
      updateTask(editId, {
        title: form.title.trim(),
        description: form.description,
        category: form.category,
        priority: form.priority,
        status: form.status,
        scope: form.scope,
        dueDate: form.dueDate || undefined,
        reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : undefined,
        assignedTo: form.assignedTo,
        team: form.team,
        tags,
        recurring,
        linkedDocumentId: form.linkedDocumentId,
        linkedAssetId: form.linkedAssetId,
        dependencyIds: form.dependencyIds,
        notes: form.notes,
      });
      toast.success("Task updated");
    } else {
      createTask({
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        status: form.status,
        scope: form.scope,
        dueDate: form.dueDate || undefined,
        reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : undefined,
        assignedTo: form.assignedTo,
        team: form.team,
        tags,
        recurring,
        linkedDocumentId: form.linkedDocumentId,
        linkedAssetId: form.linkedAssetId,
        dependencyIds: form.dependencyIds,
        sourceTicketId: form.sourceTicketId,
        notes: form.notes,
      });
      toast.success("Task created");
    }
    setDrawerOpen(false);
  };

  const applyConvert = () => {
    const tk = data.tickets.find((x) => x.id === convertTicketId);
    if (!tk) { toast.error("Pick a ticket"); return; }
    const t = convertTicketToTask(tk);
    setConvertTicketId("");
    toast.success(`Ticket converted to task '${t.title}'`);
  };

  const applyView = (id: string) => {
    const v = data.taskViews.find((x) => x.id === id);
    if (!v) return;
    setScope(v.scope);
    setQuery(v.query);
    setFCat(v.filters.category ?? "all");
    setFPrio(v.filters.priority ?? "all");
    setFStatus(v.filters.status ?? "all");
  };
  const persistView = () => {
    if (!newViewName.trim()) { toast.error("Name required"); return; }
    saveTaskView({
      name: newViewName.trim(),
      scope,
      query,
      filters: { category: fCat, priority: fPrio, status: fStatus },
    });
    setSaveViewOpen(false);
    setNewViewName("");
    toast.success("View saved");
  };

  const columns: Column<Task>[] = [
    { key: "title", header: "Task", render: (t) => (
      <button onClick={() => setDetailId(t.id)} className="min-w-0 text-left">
        <div className="font-medium text-foreground hover:text-primary">{t.title}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {t.recurring && <Repeat className="h-3 w-3" />}
          {t.escalated && <TrendingUp className="h-3 w-3 text-[#FF7C91]" />}
          {(t.tags ?? []).slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}
        </div>
      </button>
    ) },
    { key: "cat", header: "Category", render: (t) => <StatusBadge tone="muted" label={t.category} /> },
    { key: "prio", header: "Priority", render: (t) => <StatusBadge tone={PRIO_TONE[t.priority]} label={t.priority} /> },
    { key: "status", header: "Status", render: (t) => <StatusBadge tone={statusTone(t.status)} label={t.status.replace("_", " ")} /> },
    { key: "due", header: "Due", render: (t) => {
      if (!t.dueDate) return <span className="text-xs text-muted-foreground">—</span>;
      const over = isOverdue(t);
      return <span className={`text-xs ${over ? "text-[#FF7C91]" : "text-muted-foreground"}`}>{formatDate(t.dueDate)}</span>;
    } },
    { key: "assigned", header: "Assigned", render: (t) => <span className="text-xs">{t.assignedTo || "—"}</span> },
    { key: "team", header: "Team", render: (t) => <span className="text-xs text-muted-foreground">{t.team || "—"}</span> },
    { key: "scope", header: "Scope", render: (t) => <StatusBadge tone="muted" label={t.scope ?? "personal"} /> },
    { key: "actions", header: "", className: "w-12", render: (t) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailId(t.id)}><Search className="mr-2 h-3.5 w-3.5" /> Open details</DropdownMenuItem>
          {writable && <DropdownMenuItem onClick={() => openEdit(t)}><Edit className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>}
          {writable && t.status !== "done" && (
            <DropdownMenuItem onClick={() => { completeTask(t.id); toast.success("Completed"); }}>
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Mark done
            </DropdownMenuItem>
          )}
          {writable && t.status === "done" && (
            <DropdownMenuItem onClick={() => { reopenTask(t.id); toast.success("Reopened"); }}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reopen
            </DropdownMenuItem>
          )}
          {writable && t.status === "open" && (
            <DropdownMenuItem onClick={() => { setTaskStatus(t.id, "in_progress"); toast.success("Started"); }}>
              <PlayCircle className="mr-2 h-3.5 w-3.5" /> Start
            </DropdownMenuItem>
          )}
          {writable && (
            <>
              <DropdownMenuItem onClick={() => { duplicateTask(t.id); toast.success("Duplicated"); }}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { escalateTask(t.id); toast.success("Escalated"); }}>
                <TrendingUp className="mr-2 h-3.5 w-3.5" /> Escalate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const when = prompt("Remind me on (YYYY-MM-DD HH:MM):", new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 16));
                if (when) { import("@/lib/data/tasks").then((m) => m.scheduleReminder(t.id, new Date(when).toISOString())); toast.success("Reminder set"); }
              }}>
                <Bell className="mr-2 h-3.5 w-3.5" /> Set reminder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { archiveTask(t.id); toast.success("Archived"); }}>
                <Archive className="mr-2 h-3.5 w-3.5" /> Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(t.id)}>
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Track IT operational work, maintenance, and project tasks."
        actions={writable ? (
          <Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> New Task</Button>
        ) : null}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard icon={CheckSquare} label="Open" value={open} accent="primary" />
        <MetricCard icon={Clock} label="In Progress" value={inProgress} accent="warning" />
        <MetricCard icon={AlertTriangle} label="Overdue" value={overdue} accent="danger" />
        <MetricCard icon={Calendar} label="Due Soon" value={dueSoon} accent="warning" />
        <MetricCard icon={Flame} label="Critical" value={critical} accent="danger" />
        <MetricCard icon={CheckCircle2} label="Completed" value={done} accent="success" />
      </div>

      <div className="mt-6 glass-card rounded-2xl p-4">
        <Tabs value={scope} onValueChange={(v) => setScope(v as ScopeTab)}>
          <TabsList className="bg-background/40">
            <TabsTrigger value="my">My Tasks</TabsTrigger>
            <TabsTrigger value="team">Team ({CURRENT_TEAM})</TabsTrigger>
            <TabsTrigger value="all" disabled={!canSeeAll}>All Tasks</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search tasks..." className="w-full sm:w-72" />
          <Select value={fCat} onValueChange={setFCat}>
            <SelectTrigger className="h-9 w-[160px] rounded-xl border-border/60 bg-card/60"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All categories</SelectItem>{cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fPrio} onValueChange={setFPrio}>
            <SelectTrigger className="h-9 w-[140px] rounded-xl border-border/60 bg-card/60"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All priority</SelectItem>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="h-9 w-[140px] rounded-xl border-border/60 bg-card/60"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All status</SelectItem>{STATUSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-9" onClick={() => setShowArchived((v) => !v)}>
            <Archive className="mr-1 h-3.5 w-3.5" /> {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Select value="" onValueChange={applyView}>
              <SelectTrigger className="h-9 w-[180px] rounded-xl border-border/60 bg-card/60"><SelectValue placeholder="Saved views" /></SelectTrigger>
              <SelectContent>
                {data.taskViews.length === 0 && <SelectItem value="__none" disabled>No views</SelectItem>}
                {data.taskViews.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setSaveViewOpen(true)}>
              <Bookmark className="mr-1 h-3.5 w-3.5" /> Save view
            </Button>
            {data.taskViews.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {data.taskViews.map((v) => (
                    <DropdownMenuItem key={v.id} className="text-destructive" onClick={() => { deleteTaskView(v.id); toast.success("View deleted"); }}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete "{v.name}"
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {writable && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border/40 bg-background/30 p-2">
            <span className="text-xs text-muted-foreground">Convert ticket to task:</span>
            <Select value={convertTicketId} onValueChange={setConvertTicketId}>
              <SelectTrigger className="h-8 w-[280px] rounded-lg bg-card/60 text-xs"><SelectValue placeholder="Pick a ticket…" /></SelectTrigger>
              <SelectContent>
                {data.tickets.slice(0, 30).map((tk) => (
                  <SelectItem key={tk.id} value={tk.id}>{tk.number} · {tk.subject}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="secondary" onClick={applyConvert} disabled={!convertTicketId}>Convert</Button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <DataTable
          data={filtered}
          columns={columns}
          pageSize={data.settings.tablePageSize}
          emptyState={
            <EmptyState
              icon={CheckSquare}
              title="No tasks"
              description={writable ? "Create your first task." : "No tasks match the current filters."}
              actionLabel={writable ? "New Task" : undefined}
              onAction={writable ? openCreate : undefined}
            />
          }
        />
      </div>

      <FormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={editId ? "Edit Task" : "Create Task"} onSubmit={save}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Scope</Label>
            <Select value={form.scope} onValueChange={(v: TaskScope) => setForm({ ...form, scope: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["personal", "team", "shared"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Assigned to</Label>
            <Select value={form.assignedTo} onValueChange={(v) => setForm({ ...form, assignedTo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TASK_OWNERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Team</Label>
            <Select value={form.team} onValueChange={(v) => setForm({ ...form, team: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TASK_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Priority</Label>
            <Select value={form.priority} onValueChange={(v: TaskPriority) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={form.status} onValueChange={(v: TaskStatus) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Due date</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Reminder</Label><Input type="datetime-local" value={form.reminderAt} onChange={(e) => setForm({ ...form, reminderAt: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Tags (comma separated)</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="patching, security" /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Recurring</Label>
            <Select value={form.recurringFreq} onValueChange={(v) => setForm({ ...form, recurringFreq: v as FormState["recurringFreq"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not recurring</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.recurringFreq !== "none" && (
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Every (interval)</Label>
              <Input type="number" min={1} value={form.recurringInterval} onChange={(e) => setForm({ ...form, recurringInterval: Number(e.target.value) || 1 })} />
            </div>
          )}
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Linked document</Label>
            <Select value={form.linkedDocumentId ?? "none"} onValueChange={(v) => setForm({ ...form, linkedDocumentId: v === "none" ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent><SelectItem value="none">None</SelectItem>{data.documents.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Linked asset</Label>
            <Select value={form.linkedAssetId ?? "none"} onValueChange={(v) => setForm({ ...form, linkedAssetId: v === "none" ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent><SelectItem value="none">None</SelectItem>{data.assets.map((a) => <SelectItem key={a.id} value={a.id}>{a.hostname}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      </FormDrawer>

      <FormDrawer open={saveViewOpen} onOpenChange={setSaveViewOpen} title="Save current view" submitLabel="Save view" onSubmit={persistView}>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs">View name</Label><Input value={newViewName} onChange={(e) => setNewViewName(e.target.value)} placeholder="e.g. My critical work" /></div>
          <div className="rounded-lg border border-border/40 bg-background/40 p-3 text-xs text-muted-foreground">
            Scope: <span className="text-foreground">{scope}</span> · Category: <span className="text-foreground">{fCat}</span> · Priority: <span className="text-foreground">{fPrio}</span> · Status: <span className="text-foreground">{fStatus}</span>
          </div>
        </div>
      </FormDrawer>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete task?"
        destructive
        confirmLabel="Delete"
        onConfirm={() => { if (confirmDelete) { deleteTask(confirmDelete); toast.success("Moved to recycle bin"); } setConfirmDelete(null); }}
      />

      <TaskDetailsDrawer
        task={data.tasks.find((t) => t.id === detailId) ?? null}
        open={!!detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
        onEdit={(t) => { setDetailId(null); openEdit(t); }}
      />
    </div>
  );
}
