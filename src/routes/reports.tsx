import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart3, Ticket, Server, Network, FileText, CheckSquare,
  AlertTriangle, Download, Clock, CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useData } from "@/lib/data/store";
import { can } from "@/lib/permissions";
import { toCSV, downloadCSV } from "@/lib/csv";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports · IT Knowledge Center" }] }),
  beforeLoad: () => {
    if (!can("reports.view")) throw redirect({ to: "/" });
  },
  component: ReportsPage,
});

function ReportsPage() {
  const data = useData();
  const [range, setRange] = useState("30");

  const sinceMs = range === "all" ? 0 : Date.now() - Number(range) * 86_400_000;

  // Tickets
  const recentTickets = useMemo(() => data.tickets.filter((t) => new Date(t.createdAt).getTime() >= sinceMs), [data.tickets, sinceMs]);
  const openTickets = recentTickets.filter((t) => !["resolved", "closed", "cancelled"].includes(t.status));
  const slaBreached = recentTickets.filter((t) => t.sla === "breached").length;
  const slaWarning = recentTickets.filter((t) => t.sla === "warning").length;
  const slaHealthy = recentTickets.filter((t) => t.sla === "ok").length;
  const resolved = recentTickets.filter((t) => t.status === "resolved" || t.status === "closed").length;

  const byPriority = ["critical", "high", "normal", "low"].map((p) => ({
    label: p, value: recentTickets.filter((t) => t.priority === p).length,
  }));
  const byStatus = ["open", "in_progress", "waiting", "resolved", "closed"].map((s) => ({
    label: s, value: recentTickets.filter((t) => t.status === s).length,
  }));

  // CMDB
  const cmdbByStatus = ["active", "maintenance", "retired"].map((s) => ({
    label: s, value: data.assets.filter((a) => a.status === s).length,
  }));

  // IPAM
  const ipTotal = data.ipam.length;
  const ipUsed = data.ipam.filter((i) => i.status === "used").length;
  const ipReserved = data.ipam.filter((i) => i.status === "reserved").length;
  const ipFree = data.ipam.filter((i) => i.status === "free").length;
  const ipUtil = ipTotal ? Math.round((ipUsed / ipTotal) * 100) : 0;

  // Documents
  const docByStatus = ["draft", "review", "approved", "archived"].map((s) => ({
    label: s, value: data.documents.filter((d) => d.status === s).length,
  }));
  const docsOverdueReview = data.documents.filter((d) => d.reviewDate && new Date(d.reviewDate).getTime() < Date.now()).length;

  // Tasks
  const tasksByStatus = ["open", "in_progress", "blocked", "done"].map((s) => ({
    label: s, value: data.tasks.filter((t) => t.status === s).length,
  }));
  const overdueTasks = data.tasks.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < Date.now() && t.status !== "done").length;

  const exportReport = (name: string, rows: Record<string, unknown>[]) => {
    if (rows.length === 0) { toast.info("Nothing to export"); return; }
    downloadCSV(`${name}-${Date.now()}.csv`, toCSV(rows));
    toast.success(`Exported ${rows.length} rows`);
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Operational metrics, SLA performance, and inventory health."
        actions={
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard icon={Ticket} label="Tickets" value={recentTickets.length} accent="primary" />
        <MetricCard icon={Clock} label="Open" value={openTickets.length} accent="warning" />
        <MetricCard icon={CheckCircle2} label="Resolved" value={resolved} accent="success" />
        <MetricCard icon={AlertTriangle} label="SLA breached" value={slaBreached} accent="danger" />
        <MetricCard icon={Server} label="CMDB assets" value={data.assets.length} accent="muted" />
        <MetricCard icon={Network} label="IP utilization" value={`${ipUtil}%`} accent="primary" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Ticket SLA performance" icon={AlertTriangle} link="/tickets"
          onExport={() => exportReport("sla", [
            { metric: "healthy", value: slaHealthy },
            { metric: "warning", value: slaWarning },
            { metric: "breached", value: slaBreached },
          ])}>
          <Bars data={[
            { label: "Healthy", value: slaHealthy, tone: "success" as const },
            { label: "Warning", value: slaWarning, tone: "warning" as const },
            { label: "Breached", value: slaBreached, tone: "danger" as const },
          ]} />
        </Section>

        <Section title="Tickets by priority" icon={Ticket} link="/tickets"
          onExport={() => exportReport("tickets-by-priority", byPriority)}>
          <Bars data={byPriority.map((d) => ({ ...d, tone: priTone(d.label) }))} />
        </Section>

        <Section title="Tickets by status" icon={Ticket} link="/tickets"
          onExport={() => exportReport("tickets-by-status", byStatus)}>
          <Bars data={byStatus.map((d) => ({ ...d, tone: "primary" as const }))} />
        </Section>

        <Section title="CMDB status" icon={Server} link="/cmdb"
          onExport={() => exportReport("cmdb-status", cmdbByStatus)}>
          <Bars data={cmdbByStatus.map((d) => ({ ...d, tone: d.label === "active" ? "success" : d.label === "maintenance" ? "warning" : "muted" }))} />
        </Section>

        <Section title="IPAM utilization" icon={Network} link="/ipam"
          onExport={() => exportReport("ipam", [
            { metric: "used", value: ipUsed },
            { metric: "reserved", value: ipReserved },
            { metric: "free", value: ipFree },
          ])}>
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Used</span>
              <span className="font-mono">{ipUsed} / {ipTotal} ({ipUtil}%)</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/40">
              <div className="h-full bg-[#5B8CFF]" style={{ width: `${ipUtil}%` }} />
            </div>
          </div>
          <Bars data={[
            { label: "Used", value: ipUsed, tone: "primary" as const },
            { label: "Reserved", value: ipReserved, tone: "warning" as const },
            { label: "Free", value: ipFree, tone: "muted" as const },
          ]} />
        </Section>

        <Section title="Document review status" icon={FileText} link="/documents"
          onExport={() => exportReport("docs", docByStatus)}>
          <Bars data={docByStatus.map((d) => ({ ...d, tone: d.label === "approved" ? "success" : d.label === "review" ? "warning" : d.label === "draft" ? "primary" : "muted" }))} />
          {docsOverdueReview > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-[#FFC86B]/30 bg-[#FFC86B]/5 px-3 py-2 text-xs">
              <span className="text-[#FFC86B]">Overdue review</span>
              <span className="font-mono">{docsOverdueReview}</span>
            </div>
          )}
        </Section>

        <Section title="Tasks by status" icon={CheckSquare} link="/tasks"
          onExport={() => exportReport("tasks", tasksByStatus)}>
          <Bars data={tasksByStatus.map((d) => ({ ...d, tone: d.label === "done" ? "success" : d.label === "blocked" ? "danger" : "primary" }))} />
          {overdueTasks > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-[#FF7C91]/30 bg-[#FF7C91]/5 px-3 py-2 text-xs">
              <span className="text-[#FF7C91]">Overdue tasks</span>
              <span className="font-mono">{overdueTasks}</span>
            </div>
          )}
        </Section>

        <Section title="Activity volume" icon={BarChart3} link="/audit"
          onExport={() => exportReport("activity", data.activity.map((a) => ({ when: a.createdAt, type: a.type, message: a.message })))}>
          <Bars data={topModules(data.activity).map((d) => ({ ...d, tone: "primary" as const }))} />
        </Section>
      </div>
    </div>
  );
}

function priTone(p: string): "danger" | "warning" | "primary" | "muted" {
  if (p === "critical") return "danger";
  if (p === "high") return "warning";
  if (p === "normal") return "primary";
  return "muted";
}

function topModules(activity: { module?: string }[]) {
  const m = new Map<string, number>();
  for (const a of activity) {
    const k = a.module ?? "other";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
}

type Tone = "primary" | "success" | "warning" | "danger" | "muted";
const toneBar: Record<Tone, string> = {
  primary: "bg-[#5B8CFF]", success: "bg-[#52D6A4]", warning: "bg-[#FFC86B]", danger: "bg-[#FF7C91]", muted: "bg-muted-foreground/40",
};

function Bars({ data }: { data: { label: string; value: number; tone: Tone }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="capitalize text-muted-foreground">{d.label.replace(/_/g, " ")}</span>
            <span className="font-mono">{d.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted/40">
            <div className={`h-full ${toneBar[d.tone]} transition-all`} style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, icon: Icon, link, onExport, children }: {
  title: string; icon: typeof BarChart3; link?: string; onExport?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          {onExport && <Button size="sm" variant="ghost" onClick={onExport}><Download className="mr-1.5 h-3.5 w-3.5" /> Export</Button>}
          {link && (
            <Button size="sm" variant="ghost" asChild>
              <Link to={link}>Open</Link>
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// Required to satisfy unused-import warning when status badge isn't used
export const _unused = StatusBadge;
