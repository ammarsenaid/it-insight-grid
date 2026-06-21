import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  Database,
  Download,
  FileText,
  Inbox,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Ticket,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clearAll,
  exportJSON,
  importJSON,
  refreshFromStorage,
  resetDemo,
  setState,
  uid,
  useData,
} from "@/lib/data/store";
import { useKnowledge } from "@/lib/knowledge/store";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateTime } from "@/components/common/format";

export const Route = createFileRoute("/admin/diagnostics")({
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  const data = useData();
  const knowledge = useKnowledge();
  const { isPlatformAdmin } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteSnap, setConfirmDeleteSnap] = useState<string | null>(null);
  const [confirmRestoreSnap, setConfirmRestoreSnap] = useState<string | null>(null);
  const [snapshotName, setSnapshotName] = useState("");
  const [importPreview, setImportPreview] = useState<{
    json: string;
    summary: Record<string, number>;
    ok: boolean;
  } | null>(null);

  if (!isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <SectionCard title="Diagnostics">
          <p className="text-sm text-muted-foreground">
            This area is restricted to platform administrators.
          </p>
        </SectionCard>
      </div>
    );
  }

  const knowledgePageCount = knowledge.nodes.filter((n) => n.type === "page").length;
  const spaceCount = knowledge.nodes.filter((n) => n.type === "space").length;

  const doExport = () => {
    const json = exportJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ikc-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Data exported");
  };

  const previewImport = async (f: File) => {
    const text = await f.text();
    try {
      const parsed = JSON.parse(text);
      const summary: Record<string, number> = {};
      for (const k of [
        "folders",
        "documents",
        "assets",
        "ipam",
        "tasks",
        "notes",
        "tickets",
        "users",
        "teams",
        "trash",
        "activity",
        "snapshots",
        "notifications",
      ]) {
        if (Array.isArray(parsed[k])) summary[k] = parsed[k].length;
      }
      setImportPreview({ json: text, summary, ok: !!parsed.settings });
    } catch {
      setImportPreview({ json: text, summary: {}, ok: false });
    }
  };

  const confirmImport = () => {
    if (!importPreview) return;
    if (importJSON(importPreview.json)) toast.success("Data imported");
    else toast.error("Invalid JSON");
    setImportPreview(null);
  };

  const createSnapshot = () => {
    const json = exportJSON();
    setState((st) => ({
      ...st,
      snapshots: [
        {
          id: uid("snap"),
          name: snapshotName || `Snapshot ${st.snapshots.length + 1}`,
          createdAt: new Date().toISOString(),
          data: json,
          sizeBytes: json.length,
        },
        ...st.snapshots,
      ],
    }));
    setSnapshotName("");
    toast.success("Snapshot created");
  };

  const restoreSnapshot = (id: string) => {
    const snap = data.snapshots.find((x) => x.id === id);
    if (!snap) return;
    if (importJSON(snap.data)) toast.success("Snapshot restored");
  };

  const deleteSnapshot = (id: string) => {
    setState((st) => ({ ...st, snapshots: st.snapshots.filter((x) => x.id !== id) }));
    toast.success("Snapshot deleted");
  };

  const downloadSnapshot = (id: string) => {
    const snap = data.snapshots.find((x) => x.id === id);
    if (!snap) return;
    const blob = new Blob([snap.data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${snap.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Diagnostics"
        description="Inspect local workspace state and run restricted support operations."
      />

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-100/80 shadow-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div>
          <p className="font-semibold text-amber-100">Platform administrator tools</p>
          <p className="mt-0.5 leading-relaxed">
            These utilities operate on browser-local application data and should be used
            deliberately during support or QA.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard
          title="Workspace status"
          description="Local environment health"
          className="border-border/50 shadow-sm"
        >
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2 text-emerald-300">
              <FileText className="h-3.5 w-3.5" /> Knowledge module ready
            </li>
            <li className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-2">
                <Ticket className="h-3.5 w-3.5" /> Tickets in local store
              </span>
              <span className="font-mono text-foreground/80">{data.tickets.length}</span>
            </li>
            <li className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-2">
                <Trash2 className="h-3.5 w-3.5" /> Recycle bin entries
              </span>
              <span className="font-mono text-foreground/80">{data.trash.length}</span>
            </li>
          </ul>
          <Button
            size="sm"
            variant="secondary"
            className="mt-4"
            onClick={() => {
              refreshFromStorage();
              toast.success("Local data refreshed");
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh local data
          </Button>
        </SectionCard>

        <SectionCard
          title="Developer tools"
          description="Restricted utilities for QA and support"
          className="border-border/50 shadow-sm"
        >
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                to="/admin/mailbox"
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-3 py-2 hover:bg-card/70"
              >
                <Inbox className="h-4 w-4 text-primary" />
                <span className="flex-1">Mailbox Simulator</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  QA tool
                </span>
              </Link>
            </li>
            <li className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-3 py-2 text-muted-foreground">
              <Database className="h-4 w-4" />
              <span className="flex-1">Knowledge backend</span>
              <span className="text-[10px] uppercase tracking-wider text-emerald-400">
                Connected
              </span>
            </li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        title="Local Data Tools"
        description="Administrative tools for managing locally stored application data."
        className="border-border/50 shadow-sm"
      >
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            These actions affect data stored in this browser only. They do not touch any remote
            backend or other users.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Storage" value="Active" tone="success" />
          <Stat label="Knowledge Pages" value={knowledgePageCount} />
          <Stat label="Spaces" value={spaceCount} />
          <Stat label="CMDB" value={data.assets.length} />
          <Stat label="IPAM" value={data.ipam.length} />
          <Stat label="Tasks" value={data.tasks.length} />
          <Stat label="Notes" value={data.notes.length} />
          <Stat label="Trash" value={data.trash.length} />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-wrap gap-2 rounded-xl border border-border/40 bg-background/25 p-3">
            <Button size="sm" onClick={doExport}>
              <Download className="mr-1.5 h-4 w-4" /> Export data
            </Button>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" /> Import data
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) previewImport(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2 rounded-xl border border-destructive/25 bg-destructive/[0.05] p-3">
            <Button size="sm" variant="secondary" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Reset local data
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirmClear(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Clear local data
            </Button>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-border/40 bg-background/20 p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Backup snapshots
          </h4>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Snapshot name</Label>
              <Input
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder="Optional name"
              />
            </div>
            <Button size="sm" onClick={createSnapshot}>
              <Plus className="mr-1.5 h-4 w-4" /> Create snapshot
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {data.snapshots.length === 0 && (
              <p className="text-xs text-muted-foreground">No snapshots yet.</p>
            )}
            {data.snapshots.map((sn) => (
              <div
                key={sn.id}
                className="flex flex-col gap-3 rounded-xl border border-border/40 bg-card/40 p-3 transition-colors hover:border-border sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="text-sm font-medium">{sn.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatDateTime(sn.createdAt)} · {(sn.sizeBytes / 1024).toFixed(1)} KB
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => downloadSnapshot(sn.id)}
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setConfirmRestoreSnap(sn.id)}
                  >
                    <Save className="mr-1.5 h-3.5 w-3.5" /> Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setConfirmDeleteSnap(sn.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset local data?"
        description="This replaces locally stored application data with the default dataset. This affects this browser only."
        destructive
        confirmLabel="Reset"
        onConfirm={() => {
          resetDemo();
          toast.success("Data restored to defaults");
          setConfirmReset(false);
        }}
      />
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear local data?"
        description="This removes locally stored application data from this browser. This cannot be undone."
        destructive
        confirmLabel="Clear"
        onConfirm={() => {
          clearAll();
          toast.success("All data cleared");
          setConfirmClear(false);
        }}
      />
      <ConfirmDialog
        open={!!confirmRestoreSnap}
        onOpenChange={(o) => !o && setConfirmRestoreSnap(null)}
        title="Restore snapshot?"
        description="This replaces locally stored application data with the contents of this snapshot."
        destructive
        confirmLabel="Restore"
        onConfirm={() => {
          if (confirmRestoreSnap) restoreSnapshot(confirmRestoreSnap);
          setConfirmRestoreSnap(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmDeleteSnap}
        onOpenChange={(o) => !o && setConfirmDeleteSnap(null)}
        title="Delete snapshot?"
        description="The snapshot will be permanently removed from this browser."
        destructive
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteSnap) deleteSnapshot(confirmDeleteSnap);
          setConfirmDeleteSnap(null);
        }}
      />
      <ConfirmDialog
        open={!!importPreview}
        onOpenChange={(o) => !o && setImportPreview(null)}
        title={importPreview?.ok ? "Replace local data with import?" : "Invalid import file"}
        description={
          importPreview?.ok
            ? "Review the contents below — your current data will be replaced."
            : "The selected file does not appear to be a valid backup."
        }
        destructive={importPreview?.ok}
        confirmLabel={importPreview?.ok ? "Replace data" : "OK"}
        onConfirm={() => (importPreview?.ok ? confirmImport() : setImportPreview(null))}
      >
        {importPreview?.ok && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {Object.entries(importPreview.summary).map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-2 py-1"
              >
                <span className="capitalize text-muted-foreground">{k}</span>
                <span className="font-mono">{v}</span>
              </div>
            ))}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "success" }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-3 transition-colors hover:border-border/70 hover:bg-muted/15">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${tone === "success" ? "text-[#52D6A4]" : ""}`}>
        {value}
      </div>
    </div>
  );
}
