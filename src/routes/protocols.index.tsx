import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Play, Plus, ListChecks, ShieldCheck, Calendar, AlertTriangle, CheckCircle2,
  Clock, User, Users, Copy, Edit, Archive, Trash2, MoreHorizontal, Pause,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { SearchInput } from "@/components/common/SearchInput";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { DataTable, type Column } from "@/components/common/DataTable";
import { FormDrawer } from "@/components/common/FormDrawer";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDate, timeAgo } from "@/components/common/format";
import { useProtocols, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate, startRun, addStep, updateStep, deleteStep, moveStep, runProgress } from "@/lib/protocols/store";
import type { ProtocolTemplate, ProtocolRun, ProtocolStatus, ProtocolRecurrence } from "@/lib/protocols/types";
import { useRole, can } from "@/lib/permissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/protocols/")({
  head: () => ({ meta: [{ title: "Protocols · IT Knowledge Center" }] }),
  component: ProtocolsPage,
});

type Tab = "templates" | "active" | "scheduled" | "completed" | "failed" | "mine" | "team";

const STATUS_LABEL: Record<ProtocolStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  waiting: "Waiting",
  waiting_approval: "Waiting Approval",
  completed: "Completed",
  completed_with_issues: "Completed (issues)",
  failed: "Failed",
  cancelled: "Cancelled",
};

function meForRole(role: string): string {
  switch (role) {
    case "super_admin":
    case "it_admin": return "alice.it";
    case "sd_lead":
    case "helpdesk": return "bob.admin";
    case "technician": return "carol.netops";
    case "network_admin": return "carol.netops";
    default: return "alice.it";
  }
}

function ProtocolsPage() {
  const { templates, runs } = useProtocols();
  const role = useRole();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("templates");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingTemplate, setEditingTemplate] = useState<ProtocolTemplate | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ProtocolTemplate | null>(null);

  const me = meForRole(role);
  const canWrite = can("tasks.write", role);

  const metrics = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const dueToday = (r: ProtocolRun) => r.dueDate && new Date(r.dueDate).toDateString() === new Date().toDateString();
    const overdue = (r: ProtocolRun) => r.dueDate && new Date(r.dueDate) < today && !["completed","completed_with_issues","cancelled"].includes(r.status);
    return {
      active: runs.filter((r) => r.status === "in_progress").length,
      assignedToMe: runs.filter((r) => r.assignedUser === me && !["completed","cancelled"].includes(r.status)).length,
      scheduled: runs.filter((r) => r.status === "planned").length,
      dueToday: runs.filter(dueToday).length,
      overdue: runs.filter(overdue).length,
      awaitingApproval: runs.filter((r) => r.status === "waiting_approval").length,
      completedThisMonth: runs.filter((r) => r.status === "completed" && r.completedAt && new Date(r.completedAt).getMonth() === new Date().getMonth()).length,
      failed: runs.filter((r) => r.status === "failed" || r.status === "completed_with_issues").length,
    };
  }, [runs, me]);

  const filteredTemplates = useMemo(() => {
    const ql = q.toLowerCase();
    return templates.filter((t) => !t.archived && (!ql || t.title.toLowerCase().includes(ql) || t.category.toLowerCase().includes(ql) || t.tags.some((tg) => tg.toLowerCase().includes(ql))));
  }, [templates, q]);

  const filteredRuns = useMemo(() => {
    const ql = q.toLowerCase();
    let list = runs;
    if (tab === "active") list = list.filter((r) => r.status === "in_progress" || r.status === "waiting" || r.status === "waiting_approval");
    if (tab === "scheduled") list = list.filter((r) => r.status === "planned");
    if (tab === "completed") list = list.filter((r) => r.status === "completed" || r.status === "completed_with_issues");
    if (tab === "failed") list = list.filter((r) => r.status === "failed" || r.status === "completed_with_issues");
    if (tab === "mine") list = list.filter((r) => r.assignedUser === me);
    if (tab === "team") list = list.filter((r) => r.team);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (ql) list = list.filter((r) => r.templateTitle.toLowerCase().includes(ql) || r.runNumber.toLowerCase().includes(ql) || (r.assignedUser ?? "").toLowerCase().includes(ql));
    return list;
  }, [runs, tab, q, statusFilter, me]);

  const templateCols: Column<ProtocolTemplate>[] = [
    { key: "title", header: "Template", render: (t) => (
      <div>
        <div className="font-medium">{t.title}</div>
        <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.description}</div>
      </div>
    ) },
    { key: "category", header: "Category", render: (t) => <Badge variant="outline">{t.category}</Badge> },
    { key: "team", header: "Team", render: (t) => <span className="text-sm text-muted-foreground">{t.assignedTeam ?? "—"}</span> },
    { key: "duration", header: "Est.", render: (t) => <span className="text-sm">{t.estimatedMinutes ?? "—"}m</span> },
    { key: "steps", header: "Steps", render: (t) => <span className="font-mono text-sm">{t.steps.length}</span> },
    { key: "approval", header: "Approval", render: (t) => t.approvalRequired ? <ShieldCheck className="h-4 w-4 text-amber-400" /> : <span className="text-xs text-muted-foreground">—</span> },
    { key: "recurrence", header: "Recurrence", render: (t) => <span className="text-xs capitalize">{t.recurrence}</span> },
    { key: "lastRun", header: "Last Run", render: (t) => <span className="text-xs text-muted-foreground">{t.lastRunAt ? timeAgo(t.lastRunAt) : "Never"}</span> },
    { key: "actions", header: "", className: "w-[110px] text-right", render: (t) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" disabled={!canWrite} onClick={(e) => { e.stopPropagation(); const run = startRun(t.id, { assignedUser: me }); if (run) { toast.success(`Started ${run.runNumber}`); navigate({ to: "/protocols/$id", params: { id: run.id } }); } }}>
          <Play className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditingTemplate(t)}><Edit className="mr-2 h-3.5 w-3.5" />Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { const c = duplicateTemplate(t.id); if (c) toast.success("Duplicated"); }}><Copy className="mr-2 h-3.5 w-3.5" />Duplicate</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { updateTemplate(t.id, { archived: !t.archived }); toast.success(t.archived ? "Restored" : "Archived"); }}><Archive className="mr-2 h-3.5 w-3.5" />{t.archived ? "Restore" : "Archive"}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(t)}><Trash2 className="mr-2 h-3.5 w-3.5" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ) },
  ];

  const runCols: Column<ProtocolRun>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-xs">{r.runNumber}</span> },
    { key: "template", header: "Template", render: (r) => <div className="font-medium">{r.templateTitle}</div> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status as any}>{STATUS_LABEL[r.status]}</StatusBadge> },
    { key: "assignee", header: "Assignee", render: (r) => <span className="text-sm">{r.assignedUser ?? "—"}</span> },
    { key: "team", header: "Team", render: (r) => <span className="text-sm text-muted-foreground">{r.team ?? "—"}</span> },
    { key: "progress", header: "Progress", render: (r) => {
      const p = runProgress(r);
      return (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${p}%` }} />
          </div>
          <span className="font-mono text-xs">{p}%</span>
        </div>
      );
    } },
    { key: "due", header: "Due", render: (r) => <span className="text-xs">{r.dueDate ? formatDate(r.dueDate) : "—"}</span> },
    { key: "started", header: "Started", render: (r) => <span className="text-xs text-muted-foreground">{r.startedAt ? timeAgo(r.startedAt) : "—"}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Protocols & Runbooks"
        description="Reusable operational procedures and live execution runs."
        actions={canWrite && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New Template
          </Button>
        )}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <button onClick={() => setTab("active")} className="text-left"><MetricCard icon={Play} label="Active" value={metrics.active} accent="primary" /></button>
        <button onClick={() => { setTab("mine"); }} className="text-left"><MetricCard icon={User} label="Assigned to Me" value={metrics.assignedToMe} accent="primary" /></button>
        <button onClick={() => setTab("scheduled")} className="text-left"><MetricCard icon={Calendar} label="Scheduled" value={metrics.scheduled} accent="muted" /></button>
        <button onClick={() => { setTab("active"); setStatusFilter("in_progress"); }} className="text-left"><MetricCard icon={Clock} label="Due Today" value={metrics.dueToday} accent="warning" /></button>
        <button onClick={() => setTab("active")} className="text-left"><MetricCard icon={AlertTriangle} label="Overdue" value={metrics.overdue} accent="danger" /></button>
        <button onClick={() => { setTab("active"); setStatusFilter("waiting_approval"); }} className="text-left"><MetricCard icon={ShieldCheck} label="Awaiting Approval" value={metrics.awaitingApproval} accent="warning" /></button>
        <button onClick={() => setTab("completed")} className="text-left"><MetricCard icon={CheckCircle2} label="Completed (mo)" value={metrics.completedThisMonth} accent="success" /></button>
        <button onClick={() => setTab("failed")} className="text-left"><MetricCard icon={AlertTriangle} label="Failed/Issues" value={metrics.failed} accent="danger" /></button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="templates"><ListChecks className="mr-1.5 h-3.5 w-3.5" />Templates</TabsTrigger>
          <TabsTrigger value="active">Active Runs</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="failed">Failed/Issues</TabsTrigger>
          <TabsTrigger value="mine">My Protocols</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-[240px] flex-1"><SearchInput value={q} onChange={setQ} placeholder={tab === "templates" ? "Search templates..." : "Search runs..."} /></div>
        {tab !== "templates" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {tab === "templates" ? (
        <DataTable
          data={filteredTemplates}
          columns={templateCols}
          onRowClick={(t) => setEditingTemplate(t)}
          emptyState={<EmptyState icon={ListChecks} title="No templates" description="Create your first protocol template." />}
        />
      ) : (
        <DataTable
          data={filteredRuns}
          columns={runCols}
          onRowClick={(r) => navigate({ to: "/protocols/$id", params: { id: r.id } })}
          emptyState={<EmptyState icon={Play} title="No protocol runs" description="Start a run from a template." />}
        />
      )}

      <TemplateDrawer
        open={showCreate || !!editingTemplate}
        template={editingTemplate}
        onClose={() => { setShowCreate(false); setEditingTemplate(null); }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete template?"
        description={`"${confirmDelete?.title}" will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (confirmDelete) { deleteTemplate(confirmDelete.id); toast.success("Template deleted"); setConfirmDelete(null); } }}
      />
    </div>
  );
}

// ----- Template drawer (create + edit + step builder) -----
function TemplateDrawer({ open, template, onClose }: { open: boolean; template: ProtocolTemplate | null; onClose: () => void }) {
  const editing = !!template;
  const initial = template ?? {
    title: "", category: "Operations", description: "", purpose: "", scope: "", preconditions: "",
    assignedTeam: "", estimatedMinutes: 30, approvalRequired: false, recurrence: "none" as ProtocolRecurrence,
    requiredAssetIds: [], requiredKnowledgeIds: [], tags: [], visibility: "internal" as const, steps: [],
  };
  const [form, setForm] = useState(initial);

  // Re-init when opening a different template
  useMemo(() => { setForm(initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [template, open]);

  const save = () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (editing && template) {
      updateTemplate(template.id, form as any);
      toast.success("Template updated");
    } else {
      createTemplate(form as any);
      toast.success("Template created");
    }
    onClose();
  };

  return (
    <FormDrawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? "Edit Protocol Template" : "New Protocol Template"}
      onSubmit={save}
      submitLabel={editing ? "Save" : "Create"}
    >
      <div className="space-y-4">
        <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div><Label>Assigned Team</Label><Input value={form.assignedTeam ?? ""} onChange={(e) => setForm({ ...form, assignedTeam: e.target.value })} /></div>
        </div>
        <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Purpose</Label><Textarea rows={2} value={form.purpose ?? ""} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
          <div><Label>Scope</Label><Textarea rows={2} value={form.scope ?? ""} onChange={(e) => setForm({ ...form, scope: e.target.value })} /></div>
        </div>
        <div><Label>Preconditions</Label><Textarea rows={2} value={form.preconditions ?? ""} onChange={(e) => setForm({ ...form, preconditions: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Est. minutes</Label><Input type="number" value={form.estimatedMinutes ?? 30} onChange={(e) => setForm({ ...form, estimatedMinutes: parseInt(e.target.value, 10) || 0 })} /></div>
          <div>
            <Label>Recurrence</Label>
            <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v as ProtocolRecurrence })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Label>Visibility</Label>
            <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="restricted">Restricted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 p-3">
          <div>
            <Label>Approval required</Label>
            <p className="text-xs text-muted-foreground">Require sign-off before completion.</p>
          </div>
          <Switch checked={form.approvalRequired} onCheckedChange={(c) => setForm({ ...form, approvalRequired: c })} />
        </div>
        <div><Label>Tags (comma-separated)</Label>
          <Input value={form.tags.join(", ")} onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
        </div>

        {/* Step builder - only when editing existing template */}
        {editing && template && (
          <div className="rounded-lg border border-border/60 bg-card/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">Checklist Steps ({template.steps.length})</div>
              <Button size="sm" variant="outline" onClick={() => addStep(template.id)}><Plus className="mr-1 h-3 w-3" />Add Step</Button>
            </div>
            <div className="space-y-2">
              {template.steps.length === 0 && <p className="text-xs text-muted-foreground">No steps yet.</p>}
              {template.steps.map((s, i) => (
                <div key={s.id} className="rounded-md border border-border/60 bg-background/50 p-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>
                    <Input className="h-7 flex-1" value={s.title} onChange={(e) => updateStep(template.id, s.id, { title: e.target.value })} />
                    <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => moveStep(template.id, s.id, -1)}>↑</Button>
                    <Button size="sm" variant="ghost" disabled={i === template.steps.length - 1} onClick={() => moveStep(template.id, s.id, 1)}>↓</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteStep(template.id, s.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  <Textarea className="mt-2" rows={2} placeholder="Instructions" value={s.instructions} onChange={(e) => updateStep(template.id, s.id, { instructions: e.target.value })} />
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5"><Checkbox checked={s.required} onCheckedChange={(c) => updateStep(template.id, s.id, { required: !!c })} />Required</label>
                    <label className="flex items-center gap-1.5"><Checkbox checked={s.approvalCheckpoint} onCheckedChange={(c) => updateStep(template.id, s.id, { approvalCheckpoint: !!c })} />Approval checkpoint</label>
                    <label className="flex items-center gap-1.5"><Checkbox checked={s.evidenceAllowed} onCheckedChange={(c) => updateStep(template.id, s.id, { evidenceAllowed: !!c })} />Evidence</label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {!editing && (
          <p className="text-xs text-muted-foreground">Create the template first, then add checklist steps from the edit drawer.</p>
        )}
      </div>
    </FormDrawer>
  );
}
