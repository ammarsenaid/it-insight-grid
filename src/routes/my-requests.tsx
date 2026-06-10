import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Inbox, Plus, CheckCircle2, Clock, PlayCircle, ShoppingBag, RefreshCw, X, ChevronRight, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FormDrawer } from "@/components/common/FormDrawer";
import { timeAgo } from "@/components/common/format";
import { useData } from "@/lib/data/store";
import { createTicket, currentRequesterFor, recomputeSla, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_TYPES } from "@/lib/data/tickets";
import { useRole } from "@/lib/permissions";
import type { Ticket, TicketPriority } from "@/lib/data/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/my-requests")({
  head: () => ({ meta: [{ title: "My Requests · IT Knowledge Center" }] }),
  component: MyRequests,
});

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " "); }

type StatusFilter = "all" | "open" | "waiting" | "in_progress" | "resolved";
type DateFilter = "any" | "24h" | "7d" | "30d";

const DAY = 24 * 60 * 60 * 1000;

function MyRequests() {
  const data = useData();
  const role = useRole();
  const requester = currentRequesterFor(role);
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<string>("all");
  const [updated, setUpdated] = useState<DateFilter>("any");
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const mine = useMemo(
    () => data.tickets.filter((t) => t.requester === requester).map(recomputeSla),
    [data.tickets, requester, refreshKey],
  );

  const open = mine.filter((t) => !["resolved", "closed", "cancelled"].includes(t.status));
  const waiting = mine.filter((t) => t.status === "waiting");
  const inProgress = mine.filter((t) => t.status === "in_progress");
  const recentResolved = mine.filter((t) => (t.status === "resolved" || t.status === "closed") && Date.now() - new Date(t.updatedAt).getTime() < 7 * DAY);

  const categories = useMemo(() => Array.from(new Set(mine.map((t) => t.category))).sort(), [mine]);

  const filtered = useMemo(() => {
    let list = mine.slice();
    if (status === "open") list = list.filter((t) => !["resolved", "closed", "cancelled"].includes(t.status));
    else if (status === "waiting") list = list.filter((t) => t.status === "waiting");
    else if (status === "in_progress") list = list.filter((t) => t.status === "in_progress");
    else if (status === "resolved") list = list.filter((t) => t.status === "resolved" || t.status === "closed");
    if (category !== "all") list = list.filter((t) => t.category === category);
    if (updated !== "any") {
      const window = updated === "24h" ? DAY : updated === "7d" ? 7 * DAY : 30 * DAY;
      list = list.filter((t) => Date.now() - new Date(t.updatedAt).getTime() < window);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((t) => t.subject.toLowerCase().includes(q) || t.number.toLowerCase().includes(q));
    }
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [mine, status, category, updated, query]);

  const activeFilters = [
    status !== "all" && { key: "status", label: `Status: ${cap(status)}`, clear: () => setStatus("all") },
    category !== "all" && { key: "category", label: `Category: ${category}`, clear: () => setCategory("all") },
    updated !== "any" && { key: "updated", label: `Updated: ${updated === "24h" ? "Last 24h" : updated === "7d" ? "Last 7 days" : "Last 30 days"}`, clear: () => setUpdated("any") },
    query.trim() && { key: "query", label: `Search: ${query}`, clear: () => setQuery("") },
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>;

  const clearFilters = () => { setStatus("all"); setCategory("all"); setUpdated("any"); setQuery(""); };

  const handleReload = () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 400);
  };

  return (
    <div>
      <PageHeader
        title="My Requests"
        description="Track your submitted requests and respond when needed."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/service-catalog"><Button variant="secondary" size="sm"><ShoppingBag className="mr-1.5 h-4 w-4" /> Browse catalog</Button></Link>
            <Button onClick={() => setCreateOpen(true)} size="sm"><Plus className="mr-1.5 h-4 w-4" /> New request</Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleReload} aria-label="Reload requests" className="h-9 w-9">
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reload requests</TooltipContent>
            </Tooltip>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricButton onClick={() => setStatus("open")} active={status === "open"}>
          <MetricCard icon={Inbox} label="Open requests" value={open.length} accent="primary" />
        </MetricButton>
        <MetricButton onClick={() => setStatus("waiting")} active={status === "waiting"}>
          <MetricCard icon={AlertCircle} label="Waiting for my response" value={waiting.length} accent="warning" />
        </MetricButton>
        <MetricButton onClick={() => setStatus("in_progress")} active={status === "in_progress"}>
          <MetricCard icon={PlayCircle} label="In progress" value={inProgress.length} accent="primary" />
        </MetricButton>
        <MetricButton onClick={() => setStatus("resolved")} active={status === "resolved"}>
          <MetricCard icon={CheckCircle2} label="Recently resolved" value={recentResolved.length} accent="success" />
        </MetricButton>
      </div>

      <div className="mt-6 glass-card rounded-2xl p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your requests…"
              className="h-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={updated} onValueChange={(v) => setUpdated(v as DateFilter)}>
              <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Updated" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any time</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {activeFilters.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {activeFilters.map((f) => (
              <Badge key={f.key} variant="secondary" className="h-7 gap-1 rounded-full pl-2.5 pr-1 text-[11px]">
                {f.label}
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={f.clear} aria-label={`Remove ${f.label}`}>
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-[11px] text-muted-foreground">Clear all</Button>
          </div>
        )}
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          mine.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No requests yet"
              description="Submit a request or browse the service catalog to get help from IT."
              actionLabel="Browse catalog"
              onAction={() => navigate({ to: "/service-catalog" })}
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No matching requests"
              description="No requests match the selected filters."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          )
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => <RequestCard key={t.id} t={t} />)}
          </div>
        )}
      </div>

      <RequesterCreateDrawer open={createOpen} onOpenChange={setCreateOpen} requester={requester} />
    </div>
  );
}

function MetricButton({ onClick, active, children }: { onClick: () => void; active: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left transition-all ${active ? "ring-2 ring-primary/60 rounded-2xl" : ""}`}
    >
      {children}
    </button>
  );
}

function RequestCard({ t }: { t: Ticket }) {
  const waitingForUser = t.status === "waiting";
  const statusLabel = t.status === "in_progress" ? "In progress" : cap(t.status);
  const statusTone = t.status === "resolved" || t.status === "closed" ? "success" : waitingForUser ? "warning" : "info";
  return (
    <Link to="/tickets/$id" params={{ id: t.id }} className="glass-card group block rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-primary">{t.number}</span>
            <StatusBadge label={statusLabel} tone={statusTone} />
            {waitingForUser && <StatusBadge label="Waiting for your response" tone="warning" />}
          </div>
          <div className="mt-1 truncate text-sm font-semibold">{t.subject}</div>
          <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted-foreground">
            <span>{t.category}</span>
            <span>·</span>
            <span suppressHydrationWarning>Updated {timeAgo(t.updatedAt)}</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function RequesterCreateDrawer({ open, onOpenChange, requester }: { open: boolean; onOpenChange: (o: boolean) => void; requester: string }) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(TICKET_CATEGORIES[0]);
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [type, setType] = useState<typeof TICKET_TYPES[number]>("request");

  const reset = () => { setSubject(""); setDescription(""); setCategory(TICKET_CATEGORIES[0]); setPriority("normal"); setType("request"); };

  return (
    <FormDrawer
      open={open}
      onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}
      title="Submit a new request"
      description="The IT team will pick this up shortly and respond inside this portal."
      submitLabel="Submit request"
      onSubmit={() => {
        if (subject.trim().length < 4) return toast.error("Subject too short");
        if (description.trim().length < 8) return toast.error("Please describe the issue (at least 8 characters)");
        const t = createTicket({
          requester, subject: subject.trim(), description: description.trim(),
          type, category, priority, team: "Service Desk", tags: ["self-service"],
          source: "portal",
        });
        toast.success(`Request ${t.number} submitted`, { description: "You'll be notified when IT responds." });
        reset();
        onOpenChange(false);
      }}
    >
      <div className="space-y-2"><Label className="text-xs">Subject <span className="text-destructive">*</span></Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" /></div>
      <div className="space-y-2"><Label className="text-xs">Description <span className="text-destructive">*</span></Label><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Please describe the issue or request" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof TICKET_TYPES[number])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TICKET_TYPES.map((t) => <SelectItem key={t} value={t}>{cap(t)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label className="text-xs">Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{cap(p)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-2"><Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TICKET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    </FormDrawer>
  );
}
