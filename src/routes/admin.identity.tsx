import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Layers,
  Lock,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { adminUsersQuery } from "@/lib/admin-users/queries";
import { teamsQuery } from "@/lib/teams/queries";
import { adminRolesQuery } from "@/lib/admin-roles/queries";
import { useWorkspaceContext } from "@/lib/auth/AuthProvider";
import { can, useRole } from "@/lib/permissions";

export const Route = createFileRoute("/admin/identity")({
  head: () => ({
    meta: [{ title: "Identity & Access · IT Knowledge Center" }],
  }),
  component: IdentityAndAccessPage,
});

function IdentityAndAccessPage() {
  const role = useRole();
  const allowed = can("admin.users", role) || can("admin.roles", role);

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

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Identity & Access"
        description="One workbench for people, departments, teams, roles, visibility and permissions."
        actions={<QuickCreate />}
      />

      <MetricsStrip />

      <HierarchyCard />

      <SectionsGrid />

      <AdvancedDisclosure />
    </div>
  );
}

/* ───────────────────────── Quick create ───────────────────────── */

function QuickCreate() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <Link to="/admin/users">
          <UserPlus className="h-4 w-4" /> New user
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <Link to="/admin/users">
          <UsersRound className="h-4 w-4" /> New team
        </Link>
      </Button>
      <Button asChild size="sm" className="gap-1.5">
        <Link to="/admin/roles">
          <KeyRound className="h-4 w-4" /> Manage roles
        </Link>
      </Button>
    </div>
  );
}

/* ───────────────────────── Metrics ───────────────────────── */

function MetricsStrip() {
  const usersQ = useQuery(adminUsersQuery());
  const teamsQ = useQuery(teamsQuery());
  const rolesQ = useQuery(adminRolesQuery());
  const { workspaces } = useWorkspaceContext();

  const users = usersQ.data ?? [];
  const teams = teamsQ.data ?? [];
  const roles = rolesQ.data?.roles ?? [];
  const active = users.filter((u) => u.isActive).length;
  const inactive = users.length - active;
  const noTeam = users.filter((u) => u.teamNames.length === 0).length;
  const privileged = users.filter((u) =>
    u.roleKeys.some((k) => /admin|platform|owner/i.test(k)),
  ).length;

  const items: Array<{
    icon: typeof Users;
    label: string;
    value: number;
    hint: string;
    tone: string;
  }> = [
    { icon: Users, label: "Active users", value: active, hint: `${users.length} total`, tone: "from-sky-500/20 to-sky-500/0 text-sky-300" },
    { icon: Building2, label: "Departments", value: workspaces.length, hint: "Across organization", tone: "from-violet-500/20 to-violet-500/0 text-violet-300" },
    { icon: UsersRound, label: "Teams", value: teams.length, hint: "Operational groups", tone: "from-emerald-500/20 to-emerald-500/0 text-emerald-300" },
    { icon: KeyRound, label: "Roles defined", value: roles.length, hint: "Platform & team", tone: "from-amber-500/20 to-amber-500/0 text-amber-300" },
    { icon: ShieldCheck, label: "Privileged", value: privileged, hint: "Admins & owners", tone: "from-rose-500/20 to-rose-500/0 text-rose-300" },
    { icon: Lock, label: "Needs review", value: inactive + noTeam, hint: `${inactive} inactive · ${noTeam} no team`, tone: "from-slate-500/20 to-slate-500/0 text-slate-300" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((m) => (
        <div
          key={m.label}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm transition-colors hover:border-border/80"
        >
          <div className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b ${m.tone} opacity-60`} />
          <div className="relative flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {m.label}
            </div>
            <m.icon className="h-4 w-4 text-muted-foreground/70" />
          </div>
          <div className="relative mt-2 text-2xl font-semibold tracking-tight">{m.value}</div>
          <div className="relative mt-0.5 text-xs text-muted-foreground">{m.hint}</div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Hierarchy ───────────────────────── */

function HierarchyCard() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Layers className="h-3.5 w-3.5" /> Access hierarchy
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <Pill>Organization</Pill>
        <Arrow />
        <Pill>Department</Pill>
        <Arrow />
        <Pill>Team</Pill>
        <Arrow />
        <Pill>User</Pill>
        <span className="mx-2 hidden h-4 w-px bg-border/60 md:inline-block" />
        <Pill>Role</Pill>
        <Arrow />
        <Pill>Permission</Pill>
        <Arrow />
        <Pill>Page visibility</Pill>
      </div>
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted-foreground">
        People belong to teams inside a department. Roles grant capabilities and page visibility.
        Effective access is the union of every role a user holds, scoped down by department and team membership.
      </p>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border/50 bg-background/40 px-2.5 py-1 text-xs font-medium">
      {children}
    </span>
  );
}

function Arrow() {
  return <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />;
}

/* ───────────────────────── Section grid ───────────────────────── */

type Section = {
  key: string;
  to: "/admin/users" | "/admin/roles";
  title: string;
  description: string;
  icon: typeof Users;
  bullets: string[];
  accent: string;
  badge?: string;
};

function SectionsGrid() {
  const usersQ = useQuery(adminUsersQuery());
  const teamsQ = useQuery(teamsQuery());
  const rolesQ = useQuery(adminRolesQuery());
  const { workspaces } = useWorkspaceContext();

  const sections: Section[] = useMemo(
    () => [
      {
        key: "people",
        to: "/admin/users",
        title: "People",
        description: "Invite, edit, deactivate, and audit every user in the organization.",
        icon: Users,
        bullets: [
          `${usersQ.data?.length ?? 0} accounts`,
          "Profile · status · roles",
          "Bulk filters",
        ],
        accent: "from-sky-500/15 to-sky-500/0 ring-sky-500/30",
        badge: usersQ.data ? `${usersQ.data.filter((u) => u.isActive).length} active` : undefined,
      },
      {
        key: "departments",
        to: "/admin/users",
        title: "Departments",
        description: "Departments map workspaces, ownership, and shared mailboxes.",
        icon: Building2,
        bullets: [
          `${workspaces.length} departments`,
          "Workspace mapping",
          "Operational ownership",
        ],
        accent: "from-violet-500/15 to-violet-500/0 ring-violet-500/30",
      },
      {
        key: "teams",
        to: "/admin/users",
        title: "Teams & groups",
        description: "Group people for routing, on-call, and shared responsibilities.",
        icon: UsersRound,
        bullets: [
          `${teamsQ.data?.length ?? 0} teams`,
          "Member roles",
          "Routing targets",
        ],
        accent: "from-emerald-500/15 to-emerald-500/0 ring-emerald-500/30",
      },
      {
        key: "roles",
        to: "/admin/roles",
        title: "Roles & permissions",
        description: "Curated roles bundle capabilities and the pages a person can reach.",
        icon: KeyRound,
        bullets: [
          `${rolesQ.data?.roles.length ?? 0} roles`,
          "Capabilities",
          "Page visibility",
        ],
        accent: "from-amber-500/15 to-amber-500/0 ring-amber-500/30",
      },
    ],
    [usersQ.data, teamsQ.data, rolesQ.data, workspaces.length],
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((s) => (
        <Link
          key={s.key}
          to={s.to}
          className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/60 p-5 shadow-sm ring-1 ring-transparent transition-all hover:-translate-y-0.5 hover:border-border/80 hover:shadow-md"
        >
          <div className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${s.accent} blur-2xl`} />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-border/50 bg-background/60">
                <s.icon className="h-5 w-5 text-foreground/80" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold tracking-tight">{s.title}</h3>
                  {s.badge && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
                      {s.badge}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{s.description}</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
          <div className="relative mt-4 flex flex-wrap gap-1.5">
            {s.bullets.map((b) => (
              <span
                key={b}
                className="rounded-md border border-border/40 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {b}
              </span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ───────────────────────── Advanced disclosure ───────────────────────── */

function AdvancedDisclosure() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-2xl border border-border/50 bg-card/40">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Advanced · matrices & effective access</div>
                <div className="text-xs text-muted-foreground">
                  Power-user view of role × permission grants and per-route visibility.
                </div>
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid gap-3 border-t border-border/40 p-4 md:grid-cols-3">
            <AdvancedLink
              to="/admin/roles"
              title="Permission matrix"
              description="Roles × capabilities grid with grant/revoke."
            />
            <AdvancedLink
              to="/admin/roles"
              title="Page visibility"
              description="Per-route visibility controls and inheritance."
            />
            <AdvancedLink
              to="/admin/users"
              title="Access map"
              description="Module × role overview and ticket scope."
            />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function AdvancedLink({
  to,
  title,
  description,
}: {
  to: "/admin/users" | "/admin/roles";
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-background/40 p-3 transition-colors hover:border-border/70 hover:bg-background/60"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
