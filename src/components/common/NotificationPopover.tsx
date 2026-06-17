import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import type { ReactNode } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
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
import type { NotificationRow } from "@/lib/service-desk/types";
import { timeAgo } from "./format";
import { cn } from "@/lib/utils";

export function NotificationPopover({ trigger }: { trigger: ReactNode }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const enabled = Boolean(session?.user?.id);

  const { data: notifications = [] } = useQuery({
    ...notificationsQuery(10),
    enabled,
  });

  const unread = notifications.filter((n) => !n.readAt).length;

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
  });

  const handleClick = (n: NotificationRow) => {
    if (!n.readAt) markOneMut.mutate(n.id);
    if (n.ticketId) {
      navigate({ to: "/tickets/$id", params: { id: n.ticketId } });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 overflow-hidden p-0"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <div className="text-xs font-semibold">
            Notifications
            {unread > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                {unread} new
              </span>
            )}
          </div>
          {unread > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
            >
              <CheckCheck className="mr-1 h-3 w-3" /> Mark all
            </Button>
          )}
        </div>

        {!enabled ? (
          <Empty>Sign in to see notifications.</Empty>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <Bell className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">
              You're all caught up.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => handleClick(n)}
                  className={cn(
                    "block w-full border-b border-border/40 px-3 py-2 text-left transition-colors hover:bg-muted/30 last:border-0",
                    !n.readAt && "bg-primary/[0.04]",
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.readAt && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {n.body}
                        </div>
                      )}
                      <div
                        className="mt-0.5 text-[10px] text-muted-foreground/70"
                        suppressHydrationWarning
                      >
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-6 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}
