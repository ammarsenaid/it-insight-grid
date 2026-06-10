import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Copy, Archive, RotateCcw, Trash2, Download, Upload, FileCode, Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { FormDrawer } from "@/components/common/FormDrawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useRole, can } from "@/lib/permissions";
import {
  useTemplates,
  createTemplate,
  updateTemplate,
  duplicateTemplate,
  archiveTemplate,
  restoreTemplate,
  deleteTemplate,
  exportTemplate,
  importTemplate,
} from "@/lib/templates/store";
import type { RegistryTemplate, TemplateType, TemplateStatus, TemplateVisibility } from "@/lib/templates/types";
import { TEMPLATE_TYPE_LABEL } from "@/lib/templates/types";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/templates")({
  head: () => ({ meta: [{ title: "Templates · IT Knowledge Center" }] }),
  component: TemplatesAdminPage,
});

const TYPE_OPTIONS = Object.entries(TEMPLATE_TYPE_LABEL) as Array<[TemplateType, string]>;
const STATUS_OPTIONS: TemplateStatus[] = ["draft", "published", "archived"];
const VIS_OPTIONS: TemplateVisibility[] = ["internal", "restricted", "public_internal"];

interface FormState {
  name: string;
  type: TemplateType;
  category: string;
  description: string;
  defaultTeam: string;
  visibility: TemplateVisibility;
  status: TemplateStatus;
  tagsText: string;
  content: string;
  body: string;
  checklistText: string;
  protocolStepsText: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    type: "knowledge_page",
    category: "General",
    description: "",
    defaultTeam: "",
    visibility: "internal",
    status: "draft",
    tagsText: "",
    content: "",
    body: "",
    checklistText: "",
    protocolStepsText: "",
  };
}

function fromTemplate(t: RegistryTemplate): FormState {
  return {
    name: t.name,
    type: t.type,
    category: t.category,
    description: t.description ?? "",
    defaultTeam: t.defaultTeam ?? "",
    visibility: t.visibility,
    status: t.status,
    tagsText: t.tags.join(", "),
    content: t.content ?? "",
    body: t.body ?? "",
    checklistText: (t.checklist ?? []).map((c) => c.title).join("\n"),
    protocolStepsText: (t.protocolSteps ?? []).map((s) => s.title).join("\n"),
  };
}

function toPayload(f: FormState): Omit<RegistryTemplate, "id" | "createdAt" | "updatedAt" | "usageCount" | "builtin"> {
  const tags = f.tagsText.split(",").map((s) => s.trim()).filter(Boolean);
  const checklist = f.checklistText.split("\n").map((s) => s.trim()).filter(Boolean).map((title) => ({ title }));
  const protocolSteps = f.protocolStepsText.split("\n").map((s) => s.trim()).filter(Boolean).map((title) => ({ title }));
  return {
    name: f.name.trim() || "Untitled template",
    type: f.type,
    category: f.category.trim() || "General",
    description: f.description,
    defaultTeam: f.defaultTeam || undefined,
    visibility: f.visibility,
    status: f.status,
    tags,
    content: ["knowledge_page", "sop", "troubleshooting", "runbook", "postmortem", "change", "onboarding", "offboarding"].includes(f.type) ? f.content : undefined,
    body: ["ticket_reply", "internal_note", "resolution"].includes(f.type) ? f.body : undefined,
    checklist: ["task", "onboarding", "offboarding"].includes(f.type) && checklist.length ? checklist : undefined,
    protocolSteps: f.type === "protocol" && protocolSteps.length ? protocolSteps : undefined,
  };
}

function TemplatesAdminPage() {
  const role = useRole();
  const writable = can("admin.users", role) || role === "doc_editor" || role === "sd_lead";
  const all = useTemplates();

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [visFilter, setVisFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const teams = useMemo(() => {
    const s = new Set<string>();
    for (const t of all) if (t.defaultTeam) s.add(t.defaultTeam);
    return Array.from(s);
  }, [all]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return all.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "archived" ? !t.archived : t.status !== statusFilter || t.archived) return false;
      }
      if (visFilter !== "all" && t.visibility !== visFilter) return false;
      if (teamFilter !== "all" && t.defaultTeam !== teamFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [all, query, typeFilter, statusFilter, visFilter, teamFilter]);

  const metrics = useMemo(() => ({
    total: all.length,
    custom: all.filter((t) => !t.builtin).length,
    archived: all.filter((t) => t.archived).length,
    published: all.filter((t) => t.status === "published" && !t.archived).length,
  }), [all]);

  const resetFilters = () => { setQuery(""); setTypeFilter("all"); setStatusFilter("all"); setVisFilter("all"); setTeamFilter("all"); };

  const openCreate = () => { setEditId(null); setForm(emptyForm()); setDrawerOpen(true); };
  const openEdit = (t: RegistryTemplate) => {
    if (t.builtin) { toast.info("Built-in templates are read-only. Duplicate to customize."); return; }
    setEditId(t.id); setForm(fromTemplate(t)); setDrawerOpen(true);
  };
  const submit = () => {
    if (editId) {
      const ok = updateTemplate(editId, toPayload(form));
      toast[ok ? "success" : "error"](ok ? "Template updated" : "Cannot update built-in");
    } else {
      const t = createTemplate(toPayload(form));
      toast.success(`Created "${t.name}"`);
    }
    setDrawerOpen(false);
  };

  const handleDuplicate = (id: string) => {
    const t = duplicateTemplate(id);
    if (t) toast.success(`Duplicated as "${t.name}"`);
  };
  const handleArchive = (t: RegistryTemplate) => { archiveTemplate(t.id); toast.success("Archived"); };
  const handleRestore = (t: RegistryTemplate) => { restoreTemplate(t.id); toast.success("Restored"); };
  const handleDelete = (id: string) => {
    const ok = deleteTemplate(id);
    toast[ok ? "success" : "error"](ok ? "Deleted" : "Built-in templates cannot be deleted");
    setConfirmDelete(null);
  };
  const handleExport = (id: string) => {
    const json = exportTemplate(id);
    if (!json) return;
    navigator.clipboard?.writeText(json).then(() => toast.success("Template JSON copied to clipboard"));
  };
  const handleImport = () => {
    const t = importTemplate(importText);
    if (t) { toast.success(`Imported "${t.name}"`); setImportOpen(false); setImportText(""); }
    else { toast.error("Invalid template JSON"); }
  };

  const preview = previewId ? all.find((t) => t.id === previewId) ?? null : null;

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Manage reusable content and operational templates."
        actions={writable ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)}><Upload className="mr-1.5 h-4 w-4" /> Import</Button>
            <Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> New template</Button>
          </div>
        ) : null}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total templates" value={metrics.total} icon={FileCode} />
        <MetricCard label="Custom" value={metrics.custom} icon={FileCode} />
        <MetricCard label="Published" value={metrics.published} icon={FileCode} />
        <MetricCard label="Archived" value={metrics.archived} icon={Archive} />
      </div>

      <div className="glass-card mb-4 rounded-2xl p-4">
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-4"><SearchInput value={query} onChange={setQuery} placeholder="Search templates…" /></div>
          <FilterSelect className="md:col-span-2" value={typeFilter} onChange={setTypeFilter} label="Type" options={[["all", "All types"], ...TYPE_OPTIONS]} />
          <FilterSelect className="md:col-span-2" value={statusFilter} onChange={setStatusFilter} label="Status" options={[["all", "All"], ...STATUS_OPTIONS.map((s) => [s, s] as [string, string])]} />
          <FilterSelect className="md:col-span-2" value={visFilter} onChange={setVisFilter} label="Visibility" options={[["all", "All"], ...VIS_OPTIONS.map((s) => [s, s] as [string, string])]} />
          <FilterSelect className="md:col-span-2" value={teamFilter} onChange={setTeamFilter} label="Team" options={[["all", "All teams"], ...teams.map((t) => [t, t] as [string, string])]} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} of {all.length} templates</span>
          <Button variant="ghost" size="sm" onClick={resetFilters}>Reset filters</Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden rounded-2xl">
        {filtered.length === 0 ? (
          <EmptyState icon={Search} title="No templates" description="Try clearing filters or creating a new template." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Default Team</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Usage</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => setPreviewId(t.id)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {t.name}
                        {t.builtin && <Badge variant="outline" className="h-4 px-1 text-[9px]">Built-in</Badge>}
                      </div>
                      {t.description && <div className="truncate text-[11px] text-muted-foreground">{t.description}</div>}
                    </TableCell>
                    <TableCell><StatusBadge tone="info" label={TEMPLATE_TYPE_LABEL[t.type]} /></TableCell>
                    <TableCell className="text-sm">{t.category}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.defaultTeam ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.visibility}</TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={t.archived ? "muted" : t.status === "published" ? "success" : t.status === "draft" ? "warning" : "info"}
                        label={t.archived ? "archived" : t.status}
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{t.usageCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(t.updatedAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDuplicate(t.id)} title="Duplicate"><Copy className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleExport(t.id)} title="Export JSON"><Download className="h-3.5 w-3.5" /></Button>
                        {writable && !t.builtin && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)} title="Edit"><FileCode className="h-3.5 w-3.5" /></Button>
                        )}
                        {writable && (t.archived
                          ? <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRestore(t)} title="Restore"><RotateCcw className="h-3.5 w-3.5" /></Button>
                          : <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleArchive(t)} title="Archive"><Archive className="h-3.5 w-3.5" /></Button>
                        )}
                        {writable && !t.builtin && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setConfirmDelete(t.id)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create / Edit drawer */}
      <FormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={editId ? "Edit template" : "New template"} onSubmit={submit} submitLabel={editId ? "Save changes" : "Create"}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as TemplateType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPE_OPTIONS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Category"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <Field label="Default team"><Input value={form.defaultTeam} onChange={(e) => setForm({ ...form, defaultTeam: e.target.value })} placeholder="optional" /></Field>
          <Field label="Visibility">
            <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v as TemplateVisibility })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VIS_OPTIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TemplateStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Tags (comma separated)"><Input value={form.tagsText} onChange={(e) => setForm({ ...form, tagsText: e.target.value })} /></Field>

        {["knowledge_page", "sop", "troubleshooting", "runbook", "postmortem", "change", "onboarding", "offboarding"].includes(form.type) && (
          <Field label="Content (Markdown)"><Textarea rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="font-mono text-xs" /></Field>
        )}
        {["task", "onboarding", "offboarding"].includes(form.type) && (
          <Field label="Default checklist (one per line)"><Textarea rows={5} value={form.checklistText} onChange={(e) => setForm({ ...form, checklistText: e.target.value })} /></Field>
        )}
        {form.type === "protocol" && (
          <Field label="Default protocol steps (one per line)"><Textarea rows={5} value={form.protocolStepsText} onChange={(e) => setForm({ ...form, protocolStepsText: e.target.value })} /></Field>
        )}
        {["ticket_reply", "internal_note", "resolution"].includes(form.type) && (
          <Field label="Body">
            <Textarea rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <p className="mt-1 text-[11px] text-muted-foreground">Supports placeholders like <code>{"{{requester}}"}</code>, <code>{"{{assignee}}"}</code>.</p>
          </Field>
        )}
      </FormDrawer>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreviewId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {preview?.name}
              <Badge variant="outline" className="text-[10px]">{preview && TEMPLATE_TYPE_LABEL[preview.type]}</Badge>
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <div className="text-xs text-muted-foreground">{preview.category}{preview.defaultTeam ? ` · ${preview.defaultTeam}` : ""}</div>
              {preview.description && <p className="text-muted-foreground">{preview.description}</p>}
              {preview.content && (
                <pre className="max-h-96 overflow-auto rounded-md bg-muted/30 p-3 text-xs whitespace-pre-wrap">{preview.content}</pre>
              )}
              {preview.body && (
                <pre className="max-h-96 overflow-auto rounded-md bg-muted/30 p-3 text-xs whitespace-pre-wrap">{preview.body}</pre>
              )}
              {preview.checklist && preview.checklist.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium">Checklist</div>
                  <ul className="space-y-1 text-xs">
                    {preview.checklist.map((c, i) => <li key={i}>• {c.title}</li>)}
                  </ul>
                </div>
              )}
              {preview.protocolSteps && preview.protocolSteps.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium">Steps</div>
                  <ol className="list-decimal space-y-1 pl-5 text-xs">
                    {preview.protocolSteps.map((s, i) => <li key={i}>{s.title}</li>)}
                  </ol>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewId(null)}>Close</Button>
            {preview && <Button onClick={() => { handleDuplicate(preview.id); setPreviewId(null); }}>Duplicate</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Import template</DialogTitle></DialogHeader>
          <Textarea rows={10} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste exported template JSON…" className="font-mono text-xs" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={handleImport}>Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete template?"
        description="This permanently removes the custom template."
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function FilterSelect({ value, onChange, label, options, className }: { value: string; onChange: (v: string) => void; label: string; options: Array<[string, string]>; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-[11px] uppercase text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
