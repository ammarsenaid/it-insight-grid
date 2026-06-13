import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Activity, AlertCircle, Archive, Download, Edit, MoreHorizontal,
  Plus, RotateCcw, Server, Trash2, Upload, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { SearchInput } from "@/components/common/SearchInput";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormDrawer } from "@/components/common/FormDrawer";
import { ImportPreviewDialog } from "@/components/common/ImportPreviewDialog";
import { AssetDetailsDrawer } from "@/components/cmdb/AssetDetailsDrawer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { downloadCSV, toCSV } from "@/lib/csv";
import { can, useRole } from "@/lib/permissions";
import {
  createAsset, importAssets, restoreAsset, setAssetStatuses, softDeleteAsset, updateAsset,
} from "@/lib/cmdb/assets";
import { cmdbAssetsQuery, cmdbAssetTypesQuery, cmdbKeys } from "@/lib/cmdb/queries";
import type { CmdbAsset, CmdbAssetInput } from "@/lib/cmdb/types";

export const Route = createFileRoute("/cmdb")({
  head: () => ({ meta: [
    { title: "CMDB · IT Knowledge Center" },
    { name: "description", content: "Manage shared configuration items and their lifecycle." },
  ] }),
  component: CMDBPage,
});

const CSV_COLS = [
  "hostname", "displayName", "assetType", "ipAddress", "os", "role", "environment",
  "location", "owner", "vendor", "model", "serialNumber", "assetTag", "macAddress", "status",
];

function blankAsset(assetTypeId = ""): CmdbAssetInput {
  return {
    hostname: "", displayName: "", assetTypeId, ipAddress: "", os: "", role: "",
    environment: "production", location: "", owner: "", ownerId: null, vendor: "",
    model: "", serialNumber: "", assetTag: "", macAddress: "", status: "active",
    warrantyExpiration: "", notes: "",
  };
}

function assetToInput(asset: CmdbAsset): CmdbAssetInput {
  return {
    hostname: asset.hostname, displayName: asset.displayName, assetTypeId: asset.assetTypeId,
    ipAddress: asset.ipAddress, os: asset.os, role: asset.role, environment: asset.environment,
    location: asset.location, owner: asset.owner, ownerId: asset.ownerId, vendor: asset.vendor,
    model: asset.model, serialNumber: asset.serialNumber, assetTag: asset.assetTag,
    macAddress: asset.macAddress, status: asset.status,
    warrantyExpiration: asset.warrantyExpiration ?? "", notes: asset.notes,
  };
}

function publicError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "23505") return "A live asset already uses that hostname, asset tag, or serial number.";
  if (code === "22P02" || code === "23514" || code === "22023") return "One or more asset values are invalid.";
  if (code === "42501") return "You do not have permission to manage CMDB assets.";
  return "The CMDB operation failed. Try again or contact an administrator.";
}

function CMDBPage() {
  const role = useRole();
  const writable = can("cmdb.manage", role);
  const qc = useQueryClient();
  const [showDeleted, setShowDeleted] = useState(false);
  const assetsQuery = useQuery({ ...cmdbAssetsQuery(showDeleted), enabled: can("cmdb.view", role) });
  const typesQuery = useQuery({ ...cmdbAssetTypesQuery(), enabled: can("cmdb.view", role) });
  const assets = useMemo(() => assetsQuery.data ?? [], [assetsQuery.data]);
  const assetTypes = typesQuery.data ?? [];

  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEnv, setFilterEnv] = useState("all");
  const [filterOwner, setFilterOwner] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [sortBy, setSortBy] = useState("hostname");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<CmdbAssetInput>(blankAsset());
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: cmdbKeys.all });
  };
  const saveMutation = useMutation({
    mutationFn: () => editId ? updateAsset(editId, form) : createAsset(form),
    onSuccess: async () => {
      await invalidate();
      toast.success(editId ? "Asset updated" : "Asset created");
      setDrawerOpen(false);
    },
    onError: (error) => toast.error(publicError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: softDeleteAsset,
    onSuccess: async () => { await invalidate(); toast.success("Asset moved to deleted assets"); },
    onError: (error) => toast.error(publicError(error)),
  });
  const restoreMutation = useMutation({
    mutationFn: restoreAsset,
    onSuccess: async () => { await invalidate(); toast.success("Asset restored"); },
    onError: (error) => toast.error(publicError(error)),
  });
  const bulkStatusMutation = useMutation({
    mutationFn: (status: CmdbAsset["status"]) => setAssetStatuses([...selected], status),
    onSuccess: async () => { await invalidate(); toast.success("Asset status updated"); setSelected(new Set()); },
    onError: (error) => toast.error(publicError(error)),
  });
  const importMutation = useMutation({
    mutationFn: importAssets,
    onSuccess: async (count) => { await invalidate(); toast.success(`Imported ${count} asset${count === 1 ? "" : "s"}`); },
    onError: (error) => toast.error(publicError(error)),
  });

  const liveAssets = assets.filter((asset) => !asset.deletedAt);
  const owners = useMemo(() => [...new Set(liveAssets.map((a) => a.owner).filter(Boolean))].sort(), [liveAssets]);
  const locations = useMemo(() => [...new Set(liveAssets.map((a) => a.location).filter(Boolean))].sort(), [liveAssets]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (showDeleted ? !asset.deletedAt : asset.deletedAt) return false;
      if (filterType !== "all" && asset.assetType !== filterType) return false;
      if (filterStatus !== "all" && asset.status !== filterStatus) return false;
      if (filterEnv !== "all" && asset.environment !== filterEnv) return false;
      if (filterOwner !== "all" && asset.owner !== filterOwner) return false;
      if (filterLocation !== "all" && asset.location !== filterLocation) return false;
      if (!q) return true;
      return [asset.hostname, asset.displayName, asset.ipAddress, asset.role, asset.owner,
        asset.assetTag, asset.serialNumber].some((value) => value.toLowerCase().includes(q));
    }).sort((a, b) => String(a[sortBy as keyof CmdbAsset] ?? "").localeCompare(String(b[sortBy as keyof CmdbAsset] ?? "")));
  }, [assets, filterEnv, filterLocation, filterOwner, filterStatus, filterType, query, showDeleted, sortBy]);

  const openCreate = () => {
    setEditId(null);
    setForm(blankAsset(assetTypes[0]?.id));
    setDrawerOpen(true);
  };
  const openEdit = (asset: CmdbAsset) => {
    setEditId(asset.id);
    setForm(assetToInput(asset));
    setDrawerOpen(true);
  };
  const submit = () => {
    if (!form.hostname.trim()) return toast.error("Hostname is required");
    if (!form.assetTypeId) return toast.error("Asset type is required");
    saveMutation.mutate();
  };
  const importRows = (rows: Record<string, string>[]) => {
    const byKey = new Map(assetTypes.map((type) => [type.key, type.id]));
    const parsed = rows.filter((row) => row.hostname?.trim()).map((row) => ({
      ...blankAsset(byKey.get(row.assetType || "server") ?? ""),
      hostname: row.hostname.trim(), displayName: row.displayName || row.hostname.trim(),
      ipAddress: row.ipAddress || "", os: row.os || "", role: row.role || "",
      environment: (["production", "staging", "development"].includes(row.environment)
        ? row.environment : "production") as CmdbAssetInput["environment"],
      location: row.location || "", owner: row.owner || "", vendor: row.vendor || "",
      model: row.model || "", serialNumber: row.serialNumber || "", assetTag: row.assetTag || "",
      macAddress: row.macAddress || "",
      status: (["active", "maintenance", "retired"].includes(row.status)
        ? row.status : "active") as CmdbAssetInput["status"],
    }));
    if (parsed.some((asset) => !asset.assetTypeId)) return toast.error("Import contains an unknown assetType value");
    importMutation.mutate(parsed);
  };
  const exportCSV = () => {
    const rows = (selected.size ? filtered.filter((a) => selected.has(a.id)) : filtered).map((asset) => {
      const row: Record<string, string> = {};
      for (const col of CSV_COLS) row[col] = String(asset[col as keyof CmdbAsset] ?? "");
      return row;
    });
    downloadCSV(`cmdb-assets-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows, CSV_COLS));
    toast.success(`Exported ${rows.length} asset${rows.length === 1 ? "" : "s"}`);
  };
  const toggleSel = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleDeleted = () => { setShowDeleted((value) => !value); setSelected(new Set()); setDetailsId(null); };

  const columns: Column<CmdbAsset>[] = [
    ...(!showDeleted ? [{
      key: "select", header: "", className: "w-8",
      render: (asset: CmdbAsset) => <Checkbox checked={selected.has(asset.id)} onCheckedChange={() => toggleSel(asset.id)} onClick={(event) => event.stopPropagation()} />,
    }] : []),
    { key: "hostname", header: "Hostname", render: (asset) => <span className="font-mono text-foreground">{asset.hostname}</span> },
    { key: "displayName", header: "Display Name", render: (asset) => <span className="text-muted-foreground">{asset.displayName}</span> },
    { key: "assetType", header: "Type", render: (asset) => <StatusBadge tone="info" label={asset.assetType} /> },
    { key: "ipAddress", header: "IP", render: (asset) => <span className="font-mono text-xs">{asset.ipAddress || "—"}</span> },
    { key: "environment", header: "Env", render: (asset) => <StatusBadge tone="muted" label={asset.environment} /> },
    { key: "owner", header: "Owner", render: (asset) => <span className="text-xs">{asset.owner || "—"}</span> },
    { key: "status", header: "Status", render: (asset) => <StatusBadge tone={statusTone(asset.status)} label={asset.status} /> },
    { key: "actions", header: "", className: "w-12", render: (asset) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={(event) => event.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          {!asset.deletedAt && <DropdownMenuItem onClick={() => setDetailsId(asset.id)}>View details</DropdownMenuItem>}
          {writable && !asset.deletedAt && <DropdownMenuItem onClick={() => openEdit(asset)}><Edit className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>}
          {writable && !asset.deletedAt && <DropdownMenuSeparator />}
          {writable && !asset.deletedAt && <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(asset.id)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>}
          {writable && asset.deletedAt && <DropdownMenuItem onClick={() => restoreMutation.mutate(asset.id)}><RotateCcw className="mr-2 h-3.5 w-3.5" /> Restore</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    ) },
  ];

  const loadError = assetsQuery.isError || typesQuery.isError;
  if (loadError) return <EmptyState icon={AlertCircle} title="CMDB unavailable" description="The shared CMDB could not be loaded." actionLabel="Retry" onAction={() => { void assetsQuery.refetch(); void typesQuery.refetch(); }} />;

  return <div>
    <PageHeader title="CMDB" description="Track shared assets, ownership and lifecycle status." actions={<div className="flex items-center gap-2">
      {writable && <Button variant="outline" size="sm" onClick={toggleDeleted}><Archive className="mr-1.5 h-4 w-4" /> {showDeleted ? "Live assets" : "Deleted assets"}</Button>}
      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!writable || showDeleted}><Upload className="mr-1.5 h-4 w-4" /> Import</Button>
      <Button variant="outline" size="sm" onClick={exportCSV} disabled={assetsQuery.isLoading}><Download className="mr-1.5 h-4 w-4" /> Export</Button>
      <Button onClick={openCreate} disabled={!writable || showDeleted || assetTypes.length === 0}><Plus className="mr-1.5 h-4 w-4" /> Add asset</Button>
    </div>} />

    {!showDeleted && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard icon={Server} label="Total assets" value={liveAssets.length} accent="primary" />
      <MetricCard icon={Activity} label="Active" value={liveAssets.filter((a) => a.status === "active").length} accent="success" />
      <MetricCard icon={Wrench} label="In maintenance" value={liveAssets.filter((a) => a.status === "maintenance").length} accent="warning" />
      <MetricCard icon={Archive} label="Retired" value={liveAssets.filter((a) => a.status === "retired").length} accent="muted" />
    </div>}

    <div className="mt-6 glass-card rounded-2xl p-4"><div className="flex flex-wrap items-center gap-2">
      <SearchInput value={query} onChange={setQuery} placeholder="Search hostname, IP, tag, serial, role, owner..." className="w-full sm:w-80" />
      <FilterSelect value={filterType} onChange={setFilterType} options={[["all", "All types"], ...assetTypes.map((type) => [type.key, type.name] as [string, string])]} />
      <FilterSelect value={filterStatus} onChange={setFilterStatus} options={[["all", "All status"], ["active", "Active"], ["maintenance", "Maintenance"], ["retired", "Retired"]]} />
      <FilterSelect value={filterEnv} onChange={setFilterEnv} options={[["all", "All env"], ["production", "Production"], ["staging", "Staging"], ["development", "Development"]]} />
      <FilterSelect value={filterOwner} onChange={setFilterOwner} options={[["all", "All owners"], ...owners.map((value) => [value, value] as [string, string])]} />
      <FilterSelect value={filterLocation} onChange={setFilterLocation} options={[["all", "All locations"], ...locations.map((value) => [value, value] as [string, string])]} />
      <FilterSelect value={sortBy} onChange={setSortBy} options={[["hostname", "Sort: Hostname"], ["assetType", "Sort: Type"], ["status", "Sort: Status"], ["environment", "Sort: Env"], ["owner", "Sort: Owner"]]} />
    </div></div>

    {selected.size > 0 && writable && <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2.5">
      <span className="text-sm font-medium">{selected.size} selected</span>
      <Button size="sm" variant="ghost" onClick={() => bulkStatusMutation.mutate("maintenance")}><Wrench className="mr-1 h-3.5 w-3.5" /> Maintenance</Button>
      <Button size="sm" variant="ghost" onClick={() => bulkStatusMutation.mutate("retired")}><Archive className="mr-1 h-3.5 w-3.5" /> Retire</Button>
      <Button size="sm" variant="ghost" onClick={exportCSV}><Download className="mr-1 h-3.5 w-3.5" /> Export selection</Button>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
    </div>}

    <div className="mt-4"><DataTable
      data={filtered} columns={columns} pageSize={20} onRowClick={(asset) => !asset.deletedAt && setDetailsId(asset.id)}
      emptyState={<EmptyState icon={Server} title={assetsQuery.isLoading ? "Loading CMDB" : showDeleted ? "No deleted assets" : "No matching assets"} description={assetsQuery.isLoading ? "Loading shared asset data." : "No assets match the current view."} />}
    /></div>

    <FormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={editId ? "Edit Asset" : "Add CMDB Asset"} description="Changes are saved to the shared CMDB." onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hostname"><Input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} /></Field>
        <Field label="Display name"><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
        <Field label="Asset type"><Select value={form.assetTypeId} onValueChange={(assetTypeId) => setForm({ ...form, assetTypeId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{assetTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Status"><Select value={form.status} onValueChange={(status: CmdbAsset["status"]) => setForm({ ...form, status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["active", "maintenance", "retired"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="IP address"><Input value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} /></Field>
        <Field label="MAC address"><Input value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} /></Field>
        <Field label="Operating system"><Input value={form.os} onChange={(e) => setForm({ ...form, os: e.target.value })} /></Field>
        <Field label="Role"><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>
        <Field label="Environment"><Select value={form.environment} onValueChange={(environment: CmdbAsset["environment"]) => setForm({ ...form, environment })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["production", "staging", "development"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
        <Field label="Owner"><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
        <Field label="Vendor"><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></Field>
        <Field label="Model"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
        <Field label="Serial number"><Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></Field>
        <Field label="Asset tag"><Input value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} /></Field>
        <Field label="Warranty expiration"><Input type="date" value={form.warrantyExpiration?.slice(0, 10) ?? ""} onChange={(e) => setForm({ ...form, warrantyExpiration: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
    </FormDrawer>

    <ImportPreviewDialog open={importOpen} onOpenChange={setImportOpen} title="Import CMDB Assets" description="Imports are validated and committed atomically, with a maximum of 500 rows." expectedHeaders={CSV_COLS} onImport={importRows} />
    <AssetDetailsDrawer asset={assets.find((asset) => asset.id === detailsId) ?? null} onOpenChange={(open) => !open && setDetailsId(null)} onEdit={(asset) => { setDetailsId(null); openEdit(asset); }} onStatusChange={(id, status) => updateAsset(id, { status }).then(invalidate)} onDelete={(id) => deleteMutation.mutateAsync(id).then(() => setDetailsId(null))} />
    <ConfirmDialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)} title="Delete asset?" description="The asset will be soft-deleted and can be restored by a CMDB manager." destructive confirmLabel="Delete" onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete); setConfirmDelete(null); }} />
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5 col-span-2 md:col-span-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="h-9 w-[160px] rounded-xl border-border/60 bg-card/60"><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>;
}
