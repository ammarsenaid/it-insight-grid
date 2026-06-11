import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bell, Inbox, RefreshCw, Filter } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { timeAgo } from "@/components/common/format";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useData } from "@/lib/data/store";
import { currentRequesterFor, isRequesterRole } from "@/lib/data/tickets";
import { useRole, can } from "@/lib/permissions";
import type { Ticket, TicketComment } from "@/lib/data/types";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications · IT Knowledge Center" }] }),
  component: NotificationsPage,
});

type Notif = {
  id: string;
  ticketId: string;
  ticketNumber: string;
  ticketSubject: string;
  kind: "reply" | "status" | "created";
  label: string;
  at: string;
  tone: "info" | "success" | "warning" | "muted";
};

type Filter = "all" | "reply" | "status";

function NotificationsPage() {
  const data = useData();
  const role = useRole();
  const canSeeInternal = can("tickets.viewInternal", role);
  const isRequester = isRequesterRole(role);
  const requester = currentRequesterFor(role);

  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  const scopedTickets = useMemo<Ticket[]>(() => {
    if (isRequester) {
      return data.tickets.filter((t) => t.requester === requester);
    }
    return data.tickets;
  }, [data.tickets, isRequester, requester, tick]);

  const notifications = useMemo<Notif[]>(() => {
    const items: Notif[] = [];
    for (const t of scopedTickets) {
      // Ticket creation
      items.push({
        id: `${t.id}:created`,
        ticketId: t.id,
        ticketNumber: t.number,
        ticketSubject: t.subject,
        kind: "created",
        label: `Ticket ${t.number} created`,
        at: t.createdAt,
        tone: "info",
      });
      // Status events
      if (t.resolvedAt) {
        items.push({
          id: `${t.id}:resolved`,
          ticketId: t.id,
          ticketNumber: t.number,
          ticketSubject: t.subject,
          kind: "status",
          label: "Ticket marked as resolved",
          at: t.resolvedAt,
          tone: "success",
        });
      }
      if (t.status === "waiting") {
        items.push({
          id: `${t.id}:waiting`,
          ticketId: t.id,
          ticketNumber: t.number,
          ticketSubject: t.subject,
          kind: "status",
          label: "IT is waiting for your response",
          at: t.updatedAt,
          tone: "warning",
        });
      }
      // Replies (filter out internal for requesters)
      const replies = (t.comments ?? []).filter((c: TicketComment) =>
        canSeeInternal ? true : !c.internal,
      );
      for (const c of replies) {
        items.push({
          id: `${t.id}:c:${c.id}`,
          ticketId: t.id,
          ticketNumber: t.number,
          ticketSubject: t.subject,
          kind: "reply",
          label: `${c.author} ${c.internal ? "added an internal note" : "replied"}`,
          at: c.createdAt,
          tone: c.internal ? "warning" : "info",
        });
      }
    }
    return items
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 200);
  }, [scopedTickets, canSeeInternal]);

  const filtered = notifications.filter((n) => filter === "all" || n.kind === filter);

  const handleReload = () => {
    setRefreshing(true);
    setTick((k) => k + 1);
    setTimeout(() => setRefreshing(false), 350);
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={
          isRequester
            ? "Recent updates on your requests."
            : "Recent updates across the service desk."
        }
        actions={
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="h-9 w-[150px] text-xs">
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                <SelectValue placeholder="All updates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All updates</SelectItem>
                <SelectItem value="reply">Replies</SelectItem>
                <SelectItem value="status">Status changes</SelectItem>
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reload notifications"
                  onClick={handleReload}
                  className="h-9 w-9"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reload</TooltipContent>
            </Tooltip>
          </div>
        }
      />

      {filtered.length === 0 ? (
        notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description={
              isRequester
                ? "You will see updates here when IT responds or your request status changes."
                : "No recent ticket activity to show."
            }
            actionLabel={isRequester ? "View My Requests" : undefined}
            onAction={isRequester ? () => (window.location.href = "/my-requests") : undefined}
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="No matching notifications"
            description="Try a different filter."
            actionLabel="Clear filter"
            onAction={() => setFilter("all")}
          />
        )
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <Link
              key={n.id}
              to="/tickets/$id"
              params={{ id: n.ticketId }}
              className="glass-card group block rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:border-white/10"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-primary">{n.ticketNumber}</span>
                    <StatusBadge label={kindLabel(n.kind)} tone={n.tone} />
                    <span
                      className="ml-auto text-[11px] text-muted-foreground"
                      suppressHydrationWarning
                    >
                      {timeAgo(n.at)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm font-medium">{n.label}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {n.ticketSubject}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function kindLabel(k: Notif["kind"]): string {
  if (k === "reply") return "Reply";
  if (k === "status") return "Status";
  return "Created";
}
