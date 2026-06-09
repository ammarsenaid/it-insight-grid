import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, CheckSquare, Clock, AlertTriangle, Calendar, Flame, CheckCircle2, MoreHorizontal, Edit, Trash2, PlayCircle } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setState, logActivity, trashItem, uid, useData } from "@/lib/data/store";
import type { Task } from "@/lib/data/types";
import { toast } from "sonner";
import { formatDate } from "@/components/common/format";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks · IT Knowledge Center" },
      { name: "description", content: "Operational task tracking for the IT department." },
    ],
  }),
  component: TasksPage,
});

const empty = (): Omit<Task, "id" | "createdAt" | "updatedAt"> => ({
  title: "",
  category: "General",
  priority: "normal",
  status: "open",
  dueDate: "",
  assignedTo: "",
  linkedDocumentId: undefined,
  linkedAssetId: undefined,
  notes: "",
});

function TasksPage() {
  const data = useData();
  const [query, setQuery] = useState("");
  const [fCat, setFCat] = useState("all");
  const [fPrio, setFPrio] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const cats = useMemo(() => Array.from(new Set(data.tasks.map((t) => t.category))), [data.tasks]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return data.tasks.filter((t) => {
      if (fCat !== "all" && t.category !== fCat) return false;
      if (fPrio !== "all" && t.priority !== fPrio) return false;
      if (fStatus !== "all" && t.status !== fStatus) return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q);
    });
  }, [data.tasks, query, fCat, fPrio, fStatus]);

  const open = data.tasks.filter((t) => t.status === "open").length;
  const inProgress = data.tasks.filter((t) => t.status === "in_progress").length;
  const overdue = data.tasks.filter((t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < new Date()).length;
  const dueSoon = data.tasks.filter((t) => {
    if (t.status === "done" || !t.dueDate) return false;
    const days = (new Date(t.dueDate).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 3;
  }).length;
  const critical = data.tasks.filter((t) => t.priority === "critical" && t.status !== "done").length;
  const done = data.tasks.filter((t) => t.status === "done").length;

  const openCreate = () => { setEditId(null); setForm(empty()); setDrawerOpen(true); };
  const openEdit = (t: Task) => { setEditId(t.id); setForm({ ...t }); setDrawerOpen(true); };

  const save = () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setState((s) => {
      if (editId) return { ...s, tasks: s.tasks.map((t) => t.id === editId ? { ...t, ...form, updatedAt: new Date().toISOString() } : t) };
      const next: Task = { id: uid("tsk"), ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      return { ...s, tasks: [next, ...s.tasks] };
    });
    logActivity(editId ? "task.update" : "task.create", `${editId ? "Updated" : "Created"} task '${form.title}'`);
    toast.success(editId ? "Task updated" : "Task created");
    setDrawerOpen(false);
  };

  const setStatus = (id: string, status: Task["status"]) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t) }));
    logActivity("task.status", `Task status changed to ${status}`);
    toast.success(`Marked as ${status}`);
  };

  const remove = (id: string) => {
    const t = data.tasks.find((x) => x.id === id);
    if (!t) return;
    trashItem("task", t.title, "Tasks", t, 512);
    setState((s) => ({ ...s, tasks: s.tasks.filter((x) => x.id !== id) }));
    logActivity("task.delete", `Deleted task '${t.title}'`);
    toast.success("Moved to recycle bin");
  };

  const columns: Column<Task>[] = [
    { key: "title", header: "Task", render: (t) => (
      <div className="min-w-0">
        <div className="font-medium text-foreground">{t.title}</div>
        {t.notes && <div className="truncate text-xs text-muted-foreground">{t.notes}</div>}
      </div>
    ) },
    { key: "cat", header: "Category", render: (t) => <StatusBadge tone="muted" label={t.category} /> },
    { key: "prio", header: "Priority", render: (t) => <StatusBadge tone={t.priority === "critical" ? "danger" : t.priority === "high" ? "warning" : "info"} label={t.priority} /> },
    { key: "status", header: "Status", render: (t) => <StatusBadge tone={statusTone(t.status)} label={t.status.replace("_"," ")} /> },
    { key: "due", header: "Due", render: (t) => {
      if (!t.dueDate) return <span className="text-xs text-muted-foreground">—</span>;
      const overdue = t.status !== "done" && new Date(t.dueDate) < new Date();
      return <span className={`text-xs ${overdue ? "text-[#FF7C91]" : "text-muted-foreground"}`}>{formatDate(t.dueDate)}</span>;
    } },
    { key: "assigned", header: "Assigned", render: (t) => <span className="text-xs">{t.assignedTo || "—"}</span> },
    { key: "doc", header: "Document", render: (t) => {
      const d = data.documents.find((x) => x.id === t.linkedDocumentId);
      return d ? <span className="truncate text-xs text-muted-foreground">{d.title}</span> : <span className="text-xs text-muted-foreground">—</span>;
    } },
    { key: "asset", header: "Asset", render: (t) => {
      const a = data.assets.find((x) => x.id === t.linkedAssetId);
      return a ? <span className="text-xs font-mono">{a.hostname}</span> : <span className="text-xs text-muted-foreground">—</span>;
    } },
    { key: "actions", header: "", className: "w-12", render: (t) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openEdit(t)}><Edit className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
          {t.status !== "done" ? (
            <DropdownMenuItem onClick={() => setStatus(t.id, "done")}><CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Mark done</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setStatus(t.id, "open")}><PlayCircle className="mr-2 h-3.5 w-3.5" /> Reopen</DropdownMenuItem>
          )}
          {t.status === "open" && <DropdownMenuItem onClick={() => setStatus(t.id, "in_progress")}><PlayCircle className="mr-2 h-3.5 w-3.5" /> Start</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(t.id)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Tasks" description="Track IT operational work, maintenance, and project tasks." actions={<Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> New Task</Button>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard icon={CheckSquare} label="Open" value={open} accent="primary" />
        <MetricCard icon={Clock} label="In Progress" value={inProgress} accent="warning" />
        <MetricCard icon={AlertTriangle} label="Overdue" value={overdue} accent="danger" />
        <MetricCard icon={Calendar} label="Due Soon" value={dueSoon} accent="warning" />
        <MetricCard icon={Flame} label="Critical" value={critical} accent="danger" />
        <MetricCard icon={CheckCircle2} label="Completed" value={done} accent="success" />
      </div>
      <div className="mt-6 glass-card rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search tasks..." className="w-full sm:w-72" />
          <Select value={fCat} onValueChange={setFCat}>
            <SelectTrigger className="h-9 w-[160px] rounded-xl border-border/60 bg-card/60"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All categories</SelectItem>{cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fPrio} onValueChange={setFPrio}>
            <SelectTrigger className="h-9 w-[140px] rounded-xl border-border/60 bg-card/60"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All priority</SelectItem>{["low","normal","high","critical"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="h-9 w-[140px] rounded-xl border-border/60 bg-card/60"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All status</SelectItem>{["open","in_progress","blocked","done"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-4">
        <DataTable data={filtered} columns={columns} pageSize={data.settings.tablePageSize}
          emptyState={<EmptyState icon={CheckSquare} title="No tasks" description="Create your first task." actionLabel="New Task" onAction={openCreate} />} />
      </div>

      <FormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={editId ? "Edit Task" : "Create Task"} onSubmit={save}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Assigned to</Label><Input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Priority</Label>
            <Select value={form.priority} onValueChange={(v: Task["priority"]) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["low","normal","high","critical"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={form.status} onValueChange={(v: Task["status"]) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["open","in_progress","blocked","done"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Due date</Label><Input type="date" value={form.dueDate?.slice(0,10) ?? ""} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
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
          <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Notes</Label><Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      </FormDrawer>

      <ConfirmDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)} title="Delete task?" destructive confirmLabel="Delete"
        onConfirm={() => { if (confirmDelete) remove(confirmDelete); setConfirmDelete(null); }} />
    </div>
  );
}
