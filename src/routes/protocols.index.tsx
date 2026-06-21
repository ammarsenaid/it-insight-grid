import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Play, Plus, ListChecks, ShieldCheck, AlertTriangle, CheckCircle2,
  Clock, Copy, Edit, Archive, Trash2, MoreHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { SearchInput } from "@/components/common/SearchInput";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { DataTable, type Column } from "@/components/common/DataTable";
import { FormDrawer } from "@/components/common/FormDrawer";
import { FormGrid, FormField, FormSection } from "@/components/common/FormGrid";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDate, timeAgo } from "@/components/common/format";
import { protocolTemplatesKeys, protocolTemplatesQuery, protocolRunsKeys, protocolRunsQuery } from "@/lib/protocols/queries";
import {
  saveProtocolTemplate, setProtocolTemplateArchived, duplicateProtocolTemplate,
  softDeleteProtocolTemplate, startProtocolRun, runProgress, publicProtocolError,
} from "@/lib/protocols/protocols";
import type {
  ProtocolTemplate, ProtocolTemplateInput, ProtocolRun, ProtocolStatus, ProtocolRecurrence, ProtocolStep,
} from "@/lib/protocols/types";
import { useRole, can } from "@/lib/permissions";
import { toast } from "sonner";

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

function templateToInput(t: ProtocolTemplate): ProtocolTemplateInput {
  const { id, archived, lastRunAt, createdAt, updatedAt, deletedAt, ...rest } = t;
  return rest;
}

const BLANK_TEMPLATE: ProtocolTemplateInput = {
  title: "", category: "Operations", description: "", purpose: "", scope: "", preconditions: "",
  assignedTeam: "", estimatedMinutes: 30, approvalRequired: false, recurrence: "none",
  requiredAssetIds: [], requiredKnowledgeIds: [], tags: [], visibility: "internal", steps: [],
};

type SaveTemplateVars = { id: string | null; input: ProtocolTemplateInput };
type StepsVars = { template: ProtocolTemplate; steps: ProtocolStep[] };

function ProtocolsPage() {
  const role = useRole();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const templatesQ = useQuery(protocolTemplatesQuery());
  const runsQ = useQuery(protocolRunsQuery());
  const templates = useMemo(() => templatesQ.data ?? [], [templatesQ.data]);
  const runs = useMemo(() => runsQ.data ?? [], [runsQ.data]);

  const invalidateTemplates = () => qc.invalidateQueries({ queryKey: protocolTemplatesKeys.all });
  const invalidateRuns = () => qc.invalidateQueries({ queryKey: protocolRunsKeys.all });

  const [tab, setTab] = useState<Tab>("templates");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ProtocolTemplate | null>(null);

  const me = meForRole(role);
  const canWrite = can("protocols.manage", role);

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

  const startRunMutation = useMutation({
    mutationFn: (templateId: string) => startProtocolRun(templateId, { assignedUser: me }),
    onSuccess: async (runId) => {
      await invalidateRuns();
      const list = await qc.ensureQueryData(protocolRunsQuery());
      const created = list.find((r) => r.id === runId);
      toast.success(created ? `Started ${created.runNumber}` : "Protocol run started");
      navigate({ to: "/protocols/$id", params: { id: runId } });
    },
    onError: (error) => toast.error(publicProtocolError(error)),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => setProtocolTemplateArchived(id, archived),
    onSuccess: async (_data, vars) => { await invalidateTemplates(); toast.success(vars.archived ? "Archived" : "Restored"); },
    onError: (error) => toast.error(publicProtocolError(error)),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateProtocolTemplate(id),
    onSuccess: async () => { await invalidateTemplates(); toast.success("Duplicated"); },
    onError: (error) => toast.error(publicProtocolError(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => softDeleteProtocolTemplate(id),
    onSuccess: async () => { await invalidateTemplates(); toast.success("Template deleted"); },
    onError: (error) => toast.error(publicProtocolError(error)),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: ({ id, input }: SaveTemplateVars) => saveProtocolTemplate(id, input),
    onSuccess: () => invalidateTemplates(),
    onError: (error) => toast.error(publicProtocolError(error)),
  });

  const stepsMutation = useMutation({
    mutationFn: ({ template, steps }: StepsVars) => saveProtocolTemplate(template.id, { ...templateToInput(template), steps }),
    onSuccess: () => invalidateTemplates(),
    onError: (error) => toast.error(publicProtocolError(error)),
  });

  if (templatesQ.isError || runsQ.isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Protocols unavailable"
        description="The shared protocols data could not be loaded."
        actionLabel="Retry"
        onAction={() => { void templatesQ.refetch(); void runsQ.refetch(); }}
      />
    );
  }

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
        <Button size="sm" variant="ghost" disabled={!canWrite || startRunMutation.isPending} onClick={(e) => { e.stopPropagation(); startRunMutation.mutate(t.id); }}>
          <Play className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditingTemplateId(t.id)}><Edit className="mr-2 h-3.5 w-3.5" />Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => duplicateMutation.mutate(t.id)}><Copy className="mr-2 h-3.5 w-3.5" />Duplicate</DropdownMenuItem>
            <DropdownMenuItem onClick={() => archiveMutation.mutate({ id: t.id, archived: !t.archived })}><Archive className="mr-2 h-3.5 w-3.5" />{t.archived ? "Restore" : "Archive"}</DropdownMenuItem>
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
    { key: "status", header: "Status", render: (r) => <StatusBadge label={STATUS_LABEL[r.status]} tone={statusTone(r.status)} /> },
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
        title="Protocols"
        description="Run repeatable IT procedures with clear execution history."
        actions={canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New template
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Play className="mr-1.5 h-4 w-4" /> Start protocol run
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[60vh] w-[280px] overflow-y-auto">
                {templates.filter((t) => !t.archived).length === 0 ? (
                  <DropdownMenuItem disabled>No templates available</DropdownMenuItem>
                ) : (
                  templates.filter((t) => !t.archived).map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onClick={() => startRunMutation.mutate(t.id)}
                    >
                      <span className="truncate">{t.title}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{t.category}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <button onClick={() => setTab("active")} className="text-left"><MetricCard icon={Play} label="Active runs" value={metrics.active} accent="primary" /></button>
        <button onClick={() => { setTab("active"); setStatusFilter("in_progress"); }} className="text-left"><MetricCard icon={Clock} label="Due today" value={metrics.dueToday} accent="warning" /></button>
        <button onClick={() => { setTab("active"); setStatusFilter("waiting_approval"); }} className="text-left"><MetricCard icon={ShieldCheck} label="Awaiting approval" value={metrics.awaitingApproval} accent="warning" /></button>
        <button onClick={() => setTab("completed")} className="text-left"><MetricCard icon={CheckCircle2} label="Completed" value={metrics.completedThisMonth} accent="success" /></button>
        <button onClick={() => setTab("failed")} className="text-left"><MetricCard icon={AlertTriangle} label="Issues" value={metrics.failed} accent="danger" /></button>
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
          onRowClick={(t) => setEditingTemplateId(t.id)}
          emptyState={
            templatesQ.isLoading
              ? <EmptyState icon={ListChecks} title="Loading templates" description="Loading shared protocol data." />
              : q
                ? <EmptyState icon={ListChecks} title="No results found" description="No templates match your search." actionLabel="Clear search" onAction={() => setQ("")} />
                : <EmptyState icon={ListChecks} title="No templates yet" description="Templates define repeatable IT procedures (onboarding, maintenance, incident response) that your team can run consistently." actionLabel={canWrite ? "New template" : undefined} onAction={canWrite ? () => setShowCreate(true) : undefined} hint="Templates describe the procedure · runs are individual executions of a template." />
          }
        />
      ) : (
        <DataTable
          data={filteredRuns}
          columns={runCols}
          onRowClick={(r) => navigate({ to: "/protocols/$id", params: { id: r.id } })}
          emptyState={
            runsQ.isLoading
              ? <EmptyState icon={Play} title="Loading runs" description="Loading shared protocol data." />
              : (q || statusFilter !== "all")
                ? <EmptyState icon={Play} title="No results found" description="No runs match the current filters." actionLabel="Reset filters" onAction={() => { setQ(""); setStatusFilter("all"); }} />
                : <EmptyState icon={Play} title="No protocol runs yet" description="A run executes a template step by step with assignment, approvals and a full history." actionLabel={canWrite && templates.filter((t) => !t.archived).length > 0 ? "Start a run" : undefined} onAction={canWrite && templates.filter((t) => !t.archived).length > 0 ? () => startRunMutation.mutate(templates.find((t) => !t.archived)!.id) : undefined} secondaryActionLabel={canWrite ? "New template" : undefined} onSecondaryAction={canWrite ? () => setShowCreate(true) : undefined} hint="Create a template first, then start a run from it." />
          }
        />
      )}

      <TemplateDrawer
        open={showCreate || !!editingTemplateId}
        templates={templates}
        templateId={editingTemplateId}
        onClose={() => { setShowCreate(false); setEditingTemplateId(null); }}
        saveMutation={saveTemplateMutation}
        stepsMutation={stepsMutation}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete template?"
        description={`"${confirmDelete?.title}" will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (confirmDelete) { deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null); } }}
      />
    </div>
  );
}

// ----- Template drawer (create + edit + step builder) -----
function TemplateDrawer({
  open, templates, templateId, onClose, saveMutation, stepsMutation,
}: {
  open: boolean;
  templates: ProtocolTemplate[];
  templateId: string | null;
  onClose: () => void;
  saveMutation: UseMutationResult<string, Error, SaveTemplateVars>;
  stepsMutation: UseMutationResult<string, Error, StepsVars>;
}) {
  const template = templateId ? templates.find((t) => t.id === templateId) ?? null : null;
  const editing = !!template;
  const [form, setForm] = useState<ProtocolTemplateInput>(template ? templateToInput(template) : BLANK_TEMPLATE);

  // Re-init when opening a different template
  useMemo(() => { setForm(template ? templateToInput(template) : BLANK_TEMPLATE); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [template, open]);

  const save = () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    saveMutation.mutate({ id: template?.id ?? null, input: form }, {
      onSuccess: () => { toast.success(editing ? "Template updated" : "Template created"); onClose(); },
    });
  };

  const addStep = () => {
    if (!template) return;
    const newStep: ProtocolStep = {
      id: crypto.randomUUID(), title: "New step", instructions: "", required: false,
      notesAllowed: true, evidenceAllowed: true, approvalCheckpoint: false,
    };
    stepsMutation.mutate({ template, steps: [...template.steps, newStep] });
  };
  const updateStep = (stepId: string, patch: Partial<ProtocolStep>) => {
    if (!template) return;
    stepsMutation.mutate({ template, steps: template.steps.map((s) => s.id === stepId ? { ...s, ...patch } : s) });
  };
  const deleteStep = (stepId: string) => {
    if (!template) return;
    stepsMutation.mutate({ template, steps: template.steps.filter((s) => s.id !== stepId) });
  };
  const moveStep = (stepId: string, dir: -1 | 1) => {
    if (!template) return;
    const idx = template.steps.findIndex((s) => s.id === stepId);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= template.steps.length) return;
    const steps = [...template.steps];
    [steps[idx], steps[next]] = [steps[next], steps[idx]];
    stepsMutation.mutate({ template, steps });
  };

  return (
    <FormDrawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? "Edit Protocol Template" : "New Protocol Template"}
      onSubmit={save}
      submitLabel={editing ? "Save" : "Create"}
      size="lg"
    >
      <div className="space-y-6">
        <FormSection title="Basic information" description="Name this runbook and tell operators which team owns it.">
          <FormGrid>
            <FormField label="Title" required full><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FormField>
            <FormField label="Category"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></FormField>
            <FormField label="Assigned team"><Input value={form.assignedTeam ?? ""} onChange={(e) => setForm({ ...form, assignedTeam: e.target.value })} /></FormField>
            <FormField label="Description" full><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>
            <FormField label="Tags" hint="Comma separated" full>
              <Input value={form.tags.join(", ")} onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Purpose and scope" description="What this runbook does and what it covers.">
          <FormGrid>
            <FormField label="Purpose" full><Textarea rows={3} value={form.purpose ?? ""} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></FormField>
            <FormField label="Scope" full><Textarea rows={3} value={form.scope ?? ""} onChange={(e) => setForm({ ...form, scope: e.target.value })} /></FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Preconditions" description="Conditions, access or systems that must be ready before running this protocol.">
          <FormGrid columns={1}>
            <FormField label="Preconditions"><Textarea rows={3} value={form.preconditions ?? ""} onChange={(e) => setForm({ ...form, preconditions: e.target.value })} /></FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Timing and recurrence" description="Estimated duration and how often this runbook is executed.">
          <FormGrid>
            <FormField label="Estimated minutes"><Input type="number" min={0} value={form.estimatedMinutes ?? 30} onChange={(e) => setForm({ ...form, estimatedMinutes: parseInt(e.target.value, 10) || 0 })} /></FormField>
            <FormField label="Recurrence">
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
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Approval" description="Optionally require sign-off before this protocol completes.">
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 p-3">
            <div>
              <div className="text-sm font-medium">Approval required</div>
              <p className="text-xs text-muted-foreground">Require sign-off before completion.</p>
            </div>
            <Switch checked={form.approvalRequired} onCheckedChange={(c) => setForm({ ...form, approvalRequired: c })} />
          </div>
        </FormSection>

        <FormSection title="Visibility" description="Who can discover and execute this protocol.">
          <FormGrid columns={1}>
            <FormField label="Visibility">
              <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v as ProtocolTemplateInput["visibility"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </FormGrid>
        </FormSection>

        {/* Step builder - only when editing existing template */}
        {editing && template && (
          <FormSection title={`Checklist steps (${template.steps.length})`} description="Define the ordered actions operators take during execution.">
            <div className="rounded-lg border border-border/60 bg-card/40 p-3">
              <div className="mb-2 flex items-center justify-end">
                <Button size="sm" variant="outline" onClick={addStep} disabled={stepsMutation.isPending}><Plus className="mr-1 h-3 w-3" />Add step</Button>
              </div>
              <div className="space-y-2">
                {template.steps.length === 0 && <p className="text-xs text-muted-foreground">No steps yet.</p>}
                {template.steps.map((s, i) => (
                  <div key={s.id} className="rounded-md border border-border/60 bg-background/50 p-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>
                      <Input className="h-7 flex-1" value={s.title} onChange={(e) => updateStep(s.id, { title: e.target.value })} />
                      <Button size="sm" variant="ghost" disabled={i === 0 || stepsMutation.isPending} onClick={() => moveStep(s.id, -1)}>↑</Button>
                      <Button size="sm" variant="ghost" disabled={i === template.steps.length - 1 || stepsMutation.isPending} onClick={() => moveStep(s.id, 1)}>↓</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" disabled={stepsMutation.isPending} onClick={() => deleteStep(s.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                    <Textarea className="mt-2" rows={2} placeholder="Instructions" value={s.instructions} onChange={(e) => updateStep(s.id, { instructions: e.target.value })} />
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5"><Checkbox checked={s.required} onCheckedChange={(c) => updateStep(s.id, { required: !!c })} />Required</label>
                      <label className="flex items-center gap-1.5"><Checkbox checked={s.approvalCheckpoint} onCheckedChange={(c) => updateStep(s.id, { approvalCheckpoint: !!c })} />Approval checkpoint</label>
                      <label className="flex items-center gap-1.5"><Checkbox checked={s.evidenceAllowed} onCheckedChange={(c) => updateStep(s.id, { evidenceAllowed: !!c })} />Evidence</label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FormSection>
        )}
        {!editing && (
          <p className="text-xs text-muted-foreground">Create the template first, then add checklist steps from the edit drawer.</p>
        )}
      </div>
    </FormDrawer>
  );
}
