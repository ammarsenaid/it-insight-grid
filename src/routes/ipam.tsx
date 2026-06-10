import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  Network,
  MoreHorizontal,
  Edit,
  Trash2,
  CheckCircle2,
  Download,
  Upload,
  AlertTriangle,
  Ticket as TicketIcon,
  Link2,
  Lock,
  Unlock,
  Layers,
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
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setState, logActivity, trashItem, uid, useData } from "@/lib/data/store";
import { createTicket } from "@/lib/data/tickets";
import type { IPAMEntry } from "@/lib/data/types";
import { toast } from "sonner";
import { downloadCSV, toCSV } from "@/lib/csv";
import { ImportPreviewDialog } from "@/components/common/ImportPreviewDialog";
import { SubnetDetailsDrawer } from "@/components/ipam/SubnetDetailsDrawer";
import { can, useRole } from "@/lib/permissions";

export const Route = createFileRoute("/ipam")({
  head: () => ({
    meta: [
      { title: "IPAM · IT Knowledge Center" },
      { name: "description", content: "IP address management for subnets, VLANs, and linked assets." },
    ],
  }),
  component: IPAMPage,
});

const emptyIP = (): Omit<IPAMEntry, "id" | "createdAt" | "updatedAt"> => ({
  ipAddress: "",
  hostname: "",
  type: "static",
  subnet: "192.168.0.0/24",
  gateway: "192.168.0.1",
  vlan: "VLAN 10 - Servers",
  location: "DC1",
  status: "used",
  linkedAssetId: undefined,
  notes: "",
});

const CSV_COLS = ["ipAddress","hostname","type","subnet","gateway","vlan","location","status"];

function IPAMPage() {
  const data = useData();
  const role = useRole();
  const writable = can("ipam.write", role);

  const [query, setQuery] = useState("");
  const [filterSubnet, setFilterSubnet] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterVlan, setFilterVlan] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(emptyIP());
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [subnetOpen, setSubnetOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [validationError, setValidationError] = useState<string | null>(null);

  const subnets = useMemo(() => {
    const map = new Map<string, { gateway: string; vlan: string; location: string; used: number; free: number; reserved: number }>();
    data.ipam.forEach((i) => {
      const entry = map.get(i.subnet) ?? { gateway: i.gateway, vlan: i.vlan, location: i.location, used: 0, free: 0, reserved: 0 };
      if (i.status === "used") entry.used++;
      else if (i.status === "free") entry.free++;
      else entry.reserved++;
      map.set(i.subnet, entry);
    });
    return Array.from(map.entries()).map(([subnet, v]) => ({ subnet, ...v }));
  }, [data.ipam]);

  const vlanGroups = useMemo(() => {
    const map = new Map<string, { count: number; subnets: Set<string> }>();
    data.ipam.forEach((i) => {
      const cur = map.get(i.vlan) ?? { count: 0, subnets: new Set<string>() };
      cur.count++;
      cur.subnets.add(i.subnet);
      map.set(i.vlan, cur);
    });
    return Array.from(map.entries()).map(([vlan, v]) => ({ vlan, count: v.count, subnetCount: v.subnets.size }));
  }, [data.ipam]);

  // duplicate IP detection
  const duplicates = useMemo(() => {
    const map = new Map<string, IPAMEntry[]>();
    data.ipam.forEach((i) => {
      const arr = map.get(i.ipAddress) ?? [];
      arr.push(i);
      map.set(i.ipAddress, arr);
    });
    return new Set(Array.from(map.entries()).filter(([, l]) => l.length > 1).map(([ip]) => ip));
  }, [data.ipam]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return data.ipam.filter((i) => {
      if (filterSubnet !== "all" && i.subnet !== filterSubnet) return false;
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      if (filterType !== "all" && i.type !== filterType) return false;
      if (filterVlan !== "all" && i.vlan !== filterVlan) return false;
      if (!q) return true;
      return i.ipAddress.includes(q) || i.hostname.toLowerCase().includes(q) || i.vlan.toLowerCase().includes(q);
    });
  }, [data.ipam, query, filterSubnet, filterStatus, filterType, filterVlan]);

  const used = data.ipam.filter((i) => i.status === "used").length;
  const free = data.ipam.filter((i) => i.status === "free").length;
  const reserved = data.ipam.filter((i) => i.status === "reserved").length;
  const vlans = new Set(data.ipam.map((i) => i.vlan)).size;
  const linkedAssets = data.ipam.filter((i) => i.linkedAssetId).length;

  const openCreate = () => { setEditId(null); setForm(emptyIP()); setValidationError(null); setDrawerOpen(true); };
  const openEdit = (i: IPAMEntry) => { setEditId(i.id); setForm({ ...i }); setValidationError(null); setDrawerOpen(true); };

  const validateIP = (ip: string, ignoreId?: string | null): string | null => {
    if (!ip.trim()) return "IP address is required";
    const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return "Invalid IPv4 format (expected x.x.x.x)";
    if (m.slice(1).some((p) => parseInt(p, 10) > 255)) return "Each octet must be 0–255";
    const dup = data.ipam.find((i) => i.ipAddress === ip && i.id !== ignoreId);
    if (dup) return `Duplicate: ${ip} is already used by ${dup.hostname || "another record"}`;
    return null;
  };

  const save = () => {
    const err = validateIP(form.ipAddress, editId);
    if (err) { setValidationError(err); toast.error(err); return; }
    setState((s) => {
      if (editId) {
        return { ...s, ipam: s.ipam.map((i) => i.id === editId ? { ...i, ...form, updatedAt: new Date().toISOString() } : i) };
      }
      const next: IPAMEntry = { id: uid("ip"), ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      return { ...s, ipam: [next, ...s.ipam] };
    });
    logActivity(editId ? "ipam.edit" : "ipam.create", `${editId ? "Updated" : "Added"} IP record ${form.ipAddress} in ${form.subnet}`);
    toast.success(editId ? "IP record updated" : "IP record created");
    setDrawerOpen(false);
  };

  const remove = (id: string) => {
    const ip = data.ipam.find((i) => i.id === id);
    if (!ip) return;
    trashItem("ipam", ip.ipAddress, "IPAM", ip, 200);
    setState((s) => ({ ...s, ipam: s.ipam.filter((i) => i.id !== id) }));
    logActivity("ipam.delete", `Deleted IP record ${ip.ipAddress}`);
    toast.success("Moved to recycle bin");
    setSelected((p) => { const n = new Set(p); n.delete(id); return n; });
  };

  const setIPStatus = (id: string, status: IPAMEntry["status"]) => {
    setState((s) => ({
      ...s,
      ipam: s.ipam.map((i) => i.id === id ? { ...i, status, updatedAt: new Date().toISOString() } : i),
    }));
    const target = data.ipam.find((i) => i.id === id);
    logActivity("ipam.status", `Set ${target?.ipAddress} to ${status}`, "ipam", id);
    toast.success(`Marked ${target?.ipAddress} as ${status}`);
  };

  const linkAsset = (id: string, assetId: string) => {
    setState((s) => ({
      ...s,
      ipam: s.ipam.map((i) => i.id === id ? { ...i, linkedAssetId: assetId === "none" ? undefined : assetId, updatedAt: new Date().toISOString() } : i),
    }));
    toast.success(assetId === "none" ? "Unlinked asset" : "Asset linked");
  };

  const exportCSV = () => {
    const rows = (selected.size > 0 ? filtered.filter((i) => selected.has(i.id)) : filtered).map((i) => {
      const obj: Record<string, string> = {};
      CSV_COLS.forEach((c) => { obj[c] = String((i as unknown as Record<string, unknown>)[c] ?? ""); });
      return obj;
    });
    downloadCSV(`ipam-${new Date().toISOString().slice(0,10)}.csv`, toCSV(rows, CSV_COLS));
    toast.success(`Exported ${rows.length} record(s)`);
  };

  const importRows = (rows: Record<string, string>[]) => {
    const now = new Date().toISOString();
    const existing = new Set(data.ipam.map((i) => i.ipAddress));
    let skipped = 0;
    const next: IPAMEntry[] = [];
    rows.forEach((r) => {
      if (!r.ipAddress || existing.has(r.ipAddress)) { skipped++; return; }
      existing.add(r.ipAddress);
      next.push({
        id: uid("ip"),
        ipAddress: r.ipAddress,
        hostname: r.hostname || "",
        type: (r.type as IPAMEntry["type"]) || "static",
        subnet: r.subnet || "192.168.0.0/24",
        gateway: r.gateway || "",
        vlan: r.vlan || "",
        location: r.location || "",
        status: (r.status as IPAMEntry["status"]) || "used",
        notes: "",
        createdAt: now,
        updatedAt: now,
      });
    });
    setState((s) => ({ ...s, ipam: [...next, ...s.ipam] }));
    logActivity("ipam.import", `Imported ${next.length} IP records (${skipped} skipped as duplicates)`);
    if (skipped > 0) toast.warning(`${skipped} duplicate IP(s) skipped`);
  };

  const toggleSel = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((p) => p.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.id)));
  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  const bulkRelease = () => {
    setState((s) => ({
      ...s,
      ipam: s.ipam.map((i) => selected.has(i.id) ? { ...i, status: "free", linkedAssetId: undefined, updatedAt: new Date().toISOString() } : i),
    }));
    logActivity("ipam.bulk", `Released ${selected.size} IPs`);
    toast.success(`${selected.size} IP(s) released`);
    setSelected(new Set());
  };

  const bulkReserve = () => {
    setState((s) => ({
      ...s,
      ipam: s.ipam.map((i) => selected.has(i.id) ? { ...i, status: "reserved", updatedAt: new Date().toISOString() } : i),
    }));
    logActivity("ipam.bulk", `Reserved ${selected.size} IPs`);
    toast.success(`${selected.size} IP(s) reserved`);
    setSelected(new Set());
  };

  const columns: Column<IPAMEntry>[] = [
    {
      key: "select", header: "", className: "w-8",
      render: (i) => (
        <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggleSel(i.id)} onClick={(e) => e.stopPropagation()} />
      ),
    },
    {
      key: "ip", header: "IP Address",
      render: (i) => (
        <span className="inline-flex items-center gap-1.5 font-mono font-medium text-foreground">
          {i.ipAddress}
          {duplicates.has(i.ipAddress) && <AlertTriangle className="h-3 w-3 text-[#FF7C91]" />}
        </span>
      ),
    },
    { key: "host", header: "Hostname", render: (i) => <span className="font-mono text-xs">{i.hostname}</span> },
    { key: "type", header: "Type", render: (i) => <StatusBadge tone="info" label={i.type} /> },
    {
      key: "subnet", header: "Subnet",
      render: (i) => (
        <button
          className="font-mono text-xs text-primary hover:underline"
          onClick={(e) => { e.stopPropagation(); setSubnetOpen(i.subnet); }}
        >
          {i.subnet}
        </button>
      ),
    },
    { key: "gw", header: "Gateway", render: (i) => <span className="font-mono text-xs text-muted-foreground">{i.gateway}</span> },
    { key: "vlan", header: "VLAN", render: (i) => <span className="text-xs">{i.vlan}</span> },
    { key: "loc", header: "Location", render: (i) => <span className="text-xs text-muted-foreground">{i.location}</span> },
    { key: "status", header: "Status", render: (i) => <StatusBadge tone={statusTone(i.status)} label={i.status} /> },
    {
      key: "asset", header: "Linked Asset", render: (i) => {
        const a = data.assets.find((x) => x.id === i.linkedAssetId);
        return a ? <span className="text-xs">{a.hostname}</span> : <span className="text-xs text-muted-foreground">—</span>;
      },
    },
    {
      key: "actions", header: "", className: "w-12",
      render: (i) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {writable && <DropdownMenuItem onClick={() => openEdit(i)}><Edit className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>}
            {writable && i.status !== "reserved" && (
              <DropdownMenuItem onClick={() => setIPStatus(i.id, "reserved")}>
                <Lock className="mr-2 h-3.5 w-3.5" /> Reserve
              </DropdownMenuItem>
            )}
            {writable && i.status !== "free" && (
              <DropdownMenuItem onClick={() => setIPStatus(i.id, "free")}>
                <Unlock className="mr-2 h-3.5 w-3.5" /> Release
              </DropdownMenuItem>
            )}
            {writable && (
              <DropdownMenuItem onClick={() => {
                const t = createTicket({
                  requester: "system.user",
                  subject: `IP ${i.ipAddress} — investigate`,
                  description: `IPAM record ${i.ipAddress} (${i.subnet}, ${i.vlan}).`,
                  type: "incident",
                  category: "Network",
                  priority: "normal",
                  linkedIpamId: i.id,
                });
                toast.success(`Created ${t.number}`);
              }}>
                <TicketIcon className="mr-2 h-3.5 w-3.5" /> Create linked ticket
              </DropdownMenuItem>
            )}
            {writable && data.assets.length > 0 && (
              <DropdownMenuItem onClick={() => {
                const free = data.assets.find((a) => !data.ipam.some((x) => x.linkedAssetId === a.id && x.id !== i.id));
                if (free) linkAsset(i.id, free.id);
                else toast.info("No unassigned assets — edit to pick one");
              }}>
                <Link2 className="mr-2 h-3.5 w-3.5" /> Auto-link asset
              </DropdownMenuItem>
            )}
            {writable && <DropdownMenuSeparator />}
            {writable && (
              <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(i.id)}>
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="IPAM"
        description="Manage subnets, IP addresses and reservations."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!writable}>
              <Upload className="mr-1.5 h-4 w-4" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="mr-1.5 h-4 w-4" /> Export
            </Button>
            <Button onClick={openCreate} disabled={!writable}><Plus className="mr-1.5 h-4 w-4" /> Add IP record</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard icon={Network} label="Total addresses" value={data.ipam.length} accent="primary" />
        <MetricCard icon={Network} label="Available" value={free} accent="muted" />
        <MetricCard icon={CheckCircle2} label="Assigned" value={used} accent="success" />
        <MetricCard icon={Lock} label="Reserved" value={reserved} accent="warning" />
        <MetricCard
          icon={AlertTriangle}
          label="Conflicts"
          value={duplicates.size}
          accent={duplicates.size > 0 ? "danger" : "success"}
        />
      </div>
      <div className="mt-2 px-1 text-[11px] text-muted-foreground">
        <Layers className="mr-1 inline h-3 w-3" /> {subnets.length} subnet{subnets.length === 1 ? "" : "s"} · {vlans} VLAN{vlans === 1 ? "" : "s"} · {linkedAssets} linked asset{linkedAssets === 1 ? "" : "s"}
      </div>

      {duplicates.size > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#FF7C91]/30 bg-[#FF7C91]/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-[#FF7C91]" />
          <div>
            <div className="font-medium text-[#FF7C91]">{duplicates.size} duplicate IP{duplicates.size === 1 ? "" : "s"} detected</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {Array.from(duplicates).slice(0, 5).join(", ")}
              {duplicates.size > 5 && ` +${duplicates.size - 5} more`}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {subnets.map((s) => {
          const total = s.used + s.free + s.reserved;
          const util = total > 0 ? Math.round((s.used / total) * 100) : 0;
          return (
            <button
              key={s.subnet}
              onClick={() => setSubnetOpen(s.subnet)}
              className="glass-card rounded-2xl p-4 text-left transition hover:border-primary/40"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-sm font-semibold">{s.subnet}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{s.vlan} · GW {s.gateway}</div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div><span className="text-foreground font-medium">{s.used}</span> used · <span className="text-foreground font-medium">{s.free}</span> free</div>
                  <div className="text-[10px]">{s.reserved} reserved</div>
                </div>
              </div>
              <div className="mt-3">
                <Progress value={util} className="h-1.5" />
                <div className="mt-1 text-[10px] text-muted-foreground">{util}% utilization · click for details</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 glass-card rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Layers className="h-3.5 w-3.5" /> VLAN Overview
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {vlanGroups.map((v) => (
            <div key={v.vlan} className="rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-sm">
              <div className="truncate font-medium">{v.vlan}</div>
              <div className="text-xs text-muted-foreground">{v.count} addresses · {v.subnetCount} subnet{v.subnetCount === 1 ? "" : "s"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 glass-card rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search IP, hostname, VLAN..." className="w-full sm:w-72" />
          <Select value={filterSubnet} onValueChange={setFilterSubnet}>
            <SelectTrigger className="h-9 w-[180px] rounded-xl border-border/60 bg-card/60"><SelectValue placeholder="Subnet" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subnets</SelectItem>
              {subnets.map((s) => <SelectItem key={s.subnet} value={s.subnet}>{s.subnet}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterVlan} onValueChange={setFilterVlan}>
            <SelectTrigger className="h-9 w-[180px] rounded-xl border-border/60 bg-card/60"><SelectValue placeholder="VLAN" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All VLANs</SelectItem>
              {vlanGroups.map((v) => <SelectItem key={v.vlan} value={v.vlan}>{v.vlan}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-[140px] rounded-xl border-border/60 bg-card/60"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="used">Used</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 w-[140px] rounded-xl border-border/60 bg-card/60"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="static">Static</SelectItem>
              <SelectItem value="dhcp">DHCP</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="virtual">Virtual</SelectItem>
            </SelectContent>
          </Select>
          {(query || filterSubnet !== "all" || filterStatus !== "all" || filterType !== "all" || filterVlan !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setFilterSubnet("all"); setFilterStatus("all"); setFilterType("all"); setFilterVlan("all"); }}>Reset</Button>
          )}
        </div>
      </div>

      {selected.size > 0 && writable && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2.5">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <span className="text-xs text-muted-foreground">·</span>
          <Button size="sm" variant="ghost" onClick={bulkReserve}><Lock className="mr-1 h-3.5 w-3.5" /> Reserve</Button>
          <Button size="sm" variant="ghost" onClick={bulkRelease}><Unlock className="mr-1 h-3.5 w-3.5" /> Release</Button>
          <Button size="sm" variant="ghost" onClick={exportCSV}><Download className="mr-1 h-3.5 w-3.5" /> Export</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="mt-4">
        {filtered.length > 0 && (
          <div className="mb-2 flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            <span>Select all on this view</span>
          </div>
        )}
        <DataTable
          data={filtered}
          columns={columns}
          pageSize={data.settings.tablePageSize}
          emptyState={
            (query || filterSubnet !== "all" || filterStatus !== "all" || filterType !== "all" || filterVlan !== "all")
              ? <EmptyState icon={Network} title="No matching records" description="No records match the selected filters." actionLabel="Clear filters" onAction={() => { setQuery(""); setFilterSubnet("all"); setFilterStatus("all"); setFilterType("all"); setFilterVlan("all"); }} />
              : <EmptyState icon={Network} title="No IP records yet" description="Add the first IP record to start managing your network inventory." actionLabel="Add IP record" onAction={openCreate} />
          }
        />
      </div>

      <FormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={editId ? "Edit IP Record" : "Add IP Record"} onSubmit={save}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="IP address">
            <Input
              value={form.ipAddress}
              onChange={(e) => {
                const v = e.target.value;
                setForm({ ...form, ipAddress: v });
                setValidationError(validateIP(v, editId));
              }}
              className={validationError ? "border-[#FF7C91]/60" : ""}
            />
            {validationError && <div className="mt-1 text-[11px] text-[#FF7C91]">{validationError}</div>}
          </Field>
          <Field label="Hostname"><Input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} /></Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v: IPAMEntry["type"]) => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["static","dhcp","reserved","virtual"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v: IPAMEntry["status"]) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["used","free","reserved"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Subnet"><Input value={form.subnet} onChange={(e) => setForm({ ...form, subnet: e.target.value })} /></Field>
          <Field label="Gateway"><Input value={form.gateway} onChange={(e) => setForm({ ...form, gateway: e.target.value })} /></Field>
          <Field label="VLAN"><Input value={form.vlan} onChange={(e) => setForm({ ...form, vlan: e.target.value })} /></Field>
          <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Linked asset">
            <Select value={form.linkedAssetId ?? "none"} onValueChange={(v) => setForm({ ...form, linkedAssetId: v === "none" ? undefined : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {data.assets.map((a) => <SelectItem key={a.id} value={a.id}>{a.hostname}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </FormDrawer>

      <ImportPreviewDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import IP Records"
        description="Preview CSV rows before adding to IPAM. Duplicates are skipped."
        expectedHeaders={CSV_COLS}
        onImport={importRows}
      />

      <SubnetDetailsDrawer subnet={subnetOpen} onOpenChange={(o) => { if (!o) setSubnetOpen(null); }} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete IP record?"
        description="The record will be moved to the recycle bin."
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
