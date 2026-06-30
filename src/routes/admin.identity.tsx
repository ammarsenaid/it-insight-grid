import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronRight,
  Eye,
  KeyRound,
  Layers,
  Lock,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { can, useRole } from "@/lib/permissions";
import { adminRolePageVisibilityQuery, adminRolesQuery } from "@/lib/admin-roles/queries";
import { adminUsersQuery } from "@/lib/admin-users/queries";
import { getAdminUserAccessExplanation } from "@/lib/admin-users/create-user";

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
  | "effective"
  | "permissions"
  | "pages";

type SectionGroup = "people" | "access" | "insights";

type Section = {
  key: SectionKey;
  label: string;
  hint: string;
  icon: typeof Users;
  group: SectionGroup;
  advanced?: boolean;
};

const SECTIONS: Section[] = [
  { key: "users",       label: "Users",         hint: "Accounts & status",         icon: Users,       group: "people"   },
  { key: "departments", label: "Departments",   hint: "Workspaces & ownership",    icon: Building2,   group: "people"   },
  { key: "teams",       label: "Teams",         hint: "Routing & on-call",         icon: UsersRound,  group: "people"   },
  { key: "roles",       label: "Roles",         hint: "Role catalog & scope",      icon: KeyRound,    group: "access"   },
  { key: "pages",       label: "Page visibility", hint: "Route allow-list",        icon: Eye,         group: "access"   },
  { key: "permissions", label: "Capabilities",  hint: "Fine-grained grants",       icon: Layers,      group: "access", advanced: true },
  { key: "access-map",  label: "Access map",    hint: "Modules × roles",           icon: ShieldCheck, group: "insights" },
  { key: "preview",     label: "Role preview",  hint: "Simulate a role",           icon: Network,     group: "insights" },
  { key: "effective",   label: "Effective access", hint: "User access & provenance", icon: ShieldCheck, group: "insights" },
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

const GROUP_LABELS: Record<SectionGroup, string> = {
  people: "People",
  access: "Access",
  insights: "Insights",
};

/* ───────────────────────── Page ───────────────────────── */

const LS_PREFIX = "itkc.identity.";
function readPref(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(LS_PREFIX + key);
  return v == null ? fallback : v === "1";
}
function writePref(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_PREFIX + key, value ? "1" : "0");
}

function IdentityAndAccessPage() {
  const role = useRole();
  const allowed = can("admin.users", role) || can("admin.roles", role);

  const [section, setSection] = useState<SectionKey>("users");
  const [showAdvanced, setShowAdvanced] = useState(() => readPref("advanced", false));
  const [query, setQuery] = useState("");
  const [leftOpen, setLeftOpen] = useState(() => readPref("leftOpen", true));
  const [rightOpen, setRightOpen] = useState(() => readPref("rightOpen", false));
  const [userOverrode, setUserOverrode] = useState(false);

  useEffect(() => writePref("advanced", showAdvanced), [showAdvanced]);
  useEffect(() => writePref("leftOpen", leftOpen), [leftOpen]);
  useEffect(() => writePref("rightOpen", rightOpen), [rightOpen]);

  // Auto-collapse on narrow viewports — only until the user overrides.
  useEffect(() => {
    if (typeof window === "undefined" || userOverrode) return;
    const apply = () => {
      const w = window.innerWidth;
      if (w < 1280) setLeftOpen(false);
      if (w < 1536) setRightOpen(false);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [userOverrode]);

  const toggleLeft = () => { setUserOverrode(true); setLeftOpen((v) => !v); };
  const toggleRight = () => { setUserOverrode(true); setRightOpen((v) => !v); };

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

  return (
    <IdentityWorkbench
      section={section}
      onSection={setSection}
      query={query}
      onQuery={setQuery}
      showAdvanced={showAdvanced}
      onToggleAdvanced={() => setShowAdvanced((v) => !v)}
      leftOpen={leftOpen}
      onToggleLeft={toggleLeft}
      rightOpen={rightOpen}
      onToggleRight={toggleRight}
    />
  );
}

/* ───────────────────────── Workbench shell ───────────────────────── */

function IdentityWorkbench({
  section, onSection, query, onQuery,
  showAdvanced, onToggleAdvanced,
  leftOpen, onToggleLeft,
  rightOpen, onToggleRight,
}: {
  section: SectionKey;
  onSection: (s: SectionKey) => void;
  query: string;
  onQuery: (v: string) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  leftOpen: boolean;
  onToggleLeft: () => void;
  rightOpen: boolean;
  onToggleRight: () => void;
}) {
  // Live counts feed the nav rail badges. Both queries are cheap & cached.
  const { session, isPlatformAdmin } = useAuth();
  const role = useRole();
  const canManageTeams = can("admin.teams", role);
  const enabled = Boolean(session?.user) && isPlatformAdmin;
  const usersQ = useQuery({ ...adminUsersQuery(), enabled });
  const rolesQ = useQuery({ ...adminRolesQuery(), enabled });

  const counts: Partial<Record<SectionKey, number>> = {
    users: usersQ.data?.length,
    roles: rolesQ.data?.roles.length,
    permissions: rolesQ.data?.permissions.length,
  };

  const visibleSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SECTIONS.filter((s) => {
      if (s.advanced && !showAdvanced) return false;
      if (!q) return true;
      return s.label.toLowerCase().includes(q) || s.hint.toLowerCase().includes(q);
    });
  }, [query, showAdvanced]);

  const groups: SectionGroup[] = ["people", "access", "insights"];
  const meta = SECTIONS.find((s) => s.key === section)!;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 w-full overflow-hidden bg-background">
      {/* ─── Left rail: directory ─── */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border/40 bg-card/30 transition-[width] duration-200 md:flex",
          leftOpen ? "w-60" : "w-14",
        )}
      >
        <div className="flex items-center justify-between gap-1 border-b border-border/40 px-2 py-2">
          {leftOpen ? (
            <div className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Directory
            </div>
          ) : (
            <ShieldCheck className="mx-auto h-4 w-4 text-muted-foreground" />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={onToggleLeft}
            title={leftOpen ? "Collapse" : "Expand"}
          >
            {leftOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
        </div>

        {leftOpen && (
          <div className="px-2 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder="Filter directory…"
                className="h-8 w-full rounded-md border border-border/50 bg-background/50 pl-7 pr-2 text-xs outline-none focus:border-border"
              />
            </div>
          </div>
        )}

        <ScrollArea className="flex-1">
          {leftOpen ? (
            <div className="space-y-4 px-2 pb-3">
              {groups.map((g) => {
                const items = visibleSections.filter((s) => s.group === g);
                if (items.length === 0) return null;
                return (
                  <NavGroup
                    key={g}
                    label={GROUP_LABELS[g]}
                    items={items}
                    counts={counts}
                    active={section}
                    onSelect={onSection}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 px-1 py-1">
              {visibleSections.map((it) => {
                const Icon = it.icon;
                const active = section === it.key;
                return (
                  <Tooltip key={it.key}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onSection(it.key)}
                        className={cn(
                          "grid h-9 w-9 place-items-center rounded-md border border-transparent text-muted-foreground transition-colors",
                          active ? "border-border/60 bg-background/70 text-foreground" : "hover:bg-background/50",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{it.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {leftOpen && (
          <div className="border-t border-border/40 px-2 py-2">
            <button
              type="button"
              onClick={onToggleAdvanced}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-background/50"
            >
              <span className="uppercase tracking-wider">Advanced sections</span>
              <Badge variant="outline" className="h-4 border-border/50 px-1.5 text-[10px]">
                {showAdvanced ? "On" : "Off"}
              </Badge>
            </button>
          </div>
        )}
      </aside>

      {/* ─── Main column ─── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Unified command strip: breadcrumb · title · actions · rail toggles */}
        <header className="flex items-center gap-3 border-b border-border/40 bg-background/70 px-3 py-2 backdrop-blur sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <meta.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="hidden sm:inline">Identity & Access</span>
                <ChevronRight className="hidden h-3 w-3 sm:inline" />
                <span className="text-muted-foreground/80">{GROUP_LABELS[meta.group]}</span>
              </div>
              <h1 className="truncate text-sm font-semibold leading-tight text-foreground sm:text-base">
                {meta.label}
                <span className="ml-2 hidden text-[11px] font-normal text-muted-foreground lg:inline">
                  · {meta.hint}
                </span>
              </h1>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <SectionPrimaryActions
              section={section}
              onJump={onSection}
              canCreateUser={isPlatformAdmin}
              canCreateTeam={canManageTeams}
            />
            <select
              value={section}
              onChange={(e) => onSection(e.target.value as SectionKey)}
              className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs md:hidden"
            >
              {SECTIONS.filter((s) => showAdvanced || !s.advanced).map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <Separator orientation="vertical" className="hidden h-5 lg:block" />
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-7 w-7 text-muted-foreground lg:inline-flex"
              onClick={onToggleRight}
              title={rightOpen ? "Hide context" : "Show context"}
            >
              {rightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="px-3 py-4 sm:px-4 md:px-5">
            <SectionRouter key={section} section={section} onSection={onSection} />
          </div>
        </div>
      </main>

      {/* ─── Right rail: context ─── */}
      {rightOpen && (
        <aside className="hidden w-72 shrink-0 flex-col border-l border-border/40 bg-card/30 lg:flex">
          <ContextRail section={section} onJump={onSection} />
        </aside>
      )}
    </div>
  );
}

/* ───────────────────────── Section router ───────────────────────── */

function SectionRouter({
  section,
  onSection,
}: {
  section: SectionKey;
  onSection: (section: SectionKey) => void;
}) {
  const usersTab = SECTION_TO_USERS_TAB[section];
  const rolesTab = SECTION_TO_ROLES_TAB[section];
  if (usersTab) return <PeopleAndOrganizationPage embeddedTab={usersTab} />;
  if (section === "effective") return <EffectiveUserAccessInspector />;
  if (rolesTab) {
    return (
      <AdminRolesPage
        embeddedTab={rolesTab}
        onEmbeddedTabChange={(tab) => {
          const nextSection = Object.entries(SECTION_TO_ROLES_TAB).find(
            ([, mappedTab]) => mappedTab === tab,
          )?.[0] as SectionKey | undefined;
          if (nextSection) onSection(nextSection);
        }}
      />
    );
  }
  return null;
}

/* ───────────────────────── Section primary actions (compact, in strip) ───────────────────────── */

function fire(name: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name));
}

function SectionPrimaryActions({
  section,
  onJump,
  canCreateUser,
  canCreateTeam,
}: {
  section: SectionKey;
  onJump: (s: SectionKey) => void;
  canCreateUser: boolean;
  canCreateTeam: boolean;
}) {
  const actions = (() => {
    switch (section) {
      case "users":
        return canCreateUser
          ? [{ label: "Add user", icon: UserPlus, onClick: () => fire("itkc:create-user") }]
          : [];
      case "teams":
        return canCreateTeam
          ? [{ label: "New team", icon: Plus, onClick: () => fire("itkc:create-team") }]
          : [];
      case "access-map":
        return [{ label: "Preview a role", icon: Network, onClick: () => onJump("preview") }];
      case "roles":
        return [{ label: "Preview a role", icon: Network, onClick: () => onJump("preview") }];
      case "preview":
        return [{ label: "Back to roles", icon: KeyRound, onClick: () => onJump("roles") }];
      case "effective":
        return [];
      case "permissions":
      case "pages":
        return [{ label: "Back to roles", icon: KeyRound, onClick: () => onJump("roles") }];
      default:
        return [];
    }
  })();

  if (actions.length === 0) return null;

  return (
    <>
      {actions.map((a, i) => {
        const Icon = a.icon;
        return (
          <Button
            key={a.label}
            size="sm"
            variant={i === 0 ? "default" : "outline"}
            onClick={a.onClick}
            className="h-8"
          >
            <Icon className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">{a.label}</span>
          </Button>
        );
      })}
    </>
  );
}

/* ───────────────────────── Nav group ───────────────────────── */

function NavGroup({
  label, items, counts, active, onSelect,
}: {
  label: string;
  items: Section[];
  counts: Partial<Record<SectionKey, number>>;
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
          const count = counts[it.key];
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onSelect(it.key)}
              className={cn(
                "group flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors",
                isActive ? "border-border/60 bg-background/70" : "hover:bg-background/50",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-foreground" : "text-muted-foreground")} />
              <div className="min-w-0 flex-1">
                <div className={cn("truncate text-sm", isActive && "font-medium")}>{it.label}</div>
                <div className="truncate text-[11px] text-muted-foreground">{it.hint}</div>
              </div>
              {typeof count === "number" && (
                <Badge variant="outline" className="h-4 shrink-0 border-border/40 bg-background/40 px-1.5 text-[10px] font-normal text-muted-foreground">
                  {count}
                </Badge>
              )}
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
  const { effectiveAccess, profile, isPlatformAdmin } = useAuth();
  const role = useRole();
  const canManageTeams = can("admin.teams", role);
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
          bullets: ["Switch 'Acting as' in the toolbar", "Compare two roles side by side", "See blockers per route"],
        };
      case "effective":
        return {
          title: "About effective access",
          body: "Inspect a real user's backend role, permission, and route sources without changing access.",
          bullets: ["Platform roles drive routes", "Team roles add top-level permissions", "Workspace grants stay scoped"],
        };
      case "permissions":
        return {
          title: "About capabilities",
          body: "Fine-grained capability grants per role. Toggling a cell saves instantly with undo.",
          bullets: ["Cells flash on save", "Use 'Differs only' to compare", "Collapse groups for density"],
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

  // ── Role inspector (Step 5): pick any role and see its real grants. ──
  const { session } = useAuth();
  const rolesQ = useQuery({
    ...adminRolesQuery(),
    enabled: Boolean(session?.user) && isPlatformAdmin,
  });
  const pageVisQ = useQuery({
    ...adminRolePageVisibilityQuery(),
    enabled: Boolean(session?.user) && isPlatformAdmin,
  });

  const allRoles = rolesQ.data?.roles ?? [];
  const allPerms = rolesQ.data?.permissions ?? [];
  const allGrants = rolesQ.data?.grants ?? [];
  const allVis = pageVisQ.data ?? [];

  // Default the inspector to the user's own primary role if we can match it.
  const defaultRoleId = useMemo(() => {
    const myKey = (effectiveAccess?.roleKeys ?? [role])[0];
    return allRoles.find((r) => r.roleKey === myKey)?.id ?? allRoles[0]?.id ?? "";
  }, [allRoles, effectiveAccess?.roleKeys, role]);

  const [inspectRoleId, setInspectRoleId] = useState<string>("");
  const activeRoleId = inspectRoleId || defaultRoleId;
  const activeRole = allRoles.find((r) => r.id === activeRoleId);

  const grantedPermIds = useMemo(
    () => new Set(allGrants.filter((g) => g.roleId === activeRoleId).map((g) => g.permissionId)),
    [allGrants, activeRoleId],
  );
  const grantedPerms = allPerms.filter((p) => grantedPermIds.has(p.id));
  const visibleRoutes = allVis.filter((v) => v.roleId === activeRoleId && v.canView);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Section explainer */}
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

      {/* You */}
      <div className="px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          You
        </div>
        <div className="mt-1 truncate text-sm font-medium">
          {profile?.display_name ?? profile?.email ?? "Signed-in user"}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">UI role · {role}</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat label="Permissions" value={effectiveAccess?.permissionKeys.length ?? 0} />
          <Stat label="Routes" value={effectiveAccess?.visibleRoutes.length ?? 0} />
        </div>
      </div>

      <Separator className="bg-border/40" />

      {/* Inspector */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Effective access inspector
            </div>
            {activeRole && (
              <Badge
                variant="outline"
                className={cn(
                  "h-4 border-border/50 px-1.5 text-[10px]",
                  activeRole.scope === "platform" && "text-amber-400/90",
                )}
              >
                {activeRole.scope}
              </Badge>
            )}
          </div>

          <select
            value={activeRoleId}
            onChange={(e) => setInspectRoleId(e.target.value)}
            className="mt-2 h-8 w-full rounded-md border border-border/50 bg-background px-2 text-xs"
            disabled={allRoles.length === 0}
          >
            {allRoles.length === 0 ? (
              <option>Loading roles…</option>
            ) : (
              allRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.roleKey}
                </option>
              ))
            )}
          </select>

          {activeRole?.description && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {activeRole.description}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Capabilities" value={grantedPerms.length} />
            <Stat label="Visible routes" value={visibleRoutes.length} />
          </div>

          {/* Capability chips */}
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Capabilities
              </span>
              {grantedPerms.length > 8 && (
                <button
                  type="button"
                  onClick={() => onJump("permissions")}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  view all →
                </button>
              )}
            </div>
            {grantedPerms.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No capabilities granted.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {grantedPerms.slice(0, 8).map((p) => (
                  <Badge
                    key={p.id}
                    variant="secondary"
                    className="h-5 max-w-full truncate text-[10px] font-normal"
                    title={p.description ?? p.permissionKey}
                  >
                    {p.permissionKey}
                  </Badge>
                ))}
                {grantedPerms.length > 8 && (
                  <Badge variant="outline" className="h-5 border-border/50 px-1.5 text-[10px]">
                    +{grantedPerms.length - 8}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Visible routes */}
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Visible routes
              </span>
              {visibleRoutes.length > 6 && (
                <button
                  type="button"
                  onClick={() => onJump("pages")}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  view all →
                </button>
              )}
            </div>
            {visibleRoutes.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No routes allow-listed.</p>
            ) : (
              <ul className="space-y-0.5">
                {visibleRoutes.slice(0, 6).map((v) => (
                  <li
                    key={v.routePath}
                    className="truncate rounded border border-border/30 bg-background/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {v.routePath}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => onJump("preview")}
            className="mt-3 flex w-full items-center justify-between rounded-md border border-border/40 bg-background/40 px-2 py-1.5 text-xs hover:bg-background/70"
          >
            <span className="flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5" />
              Open full role simulator
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>

        <Separator className="bg-border/40" />

        {/* Quick actions */}
        <div className="px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Quick actions
          </div>
          <div className="space-y-1">
            {isPlatformAdmin && (
              <RailLink
                label="Add user"
                onClick={() => {
                  onJump("users");
                  setTimeout(() => fire("itkc:create-user"), 50);
                }}
              />
            )}
            {canManageTeams && (
              <RailLink
                label="Create team"
                onClick={() => {
                  onJump("teams");
                  setTimeout(() => fire("itkc:create-team"), 50);
                }}
              />
            )}
            <RailLink label="Manage visibility" onClick={() => onJump("pages")} />
            <RailLink label="Module access overview" onClick={() => onJump("access-map")} />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function EffectiveUserAccessInspector() {
  const { session, effectiveAccess } = useAuth();
  const usersQ = useQuery(adminUsersQuery());
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const workspaces = useMemo(
    () => effectiveAccess?.workspaces ?? [],
    [effectiveAccess?.workspaces],
  );
  const [userId, setUserId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [teamId, setTeamId] = useState("");

  useEffect(() => {
    if (!userId && users[0]?.id) setUserId(users[0].id);
  }, [userId, users]);

  useEffect(() => {
    if (workspaceId && !workspaces.some((workspace) => workspace.id === workspaceId)) {
      setWorkspaceId("");
      setTeamId("");
    }
  }, [workspaceId, workspaces]);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const teams = selectedWorkspace?.teams ?? [];
  const explanationQ = useQuery({
    queryKey: ["admin-user-access-explanation", userId, workspaceId, teamId],
    enabled: Boolean(session?.access_token && userId),
    queryFn: async () => {
      const result = await getAdminUserAccessExplanation({
        accessToken: session?.access_token ?? "",
        userId,
        workspaceId: workspaceId || null,
        teamId: teamId || null,
      });
      if (!result.ok) throw new Error(result.error);
      return result.explanation;
    },
  });
  const explanation = explanationQ.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border/50 bg-card/50 p-3 lg:grid-cols-3">
        <label className="space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">User</span>
          <select
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className="h-9 w-full rounded-md border border-border/60 bg-background px-2"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}{user.email ? ` · ${user.email}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">Department / workspace</span>
          <select
            value={workspaceId}
            onChange={(event) => {
              setWorkspaceId(event.target.value);
              setTeamId("");
            }}
            className="h-9 w-full rounded-md border border-border/60 bg-background px-2"
          >
            <option value="">No workspace context</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-medium text-muted-foreground">Team</span>
          <select
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            disabled={!workspaceId}
            className="h-9 w-full rounded-md border border-border/60 bg-background px-2 disabled:opacity-50"
          >
            <option value="">No team context</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </label>
      </div>

      {usersQ.isLoading || explanationQ.isLoading ? (
        <div className="rounded-xl border border-border/50 p-6 text-sm text-muted-foreground">
          Resolving effective access…
        </div>
      ) : explanationQ.isError ? (
        <EmptyState
          icon={Lock}
          title="Could not resolve effective access"
          description="The backend access sources for this user could not be loaded."
          actionLabel="Retry"
          onAction={() => explanationQ.refetch()}
        />
      ) : explanation ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Assigned roles" value={explanation.roles.length} />
            <Stat label="Permissions" value={explanation.permissions.length} />
            <Stat label="Workspace permissions" value={explanation.workspacePermissions.length} />
            <Stat label="Visible routes" value={explanation.visibleRoutes.length} />
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <AccessExplanationList
              title="Role assignments"
              empty="No roles are assigned."
              items={explanation.roles.map((source) => ({
                key: `${source.assignment}:${source.contextId ?? "global"}:${source.roleKey}`,
                label: source.roleName,
                detail: `${source.assignment}${source.contextName ? ` · ${source.contextName}` : ""}`,
              }))}
            />
            <AccessExplanationList
              title="Visible routes"
              empty="No stored routes are visible."
              items={explanation.visibleRoutes.map((route) => ({
                key: route.routePath,
                label: route.routePath,
                detail: route.sources.map((source) => source.roleName).join(", "),
              }))}
            />
            <AccessExplanationList
              title="Top-level permissions"
              empty="No permissions resolve from global or team roles."
              items={explanation.permissions.map((permission) => ({
                key: permission.permissionKey,
                label: permission.permissionKey,
                detail: permission.sources.map((source) => source.roleName).join(", "),
              }))}
            />
            <AccessExplanationList
              title="Workspace permissions"
              empty={workspaceId ? "No permissions resolve in this workspace." : "Select a workspace to inspect scoped permissions."}
              items={explanation.workspacePermissions.map((permission) => ({
                key: permission.permissionKey,
                label: permission.permissionKey,
                detail: permission.sources.map((source) => source.roleName).join(", "),
              }))}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function AccessExplanationList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; label: string; detail: string }>;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border/50 bg-card/40 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
          {items.map((item) => (
            <li key={item.key} className="rounded-md border border-border/30 bg-background/30 px-2 py-1.5">
              <div className="truncate font-mono text-[11px] text-foreground">{item.label}</div>
              <div className="truncate text-[10px] text-muted-foreground">{item.detail}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
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
