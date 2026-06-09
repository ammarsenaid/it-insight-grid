import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Network, MoreHorizontal, Edit, Trash2, CheckCircle2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setState, logActivity, trashItem, uid, useData } from "@/lib/data/store";
import type { IPAMEntry } from "@/lib/data/types";
import { toast } from "sonner";

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

function IPAMPage() {
  const data = useData();
  const [query, setQuery] = useState("");
  const [filterSubnet, setFilterSubnet] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(emptyIP());
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const subnets = useMemo(() => {
    const map = new Map<string, { gateway: string; vlan: string; used: number; free: number; reserved: number }>();
    data.ipam.forEach((i) => {
      const entry = map.get(i.subnet) ?? { gateway: i.gateway, vlan: i.vlan, used: 0, free: 0, reserved: 0 };
      if (i.status === "used") entry.used++;
      else if (i.status === "free") entry.free++;
      else entry.reserved++;
      map.set(i.subnet, entry);
    });
    return Array.from(map.entries()).map(([subnet, v]) => ({ subnet, ...v }));
  }, [data.ipam]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return data.ipam.filter((i) => {
      if (filterSubnet !== "all" && i.subnet !== filterSubnet) return false;
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      if (filterType !== "all" && i.type !== filterType) return false;
      if (!q) return true;
      return i.ipAddress.includes(q) || i.hostname.toLowerCase().includes(q) || i.vlan.toLowerCase().includes(q);
    });
  }, [data.ipam, query, filterSubnet, filterStatus, filterType]);

  const used = data.ipam.filter((i) => i.status === "used").length;
  const free = data.ipam.filter((i) => i.status === "free").length;
  const reserved = data.ipam.filter((i) => i.status === "reserved").length;
  const vlans = new Set(data.ipam.map((i) => i.vlan)).size;
  const linkedAssets = data.ipam.filter((i) => i.linkedAssetId).length;

  const openCreate = () => { setEditId(null); setForm(emptyIP()); setDrawerOpen(true); };
  const openEdit = (i: IPAMEntry) => { setEditId(i.id); setForm({ ...i }); setDrawerOpen(true); };

  const save = () => {
    if (!form.ipAddress.trim()) { toast.error("IP address is required"); return; }
    setState((s) => {
      if (editId) {
        return { ...s, ipam: s.ipam.map((i) => i.id === editId ? { ...i, ...form, updatedAt: new Date().toISOString() } : i) };
      }
      const next: IPAMEntry = { id: uid("ip"), ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      return { ...s, ipam: [next, ...s.ipam] };
    });
    logActivity(editId ? "ipam.edit" : "ipam.create", `${editId ? "Updated" : "Added"} IP record ${form.ipAddress}`);
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
  };

  const columns: Column<IPAMEntry>[] = [
    { key: "ip", header: "IP Address", render: (i) => <span className="font-mono font-medium text-foreground">{i.ipAddress}</span> },
    { key: "host", header: "Hostname", render: (i) => <span className="font-mono text-xs">{i.hostname}</span> },
    { key: "type", header: "Type", render: (i) => <StatusBadge tone="info" label={i.type} /> },
    { key: "subnet", header: "Subnet", render: (i) => <span className="font-mono text-xs text-muted-foreground">{i.subnet}</span> },
    { key: "gw", header: "Gateway", render: (i) => <span className="font-mono text-xs text-muted-foreground">{i.gateway}</span> },
    { key: "vlan", header: "VLAN", render: (i) => <span className="text-xs">{i.vlan}</span> },
    { key: "loc", header: "Location", render: (i) => <span className="text-xs text-muted-foreground">{i.location}</span> },
    { key: "status", header: "Status", render: (i) => <StatusBadge tone={statusTone(i.status)} label={i.status} /> },
    { key: "asset", header: "Linked Asset", render: (i) => {
      const a = data.assets.find((x) => x.id === i.linkedAssetId);
      return a ? <span className="text-xs">{a.hostname}</span> : <span className="text-xs text-muted-foreground">—</span>;
    } },
    { key: "actions", header: "", className: "w-12", render: (i) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openEdit(i)}><Edit className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(i.id)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title="IPAM"
        description="Track IP addresses, subnets, VLANs, and links to CMDB assets."
        actions={<Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" /> Add IP</Button>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <MetricCard icon={Network} label="Total" value={data.ipam.length} accent="primary" />
        <MetricCard icon={CheckCircle2} label="Used" value={used} accent="success" />
        <MetricCard icon={Network} label="Free" value={free} accent="muted" />
        <MetricCard icon={Network} label="Reserved" value={reserved} accent="warning" />
        <MetricCard icon={Network} label="Subnets" value={subnets.length} accent="primary" />
        <MetricCard icon={Network} label="VLANs" value={vlans} accent="primary" />
        <MetricCard icon={Network} label="Linked" value={linkedAssets} accent="success" />
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {subnets.map((s) => {
          const total = s.used + s.free + s.reserved;
          const util = total > 0 ? Math.round((s.used / total) * 100) : 0;
          return (
            <div key={s.subnet} className="glass-card rounded-2xl p-4">
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
                <div className="mt-1 text-[10px] text-muted-foreground">{util}% utilization</div>
              </div>
            </div>
          );
        })}
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
        </div>
      </div>

      <div className="mt-4">
        <DataTable
          data={filtered}
          columns={columns}
          pageSize={data.settings.tablePageSize}
          emptyState={<EmptyState icon={Network} title="No IP records" description="Add an IP to start managing addresses." actionLabel="Add IP" onAction={openCreate} />}
        />
      </div>

      <FormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title={editId ? "Edit IP Record" : "Add IP Record"} onSubmit={save}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="IP address"><Input value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} /></Field>
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
