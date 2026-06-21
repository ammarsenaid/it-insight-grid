import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Bell, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { DetailsDrawer } from "./DetailsDrawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "./format";
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  notificationsQuery,
  markNotificationsReadInCache,
  sdKeys,
} from "@/lib/service-desk/queries";
import {
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/lib/service-desk/notifications";
import type { NotificationKind, NotificationRow } from "@/lib/service-desk/types";

const KIND_TONE: Record<NotificationKind, string> = {
  "ticket.created": "border-[#5B8CFF]/30 bg-[#5B8CFF]/10 text-[#5B8CFF]",
  "ticket.reply": "border-[#5B8CFF]/30 bg-[#5B8CFF]/10 text-[#5B8CFF]",
  "ticket.status": "border-[#52D6A4]/30 bg-[#52D6A4]/10 text-[#52D6A4]",
  "ticket.assigned": "border-[#FFC86B]/30 bg-[#FFC86B]/10 text-[#FFC86B]",
};

function kindLabel(k: NotificationKind): string {
  return k.replace("ticket.", "");
}

const FILTERS: { key: "all" | "unread" | NotificationKind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "ticket.assigned", label: "Assigned" },
  { key: "ticket.reply", label: "Replies" },
  { key: "ticket.status", label: "Status" },
];

function bucketOf(d: string): "Today" | "Yesterday" | "Earlier" {
  const now = new Date();
  const then = new Date(d);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.floor((startOfDay(now) - startOfDay(then)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return "Earlier";
}

export function NotificationDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const enabled = Boolean(session?.user?.id);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const { data: notifications = [], isLoading, isError } = useQuery({
    ...notificationsQuery(50),
    enabled,
  });

  const unread = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);

  const filtered = useMemo(() => {
    if (filter === "all") return notifications;
    if (filter === "unread") return notifications.filter((n) => !n.readAt);
    return notifications.filter((n) => n.kind === filter);
  }, [notifications, filter]);

  const grouped = useMemo(() => {
    const g: Record<"Today" | "Yesterday" | "Earlier", NotificationRow[]> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };
    for (const n of filtered) g[bucketOf(n.createdAt)].push(n);
    return g;
  }, [filtered]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: sdKeys.notifications() });
    qc.invalidateQueries({ queryKey: sdKeys.notificationsUnread() });
  };

  const markAllMut = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: (count) => {
      markNotificationsReadInCache(qc, count);
      invalidate();
    },
    onError: () => toast.error("Could not mark notifications as read."),
  });

  const markOneMut = useMutation({
    mutationFn: (id: string) => markNotificationsRead([id]),
    onSuccess: (count, id) => {
      markNotificationsReadInCache(qc, count, [id]);
      invalidate();
    },
    onError: () => toast.error("Could not mark the notification as read."),
  });

  const handleOpen = (n: NotificationRow) => {
    if (!n.readAt) markOneMut.mutate(n.id);
    if (n.ticketId) {
      onOpenChange(false);
      navigate({ to: "/tickets/$id", params: { id: n.ticketId } });
    }
  };

  return (
    <DetailsDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      description={
        unread > 0
          ? `${unread} unread · ${notifications.length} loaded`
          : `${notifications.length} loaded`
      }
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => markAllMut.mutate()}
          disabled={unread === 0 || markAllMut.isPending}
          aria-label="Mark all notifications as read"
        >
          <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Mark all read
        </Button>
      }
    >
      {/* Category filters */}
      {enabled && notifications.length > 0 && (
        <div className="-mx-1 mb-4 flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  active
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border/60 bg-card/40 text-muted-foreground hover:bg-card/70",
                )}
                aria-pressed={active}
              >
                {f.label}
                {f.key === "unread" && unread > 0 && (
                  <span className="ml-1 rounded-full bg-primary/20 px-1 text-[10px]">{unread}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!enabled ? (
        <EmptyMsg label="Sign in to view notifications." />
      ) : isLoading ? (
        <EmptyMsg label="Loading notifications…" />
      ) : isError ? (
        <EmptyMsg label="Failed to load notifications." />
      ) : notifications.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-muted/40 text-muted-foreground">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-medium">No notifications</p>
          <p className="mt-1 text-xs text-muted-foreground">You're all caught up.</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyMsg label="No notifications match this filter." />
      ) : (
        <div className="space-y-5">
          {(["Today", "Yesterday", "Earlier"] as const).map((bucket) =>
            grouped[bucket].length === 0 ? null : (
              <section key={bucket} aria-label={bucket}>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {bucket}
                </h3>
                <ul className="space-y-2">
                  {grouped[bucket].map((n) => (
                    <li key={n.id}>
                      <div
                        className={cn(
                          "group relative rounded-xl border border-border/50 bg-card/50 p-3 transition-colors hover:bg-card/80",
                          !n.readAt && "border-primary/30 bg-primary/[0.04]",
                        )}
                      >
                        <button
                          onClick={() => handleOpen(n)}
                          className="block w-full text-left focus-visible:outline-none"
                          aria-label={`Open ${n.title}`}
                        >
                          <div className="flex items-start justify-between gap-2 pr-7">
                            <div className="flex min-w-0 items-center gap-2">
                              {!n.readAt && (
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                                  aria-label="Unread"
                                />
                              )}
                              <span className="truncate text-sm font-medium">{n.title}</span>
                            </div>
                            <Badge variant="outline" className={cn("text-[10px]", KIND_TONE[n.kind])}>
                              {kindLabel(n.kind)}
                            </Badge>
                          </div>
                          {n.body && (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                          )}
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <p
                              className="text-[10px] uppercase tracking-wider text-muted-foreground/70"
                              suppressHydrationWarning
                            >
                              {timeAgo(n.createdAt)}
                            </p>
                            {n.ticketId && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100">
                                Open ticket <ArrowRight className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                        </button>
                        {!n.readAt && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markOneMut.mutate(n.id);
                            }}
                            className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted/50 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100"
                            aria-label="Mark as read"
                            title="Mark as read"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
        </div>
      )}
    </DetailsDrawer>
  );
}

function EmptyMsg({ label }: { label: string }) {
  return (
    <div className="grid place-items-center py-12 text-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}
