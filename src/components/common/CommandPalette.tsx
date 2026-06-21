import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  FileText,
  Server,
  Network,
  CheckSquare,
  StickyNote,
  Search,
  Trash2,
  Settings as SettingsIcon,
  Ticket,
  Inbox,
  ShieldCheck,
  BarChart3,
  Users,
  UsersRound,
  KeyRound,
  Sliders,

  BookOpen,
  Clock,
  CornerDownLeft,
  type LucideIcon,
} from "lucide-react";
import { useData } from "@/lib/data/store";
import { useKnowledge } from "@/lib/knowledge/store";
import { useTeamArticles } from "@/lib/knowledge/useTeamArticles";
import { useAuth } from "@/lib/auth/AuthProvider";
import { canSeePage, hasPageVisibilityRule, useRole, type Role } from "@/lib/permissions";


type NavGroup =
  | "Pages"
  | "Tickets"
  | "Knowledge"
  | "Assets"
  | "IPAM"
  | "Tasks"
  | "Protocols"
  | "Notes"
  | "Admin"
  | "System";

interface NavEntry {
  label: string;
  to: string;
  icon: LucideIcon;
  group: NavGroup;
  keywords?: string;
}

const NAV: NavEntry[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, group: "Pages" },
  { label: "Global search", to: "/search", icon: Search, group: "Pages", keywords: "find" },
  { label: "Tickets", to: "/tickets", icon: Ticket, group: "Tickets" },
  { label: "My requests", to: "/my-requests", icon: Inbox, group: "Tickets" },
  { label: "Knowledge base", to: "/documents", icon: FileText, group: "Knowledge", keywords: "docs articles" },
  { label: "CMDB", to: "/cmdb", icon: Server, group: "Assets", keywords: "inventory hardware" },
  { label: "IPAM", to: "/ipam", icon: Network, group: "IPAM", keywords: "subnet ip address" },
  { label: "Tasks", to: "/tasks", icon: CheckSquare, group: "Tasks" },
  { label: "Protocols", to: "/protocols", icon: ShieldCheck, group: "Protocols", keywords: "runbook" },
  { label: "Notes", to: "/notes", icon: StickyNote, group: "Notes" },
  { label: "Audit log", to: "/audit", icon: ShieldCheck, group: "Admin" },
  { label: "Reports", to: "/reports", icon: BarChart3, group: "Admin" },
  { label: "Users", to: "/admin/users", icon: Users, group: "Admin" },
  { label: "Teams", to: "/admin/teams", icon: UsersRound, group: "Admin" },
  { label: "Roles", to: "/admin/roles", icon: KeyRound, group: "Admin" },
  { label: "Ticket configuration", to: "/admin/ticket-settings", icon: Sliders, group: "Admin" },
  { label: "Recycle bin", to: "/trash", icon: Trash2, group: "System" },
  { label: "Settings", to: "/settings", icon: SettingsIcon, group: "System" },
];

const RECENT_KEY = "cmdk:recent";
const MAX_RECENT = 5;

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(to: string) {
  if (typeof window === "undefined") return;
  try {
    const cur = readRecent().filter((x) => x !== to);
    const next = [to, ...cur].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function canViewDestination(to: string, role: Role, isPlatformAdmin: boolean): boolean {
  if (to.startsWith("/admin") && !hasPageVisibilityRule(to)) return isPlatformAdmin;
  return canSeePage(to, role);
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const data = useData();
  const knowledge = useKnowledge();
  const backend = useTeamArticles();
  const { isPlatformAdmin } = useAuth();
  const role = useRole();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  const canViewDocuments = canViewDestination("/documents", role, isPlatformAdmin);
  const canViewCmdb = canViewDestination("/cmdb", role, isPlatformAdmin);
  const canViewTasks = canViewDestination("/tasks", role, isPlatformAdmin);
  const canViewSearch = canViewDestination("/search", role, isPlatformAdmin);

  useEffect(() => {
    if (open) {
      setRecent(readRecent());
    } else {
      setQuery("");
    }
  }, [open]);

  const records = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return { pages: [], backendArticles: [], assets: [], tasks: [] };
    return {
      pages: canViewDocuments
        ? knowledge.nodes
            .filter((n) => n.type === "page" && n.title.toLowerCase().includes(q))
            .slice(0, 5)
        : [],
      backendArticles: canViewDocuments
        ? backend.articles
            .filter((a) => a.title.toLowerCase().includes(q) || (a.excerpt ?? "").toLowerCase().includes(q))
            .slice(0, 6)
        : [],
      assets: canViewCmdb
        ? data.assets
            .filter((a) => a.hostname.toLowerCase().includes(q) || a.displayName.toLowerCase().includes(q))
            .slice(0, 5)
        : [],
      tasks: canViewTasks
        ? data.tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 5)
        : [],
    };
  }, [query, data, knowledge, backend, canViewDocuments, canViewCmdb, canViewTasks]);

  const visibleNav = useMemo(
    () => NAV.filter((n) => canViewDestination(n.to, role, isPlatformAdmin)),
    [role, isPlatformAdmin],
  );

  const navByPath = useMemo(() => {
    const m = new Map<string, NavEntry>();
    visibleNav.forEach((n) => m.set(n.to, n));
    return m;
  }, [visibleNav]);

  const go = (to: string) => {
    if (!canViewDestination(to, role, isPlatformAdmin)) return;
    pushRecent(to);
    onOpenChange(false);
    navigate({ to });
  };

  const goArticle = (id: string) => {
    onOpenChange(false);
    navigate({ to: "/documents", search: { article: id } });
  };

  const groups = useMemo(() => {
    const g: Record<string, NavEntry[]> = {};
    for (const item of visibleNav) {
      (g[item.group] ??= []).push(item);
    }
    return g;
  }, [visibleNav]);

  const hasQuery = query.trim().length > 0;
  const recentItems = recent
    .map((to) => navByPath.get(to))
    .filter((x): x is NavEntry => Boolean(x));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        autoFocus
        placeholder="Search pages, tickets, knowledge, assets, tasks…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-1 py-2">
            <Search className="h-4 w-4 text-muted-foreground/60" />
            <span className="text-sm">No results for “{query}”.</span>
            <span className="text-xs text-muted-foreground">Try a shorter or different term.</span>
          </div>
        </CommandEmpty>

        {!hasQuery && (
          <>
            {canViewSearch && (
              <CommandGroup heading="Quick actions">
                <CommandItem onSelect={() => go("/search")}>
                  <Search className="mr-2 h-4 w-4" /> Open global search
                  <CommandShortcut>/</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            )}

            {recentItems.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Recent">
                  {recentItems.map((item) => (
                    <CommandItem key={`recent-${item.to}`} onSelect={() => go(item.to)}>
                      <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                      {item.label}
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                        {item.group}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            <CommandSeparator />
          </>
        )}

        {Object.entries(groups).map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((item) => (
              <CommandItem
                key={item.to}
                value={`${item.label} ${item.keywords ?? ""} ${item.group}`}
                onSelect={() => go(item.to)}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {hasQuery &&
          records.pages.length + records.backendArticles.length + records.assets.length + records.tasks.length > 0 && (
            <>
              <CommandSeparator />
              {records.backendArticles.length > 0 && (
                <CommandGroup heading="Knowledge">
                  {records.backendArticles.map((a) => (
                    <CommandItem key={a.id} value={`kb ${a.title}`} onSelect={() => goArticle(a.id)}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      <span className="truncate">{a.title}</span>
                      <span className="ml-2 truncate text-xs text-muted-foreground">{a.team_name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {records.pages.length > 0 && (
                <CommandGroup heading="Knowledge pages">
                  {records.pages.map((d) => (
                    <CommandItem key={d.id} value={`page ${d.title}`} onSelect={() => go("/documents")}>
                      <FileText className="mr-2 h-4 w-4" /> {d.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {records.assets.length > 0 && (
                <CommandGroup heading="Assets">
                  {records.assets.map((a) => (
                    <CommandItem key={a.id} value={`asset ${a.hostname}`} onSelect={() => go("/cmdb")}>
                      <Server className="mr-2 h-4 w-4" /> {a.hostname}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {records.tasks.length > 0 && (
                <CommandGroup heading="Tasks">
                  {records.tasks.map((t) => (
                    <CommandItem key={t.id} value={`task ${t.title}`} onSelect={() => go("/tasks")}>
                      <CheckSquare className="mr-2 h-4 w-4" /> {t.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
      </CommandList>

      {/* Keyboard hint footer */}
      <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border/60 bg-background/60 px-1 py-0.5 font-mono">↑↓</kbd>
            Navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="inline-flex items-center rounded border border-border/60 bg-background/60 px-1 py-0.5 font-mono">
              <CornerDownLeft className="h-2.5 w-2.5" />
            </kbd>
            Select
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border/60 bg-background/60 px-1 py-0.5 font-mono">Esc</kbd>
            Close
          </span>
        </div>
        <span className="hidden sm:inline">Permission-aware</span>
      </div>
    </CommandDialog>
  );
}
