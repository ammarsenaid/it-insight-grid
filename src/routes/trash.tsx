import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2, RotateCcw, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { setState, logActivity, useData } from "@/lib/data/store";
import type { TrashItem } from "@/lib/data/types";
import { toast } from "sonner";
import { formatDateTime, formatBytes } from "@/components/common/format";

export const Route = createFileRoute("/trash")({
  head: () => ({ meta: [{ title: "Recycle Bin · IT Knowledge Center" }] }),
  component: TrashPage,
});

function TrashPage() {
  const data = useData();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const restore = (item: TrashItem) => {
    setState((s) => {
      const t = s.trash.filter((x) => x.id !== item.id);
      const p = item.payload as never;
      switch (item.kind) {
        case "document": return { ...s, trash: t, documents: [p, ...s.documents] };
        case "folder": return { ...s, trash: t, folders: [...s.folders, p] };
        case "asset": return { ...s, trash: t, assets: [p, ...s.assets] };
        case "ipam": return { ...s, trash: t, ipam: [p, ...s.ipam] };
        case "task": return { ...s, trash: t, tasks: [p, ...s.tasks] };
        case "note": return { ...s, trash: t, notes: [p, ...s.notes] };
        default: return { ...s, trash: t };
      }
    });
    logActivity("trash.restore", `Restored '${item.name}'`);
    toast.success("Restored");
  };

  const remove = (id: string) => {
    setState((s) => ({ ...s, trash: s.trash.filter((x) => x.id !== id) }));
    toast.success("Permanently deleted");
  };

  const empty = () => {
    setState((s) => ({ ...s, trash: [] }));
    toast.success("Recycle bin emptied");
  };

  const oldest = data.trash.reduce<TrashItem | null>((a, b) => (!a || a.deletedAt > b.deletedAt ? b : a), null);

  const columns: Column<TrashItem>[] = [
    { key: "name", header: "Name", render: (t) => <span className="font-medium">{t.name}</span> },
    { key: "kind", header: "Type", render: (t) => <StatusBadge tone="muted" label={t.kind} /> },
    { key: "loc", header: "Original location", render: (t) => <span className="text-xs text-muted-foreground">{t.originalLocation}</span> },
    { key: "del", header: "Deleted", render: (t) => <span className="text-xs text-muted-foreground">{formatDateTime(t.deletedAt)}</span> },
    { key: "size", header: "Size", render: (t) => <span className="text-xs text-muted-foreground font-mono">{formatBytes(t.size)}</span> },
    { key: "act", header: "", className: "w-32", render: (t) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => restore(t)}><RotateCcw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(t.id)}><X className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Recycle Bin" description="Restore or permanently delete recently removed items."
        actions={data.trash.length > 0 && <Button variant="destructive" onClick={() => setConfirmEmpty(true)}><Trash2 className="mr-1.5 h-4 w-4" /> Empty bin</Button>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MetricCard icon={Trash2} label="Recoverable" value={data.trash.length} accent="primary" />
        <MetricCard icon={Trash2} label="Documents" value={data.trash.filter((t) => t.kind === "document").length} accent="muted" />
        <MetricCard icon={Trash2} label="Folders" value={data.trash.filter((t) => t.kind === "folder").length} accent="muted" />
        <MetricCard icon={Trash2} label="Operational" value={data.trash.filter((t) => ["asset","ipam","task","note"].includes(t.kind)).length} accent="muted" />
        <MetricCard icon={Trash2} label="Oldest" value={oldest ? formatDateTime(oldest.deletedAt) : "—"} accent="warning" />
      </div>
      <div className="mt-6">
        <DataTable data={data.trash} columns={columns} pageSize={data.settings.tablePageSize}
          emptyState={<EmptyState icon={Trash2} title="Recycle bin is empty" description="Deleted items will appear here." />} />
      </div>
      <ConfirmDialog open={confirmEmpty} onOpenChange={setConfirmEmpty} title="Empty recycle bin?" description="All items will be permanently deleted." destructive confirmLabel="Empty" onConfirm={() => { empty(); setConfirmEmpty(false); }} />
      <ConfirmDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)} title="Permanently delete?" destructive confirmLabel="Delete" onConfirm={() => { if (confirmDelete) remove(confirmDelete); setConfirmDelete(null); }} />
    </div>
  );
}
