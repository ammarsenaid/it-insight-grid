import { createFileRoute } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateSettings, useData } from "@/lib/data/store";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · IT Knowledge Center" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const data = useData();
  const s = data.settings;

  return (
    <div>
      <PageHeader title="Settings" description="Configure your personal application preferences." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Appearance">
          <Row label="Compact mode"><Switch checked={s.compactMode} onCheckedChange={(v) => updateSettings({ compactMode: v })} /></Row>
          <Row label="Reduced motion"><Switch checked={s.reducedMotion} onCheckedChange={(v) => updateSettings({ reducedMotion: v })} /></Row>
          <Row label="Sidebar collapsed by default"><Switch checked={s.sidebarCollapsed} onCheckedChange={(v) => updateSettings({ sidebarCollapsed: v })} /></Row>
        </Card>

        <Card title="Notifications">
          <Row label="Show in-app notifications"><Switch checked={s.showNotifications} onCheckedChange={(v) => updateSettings({ showNotifications: v })} /></Row>
        </Card>

        <Card title="Tables and views">
          <Row label="Default page size">
            <Select value={String(s.tablePageSize)} onValueChange={(v) => updateSettings({ tablePageSize: Number(v) })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 20, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </Row>
          <Row label="Default document view">
            <Select value={s.defaultDocView} onValueChange={(v: "table" | "cards") => updateSettings({ defaultDocView: v })}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="table">Table</SelectItem><SelectItem value="cards">Cards</SelectItem></SelectContent>
            </Select>
          </Row>
        </Card>

        <Card title="Dashboard">
          <Row label="Show dashboard chart"><Switch checked={s.showDashboardChart} onCheckedChange={(v) => updateSettings({ showDashboardChart: v })} /></Row>
        </Card>
      </div>
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
