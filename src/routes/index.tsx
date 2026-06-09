import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileText,
  Folder as FolderIcon,
  Server,
  Network,
  CheckSquare,
  StickyNote,
  Trash2,
  Database,
  RefreshCw,
  AlertTriangle,
  Plus,
  Activity,
} from "lucide-react";
import { useMemo } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { Button } from "@/components/common/../ui/button";
import { useData } from "@/lib/data/store";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/components/common/format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · IT Knowledge Center" },
      { name: "description", content: "Central overview of documentation, assets, IP addresses, tasks, notes, and local system activity." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const data = useData();

  const openTasks = data.tasks.filter((t) => t.status !== "done").length;
  const overdueTasks = data.tasks.filter(
    (t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < new Date(),
  );
  const maintenanceAssets = data.assets.filter((a) => a.status === "maintenance");
  const unlinkedIP = data.ipam.filter((i) => i.status === "used" && !i.linkedAssetId);
  const reviewDocs = data.documents.filter((d) => d.status === "review");

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    data.documents.forEach((d) => map.set(d.category, (map.get(d.category) ?? 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [data.documents]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Central overview of documentation, assets, IP addresses, tasks, notes, and local system activity."
        actions={
          <Link to="/documents">
            <Button>
              <Plus className="mr-1.5 h-4 w-4" /> Add Document
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard icon={FileText} label="Documents" value={data.documents.length} sub="In knowledge base" accent="primary" />
        <MetricCard icon={FolderIcon} label="Folders" value={data.folders.length} sub="Organized structure" accent="primary" />
        <MetricCard icon={Server} label="CMDB Assets" value={data.assets.length} sub="Tracked infrastructure" accent="success" />
        <MetricCard icon={Network} label="IP Records" value={data.ipam.length} sub="IPAM entries" accent="success" />
        <MetricCard icon={CheckSquare} label="Open Tasks" value={openTasks} sub={`${overdueTasks.length} overdue`} accent="warning" />
        <MetricCard icon={StickyNote} label="Notes" value={data.notes.length} sub="Quick references" accent="primary" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={Trash2} label="Recycle Bin" value={data.trash.length} sub="Recoverable items" accent="muted" />
        <MetricCard icon={Database} label="Local Snapshots" value={data.snapshots.length} sub="Mock backups" accent="muted" />
        <MetricCard icon={Database} label="Local Storage" value="Active" sub="Browser persistence" accent="success" />
        <MetricCard icon={RefreshCw} label="Last Refresh" value="Just now" sub="Session start" accent="muted" />
      </div>

      <div className="mt-6 glass-card rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickAction to="/documents" icon={FileText} label="Add Document" />
          <QuickAction to="/documents" icon={FolderIcon} label="Create Folder" />
          <QuickAction to="/cmdb" icon={Server} label="Add CMDB Asset" />
          <QuickAction to="/ipam" icon={Network} label="Add IP Address" />
          <QuickAction to="/tasks" icon={CheckSquare} label="Create Task" />
          <QuickAction to="/notes" icon={StickyNote} label="Add Note" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="glass-card rounded-2xl p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Operational Alerts</h2>
            <Badge variant="outline" className="text-[10px]">
              {overdueTasks.length + maintenanceAssets.length + unlinkedIP.length + reviewDocs.length + data.trash.length} signals
            </Badge>
          </div>
          <div className="space-y-2.5">
            {overdueTasks.slice(0, 3).map((t) => (
              <AlertRow
                key={t.id}
                tone="danger"
                title={`Task overdue: ${t.title}`}
                meta={`Due ${new Date(t.dueDate!).toLocaleDateString()}`}
                to="/tasks"
              />
            ))}
            {maintenanceAssets.slice(0, 2).map((a) => (
              <AlertRow
                key={a.id}
                tone="warning"
                title={`${a.hostname} in maintenance`}
                meta={a.displayName}
                to="/cmdb"
              />
            ))}
            {unlinkedIP.slice(0, 2).map((i) => (
              <AlertRow
                key={i.id}
                tone="info"
                title={`Unlinked IP record: ${i.ipAddress}`}
                meta={i.subnet}
                to="/ipam"
              />
            ))}
            {reviewDocs.slice(0, 2).map((d) => (
              <AlertRow
                key={d.id}
                tone="info"
                title={`Document awaiting review: ${d.title}`}
                meta={d.category}
                to="/documents"
              />
            ))}
            {data.trash.length > 0 && (
              <AlertRow
                tone="muted"
                title={`${data.trash.length} items waiting in recycle bin`}
                meta="Review for cleanup"
                to="/trash"
              />
            )}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Activity className="mr-1.5 inline h-3.5 w-3.5" /> Recent Activity
          </h2>
          <ol className="relative space-y-3 border-l border-border/40 pl-4">
            {data.activity.slice(0, 8).map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                <p className="text-xs leading-snug">{a.message}</p>
                <p className="text-[10px] text-muted-foreground">{timeAgo(a.createdAt)}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {data.settings.showDashboardChart && chartData.length > 0 && (
        <div className="mt-6 glass-card rounded-2xl p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Documents by Category
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="#9BAFCA" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9BAFCA" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "#0A1627",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  cursor={{ fill: "rgba(91,140,255,0.08)" }}
                />
                <Bar dataKey="value" fill="#5B8CFF" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: typeof FileText; label: string }) {
  return (
    <Link to={to}>
      <Button variant="secondary" className="rounded-xl">
        <Icon className="mr-1.5 h-4 w-4" /> {label}
      </Button>
    </Link>
  );
}

function AlertRow({ tone, title, meta, to }: { tone: "danger" | "warning" | "info" | "muted"; title: string; meta: string; to: string }) {
  const toneCls = {
    danger: "border-[#FF7C91]/30 bg-[#FF7C91]/5 text-[#FF7C91]",
    warning: "border-[#FFC86B]/30 bg-[#FFC86B]/5 text-[#FFC86B]",
    info: "border-[#5B8CFF]/30 bg-[#5B8CFF]/5 text-[#5B8CFF]",
    muted: "border-border bg-muted/20 text-muted-foreground",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/30 p-3">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${toneCls}`}>
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <Link to={to}>
        <Button size="sm" variant="ghost" className="shrink-0">Open</Button>
      </Link>
    </div>
  );
}
