import { Outlet, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { consumePendingTicketFilters } from "@/lib/dashboard-prefs";
import {
  Ticket as TicketIcon,
  Inbox,
  UserCheck,
  PlayCircle,
  PauseCircle,
  AlertTriangle,
  AlarmClock,
  CheckCircle2,
  Plus,
  MoreHorizontal,
  ChevronDown,
  Save,
  Trash2,
  Tag,
  Users as UsersIcon,
  ArrowUpDown,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { FilterBar } from "@/components/common/FilterBar";
import { FormDrawer } from "@/components/common/FormDrawer";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { formatDateTime, timeAgo } from "@/components/common/format";
import { useData } from "@/lib/data/store";
import {
  createTicket,
  TICKET_SOURCES,
  labelSource,
  archiveTickets,
  assignTickets,
  setStatus,
  setPriority,
  setTeam,
  addTag,
  saveView,
  deleteView,
  recomputeSla,
  TICKET_CATEGORIES,
  TICKET_TEAMS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  SERVICES,
  AGENTS,
} from "@/lib/data/tickets";
import type { Ticket, TicketPriority, TicketStatus } from "@/lib/data/types";

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
import { Badge } from "@/components/ui/badge";
import { useRole, can } from "@/lib/permissions";

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
  waiting: "muted",
  resolved: "success",
  closed: "muted",
  cancelled: "danger",
};
const SLA_TONE = { ok: "success", warning: "warning", breached: "danger" } as const;

type SortKey = "number" | "subject" | "priority" | "status" | "sla" | "createdAt" | "updatedAt";

export function TicketsPage() {
  const data = useData();
  const role = useRole();
  const navigate = useNavigate();
  const tickets = useMemo(() => data.tickets.map(recomputeSla), [data.tickets]);
  const currentUser = AGENTS[0];

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
  const [fSla, setFSla] = useState<string>("all");
  const [fSource, setFSource] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");

  // Honor a one-shot filter handoff from the Dashboard
  useEffect(() => {
    const pending = consumePendingTicketFilters();
    if (!pending) return;
    if (pending.status) setFStatus(pending.status);
    if (pending.sla) setFSla(pending.sla);
    if (pending.assignee) setFAssignee(pending.assignee);
    if (pending.scope === "mine") setFAssignee(currentUser);
    if (pending.scope === "unassigned") setFAssignee("unassigned");
    if (pending.scope === "resolvedToday") setFStatus("resolved");
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetFilters = () => {
    setQuery(""); setFStatus("all"); setFPriority("all"); setFType("all"); setFTeam("all"); setFAssignee("all"); setFCategory("all"); setFSla("all"); setFSource("all"); setPage(1);
  };

  // Apply filters
  const filtered = useMemo(() => {
    let list = tickets.slice();
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((t) =>
        t.number.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.requester.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.assignee ?? "").toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    if (fStatus !== "all") list = list.filter((t) => t.status === fStatus);
    if (fPriority !== "all") list = list.filter((t) => t.priority === fPriority);
    if (fType !== "all") list = list.filter((t) => t.type === fType);
    if (fTeam !== "all") list = list.filter((t) => t.team === fTeam);
    if (fAssignee !== "all") list = list.filter((t) => (t.assignee ?? "") === (fAssignee === "unassigned" ? "" : fAssignee));
    if (fCategory !== "all") list = list.filter((t) => t.category === fCategory);
    if (fSla !== "all") list = list.filter((t) => t.sla === fSla);
    if (fSource !== "all") list = list.filter((t) => (t.source ?? "manual") === fSource);
    list.sort((a, b) => {
      const av = a[sortKey] as string;
      const bv = b[sortKey] as string;
      const cmp = (av ?? "").localeCompare(bv ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [tickets, query, fStatus, fPriority, fType, fTeam, fAssignee, fCategory, fSla, fSource, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  // Metrics
  const metrics = useMemo(() => {
    const openLike = (t: Ticket) => !["resolved", "closed", "cancelled"].includes(t.status);
    const open = tickets.filter(openLike).length;
    const unassigned = tickets.filter((t) => openLike(t) && !t.assignee).length;
    const mine = tickets.filter((t) => openLike(t) && t.assignee === currentUser).length;
    const inProgress = tickets.filter((t) => t.status === "in_progress").length;
    const waiting = tickets.filter((t) => t.status === "waiting").length;
    const warn = tickets.filter((t) => openLike(t) && t.sla === "warning").length;
    const breached = tickets.filter((t) => openLike(t) && t.sla === "breached").length;
    const resolvedToday = tickets.filter((t) => {
      if (!t.resolvedAt) return false;
      const d = new Date(t.resolvedAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    return { open, unassigned, mine, inProgress, waiting, warn, breached, resolvedToday };
  }, [tickets]);

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const selectedIds = Array.from(selected);

  const canWrite = can("tickets.assign", role) || can("tickets.resolve", role);
  const canCreate = can("tickets.create", role);

  const applyView = (filters: Record<string, string>) => {
    setFStatus(filters.status ?? "all");
    setFPriority(filters.priority ?? "all");
    setFType(filters.type ?? "all");
    setFTeam(filters.team ?? "all");
    setFAssignee(filters.assignee ?? "all");
    setFCategory(filters.category ?? "all");
    setFSla(filters.sla ?? "all");
    setQuery(filters.q ?? "");
    setPage(1);
  };

  const lookupAsset = (id?: string) => data.assets.find((a) => a.id === id);

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Service desk queue with SLA tracking, bulk actions, and saved views."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SavedViewsMenu views={data.ticketViews} onApply={applyView} onDelete={(id) => { deleteView(id); toast.success("View removed"); }} />
            <Button variant="secondary" onClick={() => setSaveViewOpen(true)}>
              <Save className="mr-1.5 h-4 w-4" /> Save view
            </Button>
            <Button onClick={() => setCreateOpen(true)} disabled={!canCreate} title={canCreate ? undefined : "Your role cannot create tickets"}>
              <Plus className="mr-1.5 h-4 w-4" /> New ticket
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <MetricCard icon={Inbox} label="Open" value={metrics.open} accent="primary" />
        <MetricCard icon={AlertTriangle} label="Unassigned" value={metrics.unassigned} accent="warning" />
        <MetricCard icon={UserCheck} label="Assigned to me" value={metrics.mine} accent="primary" />
        <MetricCard icon={PlayCircle} label="In Progress" value={metrics.inProgress} accent="primary" />
        <MetricCard icon={PauseCircle} label="Waiting" value={metrics.waiting} accent="muted" />
        <MetricCard icon={AlarmClock} label="SLA warning" value={metrics.warn} accent="warning" />
        <MetricCard icon={AlertTriangle} label="SLA breached" value={metrics.breached} accent="danger" />
        <MetricCard icon={CheckCircle2} label="Resolved today" value={metrics.resolvedToday} accent="success" />
      </div>

      <div className="mt-6">
        <FilterBar query={query} onQueryChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search by number, subject, requester, tag…" onReset={resetFilters}>
          <SelectFilter value={fStatus} onChange={setFStatus} placeholder="Status" options={[{ value: "all", label: "All status" }, ...TICKET_STATUSES.map((s) => ({ value: s, label: labelStatus(s) }))]} />
          <SelectFilter value={fPriority} onChange={setFPriority} placeholder="Priority" options={[{ value: "all", label: "All priority" }, ...TICKET_PRIORITIES.map((p) => ({ value: p, label: cap(p) }))]} />
          <SelectFilter value={fType} onChange={setFType} placeholder="Type" options={[{ value: "all", label: "All types" }, ...TICKET_TYPES.map((t) => ({ value: t, label: cap(t) }))]} />
          <SelectFilter value={fTeam} onChange={setFTeam} placeholder="Team" options={[{ value: "all", label: "All teams" }, ...TICKET_TEAMS.map((t) => ({ value: t, label: t }))]} />
          <SelectFilter value={fAssignee} onChange={setFAssignee} placeholder="Assignee" options={[{ value: "all", label: "All assignees" }, { value: "unassigned", label: "Unassigned" }, ...AGENTS.map((a) => ({ value: a, label: a }))]} />
          <SelectFilter value={fCategory} onChange={setFCategory} placeholder="Category" options={[{ value: "all", label: "All categories" }, ...TICKET_CATEGORIES.map((c) => ({ value: c, label: c }))]} />
          <SelectFilter value={fSla} onChange={setFSla} placeholder="SLA" options={[{ value: "all", label: "All SLA" }, { value: "ok", label: "On track" }, { value: "warning", label: "At risk" }, { value: "breached", label: "Breached" }]} />
        </FilterBar>

        {selected.size > 0 && (
          <div className="glass-card mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3">
            <div className="text-xs">
              <span className="font-semibold">{selected.size}</span>
              <span className="text-muted-foreground"> selected</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BulkAssignMenu disabled={!canWrite} onAssign={(a) => { assignTickets(selectedIds, a); toast.success(`Assigned ${selectedIds.length} ticket(s) to ${a}`); clearSelection(); }} />
              <BulkStatusMenu disabled={!canWrite} onChange={(s) => { setStatus(selectedIds, s); toast.success(`Status updated to ${labelStatus(s)}`); clearSelection(); }} />
              <BulkPriorityMenu disabled={!canWrite} onChange={(p) => { setPriority(selectedIds, p); toast.success(`Priority set to ${cap(p)}`); clearSelection(); }} />
              <BulkTeamMenu disabled={!canWrite} onChange={(t) => { setTeam(selectedIds, t); toast.success(`Team set to ${t}`); clearSelection(); }} />
              <Button size="sm" variant="secondary" disabled={!canWrite} onClick={() => setTagOpen(true)}>
                <Tag className="mr-1 h-3.5 w-3.5" /> Add tag
              </Button>
              <Button size="sm" variant="ghost" className="text-[#FF7C91]" disabled={!can("documents.delete", role)} onClick={() => setArchiveOpen(true)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Archive
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
              description="Open your first request to populate the queue."
              actionLabel={canCreate ? "Create ticket" : undefined}
              onAction={canCreate ? () => setCreateOpen(true) : undefined}
            />
          ) : (
            <EmptyState
              icon={Eye}
              title="No tickets match your filters"
              description="Try adjusting your filters or clearing the search."
              actionLabel="Reset filters"
              onAction={resetFilters}
            />
          )
        ) : (
          <div className="glass-card overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className={cellHead(density, "w-8")}>
                      <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAllOnPage} aria-label="Select all on page" />
                    </th>
                    <ThSort label="Number" col="number" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                    <ThSort label="Subject" col="subject" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                    <th className={cellHead(density)}>Requester</th>
                    <th className={cellHead(density)}>Category</th>
                    <ThSort label="Priority" col="priority" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                    <ThSort label="Status" col="status" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                    <ThSort label="SLA" col="sla" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                    <th className={cellHead(density)}>Assignee</th>
                    <th className={cellHead(density)}>Team</th>
                    <th className={cellHead(density)}>Asset</th>
                    <ThSort label="Created" col="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                    <ThSort label="Updated" col="updatedAt" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }} density={density} />
                    <th className={cellHead(density, "w-10")}></th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((t) => {
                    const asset = lookupAsset(t.linkedAssetId);
                    return (
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
                        aria-label={`Open ${t.number} ${t.subject}`}
                        className="cursor-pointer border-t border-border/40 outline-none transition-colors hover:bg-white/[0.02] focus-visible:bg-white/[0.02] focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <td className={cellBody(density)} onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} aria-label={`Select ${t.number}`} />
                        </td>
                        <td className={cellBody(density, "font-mono text-[11px] text-primary")}><Link to="/tickets/$id" params={{ id: t.id }} className="hover:underline">{t.number}</Link></td>
                        <td className={cellBody(density, "max-w-[280px]")}>
                          <Link to="/tickets/$id" params={{ id: t.id }} className="block truncate font-medium hover:underline">{t.subject}</Link>
                          {t.tags.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {t.tags.slice(0, 3).map((tag) => (
                                <span key={tag} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className={cellBody(density, "text-muted-foreground")}>{t.requester}</td>
                        <td className={cellBody(density, "text-muted-foreground")}>{t.category}{t.subcategory && <span className="text-muted-foreground/60"> / {t.subcategory}</span>}</td>
                        <td className={cellBody(density)}><StatusBadge label={cap(t.priority)} tone={PRIORITY_TONE[t.priority]} /></td>
                        <td className={cellBody(density)}><StatusBadge label={labelStatus(t.status)} tone={STATUS_TONE[t.status]} /></td>
                        <td className={cellBody(density)}><StatusBadge label={t.sla === "ok" ? "On track" : t.sla === "warning" ? "At risk" : "Breached"} tone={SLA_TONE[t.sla]} /></td>
                        <td className={cellBody(density, "text-muted-foreground")}>{t.assignee ?? <span className="italic text-[#FFC86B]">Unassigned</span>}</td>
                        <td className={cellBody(density, "text-muted-foreground")}>{t.team ?? "—"}</td>
                        <td className={cellBody(density, "font-mono text-[11px] text-muted-foreground")}>{asset?.hostname ?? "—"}</td>
                        <td className={cellBody(density, "text-muted-foreground")} suppressHydrationWarning>{timeAgo(t.createdAt)}</td>
                        <td className={cellBody(density, "text-muted-foreground")} suppressHydrationWarning>{timeAgo(t.updatedAt)}</td>
                        <td className={cellBody(density)} onClick={(e) => e.stopPropagation()}>
                          <RowActions ticket={t} canWrite={canWrite} />
                        </td>
                      </tr>
                    );
                  })}
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

      <CreateTicketDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(t) => {
          toast.success(`Ticket ${t.number} created`, { description: t.subject });
          setCreateOpen(false);
        }}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive selected tickets?"
        description={`${selectedIds.length} ticket(s) will be moved to the recycle bin and can be restored later.`}
        confirmLabel="Archive"
        destructive
        onConfirm={() => {
          archiveTickets(selectedIds);
          toast.success(`${selectedIds.length} ticket(s) archived`);
          clearSelection();
        }}
      />

      <FormDrawer
        open={tagOpen}
        onOpenChange={setTagOpen}
        title="Add tag to selected tickets"
        submitLabel="Add tag"
        onSubmit={() => {
          if (!tagValue.trim()) { toast.error("Enter a tag value"); return; }
          addTag(selectedIds, tagValue);
          toast.success(`Tag added to ${selectedIds.length} ticket(s)`);
          setTagValue("");
          setTagOpen(false);
          clearSelection();
        }}
      >
        <div className="space-y-2">
          <Label>Tag</Label>
          <Input value={tagValue} onChange={(e) => setTagValue(e.target.value)} placeholder="e.g. urgent" />
          <p className="text-xs text-muted-foreground">Tags help group tickets across categories.</p>
        </div>
      </FormDrawer>

      <FormDrawer
        open={saveViewOpen}
        onOpenChange={setSaveViewOpen}
        title="Save current view"
        submitLabel="Save view"
        onSubmit={() => {
          if (!viewName.trim()) { toast.error("Name the view"); return; }
          saveView({
            name: viewName.trim(),
            query,
            filters: {
              status: fStatus, priority: fPriority, type: fType, team: fTeam,
              assignee: fAssignee, category: fCategory, sla: fSla, q: query,
            },
          });
          toast.success(`View '${viewName}' saved`);
          setViewName("");
          setSaveViewOpen(false);
        }}
      >
        <div className="space-y-2">
          <Label>View name</Label>
          <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="e.g. My critical incidents" />
          <p className="text-xs text-muted-foreground">Saved views capture current filters and search.</p>
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

function SavedViewsMenu({ views, onApply, onDelete }: { views: { id: string; name: string; query: string; filters: Record<string, string> }[]; onApply: (f: Record<string, string>) => void; onDelete: (id: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary"><Eye className="mr-1.5 h-4 w-4" /> Saved views <ChevronDown className="ml-1 h-3 w-3" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {views.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No saved views yet</div>}
        {views.map((v) => (
          <DropdownMenuItem key={v.id} onClick={() => onApply(v.filters)} className="flex items-center justify-between">
            <span className="truncate">{v.name}</span>
            <button onClick={(e) => { e.stopPropagation(); onDelete(v.id); }} className="ml-2 text-[10px] text-muted-foreground hover:text-[#FF7C91]">remove</button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkAssignMenu({ onAssign, disabled }: { onAssign: (a: string) => void; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" disabled={disabled}><UserCheck className="mr-1 h-3.5 w-3.5" /> Assign</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {AGENTS.map((a) => <DropdownMenuItem key={a} onClick={() => onAssign(a)}>{a}</DropdownMenuItem>)}
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
        {TICKET_TEAMS.map((t) => <DropdownMenuItem key={t} onClick={() => onChange(t)}>{t}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowActions({ ticket, canWrite }: { ticket: Ticket; canWrite: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">{ticket.number}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/tickets/$id" params={{ id: ticket.id }}>
            <Eye className="mr-2 h-3.5 w-3.5" /> View details
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!canWrite}><UserCheck className="mr-2 h-3.5 w-3.5" /> Assign</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {AGENTS.map((a) => <DropdownMenuItem key={a} onClick={() => { assignTickets([ticket.id], a); toast.success(`Assigned to ${a}`); }}>{a}</DropdownMenuItem>)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!canWrite}><PlayCircle className="mr-2 h-3.5 w-3.5" /> Set status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {TICKET_STATUSES.map((s) => <DropdownMenuItem key={s} onClick={() => { setStatus([ticket.id], s); toast.success(`Status set to ${labelStatus(s)}`); }}>{labelStatus(s)}</DropdownMenuItem>)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!canWrite}><AlertTriangle className="mr-2 h-3.5 w-3.5" /> Set priority</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {TICKET_PRIORITIES.map((p) => <DropdownMenuItem key={p} onClick={() => { setPriority([ticket.id], p); toast.success(`Priority set to ${cap(p)}`); }}>{cap(p)}</DropdownMenuItem>)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { navigator.clipboard?.writeText(ticket.number); toast.success("Ticket number copied"); }}>Copy number</DropdownMenuItem>
        <DropdownMenuItem className="text-[#FF7C91]" disabled={!canWrite} onClick={() => { archiveTickets([ticket.id]); toast.success(`${ticket.number} archived`); }}>
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CreateTicketDrawer({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (t: Ticket) => void }) {
  const data = useData();
  const [requester, setRequester] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<Ticket["type"]>("incident");
  const [category, setCategory] = useState<string>(TICKET_CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [service, setService] = useState<string>("");
  const [assetId, setAssetId] = useState<string>("");
  const [ipamId, setIpamId] = useState<string>("");
  const [team, setTeam] = useState<string>(TICKET_TEAMS[0]);
  const [assignee, setAssignee] = useState<string>("");
  const [tags, setTags] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);

  const reset = () => {
    setRequester(""); setSubject(""); setDescription(""); setType("incident"); setCategory(TICKET_CATEGORIES[0]);
    setSubcategory(""); setPriority("normal"); setService(""); setAssetId(""); setIpamId(""); setTeam(TICKET_TEAMS[0]);
    setAssignee(""); setTags(""); setAttachments([]);
  };

  const handleSubmit = () => {
    if (!requester.trim()) return toast.error("Requester is required");
    if (subject.trim().length < 4) return toast.error("Subject must be at least 4 characters");
    if (description.trim().length < 8) return toast.error("Description must be at least 8 characters");
    const t = createTicket({
      requester: requester.trim(),
      subject: subject.trim(),
      description: description.trim(),
      type,
      category,
      subcategory: subcategory.trim() || undefined,
      priority,
      affectedService: service || undefined,
      linkedAssetId: assetId || undefined,
      linkedIpamId: ipamId || undefined,
      team,
      assignee: assignee || undefined,
      tags: tags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      attachments,
    });
    reset();
    onCreated(t);
  };

  return (
    <FormDrawer open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }} title="Create ticket" description="All fields are validated locally. Required: requester, subject, description." submitLabel="Create ticket" onSubmit={handleSubmit}>
      <Row label="Requester *">
        <Input value={requester} onChange={(e) => setRequester(e.target.value)} placeholder="username" />
      </Row>
      <Row label="Subject *">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of the issue or request" />
      </Row>
      <Row label="Description *">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Provide steps, error messages, impacted users…" />
      </Row>
      <div className="grid grid-cols-2 gap-3">
        <Row label="Type">
          <Select value={type} onValueChange={(v) => setType(v as Ticket["type"])}>
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
            <SelectContent>{TICKET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row label="Subcategory">
          <Input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="Optional" />
        </Row>
        <Row label="Affected service">
          <Select value={service || "none"} onValueChange={(v) => setService(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Team">
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TICKET_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row label="Asset">
          <Select value={assetId || "none"} onValueChange={(v) => setAssetId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {data.assets.map((a) => <SelectItem key={a.id} value={a.id}>{a.hostname} · {a.displayName}</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
        <Row label="IP record">
          <Select value={ipamId || "none"} onValueChange={(v) => setIpamId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {data.ipam.map((p) => <SelectItem key={p.id} value={p.id}>{p.ipAddress} · {p.hostname}</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Assignee">
          <Select value={assignee || "none"} onValueChange={(v) => setAssignee(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Tags">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" />
        </Row>
      </div>
      <Row label="Attachments (prototype)">
        <div className="rounded-xl border border-dashed border-border/60 bg-background/30 p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>Drop files or click to attach (mock).</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => { const name = `evidence-${attachments.length + 1}.png`; setAttachments((a) => [...a, name]); toast.success(`Attached ${name}`); }}>
              Add mock file
            </Button>
          </div>
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {attachments.map((f, i) => (
                <Badge key={i} variant="outline" className="font-mono text-[10px]">
                  {f}
                  <button onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))} className="ml-1 text-muted-foreground hover:text-foreground">×</button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Row>
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

// keep referenced to avoid unused warnings
void formatDateTime; void Link;
