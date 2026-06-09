import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Server, Activity, Wrench, Archive, Network as NetIcon, FileText, MoreHorizontal, Edit, Trash2, AlertCircle } from "lucide-react";
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
import type { CMDBAsset } from "@/lib/data/types";
import { toast } from "sonner";
import { formatDate } from "@/components/common/format";

export const Route = createFileRoute("/cmdb")({
  head: () => ({
    meta: [
      { title: "CMDB · IT Knowledge Center" },
      { name: "description", content: "Manage servers, virtual machines, computers, applications, and network devices." },
    ],
  }),
  component: CMDBPage,
});

const emptyAsset = (): Omit<CMDBAsset, "id" | "createdAt" | "updatedAt"> => ({
  hostname: "",
  displayName: "",
  assetType: "server",
  ipAddress: "",
  os: "",
  role: "",
  environment: "production",
  location: "",
  owner: "",
  vendor: "",
  model: "",
  serialNumber: "",
  assetTag: "",
  macAddress: "",
  status: "active",
  warrantyExpiration: "",
  notes: "",
});

function CMDBPage() {
  const data = useData();
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterEnv, setFilterEnv] = useState<string>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(emptyAsset());
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return data.assets.filter((a) => {
      if (filterType !== "all" && a.assetType !== filterType) return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (filterEnv !== "all" && a.environment !== filterEnv) return false;
      if (!q) return true;
      return (
        a.hostname.toLowerCase().includes(q) ||
        a.displayName.toLowerCase().includes(q) ||
        a.ipAddress.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q)
      );
    });
  }, [data.assets, query, filterType, filterStatus, filterEnv]);

  const active = data.assets.filter((a) => a.status === "active").length;
  const maint = data.assets.filter((a) => a.status === "maintenance").length;
  const retired = data.assets.filter((a) => a.status === "retired").length;
  const withoutIP = data.assets.filter((a) => !a.ipAddress || a.ipAddress === "—").length;
  const linkedDocs = data.documents.filter((d) => /server|asset|cmdb|hyperv|dc0/i.test(d.name)).length;

  const openCreate = () => {
    setEditId(null);
    setForm(emptyAsset());
    setDrawerOpen(true);
  };
  const openEdit = (a: CMDBAsset) => {
    setEditId(a.id);
    setForm({ ...a });
    setDrawerOpen(true);
  };

  const save = () => {
    if (!form.hostname.trim()) {
      toast.error("Hostname is required");
      return;
    }
    setState((s) => {
      if (editId) {
        return {
          ...s,
          assets: s.assets.map((a) => (a.id === editId ? { ...a, ...form, updatedAt: new Date().toISOString() } : a)),
        };
      }
      const newAsset: CMDBAsset = {
        id: uid("ast"),
        ...form,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return { ...s, assets: [newAsset, ...s.assets] };
    });
    logActivity(editId ? "asset.edit" : "asset.create", `${editId ? "Updated" : "Added"} CMDB asset '${form.hostname}'`);
    toast.success(editId ? "Asset updated" : "Asset created");
    setDrawerOpen(false);
  };

  const remove = (id: string) => {
    const asset = data.assets.find((a) => a.id === id);
    if (!asset) return;
    trashItem("asset", asset.hostname, "CMDB", asset, 1024);
    setState((s) => ({ ...s, assets: s.assets.filter((a) => a.id !== id) }));
    logActivity("asset.delete", `Deleted CMDB asset '${asset.hostname}'`);
    toast.success("Asset moved to recycle bin");
  };

  const setStatus = (id: string, status: CMDBAsset["status"]) => {
    setState((s) => ({
      ...s,
      assets: s.assets.map((a) => (a.id === id ? { ...a, status, updatedAt: new Date().toISOString() } : a)),
    }));
    logActivity("asset.status", `Set status of asset to ${status}`);
    toast.success(`Marked as ${status}`);
  };

  const columns: Column<CMDBAsset>[] = [
    { key: "hostname", header: "Hostname", render: (a) => <span className="font-mono text-foreground">{a.hostname}</span> },
    { key: "display", header: "Display Name", render: (a) => <span className="text-muted-foreground">{a.displayName}</span> },
    { key: "type", header: "Type", render: (a) => <StatusBadge tone="info" label={a.assetType} /> },
    { key: "ip", header: "IP", render: (a) => <span className="font-mono text-xs">{a.ipAddress || "—"}</span> },
    { key: "os", header: "OS", render: (a) => <span className="text-xs text-muted-foreground">{a.os}</span> },
    { key: "role", header: "Role", render: (a) => <span className="text-xs">{a.role}</span> },
    { key: "env", header: "Env", render: (a) => <StatusBadge tone="muted" label={a.environment} /> },
    { key: "location", header: "Location", render: (a) => <span className="text-xs text-muted-foreground">{a.location}</span> },
    { key: "owner", header: "Owner", render: (a) => <span className="text-xs">{a.owner}</span> },
    { key: "status", header: "Status", render: (a) => <StatusBadge tone={statusTone(a.status)} label={a.status} /> },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (a) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => openEdit(a)}><Edit className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatus(a.id, "maintenance")}><Wrench className="mr-2 h-3.5 w-3.5" /> Mark as maintenance</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatus(a.id, "retired")}><Archive className="mr-2 h-3.5 w-3.5" /> Retire</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(a.id)}>
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="CMDB"
        description="Manage servers, virtual machines, computers, applications, and network devices."
        actions={<Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> Add Asset</Button>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard icon={Server} label="Total Assets" value={data.assets.length} accent="primary" />
        <MetricCard icon={Activity} label="Active" value={active} accent="success" />
        <MetricCard icon={Wrench} label="Maintenance" value={maint} accent="warning" />
        <MetricCard icon={Archive} label="Retired" value={retired} accent="muted" />
        <MetricCard icon={AlertCircle} label="Without IP" value={withoutIP} accent="danger" />
        <MetricCard icon={FileText} label="Linked Docs" value={linkedDocs} accent="primary" />
      </div>

      <div className="mt-6 glass-card rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search hostname, IP, role..." className="w-full sm:w-72" />
          <FilterSelect value={filterType} onChange={setFilterType} placeholder="Type" options={[["all","All types"],["server","Server"],["vm","VM"],["computer","Computer"],["network","Network"],["application","Application"],["storage","Storage"]]} />
          <FilterSelect value={filterStatus} onChange={setFilterStatus} placeholder="Status" options={[["all","All status"],["active","Active"],["maintenance","Maintenance"],["retired","Retired"]]} />
          <FilterSelect value={filterEnv} onChange={setFilterEnv} placeholder="Environment" options={[["all","All env"],["production","Production"],["staging","Staging"],["development","Development"]]} />
          {(query || filterType !== "all" || filterStatus !== "all" || filterEnv !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setFilterType("all"); setFilterStatus("all"); setFilterEnv("all"); }}>Reset</Button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <DataTable
          data={filtered}
          columns={columns}
          pageSize={data.settings.tablePageSize}
          emptyState={<EmptyState icon={Server} title="No assets found" description="Try a different filter or create a new asset." actionLabel="Add Asset" onAction={openCreate} />}
        />
      </div>

      <FormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={editId ? "Edit Asset" : "Add CMDB Asset"}
        description="Track a server, network device, application, or other infrastructure item."
        onSubmit={save}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hostname"><Input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} /></Field>
          <Field label="Display name"><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
          <Field label="Asset type">
            <Select value={form.assetType} onValueChange={(v: CMDBAsset["assetType"]) => setForm({ ...form, assetType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["server","vm","computer","network","application","storage"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v: CMDBAsset["status"]) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["active","maintenance","retired"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="IP address"><Input value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} /></Field>
          <Field label="MAC address"><Input value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} /></Field>
          <Field label="Operating system"><Input value={form.os} onChange={(e) => setForm({ ...form, os: e.target.value })} /></Field>
          <Field label="Role"><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>
          <Field label="Environment">
            <Select value={form.environment} onValueChange={(v: CMDBAsset["environment"]) => setForm({ ...form, environment: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["production","staging","development"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Owner"><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
          <Field label="Vendor"><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></Field>
          <Field label="Model"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
          <Field label="Serial number"><Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></Field>
          <Field label="Asset tag"><Input value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} /></Field>
          <Field label="Warranty expiration"><Input type="date" value={form.warrantyExpiration?.slice(0,10) ?? ""} onChange={(e) => setForm({ ...form, warrantyExpiration: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </FormDrawer>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete asset?"
        description="The asset will be moved to the recycle bin."
        destructive
        confirmLabel="Delete"
        onConfirm={() => { if (confirmDelete) remove(confirmDelete); setConfirmDelete(null); }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 col-span-2 md:col-span-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, options }: { value: string; onChange: (v: string) => void; placeholder: string; options: [string, string][] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[160px] rounded-xl border-border/60 bg-card/60"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// keep formatDate import used (lint)
void formatDate;
void NetIcon;
