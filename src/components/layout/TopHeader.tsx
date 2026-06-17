import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Search,
  User,
  LogOut,
  UserCog,
  Command as CommandIcon,
  Check,
  Sliders,
} from "lucide-react";
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
import { useData, updateSettings } from "@/lib/data/store";
import { CommandPalette } from "@/components/common/CommandPalette";
import { NotificationDrawer } from "@/components/common/NotificationDrawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { unreadNotificationsQuery } from "@/lib/service-desk/queries";

export function TopHeader() {
  const [q, setQ] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const navigate = useNavigate();
  const data = useData();
  const { profile, user, session, signOut, isPlatformAdmin } = useAuth();
  const meta = (user?.user_metadata ?? {}) as { display_name?: string; full_name?: string };
  const displayName =
    profile?.display_name ||
    meta.display_name ||
    meta.full_name ||
    user?.email ||
    "Signed in";
  const userEmail = user?.email ?? "";
  const { data: unread = 0 } = useQuery({
    ...unreadNotificationsQuery(),
    enabled: Boolean(session?.user?.id),
  });


  // Cmd+K / Ctrl+K opens the command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Quick Create is intentionally hidden until real backend permission checks
  // land in Phase 2 — the previous frontend-only role gating is not a real
  // authorization source.


  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md md:px-6">
        <SidebarTrigger className="h-9 w-9" />

        <form
          className="relative ml-2 hidden w-full max-w-sm md:block"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/search", search: { q } as never });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setPaletteOpen(true)}
            placeholder="Search knowledge, assets, IPs, tasks, notes..."
            className="h-10 rounded-xl border-border/60 bg-card/60 pl-10 pr-20"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline-flex">
            <CommandIcon className="h-3 w-3" />K
          </kbd>
        </form>

        <div className="ml-auto flex items-center justify-end gap-2">
          <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search">
            <Search className="h-4 w-4" />
          </Button>

          {/* Quick Create hidden until Phase 2 backend permission checks. */}


          {/* Notification bell — opens drawer */}
          <Button
            size="icon"
            variant="ghost"
            className="relative"
            onClick={() => setNotifOpen(true)}
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--destructive)] px-1 text-[9px] font-bold text-destructive-foreground">
                {unread}
              </span>
            )}
          </Button>

          {/* Profile menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-1 flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 py-1.5 pl-1.5 pr-3 transition-colors hover:bg-card/80">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
                  <User className="h-3.5 w-3.5" />
                </div>
                <div className="hidden text-xs leading-tight sm:block">
                  <div className="font-medium">{displayName}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {isPlatformAdmin ? "Platform admin" : "Authenticated user"}
                  </div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{displayName}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">{userEmail}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Sliders className="h-3 w-3" /> Quick preferences
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); updateSettings({ compactMode: !data.settings.compactMode }); }}>
                <Check className={cn("mr-2 h-4 w-4", data.settings.compactMode ? "opacity-100" : "opacity-0")} /> Compact mode
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); updateSettings({ reducedMotion: !data.settings.reducedMotion }); }}>
                <Check className={cn("mr-2 h-4 w-4", data.settings.reducedMotion ? "opacity-100" : "opacity-0")} /> Reduced motion
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); updateSettings({ showNotifications: !data.settings.showNotifications }); }}>
                <Check className={cn("mr-2 h-4 w-4", data.settings.showNotifications ? "opacity-100" : "opacity-0")} /> Show notifications
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings" className="flex items-center">
                  <UserCog className="mr-2 h-4 w-4" /> Open settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  const result = await signOut();
                  navigate({ to: "/auth", replace: true });
                  if (result.error) toast.error(result.error);
                  else toast.success("Signed out");
                }}
              >
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* mini badge for unread used by screen readers */}
        {unread > 0 && (
          <Badge variant="outline" className="sr-only">{unread} unread notifications</Badge>
        )}
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <NotificationDrawer open={notifOpen} onOpenChange={setNotifOpen} />
    </>
  );
}
