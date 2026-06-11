import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Lucide from "lucide-react";
import {
  ShoppingBag, Plus, Pencil, Eye, EyeOff, Archive, Trash2, Search,
  MoreHorizontal, ExternalLink, X, Lock, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FormDrawer } from "@/components/common/FormDrawer";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { timeAgo } from "@/components/common/format";

import { useAuth } from "@/lib/auth/AuthProvider";
import { can, useRole } from "@/lib/permissions";
import { catalogManagedQuery, sdKeys } from "@/lib/service-desk/queries";
import {
  createCatalogItem,
  deleteCatalogItem,
  setCatalogStatus,
  updateCatalogItem,
  type CatalogItemInput,
} from "@/lib/service-desk/catalog";
import type {
  CatalogFieldSchema,
  CatalogItem,
  CatalogItemStatus,
  CatalogItemVisibility,
  TicketPriority,
} from "@/lib/service-desk/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/catalog")({
  head: () => ({ meta: [{ title: "Service Catalog Admin · IT Knowledge Center" }] }),
  component: CatalogAdmin,
});

type StatusTab = "all" | CatalogItemStatus;

const STATUS_TONE: Record<CatalogItemStatus, "success" | "warning" | "muted"> = {
  published: "success",
  draft: "warning",
  archived: "muted",
};

const CATALOG_PRIORITIES: TicketPriority[] = ["low", "normal", "high", "critical"];
const CATALOG_VISIBILITIES: CatalogItemVisibility[] = ["internal", "restricted"];
// Suggested categories / teams — actual values are free-form text on the server.
const SUGGESTED_CATEGORIES = ["Hardware", "Software", "Account & Access", "Networking", "Email", "Other"];
const SUGGESTED_TEAMS = ["Service Desk", "Field Ops", "Network", "Infrastructure"];
const CATALOG_ICON_OPTIONS = [
  "ShoppingBag", "Laptop", "Monitor", "Smartphone", "Headphones", "Mouse",
  "Keyboard", "Wifi", "Network", "Server", "Database", "Cloud", "Lock",
  "Key", "Mail", "MessageSquare", "FileText", "User", "Users", "Calendar",
];

function CatalogAdmin() {
  const { session, loading: authLoading } = useAuth();
  const role = useRole();
  const qc = useQueryClient();
  const allowed = can("tickets.config", role);

  const [tab, setTab] = useState<StatusTab>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CatalogItem | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<CatalogItem | null>(null);

  const enabled = Boolean(session?.user) && allowed;
  const { data, isLoading, isError, error, refetch } = useQuery({
    ...catalogManagedQuery(),
    enabled,
  });
  const items = data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: sdKeys.catalogManaged() });
    qc.invalidateQueries({ queryKey: sdKeys.catalogPublished() });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CatalogItemStatus }) =>
      setCatalogStatus(id, status),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCatalogItem(id),
    onSuccess: () => {
      invalidate();
      toast.success("Service deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const counts = useMemo(() => ({
    all: items.length,
    published: items.filter((c) => c.status === "published").length,
    draft: items.filter((c) => c.status === "draft").length,
    archived: items.filter((c) => c.status === "archived").length,
  }), [items]);

  const filtered = useMemo(() => {
    let list = items.slice().sort((a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
    if (tab !== "all") list = list.filter((c) => c.status === tab);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q),
    );
    return list;
  }, [items, tab, query]);

  if (authLoading) {
    return <div className="glass-card rounded-2xl p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!session) {
    return (
      <EmptyState
        icon={Lock}
        title="Sign in required"
        description="You must be signed in to manage the catalog."
        actionLabel="Sign in"
        onAction={() => window.location.assign("/auth")}
      />
    );
  }
  if (!allowed) {
    return (
      <div>
        <PageHeader title="Service Catalog" description="Manage catalog services available to employees." />
        <EmptyState icon={Lock} title="Admin access required" description="Your role cannot manage the service catalog." />
      </div>
    );
  }

  const setStatus = (c: CatalogItem, status: CatalogItemStatus, msg: string) => {
    statusMutation.mutate({ id: c.id, status }, { onSuccess: () => toast.success(msg) });
  };

  return (
    <div>
      <PageHeader
        title="Service Catalog"
        description="Add, edit, publish, and archive the services employees can request."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/service-catalog"><Button variant="secondary" size="sm"><ExternalLink className="mr-1.5 h-4 w-4" /> View public catalog</Button></Link>
            <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1.5 h-4 w-4" /> New service</Button>
          </div>
        }
      />

      <div className="glass-card mb-4 rounded-2xl p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
            <TabsList>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="published">Published ({counts.published})</TabsTrigger>
              <TabsTrigger value="draft">Draft ({counts.draft})</TabsTrigger>
              <TabsTrigger value="archived">Archived ({counts.archived})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search services" className="h-9 pl-9" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card rounded-2xl p-6 text-sm text-muted-foreground">Loading services…</div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Could not load services"
          description={error instanceof Error ? error.message : "Unexpected error."}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={items.length === 0 ? "No services yet" : "No matching services"}
          description={items.length === 0 ? "Create your first catalog service to get started." : "Try a different search or status filter."}
          actionLabel={items.length === 0 ? "New service" : undefined}
          onAction={items.length === 0 ? () => setCreating(true) : undefined}
        />
      ) : (
        <SectionCard title={`Services (${filtered.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Service</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Team</th>
                  <th className="px-3 py-2 text-left">Priority</th>
                  <th className="px-3 py-2 text-left">Response</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Updated</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const Icon = (Lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>)[c.icon] ?? ShoppingBag;
                  return (
                    <tr key={c.id} className="border-t border-border/40">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{c.name}</div>
                            <div className="truncate text-[11px] text-muted-foreground">{c.description}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{c.category}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.defaultTeam ?? "—"}</td>
                      <td className="px-3 py-2 capitalize">{c.defaultPriority}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.estimatedTime ?? "—"}</td>
                      <td className="px-3 py-2"><StatusBadge label={cap(c.status)} tone={STATUS_TONE[c.status]} /></td>
                      <td className="px-3 py-2 text-muted-foreground" suppressHydrationWarning>{c.updatedAt ? timeAgo(c.updatedAt) : "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {c.status !== "published" && (
                                <DropdownMenuItem onClick={() => setStatus(c, "published", "Service published")}>
                                  <Eye className="mr-2 h-4 w-4" /> Publish
                                </DropdownMenuItem>
                              )}
                              {c.status === "published" && (
                                <DropdownMenuItem onClick={() => setStatus(c, "draft", "Service unpublished")}>
                                  <EyeOff className="mr-2 h-4 w-4" /> Unpublish
                                </DropdownMenuItem>
                              )}
                              {c.status !== "archived" && (
                                <DropdownMenuItem onClick={() => setConfirmArchive(c)}>
                                  <Archive className="mr-2 h-4 w-4" /> Archive
                                </DropdownMenuItem>
                              )}
                              {c.status === "archived" && (
                                <DropdownMenuItem onClick={() => setStatus(c, "draft", "Service restored to draft")}>
                                  <Eye className="mr-2 h-4 w-4" /> Restore to draft
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(c)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete permanently
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <CatalogEditor
        open={creating || editing !== null}
        item={editing}
        onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={confirmArchive !== null}
        onOpenChange={(o) => { if (!o) setConfirmArchive(null); }}
        title="Archive this service?"
        description={confirmArchive ? `“${confirmArchive.name}” will be hidden from employees. You can restore it later from the Archived tab.` : ""}
        confirmLabel="Archive"
        onConfirm={() => {
          if (confirmArchive) {
            setStatus(confirmArchive, "archived", "Service archived");
            setConfirmArchive(null);
          }
        }}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title="Delete this service permanently?"
        description={confirmDelete ? `“${confirmDelete.name}” will be removed from the catalog. Existing tickets created from it are not affected. This cannot be undone.` : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) {
            deleteMutation.mutate(confirmDelete.id);
            setConfirmDelete(null);
          }
        }}
      />
    </div>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function CatalogEditor({
  open, item, onOpenChange, onSaved,
}: {
  open: boolean;
  item: CatalogItem | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = item !== null;
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? SUGGESTED_CATEGORIES[0]);
  const [description, setDescription] = useState(item?.description ?? "");
  const [icon, setIcon] = useState<string>(item?.icon ?? CATALOG_ICON_OPTIONS[0]);
  const [priority, setPriority] = useState<TicketPriority>(item?.defaultPriority ?? "normal");
  const [team, setTeam] = useState(item?.defaultTeam ?? SUGGESTED_TEAMS[0]);
  const [estimatedTime, setEstimatedTime] = useState(item?.estimatedTime ?? "1 business day");
  const [status, setStatus] = useState<CatalogItemStatus>(item?.status ?? "draft");
  const [visibility, setVisibility] = useState<CatalogItemVisibility>(item?.visibility ?? "internal");
  const [fields, setFields] = useState<CatalogFieldSchema[]>(item?.fieldsSchema ?? []);

  const itemKey = item?.id ?? "__new__";
  const [lastKey, setLastKey] = useState(itemKey);
  if (open && lastKey !== itemKey) {
    setLastKey(itemKey);
    setName(item?.name ?? "");
    setCategory(item?.category ?? SUGGESTED_CATEGORIES[0]);
    setDescription(item?.description ?? "");
    setIcon(item?.icon ?? CATALOG_ICON_OPTIONS[0]);
    setPriority(item?.defaultPriority ?? "normal");
    setTeam(item?.defaultTeam ?? SUGGESTED_TEAMS[0]);
    setEstimatedTime(item?.estimatedTime ?? "1 business day");
    setStatus(item?.status ?? "draft");
    setVisibility(item?.visibility ?? "internal");
    setFields(item?.fieldsSchema ?? []);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleanFields = fields
        .map((f) => ({ ...f, key: f.key.trim(), label: f.label.trim() }))
        .filter((f) => f.key && f.label);
      const payload: CatalogItemInput = {
        name: name.trim(),
        category,
        description: description.trim(),
        icon,
        defaultPriority: priority,
        defaultTeam: team,
        estimatedTime: estimatedTime.trim() || null,
        visibility,
        fieldsSchema: cleanFields,
        status,
      };
      return isEdit && item
        ? updateCatalogItem(item.id, payload)
        : createCatalogItem(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Service updated" : `Service ${status === "published" ? "published" : "saved as draft"}`);
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const submit = () => {
    if (name.trim().length < 2) return toast.error("Title is required");
    if (description.trim().length < 4) return toast.error("Description is required");
    saveMutation.mutate();
  };

  const updateField = (idx: number, patch: Partial<CatalogFieldSchema>) => {
    setFields((arr) => arr.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };
  const removeField = (idx: number) => setFields((arr) => arr.filter((_, i) => i !== idx));
  const addField = () => setFields((arr) => [...arr, { key: "", label: "", type: "text" }]);

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit service" : "New service"}
      description="Configure how this service appears in the employee catalog."
      submitLabel={saveMutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create service"}
      onSubmit={submit}
    >
      <div className="space-y-2">
        <Label className="text-xs">Title <span className="text-destructive">*</span></Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New laptop request" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SUGGESTED_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Icon</Label>
          <Select value={icon} onValueChange={setIcon}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATALOG_ICON_OPTIONS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Description <span className="text-destructive">*</span></Label>
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this service does and when to request it." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs">Default priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATALOG_PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Assigned team</Label>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SUGGESTED_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Expected response time</Label>
          <Input value={estimatedTime} onChange={(e) => setEstimatedTime(e.target.value)} placeholder="e.g. 1 business day" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Visibility</Label>
          <Select value={visibility} onValueChange={(v) => setVisibility(v as CatalogItemVisibility)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATALOG_VISIBILITIES.map((v) => (
                <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 col-span-2">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as CatalogItemStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft (hidden from employees)</SelectItem>
              <SelectItem value="published">Published (visible)</SelectItem>
              <SelectItem value="archived">Archived (hidden)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Request form fields</Label>
          <Button type="button" variant="secondary" size="sm" onClick={addField}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add field
          </Button>
        </div>
        {fields.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No custom fields. Employees will only see a Submit button.</p>
        ) : (
          <div className="space-y-2">
            {fields.map((f, idx) => (
              <div key={idx} className="rounded-lg border border-border/40 bg-background/30 p-2">
                <div className="flex items-center justify-between gap-2 pb-2">
                  <Badge variant="outline" className="text-[10px]">Field #{idx + 1}</Badge>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeField(idx)} aria-label="Remove field">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={f.label} onChange={(e) => updateField(idx, { label: e.target.value })} placeholder="Label" className="h-8 text-xs" />
                  <Input value={f.key} onChange={(e) => updateField(idx, { key: e.target.value })} placeholder="key (no spaces)" className="h-8 font-mono text-xs" />
                  <Select value={f.type} onValueChange={(v) => updateField(idx, { type: v as CatalogFieldSchema["type"] })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Short text</SelectItem>
                      <SelectItem value="textarea">Long text</SelectItem>
                      <SelectItem value="select">Select</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={!!f.required} onChange={(e) => updateField(idx, { required: e.target.checked })} className="accent-primary" />
                    Required
                  </label>
                  {f.type === "select" && (
                    <Input
                      value={(f.options ?? []).join(", ")}
                      onChange={(e) => updateField(idx, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      placeholder="Comma-separated options"
                      className="col-span-2 h-8 text-xs"
                    />
                  )}
                  {f.type !== "select" && (
                    <Input
                      value={f.placeholder ?? ""}
                      onChange={(e) => updateField(idx, { placeholder: e.target.value })}
                      placeholder="Placeholder (optional)"
                      className="col-span-2 h-8 text-xs"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </FormDrawer>
  );
}
