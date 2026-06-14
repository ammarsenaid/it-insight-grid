import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  FileText,
  Server,
  Network,
  CheckSquare,
  StickyNote,
  AlertTriangle,
  Plus,
  Activity,
  Inbox,
  UserCheck,
  AlarmClock,
  CheckCircle2,
  Ticket as TicketIcon,
  Briefcase,
  Settings as SettingsIcon,
  ShieldCheck,
  ListChecks,
  Hash,
  ChevronRight,
  ArrowUpRight,
  XOctagon,
  Hourglass,
  PlayCircle,
  Wrench,
} from "lucide-react";
import { useProtocols as useProtocolsHook } from "@/lib/protocols/store";
import { useMemo, useState, type ComponentType } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data/store";
import { useKnowledge } from "@/lib/knowledge/store";
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
import { useRole, can, canSeePage, type Role } from "@/lib/permissions";
import {
  useDashboardPrefs,
  setDashboardPref,
  resetDashboardPrefs,
  setPendingTicketFilters,
  type DashboardSection,
} from "@/lib/dashboard-prefs";
import { recomputeSla, AGENTS } from "@/lib/data/tickets";
import { DetailsDrawer } from "@/components/common/DetailsDrawer";
import { Switch } from "@/components/ui/switch";
import { BackendKnowledgePanel } from "@/components/knowledge/BackendKnowledgePanel";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ipamAddressesQuery } from "@/lib/ipam/queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · IT Knowledge Center" },
      { name: "description", content: "IT operations control center: what needs attention, what is assigned to you, what is overdue, and what to do next." },
    ],
  }),
  component: Dashboard,
});

// ---------- role helpers ----------

const REQUESTER_ROLES: Role[] = ["employee"];
const READONLY_ROLES: Role[] = ["auditor"];

function isRequester(r: Role) { return REQUESTER_ROLES.includes(r); }
function isReadOnly(r: Role) { return READONLY_ROLES.includes(r); }

function meForRole(role: Role) {
  switch (role) {
    case "super_admin":
    case "it_admin":
      return { agent: AGENTS[0], taskOwner: "alice.it", docOwner: "alice.it", requester: "" };
    case "sd_lead":
    case "helpdesk":
      return { agent: AGENTS[0], taskOwner: "bob.admin", docOwner: "", requester: "" };
    case "technician":
      return { agent: AGENTS[1], taskOwner: "carol.netops", docOwner: "", requester: "" };
    case "network_admin":
      return { agent: AGENTS[2], taskOwner: "carol.netops", docOwner: "", requester: "" };
    case "doc_editor":
      return { agent: "", taskOwner: "alice.it", docOwner: "alice.it", requester: "" };
    case "auditor":
      return { agent: "", taskOwner: "", docOwner: "", requester: "" };
    case "employee":
      return { agent: "", taskOwner: "", docOwner: "", requester: "alice.morgan" };
  }
}

function primaryCreateForRole(role: Role): { label: string; to: string; show: boolean } {
  if (isReadOnly(role)) return { label: "", to: "/", show: false };
  if (isRequester(role)) return { label: "Submit Request", to: "/service-catalog", show: true };
  if (role === "doc_editor") return { label: "New Knowledge Page", to: "/documents", show: true };
  if (role === "helpdesk" || role === "technician" || role === "sd_lead" || role === "network_admin")
    return { label: "New Ticket", to: "/tickets", show: true };
  return { label: "Create", to: "/tickets", show: true };
}

// ---------- main ----------

function Dashboard() {
  const data = useData();
  const knowledge = useKnowledge();
  const knowledgePages = useMemo(() => knowledge.nodes.filter((n) => n.type === "page"), [knowledge.nodes]);
  const spaceCount = useMemo(() => knowledge.nodes.filter((n) => n.type === "space").length, [knowledge.nodes]);
  const role = useRole();
  const navigate = useNavigate();
  const prefs = useDashboardPrefs();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { runs: protocolRuns } = useProtocolsHook();
  const ipamReadable = can("ipam.view", role);
  const ipamQuery = useQuery({ ...ipamAddressesQuery(false), enabled: ipamReadable });
  const ipamAddresses = ipamQuery.data ?? [];

  const me = meForRole(role);
  const primary = primaryCreateForRole(role);

  const tickets = useMemo(() => data.tickets.map(recomputeSla), [data.tickets]);

  // -------- ticket calcs --------
  const openLike = (s: string) => !["resolved", "closed", "cancelled"].includes(s);
  const openTickets = tickets.filter((t) => openLike(t.status));
  const unassigned = openTickets.filter((t) => !t.assignee).length;
  const mineTickets = openTickets.filter((t) => t.assignee === me.agent && me.agent).length;
  const slaBreach = openTickets.filter((t) => t.sla === "breached").length;

  // -------- task calcs --------
  const isOverdue = (d?: string) => !!d && new Date(d) < new Date();
  const isDueToday = (d?: string) => !!d && new Date(d).toDateString() === new Date().toDateString();
  const openTasks = data.tasks.filter((t) => t.status !== "done");
  const overdueTasks = openTasks.filter((t) => isOverdue(t.dueDate));
  const maintenanceAssets = data.assets.filter((a) => a.status === "maintenance");
  const unlinkedIP = ipamQuery.isSuccess
    ? ipamAddresses.filter((address) => address.allocationState === "allocated" && !address.linkedAssetId)
    : [];
  const reviewDocs = knowledgePages.filter((p) => p.status === "in_review");

  // -------- protocol calcs --------
  const activeRuns = protocolRuns.filter((r) => r.status === "in_progress").length;
  const awaitingApproval = protocolRuns.filter((r) => r.status === "waiting_approval").length;
  const failedRuns = protocolRuns.filter((r) => r.status === "failed" || r.status === "completed_with_issues").length;

  // -------- my work --------
  const myTickets = useMemo(() => {
    if (isReadOnly(role)) return [];
    if (isRequester(role)) return tickets.filter((t) => t.requester.toLowerCase().includes(me.requester));
    if (role === "super_admin" || role === "it_admin") return openTickets;
    return openTickets.filter((t) => t.assignee === me.agent);
  }, [tickets, openTickets, role, me]);

  const myTasks = useMemo(() => {
    if (isReadOnly(role) || isRequester(role)) return [];
    if (role === "super_admin" || role === "it_admin")
      return data.tasks.filter((t) => t.status !== "done");
    return data.tasks.filter((t) => t.status !== "done" && t.assignedTo === me.taskOwner);
  }, [data.tasks, role, me]);

  const waitingForMe = useMemo(() => {
    if (isRequester(role)) return tickets.filter((t) => t.status === "waiting" && t.requester.toLowerCase().includes(me.requester)).length;
    return myTickets.filter((t) => t.status === "waiting").length;
  }, [myTickets, tickets, role, me]);

  const dueToday = myTasks.filter((t) => isDueToday(t.dueDate)).length;

  // -------- charts --------
  const docChart = useMemo(() => {
    const map = new Map<string, number>();
    knowledgePages.forEach((p) => {
      const tag = p.tags[0] ?? "General";
      map.set(tag, (map.get(tag) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [knowledgePages]);

  const ticketStatusChart = useMemo(() => {
    const order = ["open", "in_progress", "waiting", "resolved", "closed"] as const;
    const labels: Record<string, string> = {
      open: "Open", in_progress: "In Progress", waiting: "Waiting", resolved: "Resolved", closed: "Closed",
    };
    return order.map((s) => ({ name: labels[s], value: tickets.filter((t) => t.status === s).length }));
  }, [tickets]);

  // -------- role visibility --------
  const showServiceDesk = !isRequester(role) && canSeePage("/tickets", role);
  const showCmdbIpam = !isRequester(role) && !isReadOnly(role) && canSeePage("/cmdb", role);
  const showMyWork = !isReadOnly(role);
  const showTicketsChart = showServiceDesk;
  const showAuditLink = can("audit.view", role);

  // -------- click-through helpers --------
  const goTickets = (filter: Parameters<typeof setPendingTicketFilters>[0]) => {
    setPendingTicketFilters(filter);
    navigate({ to: "/tickets" });
  };
  const goTasks = () => navigate({ to: "/tasks" });
  const goProtocols = () => navigate({ to: "/protocols" });

  // -------- sorted alerts --------
  type Alert = {
    id: string;
    severity: "critical" | "high" | "medium" | "info";
    module: "Ticket" | "Task" | "CMDB" | "Knowledge" | "System";
    title: string;
    meta: string;
    cta: string;
    onClick: () => void;
  };
  const alerts: Alert[] = [];
  if (slaBreach > 0) alerts.push({
    id: "sla-breach", severity: "critical", module: "Ticket",
    title: `${slaBreach} ticket${slaBreach > 1 ? "s" : ""} breached SLA`,
    meta: "Immediate action required", cta: "Open Tickets",
    onClick: () => goTickets({ sla: "breached" }),
  });
  overdueTasks.forEach((t) => alerts.push({
    id: `task-${t.id}`, severity: "high", module: "Task",
    title: `Task overdue: ${t.title}`,
    meta: `Due ${new Date(t.dueDate!).toLocaleDateString()}`,
    cta: "Open Task", onClick: goTasks,
  }));
  if (showCmdbIpam) {
    maintenanceAssets.slice(0, 3).forEach((a) => alerts.push({
      id: `asset-${a.id}`, severity: "medium", module: "CMDB",
      title: `${a.hostname} in maintenance`, meta: a.displayName,
      cta: "View Asset", onClick: () => navigate({ to: "/cmdb" }),
    }));
    unlinkedIP.slice(0, 2).forEach((i) => alerts.push({
      id: `ip-${i.id}`, severity: "info", module: "CMDB",
      title: `Unlinked IP record: ${i.ipAddress}`, meta: i.subnet,
      cta: "View IPAM", onClick: () => navigate({ to: "/ipam" }),
    }));
  }
  reviewDocs.slice(0, 3).forEach((d) => alerts.push({
    id: `doc-${d.id}`, severity: "info", module: "Knowledge",
    title: `Awaiting review: ${d.title}`,
    meta: d.tags[0] ?? "Knowledge Base",
    cta: "Review Page", onClick: () => navigate({ to: "/documents", search: { article: d.id } }),
  }));
  const sevOrder = { critical: 0, high: 1, medium: 2, info: 3 } as const;
  alerts.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  const visibleAlerts = alerts.slice(0, 6);

  // -------- render --------
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="What needs attention, what is assigned to you, what is overdue."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCustomizeOpen(true)}>
              <SettingsIcon className="mr-1.5 h-4 w-4" /> Customize
            </Button>
            {primary.show && (
              <Button size="sm" onClick={() => navigate({ to: primary.to })}>
                <Plus className="mr-1.5 h-4 w-4" /> {primary.label}
              </Button>
            )}
          </div>
        }
      />

      {/* 1) Attention Required */}
      {prefs.attentionRequired && (
        <section>
          <SectionTitle title="Attention Required" caption="Items that may require immediate action." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {showServiceDesk && (
              <CompactMetric icon={XOctagon} label="SLA Breached" value={slaBreach} sub="Past due tickets" accent="danger" onClick={() => goTickets({ sla: "breached" })} />
            )}
            {showServiceDesk && (
              <CompactMetric icon={AlertTriangle} label="Unassigned Tickets" value={unassigned} sub="Need an owner" accent="warning" onClick={() => goTickets({ scope: "unassigned" })} />
            )}
            <CompactMetric icon={AlarmClock} label="Overdue Tasks" value={overdueTasks.length} sub="Past their due date" accent="danger" onClick={goTasks} />
            <CompactMetric icon={XOctagon} label="Failed Protocol Runs" value={failedRuns} sub="Need investigation" accent="danger" onClick={goProtocols} />
            <CompactMetric icon={ShieldCheck} label="Awaiting Approval" value={awaitingApproval} sub="Protocol runs pending" accent="warning" onClick={goProtocols} />
          </div>
        </section>
      )}

      {/* 2) My Work + Quick Actions */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {prefs.myWork && showMyWork && (
          <div className="lg:col-span-2">
            <MyWorkWidget
              role={role}
              myTickets={myTickets.length}
              myTasks={myTasks.length}
              waiting={waitingForMe}
              dueToday={dueToday}
              onOpen={() => {
                if (isRequester(role)) navigate({ to: "/my-requests" });
                else navigate({ to: "/tasks" });
              }}
              onOpenTickets={() => goTickets({ scope: "mine" })}
              onOpenWaiting={() => goTickets({ scope: "waiting" })}
              onOpenTasks={goTasks}
              onOpenDueToday={goTasks}
            />
          </div>
        )}
        {prefs.quickActions && (
          <div className={(prefs.myWork && showMyWork) ? "lg:col-span-1" : "lg:col-span-3"}>
            <QuickActions role={role} />
          </div>
        )}
      </div>

      {/* 3) Operational Alerts + Recent Activity */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-10">
        {prefs.alerts && (
          <div className="glass-card rounded-2xl p-5 lg:col-span-7">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold tracking-tight">Operational Alerts</h2>
                <p className="text-xs text-muted-foreground">Sorted by urgency.</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{alerts.length} signal{alerts.length === 1 ? "" : "s"}</Badge>
            </div>
            <div className="space-y-2">
              {visibleAlerts.map((a) => (
                <AlertRow key={a.id} {...a} />
              ))}
              {visibleAlerts.length === 0 && (
                <p className="rounded-xl border border-border/40 bg-background/30 p-4 text-sm text-muted-foreground">
                  All clear — no operational alerts.
                </p>
              )}
            </div>
            {alerts.length > visibleAlerts.length && (
              <div className="mt-3 border-t border-border/40 pt-3">
                <button
                  type="button"
                  onClick={() => navigate({ to: "/audit" })}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  View all alerts ({alerts.length}) <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {prefs.activity && (
          <div className="glass-card flex flex-col rounded-2xl p-5 lg:col-span-3">
            <div className="mb-3 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">Recent Activity</h2>
            </div>
            <ol className="flex-1 divide-y divide-border/40">
              {data.activity.slice(0, 7).map((a) => (
                <li key={a.id} className="py-2 first:pt-0">
                  <p className="text-sm leading-snug">{a.message}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70" suppressHydrationWarning>
                    {timeAgo(a.createdAt)}
                  </p>
                </li>
              ))}
              {data.activity.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">No recent activity.</p>
              )}
            </ol>
            {showAuditLink && (
              <div className="mt-3 border-t border-border/40 pt-3">
                <Link to="/audit" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  View audit log <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4) Operational Overview */}
      {prefs.operationalOverview && (
        <section className="mt-5">
          <SectionTitle title="Operational Overview" caption="Secondary metrics across modules." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {showServiceDesk && (
              <CompactMetric icon={Inbox} label="Open Tickets" value={openTickets.length} sub="In the queue" accent="primary" onClick={() => goTickets({ status: "open" })} variant="muted" />
            )}
            <CompactMetric icon={CheckSquare} label="Active Tasks" value={openTasks.length} sub="Not yet done" accent="primary" onClick={goTasks} variant="muted" />
            <CompactMetric icon={PlayCircle} label="Active Protocol Runs" value={activeRuns} sub="Currently in progress" accent="primary" onClick={goProtocols} variant="muted" />
            {showCmdbIpam && (
              <CompactMetric icon={Wrench} label="Assets in Maintenance" value={maintenanceAssets.length} sub="Under service" accent="warning" onClick={() => navigate({ to: "/cmdb" })} variant="muted" />
            )}
          </div>
        </section>
      )}

      {/* 5) Tickets by Status chart */}
      {prefs.ticketsChart && showTicketsChart && (
        <section className="mt-5">
          <div className="glass-card rounded-2xl p-5">
            <div className="mb-3">
              <h2 className="text-sm font-semibold tracking-tight">Tickets by Status</h2>
              <p className="text-xs text-muted-foreground">Distribution across the queue.</p>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ticketStatusChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="name" stroke="#9BAFCA" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#9BAFCA" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#0A1627", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 12 }}
                    cursor={{ fill: "rgba(91,140,255,0.08)" }}
                  />
                  <Bar dataKey="value" fill="#5B8CFF" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Optional: Knowledge metrics row */}
      {prefs.knowledgeMetrics && (
        <section className="mt-5">
          <SectionTitle title="Knowledge Metrics" caption="Documentation footprint." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard icon={FileText} label="Knowledge Pages" value={knowledgePages.length} sub="In knowledge base" accent="primary" />
            <MetricCard icon={Hash} label="Spaces" value={spaceCount} sub="Top-level areas" accent="primary" />
            <MetricCard icon={StickyNote} label="Notes" value={data.notes.length} sub="Quick references" accent="primary" />
            <MetricCard icon={Hourglass} label="In Review" value={reviewDocs.length} sub="Pending publication" accent="warning" />
          </div>
        </section>
      )}

      {/* Optional: Infrastructure metrics row */}
      {prefs.infrastructureMetrics && showCmdbIpam && (
        <section className="mt-5">
          <SectionTitle title="Infrastructure Metrics" caption="CMDB and IPAM footprint." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard icon={Server} label="CMDB Assets" value={data.assets.length} sub="Tracked infrastructure" accent="success" />
            <MetricCard icon={Network} label="IP Records" value={ipamQuery.isSuccess ? ipamAddresses.length : "—"} sub={ipamQuery.isError ? "Shared IPAM unavailable" : ipamQuery.isLoading ? "Loading shared IPAM" : "IPAM entries"} accent="success" />
            <MetricCard icon={Wrench} label="In Maintenance" value={maintenanceAssets.length} sub="Under service" accent="warning" />
            <MetricCard icon={AlertTriangle} label="Unlinked IPs" value={ipamQuery.isSuccess ? unlinkedIP.length : "—"} sub={ipamQuery.isError ? "Shared IPAM unavailable" : ipamQuery.isLoading ? "Loading shared IPAM" : "Allocated, no asset"} accent="warning" />
          </div>
        </section>
      )}

      {/* Optional: Knowledge Pages by Tag chart */}
      {prefs.docsChart && docChart.length > 0 && (
        <section className="mt-5">
          <div className="glass-card rounded-2xl p-5">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">Knowledge Pages by Tag</h2>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={docChart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="name" stroke="#9BAFCA" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#9BAFCA" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#0A1627", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 12 }}
                    cursor={{ fill: "rgba(91,140,255,0.08)" }}
                  />
                  <Bar dataKey="value" fill="#52D6A4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Optional: Recently published */}
      {prefs.recentKnowledge && (
        <div className="mt-5">
          <BackendKnowledgePanel />
        </div>
      )}

      {/* Optional: Recycle Bin summary */}
      {prefs.recycleBinSummary && can("recyclebin.restore", role) && data.trash.length > 0 && (
        <section className="mt-5">
          <div className="glass-card flex items-center justify-between rounded-2xl p-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Recycle Bin</h2>
              <p className="text-xs text-muted-foreground">{data.trash.length} item{data.trash.length === 1 ? "" : "s"} recoverable.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate({ to: "/trash" })}>
              Open Recycle Bin
            </Button>
          </div>
        </section>
      )}

      <CustomizeDrawer open={customizeOpen} onOpenChange={setCustomizeOpen} prefs={prefs} />
    </div>
  );
}

// ---------- subcomponents ----------

function SectionTitle({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

function CompactMetric({
  icon: Icon, label, value, sub, accent, onClick, variant = "default",
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub: string;
  accent: "primary" | "success" | "warning" | "danger" | "muted";
  onClick: () => void;
  variant?: "default" | "muted";
}) {
  const accentBg: Record<string, string> = {
    primary: "bg-[#5B8CFF]/15 text-[#5B8CFF]",
    success: "bg-[#52D6A4]/15 text-[#52D6A4]",
    warning: "bg-[#FFC86B]/15 text-[#FFC86B]",
    danger: "bg-[#FF7C91]/15 text-[#FF7C91]",
    muted: "bg-white/5 text-muted-foreground",
  };
  const numCls = variant === "muted" ? "text-xl" : "text-2xl";
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card group relative w-full overflow-hidden rounded-2xl p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-white/10 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${label}: ${value}. ${sub}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={cn("mt-1 font-semibold tabular-nums tracking-tight", numCls)}>{value}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</div>
        </div>
        <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", accentBg[accent])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </button>
  );
}

function MyWorkWidget({
  role, myTickets, myTasks, waiting, dueToday, onOpen, onOpenTickets, onOpenWaiting, onOpenTasks, onOpenDueToday,
}: {
  role: Role;
  myTickets: number;
  myTasks: number;
  waiting: number;
  dueToday: number;
  onOpen: () => void;
  onOpenTickets: () => void;
  onOpenWaiting: () => void;
  onOpenTasks: () => void;
  onOpenDueToday: () => void;
}) {
  const readOnly = isReadOnly(role);
  const requester = isRequester(role);
  return (
    <div className="glass-card flex h-full flex-col rounded-2xl p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <Briefcase className="h-4 w-4" />
            </div>
            <h2 className="truncate text-sm font-semibold tracking-tight">My Work</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Your assigned work and pending actions.</p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
          {requester ? "requester" : readOnly ? "read-only" : "agent"}
        </Badge>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
        <WorkRow label={requester ? "My open requests" : "My open tickets"} value={myTickets} onClick={onOpenTickets} />
        <WorkRow label="My active tasks" value={myTasks} onClick={onOpenTasks} />
        <WorkRow label="Waiting for my response" value={waiting} tone={waiting > 0 ? "warning" : "default"} onClick={onOpenWaiting} />
        <WorkRow label="Due today" value={dueToday} tone={dueToday > 0 ? "warning" : "default"} onClick={onOpenDueToday} />
      </div>
      <Button size="sm" variant="secondary" className="mt-4 w-full" onClick={onOpen}>
        Open My Work <ChevronRight className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function WorkRow({ label, value, tone = "default", onClick }: { label: string; value: number; tone?: "default" | "warning" | "danger"; onClick: () => void }) {
  const toneCls =
    tone === "danger" ? "text-[#FF7C91]" : tone === "warning" ? "text-[#FFC86B]" : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-xl border border-border/40 bg-background/30 px-3 py-2.5 text-left transition-colors hover:border-white/10 hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className={cn("ml-2 shrink-0 text-lg font-semibold tabular-nums", toneCls)}>{value}</span>
    </button>
  );
}

function QuickActions({ role }: { role: Role }) {
  const actions: { to: string; icon: ComponentType<{ className?: string }>; label: string; cap?: string }[] = [
    { to: "/tickets", icon: TicketIcon, label: "New ticket", cap: "tickets.create" },
    { to: "/tasks", icon: CheckSquare, label: "New task", cap: "tasks.write" },
    { to: "/protocols", icon: ListChecks, label: "Run protocol" },
    { to: "/cmdb", icon: Server, label: "Add asset", cap: "cmdb.manage" },
    { to: "/ipam", icon: Network, label: "Add IP record", cap: "ipam.manage" },
    { to: "/documents", icon: FileText, label: "New knowledge page", cap: "documents.create" },
  ];
  const filtered = actions.filter((a) => !a.cap || can(a.cap, role));
  return (
    <div className="glass-card flex h-full flex-col rounded-2xl p-5">
      <div className="mb-3">
        <h2 className="text-sm font-semibold tracking-tight">Quick Actions</h2>
        <p className="text-xs text-muted-foreground">Create or open common records.</p>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2">
        {filtered.map((a) => (
          <Link key={a.label} to={a.to} className="contents">
            <Button
              variant="secondary"
              size="sm"
              className="h-auto w-full justify-start rounded-xl py-2 text-xs"
            >
              <a.icon className="mr-1.5 h-4 w-4" /> <span className="truncate">{a.label}</span>
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}

const moduleBadgeTone: Record<string, string> = {
  Ticket: "border-[#5B8CFF]/30 bg-[#5B8CFF]/10 text-[#5B8CFF]",
  Task: "border-[#FFC86B]/30 bg-[#FFC86B]/10 text-[#FFC86B]",
  CMDB: "border-[#52D6A4]/30 bg-[#52D6A4]/10 text-[#52D6A4]",
  Knowledge: "border-[#A98BFF]/30 bg-[#A98BFF]/10 text-[#A98BFF]",
  System: "border-border bg-muted/40 text-muted-foreground",
};

function AlertRow({
  severity, module, title, meta, cta, onClick,
}: {
  severity: "critical" | "high" | "medium" | "info";
  module: "Ticket" | "Task" | "CMDB" | "Knowledge" | "System";
  title: string;
  meta: string;
  cta: string;
  onClick: () => void;
}) {
  const sevCls = {
    critical: "border-[#FF7C91]/40 bg-[#FF7C91]/10 text-[#FF7C91]",
    high: "border-[#FFC86B]/40 bg-[#FFC86B]/10 text-[#FFC86B]",
    medium: "border-[#5B8CFF]/40 bg-[#5B8CFF]/10 text-[#5B8CFF]",
    info: "border-border bg-muted/30 text-muted-foreground",
  }[severity];
  const sevLabel = { critical: "Critical", high: "Overdue", medium: "Warning", info: "Info" }[severity];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/30 p-2.5">
      <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", sevCls)}>
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("text-[10px]", sevCls)}>{sevLabel}</Badge>
          <Badge variant="outline" className={cn("text-[10px]", moduleBadgeTone[module])}>{module}</Badge>
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <Button size="sm" variant="ghost" className="shrink-0" onClick={onClick}>{cta}</Button>
    </div>
  );
}

// ---------- customize drawer ----------

const SECTION_GROUPS: { title: string; items: { key: DashboardSection; label: string; hint: string }[] }[] = [
  {
    title: "Default sections",
    items: [
      { key: "attentionRequired", label: "Attention Required", hint: "SLA breaches, overdue tasks, failed protocol runs." },
      { key: "myWork", label: "My Work", hint: "Tickets, tasks and waiting items assigned to you." },
      { key: "quickActions", label: "Quick Actions", hint: "Create shortcuts for common entities." },
      { key: "alerts", label: "Operational Alerts", hint: "Sorted by urgency across modules." },
      { key: "activity", label: "Recent Activity", hint: "Latest system events." },
      { key: "operationalOverview", label: "Operational Overview", hint: "Secondary counts across modules." },
      { key: "ticketsChart", label: "Tickets by Status", hint: "Queue distribution chart." },
    ],
  },
  {
    title: "Optional widgets",
    items: [
      { key: "knowledgeMetrics", label: "Knowledge metrics", hint: "Pages, spaces, notes, in-review counts." },
      { key: "infrastructureMetrics", label: "Infrastructure metrics", hint: "CMDB and IPAM counts." },
      { key: "docsChart", label: "Knowledge Pages by Tag", hint: "Knowledge base distribution chart." },
      { key: "recentKnowledge", label: "Recently Published Knowledge", hint: "Latest published backend knowledge." },
      { key: "recycleBinSummary", label: "Recycle Bin Summary", hint: "Recoverable items overview." },
    ],
  },
];

function CustomizeDrawer({
  open, onOpenChange, prefs,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefs: ReturnType<typeof useDashboardPrefs>;
}) {
  return (
    <DetailsDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Customize dashboard"
      description="Show or hide sections. Saved locally in your browser."
      footer={
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={resetDashboardPrefs}>Reset to defaults</Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      }
    >
      <div className="space-y-5">
        {SECTION_GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</h3>
            <div className="space-y-2">
              {g.items.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/30 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Hash className="h-3 w-3 text-muted-foreground" /> {s.label}
                    </div>
                    <p className="text-xs text-muted-foreground">{s.hint}</p>
                  </div>
                  <Switch checked={prefs[s.key]} onCheckedChange={(v) => setDashboardPref(s.key, !!v)} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-border/40 bg-background/30 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> Role-restricted sections are hidden automatically.
        </div>
      </div>
    </DetailsDrawer>
  );
}
