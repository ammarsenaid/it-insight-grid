import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Download, Edit, Layers, Lock, MoreHorizontal,
  Network, Plus, RotateCcw, Trash2, Unlock, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { SubnetDetailsDrawer } from "@/components/ipam/SubnetDetailsDrawer";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { FormDrawer } from "@/components/common/FormDrawer";
import { FormGrid, FormField, FormSection } from "@/components/common/FormGrid";
import { ImportPreviewDialog } from "@/components/common/ImportPreviewDialog";
import { MetricCard } from "@/components/common/MetricCard";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { StatusBadge, statusTone } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cmdbAssetsQuery } from "@/lib/cmdb/queries";
import { downloadCSV, toCSV } from "@/lib/csv";
import {
  importIpamAddresses, reserveNextIpamAddress, restoreIpamAddress,
  saveIpamAddress, setIpamAllocation, softDeleteIpamAddress,
} from "@/lib/ipam/addresses";
import { ipamAddressesQuery, ipamKeys, ipamNetworksQuery, ipamSubnetsQuery } from "@/lib/ipam/queries";
import type { IpamAddress, IpamAddressInput } from "@/lib/ipam/types";
import { can, useRole } from "@/lib/permissions";

export const Route = createFileRoute("/ipam")({
  head: () => ({ meta: [
    { title: "IPAM · IT Knowledge Center" },
    { name: "description", content: "Shared IP address, subnet, network, and reservation management." },
  ] }),
  component: IPAMPage,
});

const CSV_COLS = [
  "ipAddress", "hostname", "type", "networkName", "networkCidr", "subnet",
  "gateway", "vlan", "location", "allocationState", "linkedAssetId",
  "reservationName", "reservationExpiresAt", "reservationNotes", "notes",
];

function blankAddress(): IpamAddressInput {
  return {
    networkName: "Default network", networkCidr: "192.168.0.0/16",
    subnet: "192.168.0.0/24", gateway: "192.168.0.1", vlan: "", location: "",
    ipAddress: "", hostname: "", type: "static", allocationState: "free",
    linkedAssetId: null, reservationName: "", reservationExpiresAt: null,
    reservationNotes: "", notes: "",
  };
}

function toInput(address: IpamAddress): IpamAddressInput {
  return {
    networkName: address.networkName, networkCidr: address.networkCidr,
    subnet: address.subnet, gateway: address.gateway, vlan: address.vlan,
    location: address.location, ipAddress: address.ipAddress, hostname: address.hostname,
    type: address.type, allocationState: address.allocationState,
    linkedAssetId: address.linkedAssetId, reservationName: address.reservationName,
    reservationExpiresAt: address.reservationExpiresAt,
    reservationNotes: address.reservationNotes, notes: address.notes,
  };
}

function publicError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "23505") return "That IP address, subnet, network, or asset allocation already exists.";
  if (["22P02", "22023", "23514"].includes(code)) return "The address, subnet, network, gateway, or reservation is invalid.";
  if (code === "42501") return "You do not have permission to manage IPAM for this organization.";
  return "The IPAM operation failed. Try again or contact an administrator.";
}

function IPAMPage() {
  const role = useRole();
  const writable = can("ipam.manage", role);
  const readable = can("ipam.view", role);
  const qc = useQueryClient();
  const [showDeleted, setShowDeleted] = useState(false);
  const addressesQuery = useQuery({ ...ipamAddressesQuery(showDeleted), enabled: readable });
  const networksQuery = useQuery({ ...ipamNetworksQuery(showDeleted), enabled: readable });
  const subnetsQuery = useQuery({ ...ipamSubnetsQuery(showDeleted), enabled: readable });
  const assetsQuery = useQuery({ ...cmdbAssetsQuery(false), enabled: readable });
  const addresses = useMemo(() => addressesQuery.data ?? [], [addressesQuery.data]);
  const networks = networksQuery.data ?? [];
  const subnets = subnetsQuery.data ?? [];
  const assets = assetsQuery.data ?? [];

  const [query, setQuery] = useState("");
  const [filterSubnet, setFilterSubnet] = useState("all");
  const [filterState, setFilterState] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterVlan, setFilterVlan] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<IpamAddressInput>(blankAddress());
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [subnetOpen, setSubnetOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const invalidate = async () => { await qc.invalidateQueries({ queryKey: ipamKeys.all }); };
  const saveMutation = useMutation({
    mutationFn: () => saveIpamAddress(editId, form),
    onSuccess: async () => { await invalidate(); toast.success(editId ? "IP address updated" : "IP address created"); setDrawerOpen(false); },
    onError: (error) => toast.error(publicError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: softDeleteIpamAddress,
    onSuccess: async () => { await invalidate(); toast.success("IP address moved to deleted addresses"); },
    onError: (error) => toast.error(publicError(error)),
  });
  const restoreMutation = useMutation({
    mutationFn: restoreIpamAddress,
    onSuccess: async () => { await invalidate(); toast.success("IP address restored as free"); },
    onError: (error) => toast.error(publicError(error)),
  });
  const allocationMutation = useMutation({
    mutationFn: ({ ids, state }: { ids: string[]; state: "free" | "reserved" }) => setIpamAllocation(ids, state),
    onSuccess: async () => { await invalidate(); setSelected(new Set()); toast.success("Allocation state updated"); },
    onError: (error) => toast.error(publicError(error)),
  });
  const importMutation = useMutation({
    mutationFn: importIpamAddresses,
    onSuccess: async () => { await invalidate(); },
    onError: (error) => toast.error(publicError(error)),
  });
  const reserveNextMutation = useMutation({
    mutationFn: reserveNextIpamAddress,
    onSuccess: async (address) => { await invalidate(); toast.success(`Reserved ${address}`); },
    onError: (error) => toast.error(publicError(error)),
  });

  const liveAddresses = addresses.filter((address) => !address.deletedAt);
  const conflicts = liveAddresses.filter((address) => address.conflictReason);
  const vlanValues = [...new Set(subnets.map((subnet) => subnet.vlan).filter(Boolean))].sort();
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return addresses.filter((address) => {
      if (showDeleted ? !address.deletedAt : address.deletedAt) return false;
      if (filterSubnet !== "all" && address.subnetId !== filterSubnet) return false;
      if (filterState !== "all" && address.allocationState !== filterState) return false;
      if (filterType !== "all" && address.type !== filterType) return false;
      if (filterVlan !== "all" && address.vlan !== filterVlan) return false;
      if (!needle) return true;
      return [address.ipAddress, address.hostname, address.subnet, address.networkName,
        address.vlan, address.linkedAssetHostname, address.reservationName]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [addresses, filterState, filterSubnet, filterType, filterVlan, query, showDeleted]);

  const openCreate = () => { setEditId(null); setForm(blankAddress()); setDrawerOpen(true); };
  const openEdit = (address: IpamAddress) => { setEditId(address.id); setForm(toInput(address)); setDrawerOpen(true); };
  const submit = () => {
    if (!form.ipAddress.trim()) return toast.error("IP address is required");
    if (!form.subnet.trim() || !form.networkCidr.trim()) return toast.error("Network and subnet CIDRs are required");
    saveMutation.mutate();
  };
  const toggleSelected = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const exportCSV = () => {
    const source = selected.size ? visible.filter((address) => selected.has(address.id)) : visible;
    const rows = source.map((address) => ({
      ipAddress: address.ipAddress, hostname: address.hostname, type: address.type,
      networkName: address.networkName, networkCidr: address.networkCidr, subnet: address.subnet,
      gateway: address.gateway, vlan: address.vlan, location: address.location,
      allocationState: address.allocationState, linkedAssetId: address.linkedAssetId,
      reservationName: address.reservationName,
      reservationExpiresAt: address.reservationExpiresAt,
      reservationNotes: address.reservationNotes, notes: address.notes,
    }));
    downloadCSV(`ipam-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows, CSV_COLS));
    toast.success(`Exported ${rows.length} address${rows.length === 1 ? "" : "es"}`);
  };
  const importRows = async (rows: Record<string, string>[]) => {
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    if (headers.length !== CSV_COLS.length || CSV_COLS.some((header, index) => headers[index] !== header)) {
      toast.error(`CSV headers must exactly match: ${CSV_COLS.join(", ")}`);
      return false;
    }
    const parsed = rows.map((row) => ({
      ...blankAddress(), ipAddress: row.ipAddress.trim(), hostname: row.hostname || "",
      type: (["static", "dhcp", "virtual"].includes(row.type) ? row.type : "static") as IpamAddressInput["type"],
      networkName: row.networkName || row.vlan || "Imported network",
      networkCidr: row.networkCidr || row.subnet, subnet: row.subnet,
      gateway: row.gateway || "", vlan: row.vlan || "", location: row.location || "",
      allocationState: (["free", "allocated", "reserved"].includes(row.allocationState || row.status)
        ? row.allocationState || row.status : "free") as IpamAddressInput["allocationState"],
      linkedAssetId: row.linkedAssetId || null,
      reservationName: row.reservationName || "",
      reservationExpiresAt: row.reservationExpiresAt || null,
      reservationNotes: row.reservationNotes || "", notes: row.notes || "",
    }));
    if (parsed.some((row) => !row.ipAddress)) {
      toast.error("Every imported row must include an IP address.");
      return false;
    }
    return importMutation.mutateAsync(parsed);
  };

  const columns: Column<IpamAddress>[] = [
    ...(!showDeleted ? [{ key: "select", header: "", className: "w-8", render: (address: IpamAddress) => <Checkbox checked={selected.has(address.id)} onCheckedChange={() => toggleSelected(address.id)} onClick={(event) => event.stopPropagation()} /> }] : []),
    { key: "ip", header: "IP Address", render: (address) => <span className="inline-flex items-center gap-1.5 font-mono font-medium">{address.ipAddress}{address.conflictReason && <AlertTriangle className="h-3 w-3 text-destructive" />}</span> },
    { key: "host", header: "Hostname", render: (address) => <span className="font-mono text-xs">{address.hostname || "—"}</span> },
    { key: "subnet", header: "Subnet", render: (address) => <button className="font-mono text-xs text-primary hover:underline" onClick={(event) => { event.stopPropagation(); setSubnetOpen(address.subnetId); }}>{address.subnet}</button> },
    { key: "type", header: "Type", render: (address) => <StatusBadge tone="info" label={address.type} /> },
    { key: "state", header: "Allocation", render: (address) => <StatusBadge tone={statusTone(address.allocationState)} label={address.allocationState} /> },
    { key: "asset", header: "Asset / Reservation", render: (address) => <span className="text-xs">{address.linkedAssetHostname || address.reservationName || "—"}</span> },
    { key: "actions", header: "", className: "w-12", render: (address) => <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={(event) => event.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {writable && !address.deletedAt && <DropdownMenuItem onClick={() => openEdit(address)}><Edit className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>}
        {writable && !address.deletedAt && address.allocationState !== "reserved" && <DropdownMenuItem onClick={() => allocationMutation.mutate({ ids: [address.id], state: "reserved" })}><Lock className="mr-2 h-3.5 w-3.5" /> Reserve</DropdownMenuItem>}
        {writable && !address.deletedAt && address.allocationState !== "free" && <DropdownMenuItem onClick={() => allocationMutation.mutate({ ids: [address.id], state: "free" })}><Unlock className="mr-2 h-3.5 w-3.5" /> Release</DropdownMenuItem>}
        {writable && !address.deletedAt && <DropdownMenuSeparator />}
        {writable && !address.deletedAt && <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(address.id)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>}
        {writable && address.deletedAt && <DropdownMenuItem onClick={() => restoreMutation.mutate(address.id)}><RotateCcw className="mr-2 h-3.5 w-3.5" /> Restore as free</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu> },
  ];

  if (addressesQuery.isError || networksQuery.isError || subnetsQuery.isError || assetsQuery.isError) {
    return <EmptyState icon={AlertTriangle} title="IPAM unavailable" description="The shared IPAM data could not be loaded." actionLabel="Retry" onAction={() => { void addressesQuery.refetch(); void networksQuery.refetch(); void subnetsQuery.refetch(); void assetsQuery.refetch(); }} />;
  }

  return <div>
    <PageHeader title="IPAM" description="Manage organization networks, subnets, addresses, and reservations." actions={<div className="flex items-center gap-2">
      {writable && <Button variant="outline" size="sm" onClick={() => { setShowDeleted((value) => !value); setSelected(new Set()); }}><RotateCcw className="mr-1.5 h-4 w-4" /> {showDeleted ? "Active addresses" : "Deleted addresses"}</Button>}
      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!writable || showDeleted}><Upload className="mr-1.5 h-4 w-4" /> Import</Button>
      <Button variant="outline" size="sm" onClick={exportCSV}><Download className="mr-1.5 h-4 w-4" /> Export</Button>
      <Button onClick={openCreate} disabled={!writable || showDeleted}><Plus className="mr-1.5 h-4 w-4" /> Add address</Button>
    </div>} />

    {!showDeleted && <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard icon={Network} label="Total addresses" value={liveAddresses.length} accent="primary" />
        <MetricCard icon={Network} label="Available" value={liveAddresses.filter((a) => a.allocationState === "free").length} accent="muted" />
        <MetricCard icon={CheckCircle2} label="Allocated" value={liveAddresses.filter((a) => a.allocationState === "allocated").length} accent="success" />
        <MetricCard icon={Lock} label="Reserved" value={liveAddresses.filter((a) => a.allocationState === "reserved").length} accent="warning" />
        <MetricCard icon={AlertTriangle} label="Conflicts" value={conflicts.length} accent={conflicts.length ? "danger" : "success"} />
      </div>
      <div className="mt-2 px-1 text-[11px] text-muted-foreground"><Layers className="mr-1 inline h-3 w-3" /> {networks.length} network{networks.length === 1 ? "" : "s"} · {subnets.length} subnet{subnets.length === 1 ? "" : "s"}</div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">{subnets.map((subnet) => {
        const entries = liveAddresses.filter((address) => address.subnetId === subnet.id);
        const allocated = entries.filter((address) => address.allocationState === "allocated").length;
        const utilization = entries.length ? Math.round((allocated / entries.length) * 100) : 0;
        return <button key={subnet.id} onClick={() => setSubnetOpen(subnet.id)} className="glass-card rounded-2xl p-4 text-left transition hover:border-primary/40">
          <div className="flex items-start justify-between"><div><div className="font-mono text-sm font-semibold">{subnet.cidr}</div><div className="mt-0.5 text-xs text-muted-foreground">{subnet.networkName} · {subnet.vlan || "No VLAN"}</div></div><div className="text-xs text-muted-foreground">{allocated} allocated · {entries.length - allocated} available/reserved</div></div>
          <Progress value={utilization} className="mt-3 h-1.5" />
        </button>;
      })}</div>
    </>}

    <div className="mt-6 glass-card rounded-2xl p-4"><div className="flex flex-wrap items-center gap-2">
      <SearchInput value={query} onChange={setQuery} placeholder="Search IP, hostname, network, subnet, VLAN, asset..." className="w-full sm:w-80" />
      <Filter value={filterSubnet} onChange={setFilterSubnet} options={[["all", "All subnets"], ...subnets.map((subnet) => [subnet.id, subnet.cidr] as [string, string])]} />
      <Filter value={filterVlan} onChange={setFilterVlan} options={[["all", "All VLANs"], ...vlanValues.map((vlan) => [vlan, vlan] as [string, string])]} />
      <Filter value={filterState} onChange={setFilterState} options={[["all", "All allocation"], ["free", "Free"], ["allocated", "Allocated"], ["reserved", "Reserved"]]} />
      <Filter value={filterType} onChange={setFilterType} options={[["all", "All types"], ["static", "Static"], ["dhcp", "DHCP"], ["virtual", "Virtual"]]} />
    </div></div>

    {selected.size > 0 && writable && <div className="mt-4 flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2.5">
      <span className="text-sm font-medium">{selected.size} selected</span>
      <Button size="sm" variant="ghost" onClick={() => allocationMutation.mutate({ ids: [...selected], state: "reserved" })}><Lock className="mr-1 h-3.5 w-3.5" /> Reserve</Button>
      <Button size="sm" variant="ghost" onClick={() => allocationMutation.mutate({ ids: [...selected], state: "free" })}><Unlock className="mr-1 h-3.5 w-3.5" /> Release</Button>
      <Button size="sm" variant="ghost" onClick={exportCSV}><Download className="mr-1 h-3.5 w-3.5" /> Export</Button>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
    </div>}

    <div className="mt-4"><DataTable data={visible} columns={columns} pageSize={20} emptyState={(() => {
      const filtersActive = query.trim().length > 0 || filterSubnet !== "all" || filterVlan !== "all" || filterState !== "all" || filterType !== "all";
      if (addressesQuery.isLoading) return <EmptyState icon={Network} title="Loading IPAM" description="Loading shared address data." />;
      if (showDeleted) return <EmptyState icon={Network} title="Recycle bin is empty" description="Deleted addresses will appear here for 30 days before being purged." />;
      if (filtersActive) return <EmptyState icon={Network} title="No results found" description="No addresses match the current filters or search." actionLabel="Reset filters" onAction={() => { setQuery(""); setFilterSubnet("all"); setFilterVlan("all"); setFilterState("all"); setFilterType("all"); }} secondaryActionLabel="Clear search" onSecondaryAction={() => setQuery("")} />;
      return <EmptyState icon={Network} title="No IP addresses yet" description="Start by adding your first network, then create subnets and addresses to track allocations and reservations." actionLabel={writable ? "Add address" : undefined} onAction={writable ? openCreate : undefined} secondaryActionLabel={writable ? "Import CSV" : undefined} onSecondaryAction={writable ? () => setImportOpen(true) : undefined} hint="Networks group subnets · subnets group addresses · reservations hold an address for future use." />;
    })()} /></div>

    <FormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={editId ? "Edit IP address" : "Add IP address"} description="Network, subnet, allocation, and reservation changes are validated by the shared backend." onSubmit={submit} size="lg">
      <div className="space-y-6">
        <FormSection title="Network" description="The parent network this address belongs to.">
          <FormGrid>
            <FormField label="Network name" required><Input value={form.networkName} onChange={(event) => setForm({ ...form, networkName: event.target.value })} /></FormField>
            <FormField label="Network CIDR" required><Input value={form.networkCidr} onChange={(event) => setForm({ ...form, networkCidr: event.target.value })} placeholder="10.0.0.0/16" /></FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Subnet" description="Subnet, gateway and VLAN.">
          <FormGrid>
            <FormField label="Subnet CIDR" required><Input value={form.subnet} onChange={(event) => setForm({ ...form, subnet: event.target.value })} placeholder="10.0.1.0/24" /></FormField>
            <FormField label="Gateway"><Input value={form.gateway} onChange={(event) => setForm({ ...form, gateway: event.target.value })} /></FormField>
            <FormField label="VLAN"><Input value={form.vlan} onChange={(event) => setForm({ ...form, vlan: event.target.value })} /></FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Address" description="The address itself.">
          <FormGrid>
            <FormField label="IP address" required><Input value={form.ipAddress} onChange={(event) => setForm({ ...form, ipAddress: event.target.value })} /></FormField>
            <FormField label="Hostname"><Input value={form.hostname} onChange={(event) => setForm({ ...form, hostname: event.target.value })} /></FormField>
            <FormField label="Address type"><Select value={form.type} onValueChange={(type: IpamAddressInput["type"]) => setForm({ ...form, type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["static", "dhcp", "virtual"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Allocation" description="Who or what this address is allocated to.">
          <FormGrid>
            <FormField label="Allocation state"><Select value={form.allocationState} onValueChange={(allocationState: IpamAddressInput["allocationState"]) => setForm({ ...form, allocationState, linkedAssetId: allocationState === "allocated" ? form.linkedAssetId : null })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["free", "allocated", "reserved"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></FormField>
            {form.allocationState === "allocated" && (
              <FormField label="Linked CMDB asset"><Select value={form.linkedAssetId ?? "none"} onValueChange={(linkedAssetId) => setForm({ ...form, linkedAssetId: linkedAssetId === "none" ? null : linkedAssetId })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Select asset</SelectItem>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.hostname}</SelectItem>)}</SelectContent></Select></FormField>
            )}
            {form.allocationState === "reserved" && (
              <>
                <FormField label="Reservation name"><Input value={form.reservationName ?? ""} onChange={(event) => setForm({ ...form, reservationName: event.target.value })} /></FormField>
                <FormField label="Reservation expiry"><Input type="datetime-local" value={form.reservationExpiresAt?.slice(0, 16) ?? ""} onChange={(event) => setForm({ ...form, reservationExpiresAt: event.target.value || null })} /></FormField>
                <FormField label="Reservation notes" full><Input value={form.reservationNotes ?? ""} onChange={(event) => setForm({ ...form, reservationNotes: event.target.value })} /></FormField>
              </>
            )}
          </FormGrid>
        </FormSection>

        <FormSection title="Location" description="Physical or logical placement.">
          <FormGrid columns={1}>
            <FormField label="Location"><Input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></FormField>
          </FormGrid>
        </FormSection>

        <FormSection title="Notes">
          <FormGrid columns={1}>
            <FormField label="Operator notes"><Textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></FormField>
          </FormGrid>
        </FormSection>
      </div>
    </FormDrawer>


    <ImportPreviewDialog open={importOpen} onOpenChange={setImportOpen} title="Import IPAM addresses" description="The complete import is validated and committed atomically, with a maximum of 500 rows." expectedHeaders={CSV_COLS} onImport={importRows} />
    <SubnetDetailsDrawer subnet={subnets.find((subnet) => subnet.id === subnetOpen) ?? null} entries={liveAddresses.filter((address) => address.subnetId === subnetOpen)} onOpenChange={(open) => !open && setSubnetOpen(null)} onReserveNext={(subnetId) => reserveNextMutation.mutateAsync(subnetId)} />
    <ConfirmDialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)} title="Delete IP address?" description="The address will be soft-deleted and can be restored by an IPAM manager." destructive confirmLabel="Delete" onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete); setConfirmDelete(null); }} />
  </div>;
}



function Filter({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="h-9 w-[170px] rounded-xl border-border/60 bg-card/60"><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>;
}
