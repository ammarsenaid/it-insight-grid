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
  Plus,
  BookOpen,
} from "lucide-react";
import { useData } from "@/lib/data/store";
import { useKnowledge } from "@/lib/knowledge/store";
import { useTeamArticles } from "@/lib/knowledge/useTeamArticles";
import { toast } from "sonner";

const NAV = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, group: "Knowledge" },
  { label: "Knowledge Base", to: "/documents", icon: FileText, group: "Knowledge" },
  { label: "Global Search", to: "/search", icon: Search, group: "Knowledge" },
  { label: "Tickets", to: "/tickets", icon: Ticket, group: "Service Desk" },
  { label: "My Requests", to: "/my-requests", icon: Inbox, group: "Service Desk" },
  
  { label: "CMDB", to: "/cmdb", icon: Server, group: "Operations" },
  { label: "IPAM", to: "/ipam", icon: Network, group: "Operations" },
  { label: "Tasks", to: "/tasks", icon: CheckSquare, group: "Operations" },
  { label: "Notes", to: "/notes", icon: StickyNote, group: "Operations" },
  { label: "Audit Log", to: "/audit", icon: ShieldCheck, group: "Governance" },
  { label: "Reports", to: "/reports", icon: BarChart3, group: "Governance" },
  { label: "Users", to: "/admin/users", icon: Users, group: "Administration" },
  { label: "Teams", to: "/admin/teams", icon: UsersRound, group: "Administration" },
  { label: "Roles", to: "/admin/roles", icon: KeyRound, group: "Administration" },
  { label: "Ticket Configuration", to: "/admin/ticket-settings", icon: Sliders, group: "Administration" },
  { label: "Recycle Bin", to: "/trash", icon: Trash2, group: "System" },
  { label: "Settings", to: "/settings", icon: SettingsIcon, group: "System" },
];

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
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const records = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return { pages: [], backendArticles: [], assets: [], tasks: [] };
    return {
      pages: knowledge.nodes
        .filter((n) => n.type === "page" && n.title.toLowerCase().includes(q))
        .slice(0, 5),
      backendArticles: backend.articles
        .filter((a) => a.title.toLowerCase().includes(q) || (a.excerpt ?? "").toLowerCase().includes(q))
        .slice(0, 6),
      assets: data.assets.filter((a) => a.hostname.toLowerCase().includes(q) || a.displayName.toLowerCase().includes(q)).slice(0, 5),
      tasks: data.tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 5),
    };
  }, [query, data, knowledge, backend]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate({ to });
  };

  const goArticle = (id: string) => {
    onOpenChange(false);
    navigate({ to: "/documents", search: { article: id } });
  };

  const groups = useMemo(() => {
    const g: Record<string, typeof NAV> = {};
    for (const item of NAV) (g[item.group] ??= []).push(item);
    return g;
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages, knowledge, assets, tasks…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Quick actions">
          <CommandItem onSelect={() => { onOpenChange(false); toast.info("Open the create menu in the top bar."); }}>
            <Plus className="mr-2 h-4 w-4" /> New…
          </CommandItem>
          <CommandItem onSelect={() => go("/search")}>
            <Search className="mr-2 h-4 w-4" /> Open global search
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {Object.entries(groups).map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((item) => (
              <CommandItem key={item.to} onSelect={() => go(item.to)}>
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {(records.pages.length + records.backendArticles.length + records.assets.length + records.tasks.length) > 0 && (
          <>
            <CommandSeparator />
            {records.backendArticles.length > 0 && (
              <CommandGroup heading="Knowledge Base (Live)">
                {records.backendArticles.map((a) => (
                  <CommandItem key={a.id} onSelect={() => goArticle(a.id)}>
                    <BookOpen className="mr-2 h-4 w-4" />
                    <span className="truncate">{a.title}</span>
                    <span className="ml-2 truncate text-xs text-muted-foreground">{a.team_name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {records.pages.length > 0 && (
              <CommandGroup heading="Knowledge Base">
                {records.pages.map((d) => (
                  <CommandItem key={d.id} onSelect={() => go("/documents")}>
                    <FileText className="mr-2 h-4 w-4" /> {d.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {records.assets.length > 0 && (
              <CommandGroup heading="CMDB">
                {records.assets.map((a) => (
                  <CommandItem key={a.id} onSelect={() => go("/cmdb")}>
                    <Server className="mr-2 h-4 w-4" /> {a.hostname}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {records.tasks.length > 0 && (
              <CommandGroup heading="Tasks">
                {records.tasks.map((t) => (
                  <CommandItem key={t.id} onSelect={() => go("/tasks")}>
                    <CheckSquare className="mr-2 h-4 w-4" /> {t.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
