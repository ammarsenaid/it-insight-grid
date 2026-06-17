import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Inbox,
  Plus,
  CheckCircle2,
  Clock,
  PlayCircle,
  RefreshCw,
  X,
  ChevronRight,
  AlertCircle,
  Monitor,
  AppWindow,
  KeyRound,
  Wifi,
  Printer,
  Mail,
  ShieldCheck,
  HelpCircle,
} from "lucide-react";

import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FormDrawer } from "@/components/common/FormDrawer";
import { timeAgo } from "@/components/common/format";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

import { useAuth } from "@/lib/auth/AuthProvider";
import { myTicketsQuery, sdKeys } from "@/lib/service-desk/queries";
import { createTicket } from "@/lib/service-desk/tickets";
import type { Ticket, TicketPriority } from "@/lib/service-desk/types";

export const Route = createFileRoute("/my-requests")({
  head: () => ({ meta: [{ title: "My Requests · IT Knowledge Center" }] }),
  component: MyRequests,
});

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ");
}

type StatusFilter = "all" | "open" | "in_progress" | "on_hold" | "resolved";
type DateFilter = "any" | "24h" | "7d" | "30d";

const DAY = 24 * 60 * 60 * 1000;

const PRIORITIES: TicketPriority[] = ["low", "normal", "high", "critical"];

// Categorized request types — values are persisted as ticket.category.
const REQUEST_CATEGORIES: { value: string; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "Hardware", label: "Hardware", description: "Laptop, monitor, peripherals", icon: Monitor },
  { value: "Software", label: "Software", description: "Install or fix an app", icon: AppWindow },
  { value: "Account & Access", label: "Account / Access", description: "Login, password, permissions", icon: KeyRound },
  { value: "Network", label: "Network / Internet", description: "Wi-Fi, VPN, connectivity", icon: Wifi },
  { value: "Printer", label: "Printer", description: "Printing or scanning issues", icon: Printer },
  { value: "Email", label: "Email", description: "Mailbox, calendar, delivery", icon: Mail },
  { value: "Security", label: "Security", description: "Suspicious activity, phishing", icon: ShieldCheck },
  { value: "Other", label: "Other", description: "Something else", icon: HelpCircle },
];
const SUGGESTED_CATEGORIES = REQUEST_CATEGORIES.map((c) => c.value);


function MyRequests() {
  const { session, loading: authLoading } = useAuth();
  
  const qc = useQueryClient();
  const userId = session?.user?.id ?? "";

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<string>("all");
  const [updated, setUpdated] = useState<DateFilter>("any");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery(
    myTicketsQuery(userId),
  );
  const mine = useMemo(() => data ?? [], [data]);

  const open = mine.filter((t) => !["resolved", "closed"].includes(t.status));
  const onHold = mine.filter((t) => t.status === "on_hold");
  const inProgress = mine.filter((t) => t.status === "in_progress");
  const recentResolved = mine.filter(
    (t) =>
      (t.status === "resolved" || t.status === "closed") &&
      Date.now() - new Date(t.updatedAt).getTime() < 7 * DAY,
  );

  const categories = useMemo(
    () => Array.from(new Set(mine.map((t) => t.category).filter((c): c is string => !!c))).sort(),
    [mine],
  );

  const filtered = useMemo(() => {
    let list = mine.slice();
    if (status === "open") {
      list = list.filter((t) => !["resolved", "closed"].includes(t.status));
    } else if (status !== "all") {
      list = list.filter((t) => t.status === status);
    }
    if (category !== "all") list = list.filter((t) => t.category === category);
    if (updated !== "any") {
      const window = updated === "24h" ? DAY : updated === "7d" ? 7 * DAY : 30 * DAY;
      list = list.filter((t) => Date.now() - new Date(t.updatedAt).getTime() < window);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) || t.ticketNumber.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [mine, status, category, updated, query]);

  const activeFilters = [
    status !== "all" && { key: "status", label: `Status: ${cap(status)}`, clear: () => setStatus("all") },
    category !== "all" && { key: "category", label: `Category: ${category}`, clear: () => setCategory("all") },
    updated !== "any" && {
      key: "updated",
      label: `Updated: ${updated === "24h" ? "Last 24h" : updated === "7d" ? "Last 7 days" : "Last 30 days"}`,
      clear: () => setUpdated("any"),
    },
    query.trim() && { key: "query", label: `Search: ${query}`, clear: () => setQuery("") },
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>;

  const clearFilters = () => {
    setStatus("all");
    setCategory("all");
    setUpdated("any");
    setQuery("");
  };

  if (authLoading) {
    return <div className="glass-card rounded-2xl p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!session) {
    return (
      <EmptyState
        icon={Inbox}
        title="Sign in required"
        description="You need to sign in to view your requests."
        actionLabel="Sign in"
        onAction={() => window.location.assign("/auth")}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="My Requests"
        description="Track your submitted requests and respond when needed."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="mr-1.5 h-4 w-4" /> New request
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => refetch()}
                  aria-label="Reload requests"
                  className="h-9 w-9"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reload requests</TooltipContent>
            </Tooltip>
          </div>
        }
      />

      {isLoading ? (
        <div className="glass-card rounded-2xl p-6 text-sm text-muted-foreground">
          Loading your requests…
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Could not load requests"
          description={error instanceof Error ? error.message : "Unexpected error."}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricButton onClick={() => setStatus("open")} active={status === "open"}>
              <MetricCard icon={Inbox} label="Open requests" value={open.length} accent="primary" />
            </MetricButton>
            <MetricButton onClick={() => setStatus("on_hold")} active={status === "on_hold"}>
              <MetricCard
                icon={AlertCircle}
                label="On hold"
                value={onHold.length}
                accent="warning"
              />
            </MetricButton>
            <MetricButton
              onClick={() => setStatus("in_progress")}
              active={status === "in_progress"}
            >
              <MetricCard
                icon={PlayCircle}
                label="In progress"
                value={inProgress.length}
                accent="primary"
              />
            </MetricButton>
            <MetricButton onClick={() => setStatus("resolved")} active={status === "resolved"}>
              <MetricCard
                icon={CheckCircle2}
                label="Recently resolved"
                value={recentResolved.length}
                accent="success"
              />
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
                  <SelectTrigger className="h-9 w-[150px] text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="on_hold">On hold</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-9 w-[160px] text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={updated} onValueChange={(v) => setUpdated(v as DateFilter)}>
                  <SelectTrigger className="h-9 w-[150px] text-xs">
                    <SelectValue placeholder="Updated" />
                  </SelectTrigger>
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
                  <Badge
                    key={f.key}
                    variant="secondary"
                    className="h-7 gap-1 rounded-full pl-2.5 pr-1 text-[11px]"
                  >
                    {f.label}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={f.clear}
                      aria-label={`Remove ${f.label}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-7 text-[11px] text-muted-foreground"
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>

          <div className="mt-4">
            {filtered.length === 0 ? (
              mine.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No requests yet"
                  description="Submit a request and the IT team will get back to you."
                  actionLabel="New request"
                  onAction={() => setCreateOpen(true)}
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
                {filtered.map((t) => (
                  <RequestCard key={t.id} t={t} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <RequesterCreateDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        userId={userId}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: sdKeys.ticketsMine(userId) });
          qc.invalidateQueries({ queryKey: sdKeys.tickets() });
        }}
      />
    </div>
  );
}

function MetricButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active: boolean;
  children: React.ReactNode;
}) {
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
  const onHold = t.status === "on_hold";
  const statusLabel = t.status === "in_progress" ? "In progress" : cap(t.status);
  const statusTone =
    t.status === "resolved" || t.status === "closed"
      ? "success"
      : onHold
        ? "warning"
        : "info";
  return (
    <Link
      to="/tickets/$id"
      params={{ id: t.id }}
      className="glass-card group block rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:border-white/10"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-primary">{t.ticketNumber}</span>
            <StatusBadge label={statusLabel} tone={statusTone} />
          </div>
          <div className="mt-1 truncate text-sm font-semibold">{t.subject}</div>
          <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted-foreground">
            <span>{t.category ?? "Uncategorised"}</span>
            <span>·</span>
            <span suppressHydrationWarning>
              <Clock className="mr-1 inline h-3 w-3" />
              Updated {timeAgo(t.updatedAt)}
            </span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function RequesterCreateDrawer({
  open,
  onOpenChange,
  userId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  onCreated: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(SUGGESTED_CATEGORIES[0]);
  const [priority, setPriority] = useState<TicketPriority>("normal");

  const reset = () => {
    setSubject("");
    setDescription("");
    setCategory(SUGGESTED_CATEGORIES[0]);
    setPriority("normal");
  };

  const mutation = useMutation({
    mutationFn: () =>
      createTicket(userId, {
        subject: subject.trim(),
        description: description.trim(),
        type: "request",
        category,
        priority,
      }),
    onSuccess: (t) => {
      toast.success(`Request ${t.ticketNumber} submitted`, {
        description: "You'll be notified when IT responds.",
      });
      reset();
      onOpenChange(false);
      onCreated();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to submit"),
  });

  return (
    <FormDrawer
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Submit a new request"
      description="The IT team will pick this up shortly and respond inside this portal."
      submitLabel={mutation.isPending ? "Submitting…" : "Submit request"}
      onSubmit={() => {
        if (!userId) return toast.error("You must be signed in");
        if (subject.trim().length < 4) return toast.error("Subject too short");
        if (description.trim().length < 8)
          return toast.error("Please describe the issue (at least 8 characters)");
        mutation.mutate();
      }}
    >
      <div className="space-y-2">
        <Label className="text-xs">
          Subject <span className="text-destructive">*</span>
        </Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Short summary"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">
          Description <span className="text-destructive">*</span>
        </Label>
        <Textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Please describe the issue or request"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs">Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {cap(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUGGESTED_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </FormDrawer>
  );
}
