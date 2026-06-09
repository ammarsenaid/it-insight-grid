import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
} from "lucide-react";
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · IT Knowledge Center" },
      { name: "description", content: "IT operations control center: documentation, service desk, CMDB, IPAM, tasks, notes, SLA health and activity." },
    ],
  }),
  component: Dashboard,
});

// ---------- role helpers ----------

const REQUESTER_ROLES: Role[] = ["employee"];
const READONLY_ROLES: Role[] = ["auditor"];

function isRequester(r: Role) { return REQUESTER_ROLES.includes(r); }
function isReadOnly(r: Role) { return READONLY_ROLES.includes(r); }

// Simulated "me" mapping per role for the prototype.
function meForRole(role: Role) {
  // ticket assignee / task assignee / document owner / requester identity
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
  return { label: "Create", to: "/tickets", show: true }; // admins
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

  const me = meForRole(role);
  const primary = primaryCreateForRole(role);

  const tickets = useMemo(() => data.tickets.map(recomputeSla), [data.tickets]);

  // -------- metric calcs --------
  const openLike = (s: string) => !["resolved", "closed", "cancelled"].includes(s);
  const openTickets = tickets.filter((t) => openLike(t.status));
  const unassigned = openTickets.filter((t) => !t.assignee).length;
  const mineTickets = openTickets.filter((t) => t.assignee === me.agent && me.agent).length;
  const slaWarn = openTickets.filter((t) => t.sla === "warning").length;
  const slaBreach = openTickets.filter((t) => t.sla === "breached").length;
  const slaOk = openTickets.filter((t) => t.sla === "ok").length;
  const resolvedToday = tickets.filter((t) => {
    if (!t.resolvedAt) return false;
    return new Date(t.resolvedAt).toDateString() === new Date().toDateString();
  }).length;

  const openTasks = data.tasks.filter((t) => t.status !== "done").length;
  const overdueTasks = data.tasks.filter(
    (t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < new Date(),
  );
  const maintenanceAssets = data.assets.filter((a) => a.status === "maintenance");
  const unlinkedIP = data.ipam.filter((i) => i.status === "used" && !i.linkedAssetId);
  const reviewDocs = knowledgePages.filter((p) => p.status === "in_review");

  // -------- my work --------
  const myTickets = useMemo(() => {
    if (isReadOnly(role)) return [];
    if (isRequester(role)) return tickets.filter((t) => t.requester.toLowerCase().includes(me.requester));
    if (role === "super_admin" || role === "it_admin")
      return openTickets;
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

  const myOverdue = myTasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date()).length;

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

  // -------- role visibility (per spec section 10) --------
  const showServiceDesk = !isRequester(role) && canSeePage("/tickets", role);
  const showDocMetrics = role !== "employee"; // requester gets simplified view
  const showCmdbIpam = !isRequester(role) && !isReadOnly(role) && canSeePage("/cmdb", role);
  const showMyWork = !isReadOnly(role);
  const showTicketsChart = showServiceDesk;
  const showDocsChart = role !== "employee";
  const showAuditLink = can("audit.view", role);

  // -------- ticket click-through helper --------
  const goTickets = (filter: Parameters<typeof setPendingTicketFilters>[0]) => {
    setPendingTicketFilters(filter);
    navigate({ to: "/tickets" });
  };

  // -------- render --------
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="IT operations control center — documentation, tickets, infrastructure, work and activity in one place."
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

      {/* Documentation / infra metrics */}
      {prefs.docMetrics && showDocMetrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard icon={FileText} label="Knowledge Pages" value={knowledgePages.length} sub="In knowledge base" accent="primary" />
          <MetricCard icon={FolderIcon} label="Spaces" value={spaceCount} sub="Top-level areas" accent="primary" />
          {showCmdbIpam && (
            <>
              <MetricCard icon={Server} label="CMDB Assets" value={data.assets.length} sub="Tracked infrastructure" accent="success" />
              <MetricCard icon={Network} label="IP Records" value={data.ipam.length} sub="IPAM entries" accent="success" />
            </>
          )}
          <MetricCard icon={CheckSquare} label="Open Tasks" value={openTasks} sub={`${overdueTasks.length} overdue`} accent="warning" />
          <MetricCard icon={StickyNote} label="Notes" value={data.notes.length} sub="Quick references" accent="primary" />
        </div>
      )}

      <ProtocolsCompactStrip />

      {/* Service Desk Overview */}
      {prefs.serviceDesk && showServiceDesk && (
        <section className="mt-6">
          <SectionTitle title="Service Desk Overview" caption="Live SLA and queue health" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <ClickMetric icon={Inbox} label="Open Tickets" value={openTickets.length} sub="In the queue" accent="primary" onClick={() => goTickets({ status: "open" })} />
            <ClickMetric icon={AlertTriangle} label="Unassigned" value={unassigned} sub="Need an owner" accent="warning" onClick={() => goTickets({ scope: "unassigned" })} />
            <ClickMetric icon={UserCheck} label="Assigned to Me" value={mineTickets} sub="Your active queue" accent="primary" onClick={() => goTickets({ scope: "mine" })} />
            <ClickMetric icon={AlarmClock} label="SLA Warning" value={slaWarn} sub="At risk soon" accent="warning" onClick={() => goTickets({ sla: "warning" })} />
            <ClickMetric icon={AlertTriangle} label="SLA Breached" value={slaBreach} sub="Past due" accent="danger" onClick={() => goTickets({ sla: "breached" })} />
            <ClickMetric icon={CheckCircle2} label="Resolved Today" value={resolvedToday} sub="Closed in last 24h" accent="success" onClick={() => goTickets({ scope: "resolvedToday" })} />
          </div>
        </section>
      )}

      {/* My Work + Quick Actions row */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {prefs.myWork && showMyWork && (
          <MyWorkWidget
            role={role}
            myTickets={myTickets.length}
            myTasks={myTasks.length}
            waiting={waitingForMe}
            overdue={myOverdue}
            onOpen={() => {
              if (isRequester(role)) navigate({ to: "/my-requests" });
              else navigate({ to: "/tasks" });
            }}
          />
        )}
        {prefs.quickActions && (
          <div className={(prefs.myWork && showMyWork) ? "lg:col-span-2" : "lg:col-span-3"}>
            <QuickActions role={role} onOpenMyWork={() => {
              if (isRequester(role)) navigate({ to: "/my-requests" });
              else navigate({ to: "/tasks" });
            }} />
          </div>
        )}
      </div>

      {/* Alerts + Activity */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {prefs.alerts && (
          <div className="glass-card rounded-2xl p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Operational Alerts</h2>
              <Badge variant="outline" className="text-[10px]">
                {overdueTasks.length + maintenanceAssets.length + unlinkedIP.length + reviewDocs.length + data.trash.length + slaBreach} signals
              </Badge>
            </div>
            <div className="space-y-2.5">
              {slaBreach > 0 && (
                <AlertRow
                  severity="critical"
                  module="Ticket"
                  title={`${slaBreach} ticket${slaBreach > 1 ? "s" : ""} breached SLA`}
                  meta="Immediate action required"
                  cta="Open Tickets"
                  onClick={() => goTickets({ sla: "breached" })}
                />
              )}
              {overdueTasks.slice(0, 3).map((t) => (
                <AlertRow
                  key={t.id}
                  severity="high"
                  module="Task"
                  title={`Task overdue: ${t.title}`}
                  meta={`Due ${new Date(t.dueDate!).toLocaleDateString()}`}
                  cta="Open Task"
                  onClick={() => navigate({ to: "/tasks" })}
                />
              ))}
              {showCmdbIpam && maintenanceAssets.slice(0, 2).map((a) => (
                <AlertRow
                  key={a.id}
                  severity="medium"
                  module="CMDB"
                  title={`${a.hostname} in maintenance`}
                  meta={a.displayName}
                  cta="View Asset"
                  onClick={() => navigate({ to: "/cmdb" })}
                />
              ))}
              {showCmdbIpam && unlinkedIP.slice(0, 2).map((i) => (
                <AlertRow
                  key={i.id}
                  severity="info"
                  module="CMDB"
                  title={`Unlinked IP record: ${i.ipAddress}`}
                  meta={i.subnet}
                  cta="View IPAM"
                  onClick={() => navigate({ to: "/ipam" })}
                />
              ))}
              {reviewDocs.slice(0, 2).map((d) => (
                <AlertRow
                  key={d.id}
                  severity="info"
                  module="Knowledge"
                  title={`Awaiting review: ${d.title}`}
                  meta={d.tags[0] ?? "Knowledge Base"}
                  cta="Review Page"
                  onClick={() => navigate({ to: "/documents" })}
                />
              ))}
              {data.trash.length > 0 && can("recyclebin.restore", role) && (
                <AlertRow
                  severity="info"
                  module="System"
                  title={`${data.trash.length} items in recycle bin`}
                  meta="Review for cleanup"
                  cta="Open Recycle Bin"
                  onClick={() => navigate({ to: "/trash" })}
                />
              )}
              {overdueTasks.length === 0 && slaBreach === 0 && maintenanceAssets.length === 0 && reviewDocs.length === 0 && unlinkedIP.length === 0 && (
                <p className="rounded-xl border border-border/40 bg-background/30 p-4 text-sm text-muted-foreground">
                  All clear — no operational alerts.
                </p>
              )}
            </div>
          </div>
        )}

        {prefs.activity && (
          <div className="glass-card rounded-2xl p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Activity className="mr-1.5 inline h-3.5 w-3.5" /> Recent Activity
            </h2>
            <ol className="relative space-y-3 border-l border-border/40 pl-4">
              {data.activity.slice(0, 8).map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                  <p className="text-sm leading-snug">{a.message}</p>
                  <p className="text-[11px] text-foreground/60" suppressHydrationWarning>{timeAgo(a.createdAt)}</p>
                </li>
              ))}
              {data.activity.length === 0 && (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              )}
            </ol>
            {showAuditLink && (
              <div className="mt-4 border-t border-border/40 pt-3">
                <Link to="/audit" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  View Audit Log <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom analytics: 2-col */}
      {(prefs.docsChart && showDocsChart && docChart.length > 0) || (prefs.ticketsChart && showTicketsChart) ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {prefs.docsChart && showDocsChart && docChart.length > 0 && (
            <ChartCard title="Knowledge Pages by Tag">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={docChart}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" stroke="#9BAFCA" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#9BAFCA" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#0A1627", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 12 }}
                    cursor={{ fill: "rgba(91,140,255,0.08)" }}
                  />
                  <Bar dataKey="value" fill="#5B8CFF" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {prefs.ticketsChart && showTicketsChart && (
            <div className="glass-card flex flex-col rounded-2xl p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tickets by Status</h2>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ticketStatusChart}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
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
              {prefs.slaHealth && (
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/40 pt-3">
                  <SlaStat label="Healthy" value={slaOk} tone="success" />
                  <SlaStat label="Warning" value={slaWarn} tone="warning" />
                  <SlaStat label="Breached" value={slaBreach} tone="danger" />
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Local prototype status row (preserved) */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={Trash2} label="Recycle Bin" value={data.trash.length} sub="Recoverable items" accent="muted" />
        <MetricCard icon={Database} label="Local Snapshots" value={data.snapshots.length} sub="Mock backups" accent="muted" />
        <MetricCard icon={Database} label="Local Storage" value="Active" sub="Browser persistence" accent="success" />
        <MetricCard icon={RefreshCw} label="Last Refresh" value="Just now" sub="Session start" accent="muted" />
      </div>

      <CustomizeDrawer open={customizeOpen} onOpenChange={setCustomizeOpen} prefs={prefs} />
    </div>
  );
}

// ---------- subcomponents ----------

function SectionTitle({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {caption && <p className="text-xs text-muted-foreground/70">{caption}</p>}
      </div>
    </div>
  );
}

function ClickMetric({
  icon, label, value, sub, accent, onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub: string;
  accent: "primary" | "success" | "warning" | "danger" | "muted";
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <MetricCard icon={icon as never} label={label} value={value} sub={sub} accent={accent} />
    </button>
  );
}

function MyWorkWidget({
  role, myTickets, myTasks, waiting, overdue, onOpen,
}: {
  role: Role;
  myTickets: number;
  myTasks: number;
  waiting: number;
  overdue: number;
  onOpen: () => void;
}) {
  const readOnly = isReadOnly(role);
  const requester = isRequester(role);
  return (
    <div className="glass-card flex h-full flex-col rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
            <Briefcase className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-semibold tracking-tight">My Work</h2>
        </div>
        <Badge variant="outline" className="text-[10px] capitalize">
          {requester ? "requester" : readOnly ? "read-only" : "agent"} view
        </Badge>
      </div>
      <dl className="grid flex-1 grid-cols-2 gap-2">
        <Stat label={requester ? "My open requests" : "My open tickets"} value={myTickets} />
        <Stat label={requester ? "Resolved requests" : "My active tasks"} value={myTasks} />
        <Stat label="Waiting for response" value={waiting} tone={waiting > 0 ? "warning" : "default"} />
        <Stat label="Overdue items" value={overdue} tone={overdue > 0 ? "danger" : "default"} />
      </dl>
      <Button size="sm" variant="secondary" className="mt-4 w-full" onClick={onOpen}>
        Open My Work <ChevronRight className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "warning" | "danger" }) {
  const toneCls =
    tone === "danger" ? "text-[#FF7C91]" : tone === "warning" ? "text-[#FFC86B]" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/40 bg-background/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}

function QuickActions({ role, onOpenMyWork }: { role: Role; onOpenMyWork: () => void }) {
  const actions: { to: string; icon: ComponentType<{ className?: string }>; label: string; cap?: string; onClick?: () => void }[] = [
    { to: "/documents", icon: FileText, label: "New Knowledge Page", cap: "documents.create" },
    { to: "/tickets", icon: TicketIcon, label: "New Ticket", cap: "tickets.create" },
    { to: "/service-catalog", icon: ListChecks, label: "Submit Request", cap: "tickets.create" },
    { to: "/cmdb", icon: Server, label: "Add CMDB Asset", cap: "cmdb.write" },
    { to: "/ipam", icon: Network, label: "Add IP Address", cap: "ipam.write" },
    { to: "/tasks", icon: CheckSquare, label: "Create Task", cap: "tasks.write" },
    { to: "/notes", icon: StickyNote, label: "Add Note", cap: "notes.write" },
  ];
  const filtered = actions.filter((a) => !a.cap || can(a.cap, role));
  return (
    <div className="glass-card h-full rounded-2xl p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</h2>
      <div className="flex flex-wrap gap-2">
        {filtered.map((a) => (
          <Link key={a.label} to={a.to}>
            <Button variant="secondary" size="sm" className="rounded-xl">
              <a.icon className="mr-1.5 h-4 w-4" /> {a.label}
            </Button>
          </Link>
        ))}
        {!isReadOnly(role) && (
          <Button variant="secondary" size="sm" className="rounded-xl" onClick={onOpenMyWork}>
            <Briefcase className="mr-1.5 h-4 w-4" /> Open My Work
          </Button>
        )}
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
  const sevLabel = { critical: "Critical", high: "High", medium: "Medium", info: "Info" }[severity];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/30 p-3">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${sevCls}`}>
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={`text-[10px] ${sevCls}`}>{sevLabel}</Badge>
          <Badge variant="outline" className={`text-[10px] ${moduleBadgeTone[module]}`}>{module}</Badge>
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <Button size="sm" variant="ghost" className="shrink-0" onClick={onClick}>{cta}</Button>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="h-56 w-full">{children}</div>
    </div>
  );
}

function SlaStat({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "danger" }) {
  const cls = {
    success: "text-[#52D6A4]",
    warning: "text-[#FFC86B]",
    danger: "text-[#FF7C91]",
  }[tone];
  return (
    <div className="rounded-lg border border-border/40 bg-background/30 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

// ---------- customize drawer ----------

const SECTION_META: { key: DashboardSection; label: string; hint: string }[] = [
  { key: "docMetrics", label: "Knowledge metrics", hint: "Top row of knowledge pages, spaces, tasks and notes." },
  { key: "serviceDesk", label: "Service Desk overview", hint: "Open / unassigned / SLA cards." },
  { key: "myWork", label: "My Work", hint: "Your assigned tickets, tasks, waiting items." },
  { key: "quickActions", label: "Quick Actions", hint: "Create shortcuts for common entities." },
  { key: "alerts", label: "Operational Alerts", hint: "Overdue, breached, maintenance signals." },
  { key: "activity", label: "Recent Activity", hint: "Latest system events." },
  { key: "docsChart", label: "Knowledge Pages by Tag", hint: "Knowledge base distribution chart." },
  { key: "ticketsChart", label: "Tickets by Status", hint: "Queue distribution chart." },
  { key: "slaHealth", label: "SLA Health summary", hint: "Healthy / warning / breached counts." },
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
      <div className="space-y-2">
        {SECTION_META.map((s) => (
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
        <div className="mt-4 rounded-xl border border-border/40 bg-background/30 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5" /> Role-restricted sections are hidden automatically.
        </div>
      </div>
    </DetailsDrawer>
  );
}
