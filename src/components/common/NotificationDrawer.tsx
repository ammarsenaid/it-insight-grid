import { CheckCheck, BellOff, Bell } from "lucide-react";
import { DetailsDrawer } from "./DetailsDrawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useData, setState } from "@/lib/data/store";
import { timeAgo } from "./format";
import { cn } from "@/lib/utils";

const typeStyles: Record<string, string> = {
  info: "border-[#5B8CFF]/30 bg-[#5B8CFF]/10 text-[#5B8CFF]",
  success: "border-[#52D6A4]/30 bg-[#52D6A4]/10 text-[#52D6A4]",
  warning: "border-[#FFC86B]/30 bg-[#FFC86B]/10 text-[#FFC86B]",
  danger: "border-[#FF7C91]/30 bg-[#FF7C91]/10 text-[#FF7C91]",
};

export function NotificationDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const data = useData();
  const notifications = data.notifications;
  const unread = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
  };
  const clearAll = () => {
    setState((s) => ({ ...s, notifications: [] }));
  };
  const markRead = (id: string) => {
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  };

  return (
    <DetailsDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      description={unread > 0 ? `${unread} unread · ${notifications.length} total` : `${notifications.length} total`}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={markAllRead} disabled={unread === 0}>
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Mark all read
          </Button>
          <Button size="sm" variant="ghost" onClick={clearAll} disabled={notifications.length === 0}>
            <BellOff className="mr-1.5 h-3.5 w-3.5" /> Clear
          </Button>
        </>
      }
    >
      {notifications.length === 0 ? (
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
                onClick={() => markRead(n.id)}
                className={cn(
                  "w-full rounded-xl border border-border/50 bg-card/50 p-3 text-left transition-colors hover:bg-card/80",
                  !n.read && "border-primary/30 bg-primary/[0.04]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </div>
                  <Badge variant="outline" className={cn("text-[10px]", typeStyles[n.type])}>{n.type}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </DetailsDrawer>
  );
}
