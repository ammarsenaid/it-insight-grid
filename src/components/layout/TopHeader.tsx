import { useState, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Search, User } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useData } from "@/lib/data/store";

export function TopHeader() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const data = useData();
  const notifs = data.notifications;
  const unread = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="h-9 w-9" />

      <form
        className="relative ml-2 hidden flex-1 max-w-xl md:block"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ to: "/search", search: { q } as never });
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search documents, assets, IPs, tasks, notes..."
          className="h-10 rounded-xl border-border/60 bg-card/60 pl-10"
        />
      </form>

      <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
        <Link to="/search" className="md:hidden">
          <Button size="icon" variant="ghost"><Search className="h-4 w-4" /></Button>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="relative">
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--destructive)]" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              <Badge variant="outline" className="text-[10px]">{notifs.length}</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifs.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">No notifications</div>
            )}
            {notifs.map((n) => (
              <DropdownMenuItem key={n.id} className="flex-col items-start gap-1 py-2">
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-medium">{n.title}</span>
                  <Badge
                    variant="outline"
                    className={
                      n.type === "danger"
                        ? "border-[var(--destructive)]/40 text-[var(--destructive)]"
                        : n.type === "warning"
                        ? "border-[var(--warning)]/40 text-[var(--warning)]"
                        : n.type === "success"
                        ? "border-[var(--success)]/40 text-[var(--success)]"
                        : ""
                    }
                  >
                    {n.type}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{n.message}</p>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-1 flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 py-1.5 pl-1.5 pr-3">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
            <User className="h-3.5 w-3.5" />
          </div>
          <div className="hidden text-xs leading-tight sm:block">
            <div className="font-medium">IT Administrator</div>
            <div className="text-[10px] text-muted-foreground">Local prototype</div>
          </div>
        </div>
      </div>
    </header>
  );
}
