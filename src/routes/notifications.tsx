import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Inbox, RefreshCw, Filter, CheckCheck } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { timeAgo } from "@/components/common/format";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useAuth } from "@/lib/auth/AuthProvider";
import { notificationsQuery, sdKeys } from "@/lib/service-desk/queries";
import {
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/lib/service-desk/notifications";
import type { NotificationKind, NotificationRow } from "@/lib/service-desk/types";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications · IT Knowledge Center" }] }),
  component: NotificationsPage,
});

type FilterKind = "all" | "ticket.reply" | "ticket.status" | "ticket.created" | "ticket.assigned";

const KIND_TONE: Record<NotificationKind, "info" | "success" | "warning" | "muted"> = {
  "ticket.created": "info",
  "ticket.reply": "info",
  "ticket.status": "success",
  "ticket.assigned": "warning",
};

function kindLabel(k: NotificationKind): string {
  if (k === "ticket.reply") return "Reply";
  if (k === "ticket.status") return "Status";
  if (k === "ticket.assigned") return "Assigned";
  return "Created";
}

function NotificationsPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const enabled = Boolean(session?.user?.id);

  const [filter, setFilter] = useState<FilterKind>("all");

  const { data: notifications = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    ...notificationsQuery(200),
    enabled,
  });

  const filtered = useMemo<NotificationRow[]>(
    () => (filter === "all" ? notifications : notifications.filter((n) => n.kind === filter)),
    [notifications, filter],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: sdKeys.notifications() });
    qc.invalidateQueries({ queryKey: sdKeys.notificationsUnread() });
  };

  const markAllMut = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: (n) => {
      toast.success(`${n} marked as read`);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Mark all read failed"),
  });

  const markOneMut = useMutation({
    mutationFn: (id: string) => markNotificationsRead([id]),
    onSuccess: () => invalidate(),
  });

  const handleOpen = (n: NotificationRow) => {
    if (!n.readAt) markOneMut.mutate(n.id);
    if (n.ticketId) navigate({ to: "/tickets/$id", params: { id: n.ticketId } });
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Recent updates from the service desk."
        actions={
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterKind)}>
              <SelectTrigger className="h-9 w-[170px] text-xs">
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                <SelectValue placeholder="All updates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All updates</SelectItem>
                <SelectItem value="ticket.reply">Replies</SelectItem>
                <SelectItem value="ticket.status">Status changes</SelectItem>
                <SelectItem value="ticket.created">Created</SelectItem>
                <SelectItem value="ticket.assigned">Assignments</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => markAllMut.mutate()}
              disabled={unreadCount === 0 || markAllMut.isPending}
            >
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Mark all read
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reload notifications"
                  onClick={() => refetch()}
                  className="h-9 w-9"
                  disabled={isFetching}
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reload</TooltipContent>
            </Tooltip>
          </div>
        }
      />

      {!enabled ? (
        <EmptyState
          icon={Bell}
          title="Sign in required"
          description="Authenticate to view your notifications."
        />
      ) : isLoading ? (
        <EmptyState icon={Bell} title="Loading…" description="Fetching your notifications." />
      ) : isError ? (
        <EmptyState
          icon={Inbox}
          title="Failed to load notifications"
          description={error instanceof Error ? error.message : "Try again in a moment."}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="You will see updates here when activity matches your watched tickets."
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
            <button
              key={n.id}
              type="button"
              onClick={() => handleOpen(n)}
              className={`glass-card group block w-full rounded-2xl p-3 text-left transition-all hover:-translate-y-0.5 hover:border-white/10 ${!n.readAt ? "ring-1 ring-primary/30" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={kindLabel(n.kind)} tone={KIND_TONE[n.kind]} />
                    {!n.readAt && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    <span
                      className="ml-auto text-[11px] text-muted-foreground"
                      suppressHydrationWarning
                    >
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm font-medium">{n.title}</div>
                  {n.body && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{n.body}</div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
