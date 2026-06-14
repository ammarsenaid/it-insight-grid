import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Download, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { FilterBar } from "@/components/common/FilterBar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDateTime } from "@/components/common/format";
import { can, useRole } from "@/lib/permissions";
import { toCSV, downloadCSV } from "@/lib/csv";
import {
  recycleBinDeletedAssetsQuery, recycleBinDeletedAddressesQuery,
  recycleBinDeletedTasksQuery, recycleBinDeletedNotesQuery, recycleBinInvalidationKeys,
} from "@/lib/recycle-bin/queries";
import {
  assetsToRecycleBinItems, addressesToRecycleBinItems, tasksToRecycleBinItems,
  notesToRecycleBinItems, restoreRecycleBinItem,
} from "@/lib/recycle-bin/recycleBin";
import { RECYCLE_BIN_KINDS, RECYCLE_BIN_KIND_LABELS, type RecycleBinItem } from "@/lib/recycle-bin/types";

export const Route = createFileRoute("/trash")({
  head: () => ({ meta: [{ title: "Recycle Bin · IT Knowledge Center" }] }),
  beforeLoad: () => {
    if (!can("recyclebin.restore")) throw redirect({ to: "/" });
  },
  component: TrashPage,
});

function TrashPage() {
  const role = useRole();
  const qc = useQueryClient();
  const canRestore = can("recyclebin.restore", role);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("__all");

  const assetsQ = useQuery({ ...recycleBinDeletedAssetsQuery(), enabled: canRestore });
  const addressesQ = useQuery({ ...recycleBinDeletedAddressesQuery(), enabled: canRestore });
  const tasksQ = useQuery({ ...recycleBinDeletedTasksQuery(), enabled: canRestore });
  const notesQ = useQuery({ ...recycleBinDeletedNotesQuery(), enabled: canRestore });

  const queries = [assetsQ, addressesQ, tasksQ, notesQ];
  const isLoading = queries.some((query) => query.isLoading);
  const isError = queries.some((query) => query.isError);

  const items = useMemo<RecycleBinItem[]>(() => [
    ...assetsToRecycleBinItems(assetsQ.data ?? []),
    ...addressesToRecycleBinItems(addressesQ.data ?? []),
    ...tasksToRecycleBinItems(tasksQ.data ?? []),
    ...notesToRecycleBinItems(notesQ.data ?? []),
  ], [assetsQ.data, addressesQ.data, tasksQ.data, notesQ.data]);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return items.filter((item) => {
      if (kind !== "__all" && item.kind !== kind) return false;
      if (ql && !(item.name.toLowerCase().includes(ql) || item.originalLocation.toLowerCase().includes(ql))) return false;
      return true;
    });
  }, [items, q, kind]);

  const restoreMutation = useMutation({
    mutationFn: (item: RecycleBinItem) => restoreRecycleBinItem(item),
    onSuccess: async (_data, item) => {
      await qc.invalidateQueries({ queryKey: recycleBinInvalidationKeys[item.kind] });
      toast.success(`Restored ${item.name}`);
    },
    onError: () => toast.error("Failed to restore item"),
  });

  const doExport = () => {
    downloadCSV(`recycle-bin-${Date.now()}.csv`, toCSV(filtered.map((item) => ({
      name: item.name, type: item.kind, originalLocation: item.originalLocation, deletedAt: item.deletedAt,
    }))));
    toast.success(`Exported ${filtered.length} rows`);
  };

  const oldest = items.reduce<RecycleBinItem | null>((a, b) => (!a || a.deletedAt > b.deletedAt ? b : a), null);
  const newest = items.reduce<RecycleBinItem | null>((a, b) => (!a || a.deletedAt < b.deletedAt ? b : a), null);

  const columns: Column<RecycleBinItem>[] = [
    { key: "name", header: "Name", render: (item) => <span className="font-medium">{item.name}</span> },
    { key: "kind", header: "Type", render: (item) => <StatusBadge tone="muted" label={RECYCLE_BIN_KIND_LABELS[item.kind]} /> },
    { key: "loc", header: "Original location", render: (item) => <span className="text-xs text-muted-foreground">{item.originalLocation}</span> },
    { key: "del", header: "Deleted", render: (item) => <span className="text-xs text-muted-foreground">{formatDateTime(item.deletedAt)}</span> },
    { key: "act", header: "", className: "w-24", render: (item) => (
      <Button
        size="sm" variant="ghost" disabled={!canRestore || restoreMutation.isPending}
        onClick={() => restoreMutation.mutate(item)} title={canRestore ? "Restore" : "Restricted"}
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
      </Button>
    ) },
  ];

  if (isError) {
    return (
      <div>
        <PageHeader title="Recycle Bin" description="Review deleted records and restore them when needed." />
        <EmptyState icon={Trash2} title="Unable to load recycle bin" description="There was a problem loading deleted records. Try refreshing the page." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Recycle Bin"
        description="Review deleted records across CMDB, IPAM, Tasks, and Notes, and restore them when needed."
        actions={
          <Button variant="secondary" onClick={doExport} disabled={filtered.length === 0}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard icon={RotateCcw} label="Recoverable" value={items.length} accent="primary" />
        <MetricCard icon={Clock} label="Most recently deleted" value={newest ? formatDateTime(newest.deletedAt) : "—"} accent="muted" />
        <MetricCard icon={Trash2} label="Oldest" value={oldest ? formatDateTime(oldest.deletedAt) : "—"} accent="warning" />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Deleted records are retained for audit and compliance and can be restored at any time. Permanent deletion is not available.
      </p>

      <div className="mt-4">
        <FilterBar query={q} onQueryChange={setQ} placeholder="Search deleted items…" onReset={() => { setQ(""); setKind("__all"); }}>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All types</SelectItem>
              {RECYCLE_BIN_KINDS.map((k) => <SelectItem key={k} value={k}>{RECYCLE_BIN_KIND_LABELS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterBar>
        <DataTable
          data={filtered}
          columns={columns}
          pageSize={20}
          emptyState={<EmptyState icon={Trash2} title={isLoading ? "Loading recycle bin" : items.length === 0 ? "Recycle Bin is empty" : "No matching items"} description={isLoading ? "Loading deleted records." : items.length === 0 ? "Deleted records will appear here." : "Try adjusting filters."} />}
        />
      </div>
    </div>
  );
}
