import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Trash2, RotateCcw, X, Download } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { FilterBar } from "@/components/common/FilterBar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ActivityTimeline } from "@/components/common/ActivityTimeline";
import { setState, logActivity, useData } from "@/lib/data/store";
import type { TrashItem, TrashKind } from "@/lib/data/types";
import { toast } from "sonner";
import { formatDateTime, formatBytes } from "@/components/common/format";
import { can, useRole } from "@/lib/permissions";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/trash")({
  head: () => ({ meta: [{ title: "Recycle Bin · IT Knowledge Center" }] }),
  beforeLoad: () => {
    if (!can("recyclebin.restore")) throw redirect({ to: "/" });
  },
  component: TrashPage,
});

const KINDS: TrashKind[] = ["asset", "ipam", "task", "note"];

function TrashPage() {
  const data = useData();
  const role = useRole();
  const canRestore = can("recyclebin.restore", role);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("__all");

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return data.trash.filter((t) => {
      if (kind !== "__all" && t.kind !== kind) return false;
      if (ql && !(t.name.toLowerCase().includes(ql) || t.originalLocation.toLowerCase().includes(ql))) return false;
      return true;
    });
  }, [data.trash, q, kind]);

  const restore = (item: TrashItem) => {
    setState((s) => {
      const t = s.trash.filter((x) => x.id !== item.id);
      const p = item.payload as never;
      switch (item.kind) {
        case "document": return { ...s, trash: t, documents: item.payload ? [p, ...s.documents] : s.documents };
        case "folder":   return { ...s, trash: t, folders: item.payload ? [...s.folders, p] : s.folders };
        case "asset":    return { ...s, trash: t, assets: item.payload ? [p, ...s.assets] : s.assets };
        case "ipam":     return { ...s, trash: t, ipam: item.payload ? [p, ...s.ipam] : s.ipam };
        case "task":     return { ...s, trash: t, tasks: item.payload ? [p, ...s.tasks] : s.tasks };
        case "note":     return { ...s, trash: t, notes: item.payload ? [p, ...s.notes] : s.notes };
        default: return { ...s, trash: t };
      }
    });
    logActivity("trash.restore", `Restored '${item.name}'`, item.kind, item.id, role);
    toast.success(`Restored ${item.name}`);
  };

  const remove = (id: string) => {
    const item = data.trash.find((t) => t.id === id);
    setState((s) => ({ ...s, trash: s.trash.filter((x) => x.id !== id) }));
    if (item) logActivity("trash.purge", `Permanently deleted '${item.name}'`, item.kind, item.id, role);
    toast.success("Permanently deleted");
  };

  const empty = () => {
    const n = data.trash.length;
    setState((s) => ({ ...s, trash: [] }));
    logActivity("trash.empty", `Emptied recycle bin (${n} items)`, undefined, undefined, role);
    toast.success(`Emptied ${n} items`);
  };

  const doExport = () => {
    downloadCSV(`recycle-bin-${Date.now()}.csv`, toCSV(filtered.map((t) => ({
      name: t.name, type: t.kind, originalLocation: t.originalLocation,
      deletedAt: t.deletedAt, sizeBytes: t.size,
    }))));
    toast.success(`Exported ${filtered.length} rows`);
  };

  const oldest = data.trash.reduce<TrashItem | null>((a, b) => (!a || a.deletedAt > b.deletedAt ? b : a), null);
  const trashActivity = useMemo(() => data.activity
    .filter((a) => a.module === "trash" || a.type.startsWith("trash."))
    .slice(0, 20)
    .map((a) => ({ id: a.id, title: a.type, description: a.message, timestamp: a.createdAt })),
    [data.activity]);

  const columns: Column<TrashItem>[] = [
    { key: "name", header: "Name", render: (t) => <span className="font-medium">{t.name}</span> },
    { key: "kind", header: "Type", render: (t) => <StatusBadge tone="muted" label={t.kind} /> },
    { key: "loc", header: "Original location", render: (t) => <span className="text-xs text-muted-foreground">{t.originalLocation}</span> },
    { key: "del", header: "Deleted", render: (t) => <span className="text-xs text-muted-foreground">{formatDateTime(t.deletedAt)}</span> },
    { key: "size", header: "Size", render: (t) => <span className="text-xs text-muted-foreground font-mono">{formatBytes(t.size)}</span> },
    { key: "act", header: "", className: "w-32", render: (t) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => restore(t)} disabled={!canRestore} title={canRestore ? "Restore" : "Restricted"}><RotateCcw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(t.id)} disabled={!canRestore}><X className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title="Recycle Bin"
        description="Restore or permanently delete recently removed items. Items remain recoverable until purged."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={doExport} disabled={filtered.length === 0}>
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
            <Button variant="destructive" onClick={() => setConfirmEmpty(true)} disabled={data.trash.length === 0 || !canRestore}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Empty bin
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard icon={Trash2} label="Recoverable" value={data.trash.length} accent="primary" />
        <MetricCard icon={Trash2} label="Operational" value={data.trash.filter((t) => ["asset","ipam","task","note"].includes(t.kind)).length} accent="muted" />
        <MetricCard icon={Trash2} label="Oldest" value={oldest ? formatDateTime(oldest.deletedAt) : "—"} accent="warning" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <FilterBar query={q} onQueryChange={setQ} placeholder="Search deleted items…" onReset={() => { setQ(""); setKind("__all"); }}>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All types</SelectItem>
                {KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterBar>
          <DataTable
            data={filtered}
            columns={columns}
            pageSize={data.settings.tablePageSize}
            emptyState={<EmptyState icon={Trash2} title={data.trash.length === 0 ? "Recycle bin is empty" : "No matching items"} description={data.trash.length === 0 ? "Deleted items will appear here." : "Try adjusting filters."} />}
          />
        </div>
        <aside className="glass-card rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold">Recent recycle activity</h3>
          <ActivityTimeline entries={trashActivity} emptyLabel="No recycle bin activity yet." />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmEmpty} onOpenChange={setConfirmEmpty}
        title="Empty recycle bin?"
        description={`This will permanently delete all ${data.trash.length} item(s). This action cannot be undone.`}
        destructive confirmLabel="Yes, empty bin"
        onConfirm={() => { empty(); setConfirmEmpty(false); }}
      />
      <ConfirmDialog
        open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Permanently delete?"
        description="This item will be permanently removed."
        destructive confirmLabel="Delete forever"
        onConfirm={() => { if (confirmDelete) remove(confirmDelete); setConfirmDelete(null); }}
      />
    </div>
  );
}
