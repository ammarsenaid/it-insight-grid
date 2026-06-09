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
  RefreshCw,
  Database,
  Folder,
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
import { Button } from "@/components/ui/button";
import { refreshFromStorage, useData } from "@/lib/data/store";
import { useKnowledge } from "@/lib/knowledge/store";
import { canSeePage, useRole } from "@/lib/permissions";
import { useAuth } from "@/lib/auth/AuthProvider";
import { toast } from "sonner";

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
      { title: "Mailbox Simulator", url: "/admin/mailbox", icon: Inbox },
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
  const knowledge = useKnowledge();
  const { isPlatformAdmin } = useAuth();
  const ticketsCount = data.tickets.length;
  const knowledgePageCount = knowledge.nodes.filter((n) => n.type === "page").length;
  const spaceCount = knowledge.nodes.filter((n) => n.type === "space").length;

  // Global navigation no longer relies on the frontend-only prototype roles.
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
            <div className="truncate text-[11px] text-muted-foreground">Local IT Documentation</div>
            <Badge variant="outline" className="mt-1 h-5 border-primary/30 bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
              v{data.settings.version}
            </Badge>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {visibleGroups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
              {g.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => {
                  const active =
                    item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <Link to={item.url} className="flex items-center gap-3">
                          <item.icon className="h-4 w-4" />
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

      <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:hidden">
        <div className="glass-card rounded-xl p-3 text-xs">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <Database className="h-3.5 w-3.5 metric-accent-primary" />
            <span>Local Prototype</span>
          </div>
          <div className="space-y-1 text-muted-foreground">
            <Row icon={<FileText className="h-3 w-3" />} label="Knowledge Pages" value={knowledgePageCount} />
            <Row icon={<Folder className="h-3 w-3" />} label="Spaces" value={spaceCount} />
            <Row icon={<Ticket className="h-3 w-3" />} label="Tickets" value={ticketsCount} />
            <Row icon={<Trash2 className="h-3 w-3" />} label="Recycle Bin" value={data.trash.length} />
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3 h-8 w-full text-xs"
            onClick={() => {
              refreshFromStorage();
              toast.success("Local data refreshed");
            }}
          >
            <RefreshCw className="mr-1.5 h-3 w-3" /> Refresh local data
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5">
        {icon} {label}
      </span>
      <span className="font-mono text-foreground/80">{value}</span>
    </div>
  );
}
