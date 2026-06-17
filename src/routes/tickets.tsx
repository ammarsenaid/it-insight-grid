import { Outlet, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ticket as TicketIcon,
  Inbox,
  UserCheck,
  PlayCircle,
  PauseCircle,
  AlertTriangle,
  CheckCircle2,
  Plus,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Tag,
  Users as UsersIcon,
  ArrowUpDown,
  Eye,
  X,
  AlertCircle,
  Lock,
  Monitor as MonitorIcon,
  AppWindow,
  KeyRound as KeyRoundIcon,
  Wifi,
  Printer,
  Mail,
  ShieldCheck as ShieldCheckIcon,
  HelpCircle,
} from "lucide-react";

import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { FilterBar } from "@/components/common/FilterBar";
import { FormDrawer } from "@/components/common/FormDrawer";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { timeAgo } from "@/components/common/format";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useRole, can } from "@/lib/permissions";
import {
  profilesQuery,
  sdKeys,
  ticketsQuery,
} from "@/lib/service-desk/queries";
import {
  createTicket,
  updateTicket,
  type CreateTicketInput,
} from "@/lib/service-desk/tickets";
import { nameOf, profileMap } from "@/lib/service-desk/profiles";
import type {
  Ticket,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "@/lib/service-desk/types";

export const Route = createFileRoute("/tickets")({
  head: () => ({ meta: [{ title: "Tickets · IT Knowledge Center" }] }),
  component: TicketsLayout,
});

function TicketsLayout() {
  return <Outlet />;
}

const PRIORITY_TONE: Record<TicketPriority, "muted" | "info" | "warning" | "danger"> = {
  low: "muted",
  normal: "info",
  high: "warning",
  critical: "danger",
};
const STATUS_TONE: Record<TicketStatus, "info" | "warning" | "success" | "muted" | "danger" | "default"> = {
  open: "info",
  in_progress: "warning",
  on_hold: "muted",
  resolved: "success",
  closed: "muted",
  reopened: "danger",
};

const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "on_hold", "resolved", "closed", "reopened"];
const TICKET_PRIORITIES: TicketPriority[] = ["low", "normal", "high", "critical"];
const TICKET_TYPES: TicketType[] = ["request", "incident", "problem", "change"];
const TICKET_SOURCES = ["portal", "service_catalog", "email", "api"] as const;
// Free-form on the server; we present a curated list for filtering / creation.
const SUGGESTED_CATEGORIES = [
  "Hardware",
  "Software",
  "Account & Access",
  "Network",
  "Printer",
  "Email",
  "Security",
  "Other",
];
const CATEGORY_META: Record<string, { description: string; icon: React.ComponentType<{ className?: string }> }> = {
  Hardware: { description: "Laptop, monitor, peripherals", icon: MonitorIcon },
  Software: { description: "Install or fix an app", icon: AppWindow },
  "Account & Access": { description: "Login, password, permissions", icon: KeyRoundIcon },
  Network: { description: "Wi-Fi, VPN, connectivity", icon: Wifi },
  Printer: { description: "Printing or scanning", icon: Printer },
  Email: { description: "Mailbox, calendar, delivery", icon: Mail },
  Security: { description: "Suspicious activity, phishing", icon: ShieldCheckIcon },
  Other: { description: "Something else", icon: HelpCircle },
};

const SUGGESTED_TEAMS = ["Service Desk", "Field Ops", "Network", "Infrastructure"];

type SortKey = "ticketNumber" | "subject" | "priority" | "status" | "createdAt" | "updatedAt";

export function TicketsPage() {
  const { session, loading: authLoading } = useAuth();
  const role = useRole();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const userId = session?.user?.id ?? "";
  const canViewQueue = can("tickets.viewQueue", role);
  const enabled = Boolean(userId) && canViewQueue;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    ...ticketsQuery(),
    enabled,
  });
  const tickets = data ?? [];

  const { data: profiles = [] } = useQuery({ ...profilesQuery(), enabled });
  const pmap = useMemo(() => profileMap(profiles), [profiles]);

  const openTicket = (id: string) => navigate({ to: "/tickets/$id", params: { id } });
  const shouldIgnoreRowNavigation = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("a,button,input,[role='menuitem'],[data-radix-dropdown-menu-content]"));
  };

  const [query, setQuery] = useState("");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fPriority, setFPriority] = useState<string>("all");
  const [fType, setFType] = useState<string>("all");
  const [fTeam, setFTeam] = useState<string>("all");
  const [fAssignee, setFAssignee] = useState<string>("all");
  const [fCategory, setFCategory] = useState<string>("all");
  const [fSource, setFSource] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const [showMoreMetrics, setShowMoreMetrics] = useState(false);

  const resetFilters = () => {
    setQuery(""); setFStatus("all"); setFPriority("all"); setFType("all"); setFTeam("all");
    setFAssignee("all"); setFCategory("all"); setFSource("all"); setPage(1);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: sdKeys.tickets() });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateTicket>[1] }) =>
      updateTicket(id, patch),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const bulkUpdate = async (
    ids: string[],
    patch: Parameters<typeof updateTicket>[1],
    successMsg: string,
  ) => {
    try {
      await Promise.all(ids.map((id) => updateTicket(id, patch)));
      invalidate();
      toast.success(successMsg);
      clearSelection();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    }
  };

  const bulkAddTag = async (ids: string[], tag: string) => {
    try {
      await Promise.all(
        ids.map((id) => {
          const t = tickets.find((x) => x.id === id);
          if (!t) return Promise.resolve();
          if (t.tags.includes(tag)) return Promise.resolve();
          return updateTicket(id, { tags: [...t.tags, tag] });
        }),
      );
      invalidate();
      toast.success(`Tag added to ${ids.length} ticket(s)`);
      clearSelection();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tag failed");
    }
  };

  const filtered = useMemo(() => {
    let list = tickets.slice();
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((t) =>
        t.ticketNumber.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.category ?? "").toLowerCase().includes(q) ||
        nameOf(t.requesterId, pmap).toLowerCase().includes(q) ||
        nameOf(t.assigneeId, pmap).toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    if (fStatus !== "all") list = list.filter((t) => t.status === fStatus);
    if (fPriority !== "all") list = list.filter((t) => t.priority === fPriority);
    if (fType !== "all") list = list.filter((t) => t.type === fType);
    if (fTeam !== "all") list = list.filter((t) =>
      fTeam === "unassigned" ? !t.assignedTeam : t.assignedTeam === fTeam,
    );
    if (fAssignee !== "all") list = list.filter((t) =>
      fAssignee === "unassigned" ? !t.assigneeId : t.assigneeId === fAssignee,
    );
    if (fCategory !== "all") list = list.filter((t) => (t.category ?? "") === fCategory);
    if (fSource !== "all") list = list.filter((t) => t.source === fSource);
    list.sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [tickets, pmap, query, fStatus, fPriority, fType, fTeam, fAssignee, fCategory, fSource, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const metrics = useMemo(() => {
    const openLike = (t: Ticket) => !["resolved", "closed"].includes(t.status);
    const open = tickets.filter(openLike).length;
    const unassigned = tickets.filter((t) => openLike(t) && !t.assigneeId).length;
    const mine = tickets.filter((t) => openLike(t) && t.assigneeId === userId).length;
    const inProgress = tickets.filter((t) => t.status === "in_progress").length;
    const onHold = tickets.filter((t) => t.status === "on_hold").length;
    const reopened = tickets.filter((t) => t.status === "reopened").length;
    const resolvedToday = tickets.filter((t) => {
      if (!t.resolvedAt) return false;
      return new Date(t.resolvedAt).toDateString() === new Date().toDateString();
    }).length;
    return { open, unassigned, mine, inProgress, onHold, reopened, resolvedToday };
  }, [tickets, userId]);

  const allOnPageSelected = pageItems.length > 0 && pageItems.every((t) => selected.has(t.id));
  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageItems.forEach((t) => next.delete(t.id));
      else pageItems.forEach((t) => next.add(t.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const selectedIds = Array.from(selected);

  const canAssign = can("tickets.assign", role);
  const canResolve = can("tickets.resolve", role);
  const canWrite = canAssign || canResolve;
  const canCreate = can("tickets.create", role);

  const activeFilters = useMemo(() => {
    const list: { key: string; label: string; clear: () => void }[] = [];
    if (query.trim()) list.push({ key: "q", label: `Search: ${query}`, clear: () => setQuery("") });
    if (fStatus !== "all") list.push({ key: "status", label: `Status: ${labelStatus(fStatus as TicketStatus)}`, clear: () => setFStatus("all") });
    if (fPriority !== "all") list.push({ key: "priority", label: `Priority: ${cap(fPriority)}`, clear: () => setFPriority("all") });
    if (fType !== "all") list.push({ key: "type", label: `Type: ${cap(fType)}`, clear: () => setFType("all") });
    if (fTeam !== "all") list.push({ key: "team", label: `Team: ${fTeam === "unassigned" ? "Unassigned" : fTeam}`, clear: () => setFTeam("all") });
    if (fAssignee !== "all") list.push({ key: "assignee", label: `Assignee: ${fAssignee === "unassigned" ? "Unassigned" : nameOf(fAssignee, pmap)}`, clear: () => setFAssignee("all") });
    if (fCategory !== "all") list.push({ key: "category", label: `Category: ${fCategory}`, clear: () => setFCategory("all") });
    if (fSource !== "all") list.push({ key: "source", label: `Source: ${cap(fSource)}`, clear: () => setFSource("all") });
    return list;
  }, [query, fStatus, fPriority, fType, fTeam, fAssignee, fCategory, fSource, pmap]);

  if (authLoading) return <div className="glass-card rounded-2xl p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!session) {
    return (
      <EmptyState
        icon={Inbox}
        title="Sign in required"
        description="Sign in to view the ticket queue."
        actionLabel="Sign in"
        onAction={() => window.location.assign("/auth")}
      />
    );
  }
  if (!canViewQueue) {
    return (
      <div>
        <PageHeader title="Tickets" description="Track, triage and resolve service requests." />
        <EmptyState icon={Lock} title="Access restricted" description="Your role cannot view the ticket queue." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Track, triage and resolve service requests."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label="Reload tickets">
                    <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reload tickets</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button onClick={() => setCreateOpen(true)} disabled={!canCreate} title={canCreate ? undefined : "Your role cannot create tickets"}>
              <Plus className="mr-1.5 h-4 w-4" /> New ticket
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="glass-card rounded-2xl p-6 text-sm text-muted-foreground">Loading tickets…</div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Could not load tickets"
          description={error instanceof Error ? error.message : "Unexpected error."}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <MetricButton icon={Inbox} label="Open" value={metrics.open} accent="primary" onClick={() => { resetFilters(); setFStatus("open"); }} />
            <MetricButton icon={AlertTriangle} label="Unassigned" value={metrics.unassigned} accent="warning" onClick={() => { resetFilters(); setFAssignee("unassigned"); }} />
            <MetricButton icon={UserCheck} label="Assigned to me" value={metrics.mine} accent="primary" onClick={() => { resetFilters(); if (userId) setFAssignee(userId); }} />
            <MetricButton icon={PlayCircle} label="In progress" value={metrics.inProgress} accent="primary" onClick={() => { resetFilters(); setFStatus("in_progress"); }} />
            <MetricButton icon={PauseCircle} label="On hold" value={metrics.onHold} accent="muted" onClick={() => { resetFilters(); setFStatus("on_hold"); }} />
          </div>
          {showMoreMetrics && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <MetricButton icon={AlertTriangle} label="Reopened" value={metrics.reopened} accent="danger" onClick={() => { resetFilters(); setFStatus("reopened"); }} />
              <MetricButton icon={CheckCircle2} label="Resolved today" value={metrics.resolvedToday} accent="success" onClick={() => { resetFilters(); setFStatus("resolved"); }} />
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setShowMoreMetrics((v) => !v)}>
              {showMoreMetrics ? <><ChevronUp className="mr-1 h-3 w-3" /> Show fewer metrics</> : <><ChevronDown className="mr-1 h-3 w-3" /> Show more metrics</>}
            </Button>
          </div>

          <div className="mt-6">
            <FilterBar query={query} onQueryChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search by number, subject, requester, tag…" onReset={resetFilters}>
              <SelectFilter value={fStatus} onChange={setFStatus} placeholder="Status" options={[{ value: "all", label: "All status" }, ...TICKET_STATUSES.map((s) => ({ value: s, label: labelStatus(s) }))]} />
              <SelectFilter value={fPriority} onChange={setFPriority} placeholder="Priority" options={[{ value: "all", label: "All priority" }, ...TICKET_PRIORITIES.map((p) => ({ value: p, label: cap(p) }))]} />
              <SelectFilter value={fType} onChange={setFType} placeholder="Type" options={[{ value: "all", label: "All types" }, ...TICKET_TYPES.map((t) => ({ value: t, label: cap(t) }))]} />
              <SelectFilter value={fTeam} onChange={setFTeam} placeholder="Team" options={[{ value: "all", label: "All teams" }, { value: "unassigned", label: "Unassigned" }, ...SUGGESTED_TEAMS.map((t) => ({ value: t, label: t }))]} />
              <SelectFilter value={fAssignee} onChange={setFAssignee} placeholder="Assignee" options={[{ value: "all", label: "All assignees" }, { value: "unassigned", label: "Unassigned" }, ...profiles.map((p) => ({ value: p.id, label: p.displayName }))]} />
              <SelectFilter value={fCategory} onChange={setFCategory} placeholder="Category" options={[{ value: "all", label: "All categories" }, ...SUGGESTED_CATEGORIES.map((c) => ({ value: c, label: c }))]} />
              <SelectFilter value={fSource} onChange={setFSource} placeholder="Source" options={[{ value: "all", label: "All Sources" }, ...TICKET_SOURCES.map((s) => ({ value: s, label: cap(s) }))]} />
            </FilterBar>

            {activeFilters.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Active filters</span>
                {activeFilters.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => { f.clear(); setPage(1); }}
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2.5 py-0.5 text-[11px] text-foreground/80 hover:bg-white/[0.04] hover:text-foreground"
                  >
                    {f.label}
                    <X className="h-3 w-3" />
                  </button>
                ))}
                <button onClick={resetFilters} className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  Clear all
                </button>
              </div>
            )}

            {selected.size > 0 && canWrite && (
              <div className="glass-card mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3">
                <div className="text-xs">
                  <span className="font-semibold">{selected.size}</span>
                  <span className="text-muted-foreground"> selected</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canAssign && (
                    <BulkAssignMenu
                      profiles={profiles}
                      onAssign={(id, label) => bulkUpdate(selectedIds, { assigneeId: id }, `Assigned ${selectedIds.length} ticket(s) to ${label}`)}
                    />
                  )}
                  {canResolve && <BulkStatusMenu onChange={(s) => bulkUpdate(selectedIds, { status: s }, `Status updated to ${labelStatus(s)}`)} />}
                  <BulkPriorityMenu onChange={(p) => bulkUpdate(selectedIds, { priority: p }, `Priority set to ${cap(p)}`)} />
                  {canAssign && <BulkTeamMenu onChange={(t) => bulkUpdate(selectedIds, { assignedTeam: t || null }, `Team set to ${t || "Unassigned"}`)} />}
                  <Button size="sm" variant="secondary" onClick={() => setTagOpen(true)}>
                    <Tag className="mr-1 h-3.5 w-3.5" /> Add tag
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
                </div>
              </div>
            )}

            {filtered.length === 0 ? (
              tickets.length === 0 ? (
                <EmptyState
                  icon={TicketIcon}
                  title="No tickets yet"
                  description="Create the first request to start tracking service work."
                  actionLabel={canCreate ? "Create ticket" : undefined}
                  onAction={canCreate ? () => setCreateOpen(true) : undefined}
                />
              ) : (
                <EmptyState
                  icon={Eye}
                  title="No tickets found"
                  description="No tickets match the current filters."
                  actionLabel="Clear filters"
                  onAction={resetFilters}
                />
              )
            ) : (
              <div className="glass-card overflow-hidden rounded-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        {canWrite && (
                          <th className={cellHead(density, "w-8")}>
                            <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAllOnPage} aria-label="Select all on page" />
                          </th>
                        )}
                        <ThSort label="Number" col="ticketNumber" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                        <ThSort label="Subject" col="subject" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                        <th className={cellHead(density)}>Requester</th>
                        <th className={cellHead(density)}>Category</th>
                        <ThSort label="Priority" col="priority" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                        <ThSort label="Status" col="status" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                        <th className={cellHead(density)}>Assignee</th>
                        <th className={cellHead(density)}>Team</th>
                        <ThSort label="Created" col="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                        <ThSort label="Updated" col="updatedAt" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                        <th className={cellHead(density, "w-10")}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((t) => (
                        <tr
                          key={t.id}
                          onClick={(e) => {
                            if (e.defaultPrevented || shouldIgnoreRowNavigation(e.target)) return;
                            openTicket(t.id);
                          }}
                          onKeyDown={(e) => {
                            if ((e.key !== "Enter" && e.key !== " ") || shouldIgnoreRowNavigation(e.target)) return;
                            e.preventDefault();
                            openTicket(t.id);
                          }}
                          tabIndex={0}
                          role="link"
                          aria-label={`Open ${t.ticketNumber} ${t.subject}`}
                          className="cursor-pointer border-t border-border/40 outline-none transition-colors hover:bg-white/[0.02] focus-visible:bg-white/[0.02] focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {canWrite && (
                            <td className={cellBody(density)} onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} aria-label={`Select ${t.ticketNumber}`} />
                            </td>
                          )}
                          <td className={cellBody(density, "font-mono text-[11px] text-primary")}><Link to="/tickets/$id" params={{ id: t.id }} className="hover:underline">{t.ticketNumber}</Link></td>
                          <td className={cellBody(density, "max-w-[280px]")}>
                            <div className="flex items-center gap-1.5">
                              <Link to="/tickets/$id" params={{ id: t.id }} className="block truncate font-medium hover:underline">{t.subject}</Link>
                              <StatusBadge label={cap(t.source)} tone="muted" />
                            </div>
                            {t.tags.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {t.tags.slice(0, 3).map((tag) => (
                                  <span key={tag} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className={cellBody(density, "text-muted-foreground")}>{nameOf(t.requesterId, pmap)}</td>
                          <td className={cellBody(density, "text-muted-foreground")}>{t.category ?? "—"}{t.subcategory && <span className="text-muted-foreground/60"> / {t.subcategory}</span>}</td>
                          <td className={cellBody(density)}><StatusBadge label={cap(t.priority)} tone={PRIORITY_TONE[t.priority]} /></td>
                          <td className={cellBody(density)}><StatusBadge label={labelStatus(t.status)} tone={STATUS_TONE[t.status]} /></td>
                          <td className={cellBody(density, "text-muted-foreground")}>{t.assigneeId ? nameOf(t.assigneeId, pmap) : <span className="italic text-[#FFC86B]">Unassigned</span>}</td>
                          <td className={cellBody(density, "text-muted-foreground")}>{t.assignedTeam ?? "—"}</td>
                          <td className={cellBody(density, "text-muted-foreground")} suppressHydrationWarning>{timeAgo(t.createdAt)}</td>
                          <td className={cellBody(density, "text-muted-foreground")} suppressHydrationWarning>{timeAgo(t.updatedAt)}</td>
                          <td className={cellBody(density)} onClick={(e) => e.stopPropagation()}>
                            <RowActions
                              ticket={t}
                              canAssign={canAssign}
                              canResolve={canResolve}
                              profiles={profiles}
                              onUpdate={(patch) => updateMutation.mutate({ id: t.id, patch })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span>{filtered.length} ticket{filtered.length === 1 ? "" : "s"}</span>
                    <span>·</span>
                    <label className="flex items-center gap-1.5">
                      Density
                      <Select value={density} onValueChange={(v) => setDensity(v as "comfortable" | "compact")}>
                        <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="comfortable">Comfortable</SelectItem>
                          <SelectItem value="compact">Compact</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="flex items-center gap-1.5">
                      Rows
                      <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                        <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}>Previous</Button>
                    <span>Page {pageSafe} / {totalPages}</span>
                    <Button size="sm" variant="ghost" disabled={pageSafe >= totalPages} onClick={() => setPage(pageSafe + 1)}>Next</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <CreateTicketDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        userId={userId}
        onCreated={() => {
          invalidate();
          qc.invalidateQueries({ queryKey: sdKeys.ticketsMine(userId) });
          setCreateOpen(false);
        }}
      />

      <FormDrawer
        open={tagOpen}
        onOpenChange={setTagOpen}
        title="Add tag to selected tickets"
        submitLabel="Add tag"
        onSubmit={() => {
          const v = tagValue.trim().toLowerCase();
          if (!v) { toast.error("Enter a tag value"); return; }
          bulkAddTag(selectedIds, v);
          setTagValue("");
          setTagOpen(false);
        }}
      >
        <div className="space-y-2">
          <Label>Tag</Label>
          <Input value={tagValue} onChange={(e) => setTagValue(e.target.value)} placeholder="e.g. urgent" />
          <p className="text-xs text-muted-foreground">Tags help group tickets across categories.</p>
        </div>
      </FormDrawer>
    </div>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " "); }
function labelStatus(s: TicketStatus) { return s === "in_progress" ? "In progress" : cap(s); }

function cellHead(d: "comfortable" | "compact", extra = "") {
  return `${d === "compact" ? "px-2 py-1.5" : "px-3 py-2.5"} text-left font-medium ${extra}`;
}
function cellBody(d: "comfortable" | "compact", extra = "") {
  return `${d === "compact" ? "px-2 py-1.5" : "px-3 py-2.5"} align-middle ${extra}`;
}

function ThSort({
  label, col, sortKey, sortDir, onSort, density,
}: { label: string; col: SortKey; sortKey: SortKey; sortDir: "asc" | "desc"; onSort: (c: SortKey) => void; density: "comfortable" | "compact" }) {
  const active = sortKey === col;
  return (
    <th className={cellHead(density)}>
      <button onClick={() => onSort(col)} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}>
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
        {active && <span className="text-[9px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function SelectFilter({
  value, onChange, placeholder, options,
}: { value: string; onChange: (v: string) => void; placeholder: string; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function MetricButton({ icon, label, value, accent, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent: "primary" | "success" | "warning" | "danger" | "muted"; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">
      <MetricCard icon={icon as never} label={label} value={value} accent={accent} />
    </button>
  );
}

function BulkAssignMenu({
  onAssign, disabled, profiles,
}: { onAssign: (id: string | null, label: string) => void; disabled?: boolean; profiles: { id: string; displayName: string }[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" disabled={disabled}><UserCheck className="mr-1 h-3.5 w-3.5" /> Assign</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 overflow-y-auto">
        <DropdownMenuItem onClick={() => onAssign(null, "Unassigned")}>Unassigned</DropdownMenuItem>
        <DropdownMenuSeparator />
        {profiles.map((p) => <DropdownMenuItem key={p.id} onClick={() => onAssign(p.id, p.displayName)}>{p.displayName}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function BulkStatusMenu({ onChange, disabled }: { onChange: (s: TicketStatus) => void; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" disabled={disabled}><PlayCircle className="mr-1 h-3.5 w-3.5" /> Status</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {TICKET_STATUSES.map((s) => <DropdownMenuItem key={s} onClick={() => onChange(s)}>{labelStatus(s)}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function BulkPriorityMenu({ onChange, disabled }: { onChange: (p: TicketPriority) => void; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" disabled={disabled}><AlertTriangle className="mr-1 h-3.5 w-3.5" /> Priority</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {TICKET_PRIORITIES.map((p) => <DropdownMenuItem key={p} onClick={() => onChange(p)}>{cap(p)}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function BulkTeamMenu({ onChange, disabled }: { onChange: (t: string) => void; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" disabled={disabled}><UsersIcon className="mr-1 h-3.5 w-3.5" /> Team</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => onChange("")}>Unassigned</DropdownMenuItem>
        <DropdownMenuSeparator />
        {SUGGESTED_TEAMS.map((t) => <DropdownMenuItem key={t} onClick={() => onChange(t)}>{t}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowActions({
  ticket, canAssign, canResolve, profiles, onUpdate,
}: {
  ticket: Ticket;
  canAssign: boolean;
  canResolve: boolean;
  profiles: { id: string; displayName: string }[];
  onUpdate: (patch: Parameters<typeof updateTicket>[1]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">{ticket.ticketNumber}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/tickets/$id" params={{ id: ticket.id }}>
            <Eye className="mr-2 h-3.5 w-3.5" /> View details
          </Link>
        </DropdownMenuItem>
        {(canAssign || canResolve) && (
          <>
            <DropdownMenuSeparator />
            {canAssign && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><UserCheck className="mr-2 h-3.5 w-3.5" /> Assign</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                  <DropdownMenuItem onClick={() => { onUpdate({ assigneeId: null }); toast.success("Unassigned"); }}>Unassigned</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {profiles.map((p) => <DropdownMenuItem key={p.id} onClick={() => { onUpdate({ assigneeId: p.id }); toast.success(`Assigned to ${p.displayName}`); }}>{p.displayName}</DropdownMenuItem>)}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {canResolve && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><PlayCircle className="mr-2 h-3.5 w-3.5" /> Set status</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {TICKET_STATUSES.map((s) => <DropdownMenuItem key={s} onClick={() => { onUpdate({ status: s }); toast.success(`Status set to ${labelStatus(s)}`); }}>{labelStatus(s)}</DropdownMenuItem>)}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><AlertTriangle className="mr-2 h-3.5 w-3.5" /> Set priority</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {TICKET_PRIORITIES.map((p) => <DropdownMenuItem key={p} onClick={() => { onUpdate({ priority: p }); toast.success(`Priority set to ${cap(p)}`); }}>{cap(p)}</DropdownMenuItem>)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={() => { navigator.clipboard?.writeText(ticket.ticketNumber); toast.success("Ticket number copied"); }}>Copy number</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CreateTicketDrawer({
  open, onOpenChange, userId, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; userId: string; onCreated: () => void }) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TicketType>("incident");
  const [category, setCategory] = useState<string>(SUGGESTED_CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [tags, setTags] = useState("");

  const reset = () => {
    setSubject(""); setDescription(""); setType("incident"); setCategory(SUGGESTED_CATEGORIES[0]);
    setSubcategory(""); setPriority("normal"); setTags("");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const input: CreateTicketInput = {
        subject: subject.trim(),
        description: description.trim(),
        type,
        category,
        subcategory: subcategory.trim() || null,
        priority,
        tags: tags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      };
      return createTicket(userId, input);
    },
    onSuccess: (t) => {
      toast.success(`Ticket ${t.ticketNumber} created`, { description: t.subject });
      reset();
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Create failed"),
  });

  const handleSubmit = () => {
    if (!userId) return toast.error("You must be signed in");
    if (subject.trim().length < 4) return toast.error("Subject must be at least 4 characters");
    if (description.trim().length < 8) return toast.error("Description must be at least 8 characters");
    mutation.mutate();
  };

  return (
    <FormDrawer
      open={open}
      onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}
      title="Create ticket"
      description="The ticket will be created under your account. Assign and route after submission."
      submitLabel={mutation.isPending ? "Creating…" : "Create ticket"}
      onSubmit={handleSubmit}
    >
      <Row label="Subject *">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of the issue or request" />
      </Row>
      <Row label="Description *">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Provide steps, error messages, impacted users…" />
      </Row>
      <div className="grid grid-cols-2 gap-3">
        <Row label="Type">
          <Select value={type} onValueChange={(v) => setType(v as TicketType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TICKET_TYPES.map((t) => <SelectItem key={t} value={t}>{cap(t)}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row label="Priority">
          <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{cap(p)}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row label="Category">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SUGGESTED_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row label="Subcategory">
          <Input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="Optional" />
        </Row>
        <Row label="Tags">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" />
        </Row>
      </div>
    </FormDrawer>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
