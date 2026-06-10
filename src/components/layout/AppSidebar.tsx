import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  Search,
  Server,
  Network,
  CheckSquare,
  StickyNote,
  Trash2,
  Settings as SettingsIcon,
  Brain,
  Ticket,
  Inbox,
  ShoppingBag,
  ShieldCheck,
  BarChart3,
  Users,
  UsersRound,
  KeyRound,
  Sliders,
  ListChecks,
  FileCode,
  Wrench,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useData } from "@/lib/data/store";

import { useAuth } from "@/lib/auth/AuthProvider";

const groups = [
  {
    label: "Knowledge",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Knowledge Base", url: "/documents", icon: FileText },
      { title: "Global Search", url: "/search", icon: Search },
    ],
  },
  {
    label: "Service Desk",
    items: [
      { title: "Tickets", url: "/tickets", icon: Ticket },
      { title: "My Requests", url: "/my-requests", icon: Inbox },
      { title: "Service Catalog", url: "/service-catalog", icon: ShoppingBag },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "CMDB", url: "/cmdb", icon: Server },
      { title: "IPAM", url: "/ipam", icon: Network },
      { title: "Tasks", url: "/tasks", icon: CheckSquare },
      { title: "Protocols", url: "/protocols", icon: ListChecks },
      { title: "Notes", url: "/notes", icon: StickyNote },
    ],
  },
  {
    label: "Governance",
    items: [
      { title: "Audit Log", url: "/audit", icon: ShieldCheck },
      { title: "Reports", url: "/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Users", url: "/admin/users", icon: Users },
      { title: "Teams", url: "/admin/teams", icon: UsersRound },
      { title: "Roles", url: "/admin/roles", icon: KeyRound },
      { title: "Templates", url: "/admin/templates", icon: FileCode },
      { title: "Ticket Configuration", url: "/admin/ticket-settings", icon: Sliders },
      { title: "Diagnostics", url: "/admin/diagnostics", icon: Wrench },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Recycle Bin", url: "/trash", icon: Trash2 },
      { title: "Settings", url: "/settings", icon: SettingsIcon },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const data = useData();
  const { isPlatformAdmin } = useAuth();

  // Only admin links are gated, by the real is_platform_admin() result.
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !(it.url.startsWith("/admin") && !isPlatformAdmin)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-primary/30">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-semibold tracking-tight">IT Knowledge Center</div>
            <div className="truncate text-[11px] text-muted-foreground">Operations & documentation</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="kb-scroll px-2 py-2">
        {visibleGroups.map((g) => (
          <SidebarGroup key={g.label} className="py-1">
            <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60 group-data-[collapsible=icon]:sr-only">
              {g.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {g.items.map((item) => {
                  const active =
                    item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="h-9 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:!w-8 group-data-[collapsible=icon]:!px-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:mx-auto"
                      >
                        <Link to={item.url} className="flex w-full items-center gap-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
                          <item.icon className="h-4 w-4 shrink-0 opacity-80" />
                          <span className="flex-1 truncate group-data-[collapsible=icon]:hidden">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-4 py-3 group-data-[collapsible=icon]:hidden">
        <p className="text-[10px] text-muted-foreground/60">
          IT Knowledge Center · v2.0
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}

