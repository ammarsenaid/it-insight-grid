import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
  KeyRound,
  Layers,
  Lock,
  Network,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { can, useRole } from "@/lib/permissions";
import { ROUTE_REQUIREMENTS, describeRouteRequirement } from "@/lib/auth/effective-access";

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
  | "capabilities"
  | "pages"
  | "preview"
  | "effective";

type Section = {
  key: SectionKey;
  label: string;
  hint: string;
  icon: typeof Users;
  group: "people" | "access" | "audit";
  tabParam?: string; // ?tab=… written to URL for embedded pages
  advanced?: boolean;
};

const SECTIONS: Section[] = [
  { key: "users", label: "Users", hint: "Accounts, roles, status", icon: Users, group: "people", tabParam: "users" },
  { key: "departments", label: "Departments", hint: "Workspaces & ownership", icon: Building2, group: "people", tabParam: "departments" },
  { key: "teams", label: "Teams & groups", hint: "Routing & on-call", icon: UsersRound, group: "people", tabParam: "teams" },
  { key: "access-map", label: "Access map", hint: "Modules × roles", icon: ShieldCheck, group: "people", tabParam: "access" },
  { key: "roles", label: "Roles", hint: "Role catalog", icon: KeyRound, group: "access", tabParam: "roles" },
  { key: "capabilities", label: "Permissions", hint: "Capability matrix", icon: Layers, group: "access", tabParam: "capabilities", advanced: true },
  { key: "pages", label: "Page visibility", hint: "Route allow-list", icon: Eye, group: "access", tabParam: "pages", advanced: true },
  { key: "preview", label: "Role preview", hint: "Simulate a role", icon: Network, group: "access", tabParam: "preview" },
  { key: "effective", label: "Effective access", hint: "What you can reach", icon: ShieldCheck, group: "audit" },
];

function isPeopleSection(s: SectionKey) {
  return s === "users" || s === "departments" || s === "teams" || s === "access-map";
}
function isRolesSection(s: SectionKey) {
  return s === "roles" || s === "capabilities" || s === "pages" || s === "preview";
}

/* ───────────────────────── Page ───────────────────────── */

function IdentityAndAccessPage() {
  const role = useRole();
  const allowed = can("admin.users", role) || can("admin.roles", role);

  const [section, setSection] = useState<SectionKey>("users");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [query, setQuery] = useState("");

  // When section changes, write ?tab= so embedded pages pick up the right tab
  useEffect(() => {
    const target = SECTIONS.find((s) => s.key === section);
    if (!target?.tabParam || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", target.tabParam);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params}${window.location.hash}`,
    );
  }, [section]);

  if (!allowed) {
    return (
      <div className="space-y-5 pb-8">
        <PageHeader
          title="Identity & Access"
          description="Central directory for people, departments, teams, roles and permissions."
        />
        <EmptyState
          icon={Lock}
          title="Admin access required"
          description="Sign in with an administrator role to manage identity and access."
        />
      </div>
    );
  }

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SECTIONS.filter((s) => {
      if (!showAdvanced && s.advanced) return false;
      if (!q) return true;
      return s.label.toLowerCase().includes(q) || s.hint.toLowerCase().includes(q);
    });
  }, [query, showAdvanced]);

  const peopleSections = filteredSections.filter((s) => s.group === "people");
  const accessSections = filteredSections.filter((s) => s.group === "access");
  const auditSections = filteredSections.filter((s) => s.group === "audit");

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 w-full overflow-hidden">
      {/* Left rail — directory */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/40 bg-card/40 lg:flex">
        <div className="border-b border-border/40 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Layers className="h-3.5 w-3.5" /> Identity & Access
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter sections…"
            className="mt-2 h-8 w-full rounded-md border border-border/50 bg-background/50 px-2 text-xs outline-none focus:border-border"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Advanced
            </button>
            <span className="text-[10px] text-muted-foreground">
              {filteredSections.length} item{filteredSections.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-2">
            <NavGroup label="People" items={peopleSections} active={section} onSelect={setSection} />
            <NavGroup label="Access control" items={accessSections} active={section} onSelect={setSection} />
            <NavGroup label="Audit" items={auditSections} active={section} onSelect={setSection} />
          </div>
        </ScrollArea>
        <div className="border-t border-border/40 p-3">
          <Button asChild size="sm" variant="outline" className="w-full justify-start gap-2">
            <Link to="/admin/users">
              <UserPlus className="h-3.5 w-3.5" /> Open legacy /admin/users
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="mt-2 w-full justify-start gap-2">
            <Link to="/admin/roles">
              <KeyRound className="h-3.5 w-3.5" /> Open legacy /admin/roles
            </Link>
          </Button>
        </div>
      </aside>

      {/* Main column */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Section bar (mobile + breadcrumb) */}
        <div className="flex items-center gap-2 border-b border-border/40 bg-background/60 px-4 py-2 backdrop-blur lg:hidden">
          <select
            value={section}
            onChange={(e) => setSection(e.target.value as SectionKey)}
            className="h-8 rounded-md border border-border/50 bg-background px-2 text-sm"
          >
            {SECTIONS.filter((s) => showAdvanced || !s.advanced).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-muted-foreground"
          >
            {showAdvanced ? "Hide advanced" : "Show advanced"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="px-4 pt-4 md:px-6">
            <Breadcrumb section={section} />
          </div>
          <div className="px-4 pb-8 md:px-6">
            <SectionRouter section={section} key={section} />
          </div>
        </div>
      </main>

      {/* Right rail — effective access */}
      <aside className="hidden w-80 shrink-0 flex-col border-l border-border/40 bg-card/40 xl:flex">
        <EffectiveAccessRail onJump={setSection} />
      </aside>
    </div>
  );
}

/* ───────────────────────── Nav group ───────────────────────── */

function NavGroup({
  label,
  items,
  active,
  onSelect,
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
                isActive
                  ? "border-border/60 bg-background/70"
                  : "hover:bg-background/50",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              />
              <div className="min-w-0">
                <div className={cn("truncate text-sm", isActive ? "font-medium" : "")}>
                  {it.label}
                  {it.advanced && (
                    <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[9px]">
                      adv
                    </Badge>
                  )}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">{it.hint}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Breadcrumb ───────────────────────── */

function Breadcrumb({ section }: { section: SectionKey }) {
  const meta = SECTIONS.find((s) => s.key === section)!;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Identity & Access</span>
      <ChevronRight className="h-3 w-3" />
      <span className="text-foreground">{meta.label}</span>
      <span className="ml-2 hidden text-muted-foreground/70 md:inline">· {meta.hint}</span>
    </div>
  );
}

/* ───────────────────────── Section router ───────────────────────── */

function SectionRouter({ section }: { section: SectionKey }) {
  if (section === "effective") return <EffectiveAccessPanel />;
  if (isPeopleSection(section)) return <PeopleAndOrganizationPage hideHeader />;
  if (isRolesSection(section)) return <AdminRolesPage />;
  return null;
}

/* ───────────────────────── Effective access ───────────────────────── */

function EffectiveAccessRail({ onJump }: { onJump: (s: SectionKey) => void }) {
  const { effectiveAccess, profile } = useAuth();
  const role = useRole();

  const permCount = effectiveAccess?.permissionKeys.length ?? 0;
  const routeCount = effectiveAccess?.visibleRoutes.length ?? 0;
  const roleKeys = effectiveAccess?.roleKeys ?? [role];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/40 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Effective access
        </div>
        <div className="mt-1 text-sm font-medium">
          {profile?.display_name ?? profile?.email ?? "Signed-in user"}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">UI role · {role}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 p-4">
        <Stat label="Permissions" value={permCount} />
        <Stat label="Routes" value={routeCount} />
      </div>

      <Separator className="bg-border/40" />

      <div className="p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Roles held
        </div>
        <div className="flex flex-wrap gap-1.5">
          {roleKeys.length === 0 ? (
            <span className="text-xs text-muted-foreground">No roles assigned.</span>
          ) : (
            roleKeys.map((r) => (
              <Badge key={r} variant="secondary" className="h-5 text-[10px]">
                {r}
              </Badge>
            ))
          )}
        </div>
      </div>

      <Separator className="bg-border/40" />

      <div className="flex-1 overflow-hidden p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Accessible routes
          </div>
          <button
            type="button"
            onClick={() => onJump("preview")}
            className="text-[11px] text-primary hover:underline"
          >
            Simulate role →
          </button>
        </div>
        <ScrollArea className="h-[calc(100%-1.75rem)] pr-2">
          <ul className="space-y-1">
            {(effectiveAccess?.visibleRoutes ?? []).slice(0, 80).map((r) => (
              <li
                key={r}
                className="flex items-center justify-between gap-2 rounded-md border border-border/30 bg-background/30 px-2 py-1 text-[11px]"
              >
                <code className="truncate text-muted-foreground">{r}</code>
              </li>
            ))}
            {(effectiveAccess?.visibleRoutes.length ?? 0) === 0 && (
              <li className="text-xs text-muted-foreground">No visible routes resolved.</li>
            )}
          </ul>
        </ScrollArea>
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

function EffectiveAccessPanel() {
  const { effectiveAccess } = useAuth();
  const role = useRole();
  const visible = new Set(effectiveAccess?.visibleRoutes ?? []);
  const entries = Object.entries(ROUTE_REQUIREMENTS);

  return (
    <div className="space-y-4 pt-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Effective access overview</h2>
        <p className="text-sm text-muted-foreground">
          Every UI route, its backend contract, and whether the current session can reach it.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card title="UI role">
          <span className="text-base font-medium">{role}</span>
        </Card>
        <Card title="Permissions">
          <span className="text-base font-medium">{effectiveAccess?.permissionKeys.length ?? 0}</span>
        </Card>
        <Card title="Visible routes">
          <span className="text-base font-medium">{effectiveAccess?.visibleRoutes.length ?? 0}</span>
        </Card>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/40">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Route</th>
              <th className="px-3 py-2 text-left font-medium">Backend contract</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([path]) => {
              const ok = visible.has(path);
              return (
                <tr key={path} className="border-t border-border/30">
                  <td className="px-3 py-1.5">
                    <code className="text-xs">{path}</code>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    {describeRouteRequirement(path)}
                  </td>
                  <td className="px-3 py-1.5">
                    {ok ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Allowed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        Blocked
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
