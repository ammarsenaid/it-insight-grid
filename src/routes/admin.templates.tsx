import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, FileCode, Search, Pencil } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { FormDrawer } from "@/components/common/FormDrawer";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useRole, can } from "@/lib/permissions";
import { cannedResponsesQuery, sdKeys } from "@/lib/service-desk/queries";
import {
  createCannedResponse,
  deleteCannedResponse,
  updateCannedResponse,
  type CannedResponseInput,
} from "@/lib/service-desk/settings";
import type { TicketCannedResponse } from "@/lib/service-desk/types";

export const Route = createFileRoute("/admin/templates")({
  head: () => ({ meta: [{ title: "Reply Templates · IT Knowledge Center" }] }),
  component: TemplatesAdminPage,
});

interface FormState {
  shortcut: string;
  title: string;
  body: string;
  isInternal: boolean;
}

const emptyForm = (): FormState => ({ shortcut: "", title: "", body: "", isInternal: false });

function fromRow(r: TicketCannedResponse): FormState {
  return { shortcut: r.shortcut, title: r.title, body: r.body, isInternal: r.isInternal };
}

function toPayload(f: FormState): CannedResponseInput {
  return {
    shortcut: f.shortcut.trim(),
    title: f.title.trim(),
    body: f.body,
    isInternal: f.isInternal,
  };
}

function TemplatesAdminPage() {
  const role = useRole();
  const { session } = useAuth();
  const writable = can("tickets.config", role);
  const canDelete = can("tickets.cannedResponses.delete", role);
  const qc = useQueryClient();

  const { data: rows = [], isLoading, isError, error } = useQuery(cannedResponsesQuery());

  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "public" | "internal">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return rows.filter((r) => {
      if (scopeFilter === "public" && r.isInternal) return false;
      if (scopeFilter === "internal" && !r.isInternal) return false;
      if (!q) return true;
      return (
        r.shortcut.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.body.toLowerCase().includes(q)
      );
    });
  }, [rows, query, scopeFilter]);

  const metrics = useMemo(
    () => ({
      total: rows.length,
      publicCount: rows.filter((r) => !r.isInternal).length,
      internalCount: rows.filter((r) => r.isInternal).length,
    }),
    [rows],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: sdKeys.settings.canned() });

  const createMut = useMutation({
    mutationFn: (input: CannedResponseInput) => {
      if (!session?.user?.id) throw new Error("Sign in required");
      return createCannedResponse(session.user.id, input);
    },
    onSuccess: (row) => {
      toast.success(`Created "${row.title}"`);
      invalidate();
      setDrawerOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CannedResponseInput> }) =>
      updateCannedResponse(id, patch),
    onSuccess: () => {
      toast.success("Template updated");
      invalidate();
      setDrawerOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => {
      if (!canDelete) throw new Error("You do not have permission to delete templates");
      return deleteCannedResponse(id);
    },
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
      setConfirmDelete(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setDrawerOpen(true);
  };
  const openEdit = (r: TicketCannedResponse) => {
    setEditId(r.id);
    setForm(fromRow(r));
    setDrawerOpen(true);
  };

  const submit = () => {
    const payload = toPayload(form);
    if (!payload.shortcut || !payload.title || !payload.body) {
      toast.error("Shortcut, title, and body are required");
      return;
    }
    if (editId) updateMut.mutate({ id: editId, patch: payload });
    else createMut.mutate(payload);
  };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Reply Templates"
        description="Manage canned responses available to agents in the ticket reply composer."
        actions={
          writable ? (
            <Button onClick={openCreate} disabled={!session?.user?.id}>
              <Plus className="mr-1.5 h-4 w-4" /> New template
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Templates" value={metrics.total} icon={FileCode} />
        <MetricCard label="Public replies" value={metrics.publicCount} icon={FileCode} />
        <MetricCard label="Internal notes" value={metrics.internalCount} icon={FileCode} />
      </div>

      <div className="rounded-xl border border-border/50 bg-card/60 p-3 shadow-sm">
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search shortcut, title, body…"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-background/30 p-1 md:col-span-3">
            <Button
              size="sm"
              variant={scopeFilter === "all" ? "default" : "ghost"}
              onClick={() => setScopeFilter("all")}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={scopeFilter === "public" ? "default" : "ghost"}
              onClick={() => setScopeFilter("public")}
            >
              Public
            </Button>
            <Button
              size="sm"
              variant={scopeFilter === "internal" ? "default" : "ghost"}
              onClick={() => setScopeFilter("internal")}
            >
              Internal
            </Button>
          </div>
          <div className="md:col-span-3 flex items-center justify-end text-xs text-muted-foreground">
            {filtered.length} of {rows.length}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/50 bg-card/60 shadow-sm">
        {isLoading ? (
          <EmptyState icon={Search} title="Loading templates…" description="" />
        ) : isError ? (
          <EmptyState
            icon={Search}
            title="Failed to load templates"
            description={error instanceof Error ? error.message : "Unknown error"}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No templates"
            description={
              writable
                ? "Create your first canned response."
                : "Ask an admin to add reply templates."
            }
          />
        ) : (
          <div className="max-h-[68vh] overflow-auto">
            <Table className="min-w-[760px]">
              <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Shortcut</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} className="transition-colors hover:bg-muted/25">
                    <TableCell>
                      <code className="rounded-md border border-border/40 bg-background/40 px-2 py-1 text-xs">
                        /{r.shortcut}
                      </code>
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.title}
                      <div className="truncate text-[11px] text-muted-foreground max-w-[480px]">
                        {r.body}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={r.isInternal ? "warning" : "info"}
                        label={r.isInternal ? "internal" : "public"}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {writable && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openEdit(r)}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setConfirmDelete(r.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      <FormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editId ? "Edit template" : "New template"}
        onSubmit={submit}
        submitLabel={editId ? "Save changes" : "Create"}
      >
        <Field label="Shortcut">
          <Input
            value={form.shortcut}
            onChange={(e) => setForm({ ...form, shortcut: e.target.value })}
            placeholder="e.g. greeting"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Used as <code>/{form.shortcut || "shortcut"}</code> in the reply composer.
          </p>
        </Field>
        <Field label="Title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Body">
          <Textarea
            rows={10}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            className="font-mono text-xs"
          />
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/30 p-3.5">
          <div>
            <div className="text-sm font-medium">Internal note only</div>
            <div className="text-[11px] text-muted-foreground">
              Internal templates are hidden from requesters and only insertable into internal notes.
            </div>
          </div>
          <Switch
            checked={form.isInternal}
            onCheckedChange={(v) => setForm({ ...form, isInternal: v })}
          />
        </div>
      </FormDrawer>

      {canDelete && (
        <ConfirmDialog
          open={confirmDelete !== null}
          onOpenChange={(o) => !o && setConfirmDelete(null)}
          title="Delete template?"
          description="This canned response will be removed for all agents."
          confirmLabel="Delete"
          onConfirm={() => confirmDelete && deleteMut.mutate(confirmDelete)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-border/40 bg-card/30 p-3.5">
      <Label className="mb-1.5 block text-xs">{label}</Label>
      {children}
    </div>
  );
}
