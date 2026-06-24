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
  RefreshCw,
  BookOpen,
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
import { useRole, can, type Role } from "@/lib/permissions";
import { useAuth } from "@/lib/auth/AuthProvider";
import { canAccessRoute } from "@/lib/auth/effective-access";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cmdbAssetsQuery } from "@/lib/cmdb/queries";
import { ipamAddressesQuery } from "@/lib/ipam/queries";
import { notesQuery } from "@/lib/notes/queries";
import { protocolRunsQuery } from "@/lib/protocols/queries";
import {
  recycleBinDeletedAddressesQuery,
  recycleBinDeletedAssetsQuery,
  recycleBinDeletedNotesQuery,
  recycleBinDeletedTasksQuery,
} from "@/lib/recycle-bin/queries";
import {
  addressesToRecycleBinItems,
  assetsToRecycleBinItems,
  notesToRecycleBinItems,
  tasksToRecycleBinItems,
} from "@/lib/recycle-bin/recycleBin";
import { tasksQuery } from "@/lib/tasks/queries";

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
  if (isRequester(role)) return { label: "Open My Requests", to: "/my-requests", show: true };
  if (role === "doc_editor") return { label: "Open Knowledge Base", to: "/documents", show: true };
  if (role === "helpdesk" || role === "technician" || role === "sd_lead" || role === "network_admin")
    return { label: "New Ticket", to: "/tickets/new", show: true };
  return { label: "New Ticket", to: "/tickets/new", show: true };
}

// ---------- main ----------

function Dashboard() {
  const { tickets: legacyTickets, activity: localActivity } = useData();
  const knowledge = useKnowledge();
  const knowledgePages = useMemo(() => knowledge.nodes.filter((n) => n.type === "page"), [knowledge.nodes]);
  const spaceCount = useMemo(() => knowledge.nodes.filter((n) => n.type === "space").length, [knowledge.nodes]);
  const role = useRole();
  const { effectiveAccess } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prefs = useDashboardPrefs();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const cmdbReadable = can("cmdb.view", role);
  const ipamReadable = can("ipam.view", role);
  const notesReadable = can("notes.view", role);
  const protocolsReadable = can("protocols.view", role);
  const tasksReadable = can("tasks.view", role);
  const recycleBinReadable = can("recyclebin.restore", role);
  const cmdbQuery = useQuery({ ...cmdbAssetsQuery(), enabled: cmdbReadable });
  const ipamQuery = useQuery({ ...ipamAddressesQuery(false), enabled: ipamReadable });
  const notesQueryResult = useQuery({ ...notesQuery(), enabled: notesReadable });
  const protocolRunsQueryResult = useQuery({ ...protocolRunsQuery(), enabled: protocolsReadable });
  const tasksQueryResult = useQuery({ ...tasksQuery(), enabled: tasksReadable });
  const deletedAssetsQuery = useQuery({ ...recycleBinDeletedAssetsQuery(), enabled: recycleBinReadable });
  const deletedAddressesQuery = useQuery({ ...recycleBinDeletedAddressesQuery(), enabled: recycleBinReadable });
  const deletedTasksQuery = useQuery({ ...recycleBinDeletedTasksQuery(), enabled: recycleBinReadable });
  const deletedNotesQuery = useQuery({ ...recycleBinDeletedNotesQuery(), enabled: recycleBinReadable });
  const operationalDataUnavailable = [
    cmdbQuery,
    ipamQuery,
    notesQueryResult,
    protocolRunsQueryResult,
    tasksQueryResult,
    deletedAssetsQuery,
    deletedAddressesQuery,
    deletedTasksQuery,
    deletedNotesQuery,
  ].some((query) => query.isError);
  const operationalDataLoading = [
    cmdbQuery,
    ipamQuery,
    notesQueryResult,
    protocolRunsQueryResult,
    tasksQueryResult,
    deletedAssetsQuery,
    deletedAddressesQuery,
    deletedTasksQuery,
    deletedNotesQuery,
  ].some((query) => query.isLoading || query.isFetching);
  const assets = cmdbQuery.data ?? [];
  const ipamAddresses = ipamQuery.data ?? [];
  const notes = notesQueryResult.data ?? [];
  const protocolRuns = protocolRunsQueryResult.data ?? [];
  const tasks = tasksQueryResult.data ?? [];
  const recycleBinCount = useMemo(() =>
    assetsToRecycleBinItems(deletedAssetsQuery.data ?? []).length
    + addressesToRecycleBinItems(deletedAddressesQuery.data ?? []).length
    + tasksToRecycleBinItems(deletedTasksQuery.data ?? []).length
    + notesToRecycleBinItems(deletedNotesQuery.data ?? []).length,
  [deletedAssetsQuery.data, deletedAddressesQuery.data, deletedTasksQuery.data, deletedNotesQuery.data]);

  const me = meForRole(role);
  const primary = primaryCreateForRole(role);
  const workspaceContext = effectiveAccess?.activeOrganization?.name
    ?? effectiveAccess?.workspaces[0]?.name
    ?? "Workspace context unavailable";

  const tickets = useMemo(() => legacyTickets.map(recomputeSla), [legacyTickets]);

  // -------- ticket calcs --------
  const openLike = (s: string) => !["resolved", "closed", "cancelled"].includes(s);
  const openTickets = tickets.filter((t) => openLike(t.status));
  const unassigned = openTickets.filter((t) => !t.assignee).length;
  const mineTickets = openTickets.filter((t) => t.assignee === me.agent && me.agent).length;
  const slaBreach = openTickets.filter((t) => t.sla === "breached").length;

  // -------- task calcs --------
  const isOverdue = (d?: string | null) => !!d && new Date(d) < new Date();
  const isDueToday = (d?: string | null) => !!d && new Date(d).toDateString() === new Date().toDateString();
  const openTasks = tasks.filter((t) => t.status !== "done");
  const overdueTasks = openTasks.filter((t) => isOverdue(t.dueDate));
  const maintenanceAssets = assets.filter((a) => a.status === "maintenance");
  const unlinkedIP = ipamQuery.isSuccess
    ? ipamAddresses.filter((address) => address.allocationState === "allocated" && !address.linkedAssetId)
    : [];
  const reviewDocs = knowledgePages.filter((p) => p.status === "in_review");

  // -------- protocol calcs --------
  const activeRuns = protocolRuns.filter((r) => r.status === "in_progress").length;
  const awaitingApproval = protocolRuns.filter((r) => r.status === "waiting_approval").length;
  const failedRuns = protocolRuns.filter((r) => r.status === "failed" || r.status === "completed_with_issues").length;
  const overdueRuns = protocolRuns.filter((r) =>
    !!r.dueDate && new Date(r.dueDate) < new Date() && !["completed", "completed_with_issues", "cancelled"].includes(r.status),
  ).length;

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
      return tasks.filter((t) => t.status !== "done");
    return tasks.filter((t) => t.status !== "done" && t.assignedTo === me.taskOwner);
  }, [tasks, role, me]);

  const waitingForMe = useMemo(() => {
    if (isRequester(role)) return tickets.filter((t) => t.status === "waiting" && t.requester.toLowerCase().includes(me.requester)).length;
    return myTickets.filter((t) => t.status === "waiting").length;
  }, [myTickets, tickets, role, me]);

  const dueToday = myTasks.filter((t) => isDueToday(t.dueDate)).length;
  const myProtocolRuns = protocolRuns.filter((r) =>
    !["completed", "completed_with_issues", "cancelled"].includes(r.status)
    && !!r.assignedUser
    && r.assignedUser === me.taskOwner,
  ).length;
  const myWaitingProtocolRuns = protocolRuns.filter((r) =>
    r.status === "waiting_approval" && !!r.assignedUser && r.assignedUser === me.taskOwner,
  ).length;

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
  const showServiceDesk = canAccessRoute(effectiveAccess, "/tickets");
  const showCmdbIpam = canAccessRoute(effectiveAccess, "/cmdb");
  const showIpam = canAccessRoute(effectiveAccess, "/ipam");
  const showTasksRoute = canAccessRoute(effectiveAccess, "/tasks");
  const showProtocolsRoute = canAccessRoute(effectiveAccess, "/protocols");
  const showNotesRoute = canAccessRoute(effectiveAccess, "/notes");
  const showDocumentsRoute = canAccessRoute(effectiveAccess, "/documents");
  const showServiceCatalogRoute = canAccessRoute(effectiveAccess, "/service-catalog");
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
  const refreshDashboard = () => {
    void queryClient.invalidateQueries({ queryKey: ["cmdb"] });
    void queryClient.invalidateQueries({ queryKey: ["ipam"] });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    void queryClient.invalidateQueries({ queryKey: ["protocolRuns"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

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
    onClick: () => navigate({ to: "/tickets" }),
  });
  overdueTasks.forEach((t) => alerts.push({
    id: `task-${t.id}`, severity: "high", module: "Task",
    title: `Task overdue: ${t.title}`,
    meta: `Due ${new Date(t.dueDate!).toLocaleDateString()}`,
    cta: "Open Tasks", onClick: goTasks,
  }));
  if (showCmdbIpam) {
    maintenanceAssets.slice(0, 3).forEach((a) => alerts.push({
      id: `asset-${a.id}`, severity: "medium", module: "CMDB",
      title: `${a.hostname} in maintenance`, meta: a.displayName,
      cta: "Open CMDB", onClick: () => navigate({ to: "/cmdb" }),
    }));
    unlinkedIP.slice(0, 2).forEach((i) => alerts.push({
      id: `ip-${i.id}`, severity: "info", module: "CMDB",
      title: `Unlinked IP record: ${i.ipAddress}`, meta: i.subnet,
      cta: "Open IPAM", onClick: () => navigate({ to: "/ipam" }),
    }));
  }
  if (failedRuns > 0) alerts.push({
    id: "failed-protocol-runs", severity: "critical", module: "System",
    title: `${failedRuns} protocol run${failedRuns > 1 ? "s" : ""} failed or completed with issues`,
    meta: "Review run evidence and remediation steps", cta: "Open Protocols",
    onClick: goProtocols,
  });
  if (overdueRuns > 0) alerts.push({
    id: "overdue-protocol-runs", severity: "high", module: "System",
    title: `${overdueRuns} protocol run${overdueRuns > 1 ? "s are" : " is"} overdue`,
    meta: "Run due date has passed", cta: "Open Protocols",
    onClick: goProtocols,
  });
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
        description="Operational command center for work, urgency, module health, and recent changes."
        status={
          <Badge variant="outline" className={cn(
            "text-[10px]",
            operationalDataUnavailable
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : operationalDataLoading
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-[#52D6A4]/30 bg-[#52D6A4]/10 text-[#52D6A4]",
          )}>
            {operationalDataUnavailable ? "Partial data" : operationalDataLoading ? "Refreshing" : "Operational"}
          </Badge>
        }
        meta={
          <span>
            Context: {workspaceContext} · Role: {role.replaceAll("_", " ")} · Live modules refresh on demand
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshDashboard} disabled={operationalDataLoading}>
              <RefreshCw className={cn("mr-1.5 h-4 w-4", operationalDataLoading && "animate-spin")} /> Refresh
            </Button>
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

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div>
          <p className="font-medium text-amber-100">Mixed data sources</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-100/80">
            Task, protocol, CMDB, IPAM, note, and recycle-bin data is loaded from shared services.
            Ticket, recent-activity, and legacy knowledge widgets are browser-local previews and must
            not be used for operational decisions.
          </p>
        </div>
      </div>

      {operationalDataUnavailable && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm" role="alert">
          <XOctagon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Some operational data is unavailable</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              One or more dashboard sources failed to load. Unavailable metrics are shown as — and
              an empty alert list must not be treated as an all-clear signal.
            </p>
          </div>
        </div>
      )}

      {/* 1) Attention Required */}
      {prefs.attentionRequired && (
        <section>
          <SectionTitle title="Attention Required" caption="Items that may require immediate action." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {showServiceDesk && (
              <CompactMetric icon={XOctagon} label="SLA Breached" value={slaBreach} sub="Browser-local preview" accent="danger" onClick={() => navigate({ to: "/tickets" })} />
            )}
            {showServiceDesk && (
              <CompactMetric icon={AlertTriangle} label="Unassigned Tickets" value={unassigned} sub="Need an owner" accent="warning" onClick={() => goTickets({ scope: "unassigned" })} />
            )}
            <CompactMetric icon={AlarmClock} label="Overdue Tasks" value={tasksQueryResult.isSuccess ? overdueTasks.length : "—"} sub={tasksQueryResult.isError ? "Task data unavailable" : "Past their due date"} accent="danger" onClick={goTasks} />
            <CompactMetric icon={XOctagon} label="Failed Protocol Runs" value={protocolRunsQueryResult.isSuccess ? failedRuns : "—"} sub={protocolRunsQueryResult.isError ? "Protocol data unavailable" : "Need investigation"} accent="danger" onClick={goProtocols} />
            <CompactMetric icon={ShieldCheck} label="Awaiting Approval" value={protocolRunsQueryResult.isSuccess ? awaitingApproval : "—"} sub={protocolRunsQueryResult.isError ? "Protocol data unavailable" : "Protocol runs pending"} accent="warning" onClick={goProtocols} />
          </div>
          {!operationalDataUnavailable && visibleAlerts.length === 0 && (
            <div className="mt-3 rounded-xl border border-[#52D6A4]/25 bg-[#52D6A4]/10 px-4 py-3 text-sm text-muted-foreground">
              No live urgent items are currently wired for Tasks, Protocols, CMDB, IPAM, or Notes. Ticket SLA signals are browser-local previews until the live ticket dashboard contract is added.
            </div>
          )}
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
              protocolRuns={protocolRunsQueryResult.isSuccess ? myProtocolRuns : null}
              pendingApprovals={protocolRunsQueryResult.isSuccess ? myWaitingProtocolRuns : null}
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
            <QuickActions
              role={role}
              routes={{
                tickets: showServiceDesk || canAccessRoute(effectiveAccess, "/my-requests"),
                tasks: showTasksRoute,
                protocols: showProtocolsRoute,
                cmdb: showCmdbIpam,
                ipam: showIpam,
                notes: showNotesRoute,
                documents: showDocumentsRoute,
                catalog: showServiceCatalogRoute,
              }}
            />
          </div>
        )}
      </div>

      {/* 3) Platform Snapshot */}
      {prefs.operationalOverview && (
        <section className="mt-5">
          <SectionTitle title="Platform Snapshot" caption="Module usefulness and integration status at a glance." />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {showServiceDesk && (
              <ModuleSnapshotCard icon={TicketIcon} title="Tickets" to="/tickets" value={openTickets.length} label="open preview tickets" status="Browser-local preview" tone="warning" />
            )}
            {showDocumentsRoute && (
              <ModuleSnapshotCard icon={FileText} title="Knowledge / Documents" to="/documents" value={knowledgePages.length} label="browser-local pages" status="Backend panel available below" tone="warning" />
            )}
            {showTasksRoute && (
              <ModuleSnapshotCard icon={CheckSquare} title="Tasks" to="/tasks" value={tasksQueryResult.isSuccess ? openTasks.length : "—"} label={tasksQueryResult.isError ? "data unavailable" : "active tasks"} status="Live backend" tone={tasksQueryResult.isError ? "danger" : "success"} />
            )}
            {showProtocolsRoute && (
              <ModuleSnapshotCard icon={ListChecks} title="Protocols" to="/protocols" value={protocolRunsQueryResult.isSuccess ? protocolRuns.length : "—"} label={protocolRunsQueryResult.isError ? "data unavailable" : "runs"} status="Live backend" tone={protocolRunsQueryResult.isError ? "danger" : "success"} />
            )}
            {showCmdbIpam && (
              <ModuleSnapshotCard icon={Server} title="CMDB" to="/cmdb" value={cmdbQuery.isSuccess ? assets.length : "—"} label={cmdbQuery.isError ? "data unavailable" : "assets"} status="Live backend" tone={cmdbQuery.isError ? "danger" : "success"} />
            )}
            {showIpam && (
              <ModuleSnapshotCard icon={Network} title="IPAM" to="/ipam" value={ipamQuery.isSuccess ? ipamAddresses.length : "—"} label={ipamQuery.isError ? "data unavailable" : "IP records"} status="Live backend" tone={ipamQuery.isError ? "danger" : "success"} />
            )}
            {showNotesRoute && (
              <ModuleSnapshotCard icon={StickyNote} title="Notes" to="/notes" value={notesQueryResult.isSuccess ? notes.length : "—"} label={notesQueryResult.isError ? "data unavailable" : "notes"} status="Live backend" tone={notesQueryResult.isError ? "danger" : "success"} />
            )}
            {showServiceCatalogRoute && (
              <ModuleSnapshotCard icon={BookOpen} title="Service Catalog" to="/service-catalog" value="Open" label="request catalog" status="Count not wired" tone="muted" />
            )}
          </div>
        </section>
      )}

      {/* 4) Operational Alerts + Recent Activity */}
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
              {visibleAlerts.length === 0 && !operationalDataUnavailable && (
                <p className="rounded-xl border border-border/40 bg-background/30 p-4 text-sm text-muted-foreground">
                  All clear — no operational alerts.
                </p>
              )}
              {visibleAlerts.length === 0 && operationalDataUnavailable && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground">
                  Alert status is unavailable until all operational sources load successfully.
                </p>
              )}
            </div>
            {alerts.length > visibleAlerts.length && showAuditLink && (
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
              <h2 className="text-sm font-semibold tracking-tight">Browser-local Recent Activity</h2>
            </div>
            <ol className="flex-1 divide-y divide-border/40">
              {localActivity.slice(0, 7).map((a) => (
                <li key={a.id} className="py-2 first:pt-0">
                  <p className="text-sm leading-snug">{a.message}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70" suppressHydrationWarning>
                    {timeAgo(a.createdAt)}
                  </p>
                </li>
              ))}
              {localActivity.length === 0 && (
                <p className="rounded-xl border border-border/40 bg-background/30 p-4 text-sm text-muted-foreground">
                  No browser-local activity is available. A live cross-module activity feed is not wired yet.
                </p>
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

      {/* 5) Operational Overview */}
      {prefs.operationalOverview && (
        <section className="mt-5">
          <SectionTitle title="Operational Load" caption="Secondary live metrics across modules." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {showServiceDesk && (
              <CompactMetric icon={Inbox} label="Open Tickets" value={openTickets.length} sub="In the queue" accent="primary" onClick={() => goTickets({ status: "open" })} variant="muted" />
            )}
            <CompactMetric icon={CheckSquare} label="Active Tasks" value={tasksQueryResult.isSuccess ? openTasks.length : "—"} sub={tasksQueryResult.isError ? "Task data unavailable" : "Not yet done"} accent="primary" onClick={goTasks} variant="muted" />
            <CompactMetric icon={PlayCircle} label="Active Protocol Runs" value={protocolRunsQueryResult.isSuccess ? activeRuns : "—"} sub={protocolRunsQueryResult.isError ? "Protocol data unavailable" : "Currently in progress"} accent="primary" onClick={goProtocols} variant="muted" />
            {showCmdbIpam && (
              <CompactMetric icon={Wrench} label="Assets in Maintenance" value={maintenanceAssets.length} sub="Under service" accent="warning" onClick={() => navigate({ to: "/cmdb" })} variant="muted" />
            )}
          </div>
        </section>
      )}

      {/* 6) Tickets by Status chart */}
      {prefs.ticketsChart && showTicketsChart && (
        <section className="mt-5">
          <div className="glass-card rounded-2xl p-5">
            <div className="mb-3">
              <h2 className="text-sm font-semibold tracking-tight">Browser-local Tickets by Status</h2>
              <p className="text-xs text-muted-foreground">Preview data stored in this browser, not the live queue.</p>
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
          <SectionTitle title="Browser-local Knowledge Metrics" caption="Preview content stored in this browser." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard icon={FileText} label="Knowledge Pages" value={knowledgePages.length} sub="In knowledge base" accent="primary" />
            <MetricCard icon={Hash} label="Spaces" value={spaceCount} sub="Top-level areas" accent="primary" />
            <MetricCard icon={StickyNote} label="Notes" value={notesQueryResult.isSuccess ? notes.length : "—"} sub={notesQueryResult.isError ? "Note data unavailable" : "Quick references"} accent="primary" />
            <MetricCard icon={Hourglass} label="In Review" value={reviewDocs.length} sub="Pending publication" accent="warning" />
          </div>
        </section>
      )}

      {/* Optional: Infrastructure metrics row */}
      {prefs.infrastructureMetrics && showCmdbIpam && (
        <section className="mt-5">
          <SectionTitle title="Infrastructure Metrics" caption="CMDB and IPAM footprint." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard icon={Server} label="CMDB Assets" value={cmdbQuery.isSuccess ? assets.length : "—"} sub={cmdbQuery.isError ? "CMDB unavailable" : "Tracked infrastructure"} accent="success" />
            <MetricCard icon={Network} label="IP Records" value={ipamQuery.isSuccess ? ipamAddresses.length : "—"} sub={ipamQuery.isError ? "Shared IPAM unavailable" : ipamQuery.isLoading ? "Loading shared IPAM" : "IPAM entries"} accent="success" />
            <MetricCard icon={Wrench} label="In Maintenance" value={cmdbQuery.isSuccess ? maintenanceAssets.length : "—"} sub={cmdbQuery.isError ? "CMDB unavailable" : "Under service"} accent="warning" />
            <MetricCard icon={AlertTriangle} label="Unlinked IPs" value={ipamQuery.isSuccess ? unlinkedIP.length : "—"} sub={ipamQuery.isError ? "Shared IPAM unavailable" : ipamQuery.isLoading ? "Loading shared IPAM" : "Allocated, no asset"} accent="warning" />
          </div>
        </section>
      )}

      {/* Optional: Knowledge Pages by Tag chart */}
      {prefs.docsChart && docChart.length > 0 && (
        <section className="mt-5">
          <div className="glass-card rounded-2xl p-5">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">Browser-local Knowledge Pages by Tag</h2>
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
      {prefs.recycleBinSummary && recycleBinReadable && recycleBinCount > 0 && (
        <section className="mt-5">
          <div className="glass-card flex items-center justify-between rounded-2xl p-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Recycle Bin</h2>
              <p className="text-xs text-muted-foreground">{recycleBinCount} item{recycleBinCount === 1 ? "" : "s"} recoverable.</p>
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
  role, myTickets, myTasks, waiting, dueToday, protocolRuns, pendingApprovals, onOpen, onOpenTickets, onOpenWaiting, onOpenTasks, onOpenDueToday,
}: {
  role: Role;
  myTickets: number;
  myTasks: number;
  waiting: number;
  dueToday: number;
  protocolRuns: number | null;
  pendingApprovals: number | null;
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
        {!requester && (
          <WorkRow label="My protocol runs" value={protocolRuns ?? "—"} onClick={onOpen} disabled={protocolRuns === null} />
        )}
        {!requester && (
          <WorkRow label="Pending approvals" value={pendingApprovals ?? "—"} tone={(pendingApprovals ?? 0) > 0 ? "warning" : "default"} onClick={onOpen} disabled={pendingApprovals === null} />
        )}
      </div>
      <Button size="sm" variant="secondary" className="mt-4 w-full" onClick={onOpen}>
        Open My Work <ChevronRight className="ml-1 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function WorkRow({
  label, value, tone = "default", onClick, disabled = false,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warning" | "danger";
  onClick: () => void;
  disabled?: boolean;
}) {
  const toneCls =
    tone === "danger" ? "text-[#FF7C91]" : tone === "warning" ? "text-[#FFC86B]" : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-between rounded-xl border border-border/40 bg-background/30 px-3 py-2.5 text-left transition-colors hover:border-white/10 hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className={cn("ml-2 shrink-0 text-lg font-semibold tabular-nums", toneCls)}>{value}</span>
    </button>
  );
}

function QuickActions({
  role,
  routes,
}: {
  role: Role;
  routes: {
    tickets: boolean;
    tasks: boolean;
    protocols: boolean;
    cmdb: boolean;
    ipam: boolean;
    notes: boolean;
    documents: boolean;
    catalog: boolean;
  };
}) {
  const actions: {
    to: string;
    icon: ComponentType<{ className?: string }>;
    label: string;
    cap?: string;
    visible: boolean;
  }[] = [
    { to: "/tickets/new", icon: TicketIcon, label: "Create ticket", cap: "tickets.create", visible: routes.tickets },
    { to: "/tasks", icon: CheckSquare, label: "New task", cap: "tasks.write", visible: routes.tasks },
    { to: "/protocols", icon: ListChecks, label: "New protocol run", cap: "protocols.manage", visible: routes.protocols },
    { to: "/notes", icon: StickyNote, label: "Add note", cap: "notes.write", visible: routes.notes },
    { to: "/cmdb", icon: Server, label: "Add CMDB asset", cap: "cmdb.manage", visible: routes.cmdb },
    { to: "/ipam", icon: Network, label: "Add IP/subnet", cap: "ipam.manage", visible: routes.ipam },
    { to: "/service-catalog", icon: BookOpen, label: "Open catalog", visible: routes.catalog },
    { to: "/documents", icon: FileText, label: "Open knowledge", visible: routes.documents },
  ];
  const filtered = actions.filter((a) => a.visible && (!a.cap || can(a.cap, role)));
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
        {filtered.length === 0 && (
          <p className="col-span-2 rounded-xl border border-border/40 bg-background/30 p-4 text-sm text-muted-foreground">
            No permitted quick actions are available for this role.
          </p>
        )}
      </div>
    </div>
  );
}

function ModuleSnapshotCard({
  icon: Icon, title, to, value, label, status, tone,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  to: string;
  value: number | string;
  label: string;
  status: string;
  tone: "success" | "warning" | "danger" | "muted";
}) {
  const toneCls = {
    success: "border-[#52D6A4]/30 bg-[#52D6A4]/10 text-[#52D6A4]",
    warning: "border-[#FFC86B]/30 bg-[#FFC86B]/10 text-[#FFC86B]",
    danger: "border-[#FF7C91]/30 bg-[#FF7C91]/10 text-[#FF7C91]",
    muted: "border-border bg-muted/30 text-muted-foreground",
  }[tone];
  return (
    <Link
      to={to}
      className="glass-card group rounded-2xl p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-white/10 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", toneCls)}>
              <Icon className="h-4 w-4" />
            </span>
            <h3 className="truncate text-sm font-semibold tracking-tight">{title}</h3>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
            <span className="truncate text-xs text-muted-foreground">{label}</span>
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100" />
      </div>
      <Badge variant="outline" className={cn("mt-3 text-[10px]", toneCls)}>
        {status}
      </Badge>
    </Link>
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
    <div className="flex flex-col gap-3 rounded-xl border border-border/40 bg-background/30 p-2.5 sm:flex-row sm:items-center">
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
      <Button size="sm" variant="ghost" className="self-end shrink-0 sm:self-auto" onClick={onClick}>{cta}</Button>
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
                    <label htmlFor={`dashboard-section-${s.key}`} className="flex items-center gap-1.5 text-sm font-medium">
                      <Hash className="h-3 w-3 text-muted-foreground" /> {s.label}
                    </label>
                    <p className="text-xs text-muted-foreground">{s.hint}</p>
                  </div>
                  <Switch id={`dashboard-section-${s.key}`} checked={prefs[s.key]} onCheckedChange={(v) => setDashboardPref(s.key, !!v)} />
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
