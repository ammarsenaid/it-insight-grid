import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ShieldCheck, Download, Eye, Filter as FilterIcon } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/common/DataTable";
import { FilterBar } from "@/components/common/FilterBar";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DetailsDrawer } from "@/components/common/DetailsDrawer";
import { useData } from "@/lib/data/store";
import { can, useRole } from "@/lib/permissions";
import { formatDateTime, timeAgo } from "@/components/common/format";
import { toCSV, downloadCSV } from "@/lib/csv";
import type { ActivityLog } from "@/lib/data/types";
import { toast } from "sonner";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "Audit Log · IT Knowledge Center" }] }),
  beforeLoad: () => {
    if (!can("audit.view")) throw redirect({ to: "/" });
  },
  component: AuditPage,
});

function AuditPage() {
  const data = useData();
  void useRole();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actor, setActor] = useState("__all");
  const [mod, setMod] = useState("__all");
  const [action, setAction] = useState("__all");
  const [selected, setSelected] = useState<ActivityLog | null>(null);

  const actors = useMemo(() => Array.from(new Set(data.activity.map((a) => a.actor).filter(Boolean))) as string[], [data.activity]);
  const modules = useMemo(() => Array.from(new Set(data.activity.map((a) => a.module).filter(Boolean))) as string[], [data.activity]);
  const actions = useMemo(() => Array.from(new Set(data.activity.map((a) => a.type))), [data.activity]);

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from).getTime() : 0;
    const toTs = to ? new Date(to).getTime() + 86_400_000 : Infinity;
    const ql = q.toLowerCase();
    return data.activity.filter((a) => {
      const ts = new Date(a.createdAt).getTime();
      if (ts < fromTs || ts > toTs) return false;
      if (actor !== "__all" && a.actor !== actor) return false;
      if (mod !== "__all" && a.module !== mod) return false;
      if (action !== "__all" && a.type !== action) return false;
      if (ql && !(a.message.toLowerCase().includes(ql) || a.type.toLowerCase().includes(ql))) return false;
      return true;
    });
  }, [data.activity, q, from, to, actor, mod, action]);

  const reset = () => { setQ(""); setFrom(""); setTo(""); setActor("__all"); setMod("__all"); setAction("__all"); };

  const doExport = () => {
    const csv = toCSV(filtered.map((a) => ({
      timestamp: a.createdAt,
      actor: a.actor ?? "system",
      module: a.module ?? "",
      action: a.type,
      message: a.message,
      entityType: a.entityType ?? "",
      entityId: a.entityId ?? "",
    })));
    downloadCSV(`audit-log-${Date.now()}.csv`, csv);
    toast.success(`Exported ${filtered.length} events`);
  };

  const last24h = data.activity.filter((a) => Date.now() - new Date(a.createdAt).getTime() < 86_400_000).length;

  const columns: Column<ActivityLog>[] = [
    { key: "ts", header: "When", className: "w-40", render: (a) => (
      <div>
        <div className="text-xs">{formatDateTime(a.createdAt)}</div>
        <div className="text-[10px] text-muted-foreground">{timeAgo(a.createdAt)}</div>
      </div>
    ) },
    { key: "actor", header: "Actor", render: (a) => <span className="text-xs">{a.actor ?? "system"}</span> },
    { key: "module", header: "Module", render: (a) => <StatusBadge tone="muted" label={a.module ?? "—"} /> },
    { key: "action", header: "Action", render: (a) => <span className="font-mono text-xs">{a.type}</span> },
    { key: "msg", header: "Details", render: (a) => <span className="text-xs">{a.message}</span> },
    { key: "act", header: "", className: "w-12", render: (a) => (
      <Button size="sm" variant="ghost" onClick={() => setSelected(a)}><Eye className="h-3.5 w-3.5" /></Button>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Review important activity across the workspace."
        actions={<Button onClick={doExport} variant="secondary"><Download className="mr-1.5 h-4 w-4" /> Export CSV</Button>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon={ShieldCheck} label="Total events" value={data.activity.length} accent="primary" />
        <MetricCard icon={ShieldCheck} label="Last 24h" value={last24h} accent="success" />
        <MetricCard icon={FilterIcon} label="Showing" value={filtered.length} accent="muted" />
        <MetricCard icon={ShieldCheck} label="Modules" value={modules.length} accent="warning" />
      </div>

      <div className="mt-6">
        <FilterBar query={q} onQueryChange={setQ} placeholder="Search events…" onReset={reset}>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
          <Select value={actor} onValueChange={setActor}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Actor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All actors</SelectItem>
              {actors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={mod} onValueChange={setMod}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Module" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All modules</SelectItem>
              {modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All actions</SelectItem>
              {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterBar>

        <DataTable
          data={filtered}
          columns={columns}
          pageSize={data.settings.tablePageSize}
          emptyState={
            (q || from || to || actor !== "__all" || mod !== "__all" || action !== "__all")
              ? <EmptyState icon={ShieldCheck} title="No matching events" description="Try adjusting filters or clearing them to see all activity." actionLabel="Clear filters" onAction={reset} />
              : <EmptyState icon={ShieldCheck} title="No audit events" description="Activity will appear here as users work across the platform." />
          }
        />
      </div>

      <DetailsDrawer
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected ? selected.type : "Event"}
        description={selected ? formatDateTime(selected.createdAt) : undefined}
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <Field label="Message" value={selected.message} />
            <Field label="Actor" value={selected.actor ?? "system"} />
            <Field label="Module" value={selected.module ?? "—"} />
            <Field label="Action" value={selected.type} mono />
            <Field label="Entity type" value={selected.entityType ?? "—"} />
            <Field label="Entity ID" value={selected.entityId ?? "—"} mono />
            <Field label="Timestamp" value={formatDateTime(selected.createdAt)} />
            <pre className="mt-3 overflow-auto rounded-xl border border-border/40 bg-background/40 p-3 text-[11px] text-muted-foreground">{JSON.stringify(selected, null, 2)}</pre>
          </div>
        )}
      </DetailsDrawer>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/30 pb-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "text-xs text-right"}>{value}</span>
    </div>
  );
}
