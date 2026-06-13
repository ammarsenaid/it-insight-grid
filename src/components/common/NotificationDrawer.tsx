import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Bell } from "lucide-react";
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
  unreadNotificationsQuery,
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

  const { data: notifications = [], isLoading, isError } = useQuery({
    ...notificationsQuery(50),
    enabled,
  });

  const unread = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);

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

  const handleClick = (n: NotificationRow) => {
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
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => markAllMut.mutate()}
            disabled={unread === 0 || markAllMut.isPending}
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Mark all read
          </Button>
        </>
      }
    >
      {!enabled ? (
        <EmptyMsg label="Sign in to view notifications." />
      ) : isLoading ? (
        <EmptyMsg label="Loading notifications…" />
      ) : isError ? (
        <EmptyMsg label="Failed to load notifications." />
      ) : notifications.length === 0 ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-muted/40 text-muted-foreground">
            <Bell className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-medium">No notifications</p>
          <p className="mt-1 text-xs text-muted-foreground">You're all caught up.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => handleClick(n)}
                className={cn(
                  "w-full rounded-xl border border-border/50 bg-card/50 p-3 text-left transition-colors hover:bg-card/80",
                  !n.readAt && "border-primary/30 bg-primary/[0.04]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    {!n.readAt && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </div>
                  <Badge variant="outline" className={cn("text-[10px]", KIND_TONE[n.kind])}>
                    {kindLabel(n.kind)}
                  </Badge>
                </div>
                {n.body && <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>}
                <p
                  className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70"
                  suppressHydrationWarning
                >
                  {timeAgo(n.createdAt)}
                </p>
              </button>
            </li>
          ))}
        </ul>
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
