import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  Eye,
  KeyRound,
  Layers,
  Lock,
  MoreHorizontal,
  Network,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { can, useRole } from "@/lib/permissions";

import { PeopleAndOrganizationPage } from "./admin.users";
import { AdminRolesPage } from "./admin.roles";

export const Route = createFileRoute("/admin/identity")({
  head: () => ({ meta: [{ title: "Identity & Access · IT Knowledge Center" }] }),
  component: IdentityAndAccessPage,
});

/* ───────────────────────── Section model ───────────────────────── */

type SectionKey =
  | "users"
  | "departments"
  | "teams"
  | "access-map"
  | "roles"
  | "preview"
  | "permissions"
  | "pages";

type Section = {
  key: SectionKey;
  label: string;
  hint: string;
  icon: typeof Users;
  group: "people" | "access" | "advanced";
};

const SECTIONS: Section[] = [
  { key: "users",       label: "Users",         hint: "Accounts & status",     icon: Users,       group: "people" },
  { key: "departments", label: "Departments",   hint: "Workspaces & ownership",icon: Building2,   group: "people" },
  { key: "teams",       label: "Teams",         hint: "Routing & on-call",     icon: UsersRound,  group: "people" },
  { key: "access-map",  label: "Access map",    hint: "Modules × roles",       icon: ShieldCheck, group: "people" },
  { key: "roles",       label: "Roles",         hint: "Role catalog",          icon: KeyRound,    group: "access" },
  { key: "preview",     label: "Role preview",  hint: "Simulate a role",       icon: Network,     group: "access" },
  { key: "permissions", label: "Permissions",   hint: "Capability matrix",     icon: Layers,      group: "advanced" },
  { key: "pages",       label: "Page visibility", hint: "Route allow-list",    icon: Eye,         group: "advanced" },
];

const SECTION_TO_USERS_TAB: Partial<Record<SectionKey, "users" | "departments" | "teams" | "access">> = {
  users: "users",
  departments: "departments",
  teams: "teams",
  "access-map": "access",
};

const SECTION_TO_ROLES_TAB: Partial<Record<SectionKey, "roles" | "capabilities" | "pages" | "preview">> = {
  roles: "roles",
  preview: "preview",
  permissions: "capabilities",
  pages: "pages",
};

/* ───────────────────────── Page ───────────────────────── */

function IdentityAndAccessPage() {
  const role = useRole();
  const allowed = can("admin.users", role) || can("admin.roles", role);

  const [section, setSection] = useState<SectionKey>("users");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [query, setQuery] = useState("");

  if (!allowed) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Lock}
          title="Admin access required"
          description="Sign in with an administrator role to manage identity and access."
        />
      </div>
    );
  }

  const visibleSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SECTIONS.filter((s) => {
      if (!showAdvanced && s.group === "advanced") return false;
      if (!q) return true;
      return s.label.toLowerCase().includes(q) || s.hint.toLowerCase().includes(q);
    });
  }, [query, showAdvanced]);

  const peopleSections = visibleSections.filter((s) => s.group === "people");
  const accessSections = visibleSections.filter((s) => s.group === "access");
  const advancedSections = visibleSections.filter((s) => s.group === "advanced");
  const meta = SECTIONS.find((s) => s.key === section)!;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 w-full overflow-hidden">
      {/* ─── Left rail: directory ─── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/40 bg-card/30 lg:flex">
        <div className="flex items-center justify-between border-b border-border/40 px-3 py-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Identity & Access
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Workbench
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? "Hide advanced sections" : "Show advanced sections"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Developer
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/admin/users">Open legacy /admin/users</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/admin/roles">Open legacy /admin/roles</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="px-3 py-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter sections…"
            className="h-8 w-full rounded-md border border-border/50 bg-background/50 px-2 text-xs outline-none focus:border-border"
          />
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-4 px-2 pb-3">
            <NavGroup label="People"        items={peopleSections}   active={section} onSelect={setSection} />
            <NavGroup label="Access control" items={accessSections}   active={section} onSelect={setSection} />
            {showAdvanced && (
              <NavGroup label="Advanced"    items={advancedSections} active={section} onSelect={setSection} />
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* ─── Main column ─── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Slim breadcrumb / mobile selector */}
        <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-background/60 px-4 py-2 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span>Identity & Access</span>
            <ChevronRight className="h-3 w-3" />
            <span className="truncate text-foreground">{meta.label}</span>
            <span className="ml-1 hidden text-muted-foreground/70 md:inline">· {meta.hint}</span>
          </div>
          <select
            value={section}
            onChange={(e) => setSection(e.target.value as SectionKey)}
            className="h-7 rounded-md border border-border/50 bg-background px-2 text-xs lg:hidden"
          >
            {SECTIONS.filter((s) => showAdvanced || s.group !== "advanced").map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="px-4 py-4 md:px-6">
            <SectionRouter key={section} section={section} />
          </div>
        </div>
      </main>

      {/* ─── Right rail: context summary ─── */}
      <aside className="hidden w-72 shrink-0 flex-col border-l border-border/40 bg-card/30 xl:flex">
        <ContextRail section={section} onJump={setSection} />
      </aside>
    </div>
  );
}

/* ───────────────────────── Section router ───────────────────────── */

function SectionRouter({ section }: { section: SectionKey }) {
  const usersTab = SECTION_TO_USERS_TAB[section];
  const rolesTab = SECTION_TO_ROLES_TAB[section];
  if (usersTab) return <PeopleAndOrganizationPage embeddedTab={usersTab} />;
  if (rolesTab) return <AdminRolesPage embeddedTab={rolesTab} />;
  return null;
}

/* ───────────────────────── Nav group ───────────────────────── */

function NavGroup({
  label, items, active, onSelect,
}: {
  label: string;
  items: Section[];
  active: SectionKey;
  onSelect: (s: SectionKey) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {label}
      </div>
      <div className="space-y-0.5">
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.key;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onSelect(it.key)}
              className={cn(
                "group flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors",
                isActive ? "border-border/60 bg-background/70" : "hover:bg-background/50",
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", isActive ? "text-foreground" : "text-muted-foreground")} />
              <div className="min-w-0">
                <div className={cn("truncate text-sm", isActive && "font-medium")}>{it.label}</div>
                <div className="truncate text-[11px] text-muted-foreground">{it.hint}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Context rail ───────────────────────── */

function ContextRail({
  section, onJump,
}: { section: SectionKey; onJump: (s: SectionKey) => void }) {
  const { effectiveAccess, profile } = useAuth();
  const role = useRole();
  const meta = SECTIONS.find((s) => s.key === section)!;

  const summary: { title: string; body: string; bullets: string[] } = useMemo(() => {
    switch (section) {
      case "users":
        return {
          title: "About users",
          body: "Active directory of every account. Select a user to inspect roles, teams, departments and effective access.",
          bullets: ["Status = whether the account can sign in", "Roles drive permissions", "Teams drive routing & ownership"],
        };
      case "departments":
        return {
          title: "About departments",
          body: "Departments are the top organizational unit. They own workspaces and inherit visibility to their resources.",
          bullets: ["1 department = 1 workspace", "Users may belong to many", "Owners can manage members"],
        };
      case "teams":
        return {
          title: "About teams",
          body: "Operational groups used for ticket routing, on-call rotation and shared queues.",
          bullets: ["Teams nest under a workspace", "Members may share roles", "Used by the Service Desk"],
        };
      case "access-map":
        return {
          title: "About access map",
          body: "A read-only overview of which roles can reach which modules at a glance.",
          bullets: ["Read · Write · Manage · Admin", "Aggregates capability grants", "Use it to spot privilege gaps"],
        };
      case "roles":
        return {
          title: "About roles",
          body: "Roles bundle capability grants. Platform roles apply globally; team roles apply within a team scope.",
          bullets: ["Edit name & description in place", "Cannot delete system roles", "Preview with the simulator"],
        };
      case "preview":
        return {
          title: "About role preview",
          body: "Simulate what a role can actually reach without changing your own session.",
          bullets: ["Switch ‘Acting as’ in the toolbar", "Compare two roles side by side", "See blockers per route"],
        };
      case "permissions":
        return {
          title: "About permissions",
          body: "Fine-grained capability grants per role. Toggling a cell saves instantly with undo.",
          bullets: ["Cells flash on save", "Use ‘Differs only’ to compare", "Collapse groups for density"],
        };
      case "pages":
        return {
          title: "About page visibility",
          body: "Stored route allow-list per role compared against the backend contract for effective access.",
          bullets: ["Visibility ≠ permission", "Both gates must pass", "Static rules are reference-only"],
        };
    }
  }, [section]);

  const permCount = effectiveAccess?.permissionKeys.length ?? 0;
  const routeCount = effectiveAccess?.visibleRoutes.length ?? 0;
  const roleKeys = effectiveAccess?.roleKeys ?? [role];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Section context */}
      <div className="border-b border-border/40 p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <meta.icon className="h-3.5 w-3.5" /> {meta.label}
        </div>
        <p className="mt-2 text-sm font-medium leading-snug">{summary.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{summary.body}</p>
        <ul className="mt-3 space-y-1">
          {summary.bullets.map((b) => (
            <li key={b} className="flex gap-2 text-[11px] text-muted-foreground">
              <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <Separator className="bg-border/40" />

      {/* Your effective access */}
      <div className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Your effective access
        </div>
        <div className="mt-1 text-sm font-medium">
          {profile?.display_name ?? profile?.email ?? "Signed-in user"}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">UI role · {role}</div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Permissions" value={permCount} />
          <Stat label="Routes" value={routeCount} />
        </div>

        <div className="mt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Roles held
          </div>
          <div className="flex flex-wrap gap-1.5">
            {roleKeys.length === 0 ? (
              <span className="text-xs text-muted-foreground">No roles assigned.</span>
            ) : (
              roleKeys.map((r) => (
                <Badge key={r} variant="secondary" className="h-5 text-[10px]">{r}</Badge>
              ))
            )}
          </div>
        </div>
      </div>

      <Separator className="bg-border/40" />

      {/* Jump-tos */}
      <div className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Jump to
        </div>
        <div className="space-y-1">
          <RailLink label="Simulate a role"      onClick={() => onJump("preview")} />
          <RailLink label="Browse role catalog"  onClick={() => onJump("roles")} />
          <RailLink label="Module access overview" onClick={() => onJump("access-map")} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-2">
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function RailLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md border border-border/30 bg-background/30 px-2 py-1.5 text-left text-xs hover:bg-background/60"
    >
      <span>{label}</span>
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}
