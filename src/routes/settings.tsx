import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Database, Download, Upload, RotateCcw, Trash2, Save, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { clearAll, exportJSON, importJSON, resetDemo, setState, uid, updateSettings, useData } from "@/lib/data/store";
import { useKnowledge } from "@/lib/knowledge/store";
import { toast } from "sonner";
import { formatDateTime } from "@/components/common/format";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · IT Knowledge Center" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const data = useData();
  const knowledge = useKnowledge();
  const knowledgePageCount = knowledge.nodes.filter((n) => n.type === "page").length;
  const spaceCount = knowledge.nodes.filter((n) => n.type === "space").length;
  const s = data.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const [importPreview, setImportPreview] = useState<{ json: string; summary: Record<string, number>; ok: boolean } | null>(null);

  const doExport = () => {
    const json = exportJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ikc-backup-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
    toast.success("Data exported");
  };

  const previewImport = async (f: File) => {
    const text = await f.text();
    try {
      const parsed = JSON.parse(text);
      const summary: Record<string, number> = {};
      for (const k of ["folders","documents","assets","ipam","tasks","notes","tickets","users","teams","trash","activity","snapshots","notifications"]) {
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
      snapshots: [{ id: uid("snap"), name: snapshotName || `Snapshot ${st.snapshots.length + 1}`, createdAt: new Date().toISOString(), data: json, sizeBytes: json.length }, ...st.snapshots],
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
    const a = document.createElement("a"); a.href = url; a.download = `${snap.name}.json`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Settings" description="Configure application preferences and manage local data." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="General">
          <Row label="App name"><Input value={s.appName} onChange={(e) => updateSettings({ appName: e.target.value })} className="max-w-xs" /></Row>
          <Row label="Version"><StatusBadge tone="info" label={s.version} /></Row>
          <Row label="Theme"><StatusBadge tone="muted" label="Dark (only)" /></Row>
          <Row label="Compact mode"><Switch checked={s.compactMode} onCheckedChange={(v) => updateSettings({ compactMode: v })} /></Row>
          <Row label="Show notifications"><Switch checked={s.showNotifications} onCheckedChange={(v) => updateSettings({ showNotifications: v })} /></Row>
          <Row label="Table page size">
            <Select value={String(s.tablePageSize)} onValueChange={(v) => updateSettings({ tablePageSize: Number(v) })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 20, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </Row>
        </Card>

        <Card title="UI Preferences">
          <Row label="Default document view">
            <Select value={s.defaultDocView} onValueChange={(v: "table" | "cards") => updateSettings({ defaultDocView: v })}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="table">Table</SelectItem><SelectItem value="cards">Cards</SelectItem></SelectContent>
            </Select>
          </Row>
          <Row label="Show dashboard chart"><Switch checked={s.showDashboardChart} onCheckedChange={(v) => updateSettings({ showDashboardChart: v })} /></Row>
          <Row label="Reduced motion"><Switch checked={s.reducedMotion} onCheckedChange={(v) => updateSettings({ reducedMotion: v })} /></Row>
          <Row label="Sidebar collapsed by default"><Switch checked={s.sidebarCollapsed} onCheckedChange={(v) => updateSettings({ sidebarCollapsed: v })} /></Row>
        </Card>

        <Card title="Local Data" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Storage" value="Active" tone="success" />
            <Stat label="Knowledge Pages" value={knowledgePageCount} />
            <Stat label="Spaces" value={spaceCount} />
            <Stat label="CMDB" value={data.assets.length} />
            <Stat label="IPAM" value={data.ipam.length} />
            <Stat label="Tasks" value={data.tasks.length} />
            <Stat label="Notes" value={data.notes.length} />
            <Stat label="Trash" value={data.trash.length} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={doExport}><Download className="mr-1.5 h-4 w-4" /> Export JSON</Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload className="mr-1.5 h-4 w-4" /> Import JSON</Button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) previewImport(f); e.target.value = ""; }} />
            <Button variant="secondary" onClick={() => setConfirmReset(true)}><RotateCcw className="mr-1.5 h-4 w-4" /> Reset to defaults</Button>
            <Button variant="destructive" onClick={() => setConfirmClear(true)}><Trash2 className="mr-1.5 h-4 w-4" /> Clear all</Button>
          </div>
        </Card>

        <Card title="Backup Snapshots" className="lg:col-span-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-48 space-y-1.5"><Label className="text-xs text-muted-foreground">Snapshot name</Label><Input value={snapshotName} onChange={(e) => setSnapshotName(e.target.value)} placeholder="Optional name" /></div>
            <Button onClick={createSnapshot}><Plus className="mr-1.5 h-4 w-4" /> Create Snapshot</Button>
          </div>
          <div className="mt-4 space-y-2">
            {data.snapshots.length === 0 && <p className="text-xs text-muted-foreground">No snapshots yet.</p>}
            {data.snapshots.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 p-3">
                <div>
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground">{formatDateTime(s.createdAt)} · {(s.sizeBytes / 1024).toFixed(1)} KB</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => downloadSnapshot(s.id)}><Download className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="secondary" onClick={() => restoreSnapshot(s.id)}><Save className="mr-1.5 h-3.5 w-3.5" /> Restore</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteSnapshot(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <ConfirmDialog open={confirmReset} onOpenChange={setConfirmReset} title="Reset to defaults?" description="All current data will be replaced with the default dataset." destructive confirmLabel="Reset"
        onConfirm={() => { resetDemo(); toast.success("Data restored to defaults"); setConfirmReset(false); }} />
      <ConfirmDialog open={confirmClear} onOpenChange={setConfirmClear} title="Clear all local data?" description="Everything will be removed. This cannot be undone." destructive confirmLabel="Clear"
        onConfirm={() => { clearAll(); toast.success("All data cleared"); setConfirmClear(false); }} />
      <ConfirmDialog
        open={!!importPreview}
        onOpenChange={(o) => !o && setImportPreview(null)}
        title={importPreview?.ok ? "Replace local data with import?" : "Invalid import file"}
        description={importPreview?.ok ? "Review the contents below — your current data will be replaced." : "The selected file does not appear to be a valid backup."}
        destructive={importPreview?.ok}
        confirmLabel={importPreview?.ok ? "Replace data" : "OK"}
        onConfirm={() => importPreview?.ok ? confirmImport() : setImportPreview(null)}
      >
        {importPreview?.ok && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {Object.entries(importPreview.summary).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-2 py-1">
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

function Card({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`glass-card rounded-2xl p-5 ${className ?? ""}`}>
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground"><Database className="h-3.5 w-3.5 text-primary" /> {title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><Label className="text-sm">{label}</Label>{children}</div>;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "success" }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${tone === "success" ? "text-[#52D6A4]" : ""}`}>{value}</div>
    </div>
  );
}
