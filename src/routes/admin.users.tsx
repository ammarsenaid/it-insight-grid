import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  ChevronDown,
  Layers,
  Lock,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import { DetailsDrawer } from "@/components/common/DetailsDrawer";
import { EmptyState } from "@/components/common/EmptyState";
import { FormDrawer } from "@/components/common/FormDrawer";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  createAdminUser,
  setAdminUserActive,
  updateAdminUser,
} from "@/lib/admin-users/create-user";
import {
  adminUserFormOptionsQuery,
  adminUsersKeys,
  adminUsersQuery,
} from "@/lib/admin-users/queries";
import { formatAdminUsersError } from "@/lib/admin-users/errors";
import type { AdminUser } from "@/lib/admin-users/types";
import { useAuth, useWorkspaceContext } from "@/lib/auth/AuthProvider";
import { can, useRole } from "@/lib/permissions";
import { formatTeamsError } from "@/lib/teams/errors";
import {
  teamsKeys,
  teamsQuery,
  teamMembersQuery,
  teamRolesQuery,
  profilesQuery,
} from "@/lib/teams/queries";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  removeTeamMember,
  setTeamMemberRole,
  slugify,
  updateTeam,
} from "@/lib/teams/teams";
import type { TeamInput, TeamSummary } from "@/lib/teams/types";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "People & Organization · IT Knowledge Center" }] }),
  component: PeopleAndOrganizationPage,
});

const NO_SELECTION = "none";

type TabKey = "users" | "departments" | "teams" | "access";

type UserDraft = {
  displayName: string;
  email: string;
  roleId: string | null;
  teamId: string | null;
  isActive: boolean;
};

const EMPTY_USER: UserDraft = {
  displayName: "",
  email: "",
  roleId: null,
  teamId: null,
  isActive: true,
};

const EMPTY_TEAM: TeamInput = { name: "", slug: "", description: "" };

type UserFilter = "all" | "active" | "inactive" | "admins" | "no_team";

function listLabel(values: string[], fallback = "—"): string {
  return values.length > 0 ? values.join(", ") : fallback;
}

function PeopleAndOrganizationPage() {
  const { session, isPlatformAdmin } = useAuth();
  const role = useRole();
  const allowed = can("admin.users", role);
  const teamsAllowed = can("admin.teams", role);

  const [tab, setTab] = useState<TabKey>("users");

  if (!allowed) {
    return (
      <div>
        <PageHeader
          title="People & Organization"
          description="Manage users, departments, teams, roles, and operational ownership from one place."
        />
        <EmptyState
          icon={Lock}
          title="Admin access required"
          description="Switch to the IT Administrator role via the profile menu to manage people and organization."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="People & Organization"
        description="Manage users, departments, teams, roles, and operational ownership from one place."
        actions={<CreateMenu canCreateUser={isPlatformAdmin} canCreateTeam={teamsAllowed} />}
      />

      {!isPlatformAdmin && (
        <Alert className="border-border/50 bg-muted/30 text-muted-foreground">
          <Lock className="h-4 w-4" />
          <AlertDescription>
            User management changes require Platform Administrator access.
          </AlertDescription>
        </Alert>
      )}

      <OverviewStrip />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="space-y-5">
        <TabsList className="h-10 border border-border/40 bg-card/60 p-1">
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="departments" className="gap-2">
            <Building2 className="h-4 w-4" /> Departments
          </TabsTrigger>
          <TabsTrigger value="teams" className="gap-2">
            <UsersRound className="h-4 w-4" /> Teams
          </TabsTrigger>
          <TabsTrigger value="access" className="gap-2">
            <ShieldCheck className="h-4 w-4" /> Access map
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-0">
          <UsersTab session={session} isPlatformAdmin={isPlatformAdmin} />
        </TabsContent>
        <TabsContent value="departments" className="mt-0">
          <DepartmentsTab />
        </TabsContent>
        <TabsContent value="teams" className="mt-0">
          <TeamsTab allowed={teamsAllowed} />
        </TabsContent>
        <TabsContent value="access" className="mt-0">
          <AccessMapTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────────────────── Overview ───────────────────────── */

function OverviewStrip() {
  const usersQ = useQuery(adminUsersQuery());
  const teamsQ = useQuery(teamsQuery());
  const { workspaces } = useWorkspaceContext();

  const users = usersQ.data ?? [];
  const teams = teamsQ.data ?? [];
  const activeUsers = users.filter((u) => u.isActive).length;
  const inactiveUsers = users.length - activeUsers;
  const usersWithoutTeam = users.filter((u) => u.teamNames.length === 0).length;
  const admins = users.filter((u) =>
    u.roleKeys.some((k) => /admin|platform|owner/i.test(k)),
  ).length;

  return (
    <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric icon={Users} label="Active users" value={activeUsers} hint={`${users.length} total`} />
        <Metric icon={Building2} label="Departments" value={workspaces.length} hint="Across organization" />
        <Metric icon={UsersRound} label="Teams" value={teams.length} hint="Operational groups" />
        <Metric icon={ShieldCheck} label="Privileged roles" value={admins} hint="Admins & owners" />
        <Metric icon={UsersRound} label="Users without team" value={usersWithoutTeam} hint="Need assignment" />
        <Metric icon={Lock} label="Inactive users" value={inactiveUsers} hint="Sign-in disabled" />
      </div>
      <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Layers className="h-3.5 w-3.5" /> Hierarchy
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Pill>Organization</Pill>
          <span className="text-muted-foreground">→</span>
          <Pill>Department</Pill>
          <span className="text-muted-foreground">→</span>
          <Pill>Team</Pill>
          <span className="text-muted-foreground">→</span>
          <Pill>User</Pill>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Each user belongs to one or more teams. Teams live inside a department. Departments are
          organized under the active organization. Access is scoped from the top down.
        </p>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <Icon className="h-4 w-4 text-muted-foreground/70" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
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

/* ───────────────────────── Create menu ───────────────────────── */

function CreateMenu({
  canCreateUser,
  canCreateTeam,
}: {
  canCreateUser: boolean;
  canCreateTeam: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Create <ChevronDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          disabled={!canCreateUser}
          onClick={() => window.dispatchEvent(new CustomEvent("itkc:create-user"))}
        >
          <Users className="mr-2 h-4 w-4" /> New user
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.dispatchEvent(new CustomEvent("itkc:create-department"))}
        >
          <Building2 className="mr-2 h-4 w-4" /> New department
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canCreateTeam}
          onClick={() => window.dispatchEvent(new CustomEvent("itkc:create-team"))}
        >
          <UsersRound className="mr-2 h-4 w-4" /> New team
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useCreateEvent(name: string, handler: () => void) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fn = () => handler();
    window.addEventListener(name, fn);
    return () => window.removeEventListener(name, fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}

/* ───────────────────────── Users tab ───────────────────────── */

function UsersTab({
  session,
  isPlatformAdmin,
}: {
  session: ReturnType<typeof useAuth>["session"];
  isPlatformAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const enabled = Boolean(session?.user);
  const { data = [], isLoading, isError, error, refetch } = useQuery({
    ...adminUsersQuery(),
    enabled,
  });
  const optionsQuery = useQuery({
    ...adminUserFormOptionsQuery(),
    enabled: enabled && isPlatformAdmin,
  });

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [details, setDetails] = useState<AdminUser | null>(null);
  const [statusActionUserId, setStatusActionUserId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<UserDraft>(EMPTY_USER);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editDraft, setEditDraft] = useState<UserDraft>(EMPTY_USER);
  const [editError, setEditError] = useState<string | null>(null);

  useCreateEvent("itkc:create-user", () => {
    if (!isPlatformAdmin) return;
    setDraft(EMPTY_USER);
    setCreateError(null);
    setCreateOpen(true);
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!isPlatformAdmin) throw new Error("Platform Administrator access is required.");
      if (!session?.access_token) throw new Error("Your session is no longer available.");
      return createAdminUser({ ...draft, accessToken: session.access_token });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: adminUsersKeys.all });
      setCreateOpen(false);
      setDraft(EMPTY_USER);
      setCreateError(null);
      toast.success(result.invited ? "User created and invite sent" : "Inactive user created");
    },
    onError: (e) => setCreateError(formatAdminUsersError(e, "Failed to create user")),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!isPlatformAdmin) throw new Error("Platform Administrator access is required.");
      if (!session?.access_token) throw new Error("Your session is no longer available.");
      if (!editUser) throw new Error("No user is selected for editing.");
      return updateAdminUser({
        accessToken: session.access_token,
        userId: editUser.id,
        displayName: editDraft.displayName,
        isActive: editDraft.isActive,
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setEditError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: adminUsersKeys.all });
      setEditUser(null);
      setEditDraft(EMPTY_USER);
      setEditError(null);
      toast.success("User updated");
      refetch();
    },
    onError: (e) => setEditError(formatAdminUsersError(e, "Failed to update user")),
  });

  const visible = useMemo(() => {
    let list = data.slice();
    if (filter === "active") list = list.filter((u) => u.isActive);
    if (filter === "inactive") list = list.filter((u) => !u.isActive);
    if (filter === "admins")
      list = list.filter((u) => u.roleKeys.some((k) => /admin|platform|owner/i.test(k)));
    if (filter === "no_team") list = list.filter((u) => u.teamNames.length === 0);
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((u) =>
      [u.displayName, u.email ?? "", ...u.teamNames, ...u.roleNames, ...u.roleKeys].some((v) =>
        v.toLowerCase().includes(needle),
      ),
    );
  }, [data, q, filter]);

  function openEdit(user: AdminUser) {
    if (!isPlatformAdmin) return;
    setDetails(null);
    setEditUser(user);
    setEditDraft({
      displayName: user.displayName,
      email: user.email ?? "",
      roleId: null,
      teamId: null,
      isActive: user.isActive,
    });
    setEditError(null);
  }

  function submitCreate() {
    if (!draft.displayName.trim()) return setCreateError("Display name is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))
      return setCreateError("Enter a valid email address.");
    setCreateError(null);
    createMutation.mutate();
  }
  function submitEdit() {
    if (!editUser) return setEditError("No user is selected.");
    if (!editDraft.displayName.trim()) return setEditError("Display name is required.");
    setEditError(null);
    updateMutation.mutate();
  }

  async function handleSetUserActive(user: AdminUser, isActive: boolean) {
    if (!isPlatformAdmin || !session?.access_token) return;
    const action = isActive ? "enable" : "disable";
    if (!window.confirm(`Do you want to ${action} ${user.displayName}?`)) return;
    setStatusActionUserId(user.id);
    try {
      const result = await setAdminUserActive({
        accessToken: session.access_token,
        userId: user.id,
        isActive,
      });
      if (!result.ok) {
        toast.error("User status was not updated", { description: result.error });
        return;
      }
      toast.success("User status updated");
      setDetails(null);
      refetch();
    } finally {
      setStatusActionUserId(null);
    }
  }

  const counts = {
    all: data.length,
    active: data.filter((u) => u.isActive).length,
    inactive: data.filter((u) => !u.isActive).length,
    admins: data.filter((u) => u.roleKeys.some((k) => /admin|platform|owner/i.test(k))).length,
    no_team: data.filter((u) => u.teamNames.length === 0).length,
  };

  return (
    <div className="space-y-4">
      <Toolbar
        search={q}
        onSearch={setQ}
        placeholder="Search users by name, email, team, role…"
        chips={[
          { id: "all", label: `All (${counts.all})` },
          { id: "active", label: `Active (${counts.active})` },
          { id: "inactive", label: `Inactive (${counts.inactive})` },
          { id: "admins", label: `Admins (${counts.admins})` },
          { id: "no_team", label: `Without team (${counts.no_team})` },
        ]}
        activeChip={filter}
        onChip={(id) => setFilter(id as UserFilter)}
      />

      <SectionCard className="overflow-hidden border-border/50 shadow-sm" contentClassName="p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading users…</div>
        ) : isError ? (
          <EmptyState
            icon={AlertCircle}
            title="Could not load users"
            description={formatAdminUsersError(error, "Unexpected error")}
            actionLabel="Retry"
            onAction={() => refetch()}
            className="m-4"
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users match your filters"
            description="Adjust the search or filter chips above."
            className="m-4"
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden max-h-[60vh] overflow-auto md:block">
              <Table className="min-w-[900px]">
                <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>User</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((user) => (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer transition-colors hover:bg-muted/25"
                      onClick={() => setDetails(user)}
                    >
                      <TableCell>
                        <div className="font-medium">{user.displayName}</div>
                        <div className="text-xs text-muted-foreground">
                          {user.email ?? "Email unavailable"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground/80 italic">
                        Not assigned
                      </TableCell>
                      <TableCell className="text-sm">{listLabel(user.teamNames)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          label={listLabel(user.roleNames, "No global role")}
                          tone="info"
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          label={user.isActive ? "active" : "inactive"}
                          tone={user.isActive ? "success" : "muted"}
                        />
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetails(user)}>
                              View
                            </DropdownMenuItem>
                            {isPlatformAdmin ? (
                              <>
                                <DropdownMenuItem onClick={() => openEdit(user)}>
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={statusActionUserId === user.id}
                                  onClick={() => handleSetUserActive(user, !user.isActive)}
                                >
                                  {user.isActive ? "Disable" : "Activate"}
                                </DropdownMenuItem>
                                <DisabledMenuItem label="Delete" />
                              </>
                            ) : (
                              <>
                                <DisabledMenuItem label="Edit" />
                                <DisabledMenuItem label="Disable / Activate" />
                                <DisabledMenuItem label="Delete" />
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 p-3 md:hidden">
              {visible.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setDetails(user)}
                  className="block w-full rounded-xl border border-border/40 bg-card/40 p-3 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{user.displayName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {user.email ?? "Email unavailable"}
                      </div>
                    </div>
                    <StatusBadge
                      label={user.isActive ? "active" : "inactive"}
                      tone={user.isActive ? "success" : "muted"}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    <Badge variant="outline">{listLabel(user.teamNames, "No team")}</Badge>
                    <Badge variant="outline">
                      {listLabel(user.roleNames, "No global role")}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      {/* Create user drawer */}
      <FormDrawer
        open={createOpen && isPlatformAdmin}
        onOpenChange={(o) => !createMutation.isPending && setCreateOpen(o)}
        title="New user"
        description="Create a real account and assign its initial access."
        onSubmit={submitCreate}
        submitLabel={createMutation.isPending ? "Creating…" : "Create user"}
      >
        <Field label="Display name">
          <Input
            value={draft.displayName}
            onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
            maxLength={120}
            autoComplete="name"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            maxLength={320}
            autoComplete="email"
          />
        </Field>
        <Field label="Initial global role">
          <Select
            value={draft.roleId ?? NO_SELECTION}
            onValueChange={(v) =>
              setDraft({ ...draft, roleId: v === NO_SELECTION ? null : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="No global role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SELECTION}>No global role</SelectItem>
              {(optionsQuery.data?.roles ?? []).map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Team">
          <Select
            value={draft.teamId ?? NO_SELECTION}
            onValueChange={(v) =>
              setDraft({ ...draft, teamId: v === NO_SELECTION ? null : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="No team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SELECTION}>No team</SelectItem>
              {(optionsQuery.data?.teams ?? []).map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/30 p-3.5">
          <div>
            <Label className="text-xs">Active account</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Active users receive an invite. Inactive users are created disabled.
            </p>
          </div>
          <Switch
            checked={draft.isActive}
            onCheckedChange={(c) => setDraft({ ...draft, isActive: c })}
          />
        </div>
        {createError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>User was not created</AlertTitle>
            <AlertDescription>{createError}</AlertDescription>
          </Alert>
        )}
      </FormDrawer>

      {/* Edit user drawer */}
      <FormDrawer
        open={Boolean(editUser) && isPlatformAdmin}
        onOpenChange={(o) => {
          if (!updateMutation.isPending && !o) {
            setEditUser(null);
            setEditDraft(EMPTY_USER);
            setEditError(null);
          }
        }}
        title={editUser ? `Edit ${editUser.displayName}` : "Edit user"}
        description="Update the display name and account status."
        onSubmit={submitEdit}
        submitLabel={updateMutation.isPending ? "Saving…" : "Save changes"}
      >
        <Field label="Display name">
          <Input
            value={editDraft.displayName}
            onChange={(e) => setEditDraft({ ...editDraft, displayName: e.target.value })}
            maxLength={120}
          />
        </Field>
        <Field label="Email">
          <Input value={editDraft.email} disabled className="opacity-80" />
          <p className="text-[11px] text-muted-foreground">
            Email editing is intentionally locked to avoid breaking authentication.
          </p>
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/30 p-3.5">
          <div>
            <Label className="text-xs">Active account</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Disabled users cannot sign in until the account is enabled again.
            </p>
          </div>
          <Switch
            checked={editDraft.isActive}
            onCheckedChange={(c) => setEditDraft({ ...editDraft, isActive: c })}
          />
        </div>
        {editError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>User was not updated</AlertTitle>
            <AlertDescription>{editError}</AlertDescription>
          </Alert>
        )}
      </FormDrawer>

      {/* Details */}
      <DetailsDrawer
        open={Boolean(details)}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.displayName ?? ""}
        description={
          details
            ? `${listLabel(details.roleNames, "No global role")} · ${listLabel(details.teamNames, "No team")}`
            : undefined
        }
        actions={
          details && isPlatformAdmin && (
            <Button size="sm" variant="secondary" onClick={() => openEdit(details)}>
              Edit user
            </Button>
          )
        }
      >
        {details && (
          <div className="space-y-5">
            <SectionCard title="Profile">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Info icon={Mail} label="Email" value={details.email ?? "Email unavailable"} />
                <Info icon={Building2} label="Department" value="Not assigned" muted />
                <Info icon={Users} label="Team" value={listLabel(details.teamNames, "No team")} />
                <Info
                  icon={ShieldCheck}
                  label="Role"
                  value={listLabel(details.roleNames, "No global role")}
                />
              </dl>
            </SectionCard>
          </div>
        )}
      </DetailsDrawer>
    </div>
  );
}

/* ───────────────────────── Departments tab ───────────────────────── */

function DepartmentsTab() {
  const { workspaces, activeOrganization } = useWorkspaceContext();
  const teamsQ = useQuery(teamsQuery());
  const usersQ = useQuery(adminUsersQuery());

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", slug: "", description: "", type: "department" });

  useCreateEvent("itkc:create-department", () => {
    setDraft({ name: "", slug: "", description: "", type: "department" });
    setCreateOpen(true);
  });

  const visible = useMemo(() => {
    let list = workspaces.slice();
    if (filter === "active") list = list.filter((w) => /active/i.test(w.status));
    if (filter === "inactive") list = list.filter((w) => !/active/i.test(w.status));
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((w) =>
      [w.name, w.slug, w.type, w.status].some((v) => v.toLowerCase().includes(needle)),
    );
  }, [workspaces, q, filter]);

  return (
    <div className="space-y-4">
      <Toolbar
        search={q}
        onSearch={setQ}
        placeholder="Search departments by name, slug, type…"
        chips={[
          { id: "all", label: `All (${workspaces.length})` },
          { id: "active", label: "Active" },
          { id: "inactive", label: "Inactive" },
        ]}
        activeChip={filter}
        onChip={(id) => setFilter(id as "all" | "active" | "inactive")}
      />

      {activeOrganization && (
        <div className="rounded-xl border border-border/40 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
          Organization: <span className="font-medium text-foreground">{activeOrganization.name}</span>
        </div>
      )}

      <SectionCard className="overflow-hidden border-border/50 shadow-sm" contentClassName="p-0">
        {visible.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No departments visible"
            description="Departments will appear here once you are granted access to a workspace."
            className="m-4"
          />
        ) : (
          <>
            <div className="hidden max-h-[60vh] overflow-auto md:block">
              <Table className="min-w-[820px]">
                <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Department</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Teams</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((w) => {
                    const memberCount = (usersQ.data ?? []).filter((u) =>
                      u.teamNames.some((tn) => w.teams.some((t) => t.name === tn)),
                    ).length;
                    return (
                      <TableRow key={w.id} className="hover:bg-muted/25">
                        <TableCell>
                          <div className="font-medium">{w.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {w.membershipStatus}
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="rounded-md border border-border/30 bg-background/40 px-2 py-1 text-xs text-muted-foreground">
                            {w.slug}
                          </code>
                        </TableCell>
                        <TableCell className="text-sm capitalize">{w.type}</TableCell>
                        <TableCell>
                          <StatusBadge
                            label={w.status}
                            tone={/active/i.test(w.status) ? "success" : "muted"}
                          />
                        </TableCell>
                        <TableCell className="text-sm">{w.teams.length}</TableCell>
                        <TableCell className="text-sm">{memberCount || "—"}</TableCell>
                        <TableCell className="text-right">
                          <DepartmentRowActions />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-2 p-3 md:hidden">
              {visible.map((w) => (
                <div
                  key={w.id}
                  className="rounded-xl border border-border/40 bg-card/40 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{w.name}</div>
                    <StatusBadge
                      label={w.status}
                      tone={/active/i.test(w.status) ? "success" : "muted"}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground capitalize">
                    {w.type} · {w.teams.length} team(s)
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {teamsQ.isError && (
          <div className="border-t border-border/40 p-3 text-xs text-destructive">
            Could not load related teams for member counts.
          </div>
        )}
      </SectionCard>

      <FormDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New department"
        description="Departments group teams, ownership, and visible modules under the organization."
        onSubmit={() => {
          /* configuration required */
        }}
        submitLabel="Save department"
      >
        <BackendPendingBanner />
        <Field label="Department name">
          <Input
            value={draft.name}
            onChange={(e) =>
              setDraft({ ...draft, name: e.target.value, slug: slugify(e.target.value) })
            }
          />
        </Field>
        <Field label="Slug">
          <Input
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
          />
        </Field>
        <Field label="Type">
          <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="department">Department</SelectItem>
              <SelectItem value="workspace">Workspace</SelectItem>
              <SelectItem value="business_unit">Business unit</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Description">
          <Textarea
            rows={3}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>
        <DisabledFooterNote />
      </FormDrawer>
    </div>
  );
}

function DepartmentRowActions() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DisabledMenuItem label="View department" />
        <DisabledMenuItem label="Edit department" />
        <DisabledMenuItem label="Add team" />
        <DropdownMenuSeparator />
        <DisabledMenuItem label="Archive" />
        <DisabledMenuItem label="Delete" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ───────────────────────── Teams tab ───────────────────────── */

function TeamsTab({ allowed }: { allowed: boolean }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TeamSummary | null>(null);
  const [details, setDetails] = useState<TeamSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TeamSummary | null>(null);
  const [draft, setDraft] = useState<TeamInput>(EMPTY_TEAM);
  const [slugTouched, setSlugTouched] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    ...teamsQuery(),
    enabled: allowed,
  });

  useCreateEvent("itkc:create-team", () => {
    if (!allowed) return;
    setDraft(EMPTY_TEAM);
    setSlugTouched(false);
    setCreateOpen(true);
  });

  const visible = useMemo(() => {
    const teams = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return teams;
    return teams.filter((t) =>
      [t.name, t.description ?? "", t.slug].some((v) => v.toLowerCase().includes(needle)),
    );
  }, [data, q]);

  const invalidate = () => qc.invalidateQueries({ queryKey: teamsKeys.list() });

  const createMutation = useMutation({
    mutationFn: (input: TeamInput) => createTeam({ ...input, slug: slugify(input.slug) }),
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      toast.success("Team created");
    },
    onError: (e) => toast.error(formatTeamsError(e, "Failed to create team")),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TeamInput }) =>
      updateTeam(id, { ...input, slug: slugify(input.slug) }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Team updated");
    },
    onError: (e) => toast.error(formatTeamsError(e, "Failed to update team")),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
      setDetails(null);
      toast.success("Team deleted");
    },
    onError: (e) => toast.error(formatTeamsError(e, "Failed to delete team")),
  });

  function openEdit(t: TeamSummary) {
    setDraft({ name: t.name, slug: t.slug, description: t.description ?? "" });
    setSlugTouched(true);
    setEditing(t);
  }
  function submitCreate() {
    if (!draft.name.trim()) return toast.error("Team name is required");
    if (!slugify(draft.slug)) return toast.error("Team slug is required");
    createMutation.mutate(draft);
  }
  function submitEdit() {
    if (!editing) return;
    if (!draft.name.trim()) return toast.error("Team name is required");
    if (!slugify(draft.slug)) return toast.error("Team slug is required");
    updateMutation.mutate({ id: editing.id, input: draft });
  }

  if (!allowed) {
    return (
      <EmptyState
        icon={Lock}
        title="Team admin access required"
        description="Switch to the IT Administrator role to manage teams."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Toolbar
        search={q}
        onSearch={setQ}
        placeholder="Search teams by name, slug, description…"
        chips={[{ id: "all", label: `${visible.length} of ${(data ?? []).length} teams` }]}
        activeChip="all"
        onChip={() => {}}
      />

      <SectionCard className="overflow-hidden border-border/50 shadow-sm" contentClassName="p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading teams…</div>
        ) : isError ? (
          <EmptyState
            icon={AlertCircle}
            title="Could not load teams"
            description={formatTeamsError(error, "Unexpected error")}
            actionLabel="Retry"
            onAction={() => refetch()}
            className="m-4"
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No teams yet"
            description="Use Create → New team to add the first team."
            className="m-4"
          />
        ) : (
          <>
            <div className="hidden max-h-[60vh] overflow-auto md:block">
              <Table className="min-w-[820px]">
                <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Team</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((t) => (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer transition-colors hover:bg-muted/25"
                      onClick={() => setDetails(t)}
                    >
                      <TableCell>
                        <div className="font-medium">{t.name}</div>
                        {t.description && (
                          <div className="line-clamp-1 text-xs text-muted-foreground">
                            {t.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground/80 italic">
                        Not assigned
                      </TableCell>
                      <TableCell>
                        <code className="rounded-md border border-border/30 bg-background/40 px-2 py-1 text-xs text-muted-foreground">
                          {t.slug}
                        </code>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex min-w-8 justify-center rounded-full border border-border/40 bg-muted/25 px-2 py-0.5 text-xs font-medium">
                          {t.memberCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetails(t)}>
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(t)}>Edit</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setConfirmDelete(t)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-2 p-3 md:hidden">
              {visible.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDetails(t)}
                  className="block w-full rounded-xl border border-border/40 bg-card/40 p-3 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{t.name}</div>
                    <span className="rounded-full border border-border/40 bg-muted/25 px-2 py-0.5 text-xs">
                      {t.memberCount}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{t.slug}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      <FormDrawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New team"
        onSubmit={submitCreate}
        submitLabel="Create team"
      >
        <TeamForm
          draft={draft}
          setDraft={setDraft}
          slugTouched={slugTouched}
          setSlugTouched={setSlugTouched}
        />
      </FormDrawer>

      <FormDrawer
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={`Edit ${editing?.name ?? "team"}`}
        onSubmit={submitEdit}
        submitLabel="Save changes"
      >
        <TeamForm
          draft={draft}
          setDraft={setDraft}
          slugTouched={slugTouched}
          setSlugTouched={setSlugTouched}
        />
      </FormDrawer>

      <DetailsDrawer
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        title={details?.name ?? ""}
        description={details?.description ?? undefined}
        actions={
          details && (
            <>
              <Button size="sm" variant="secondary" onClick={() => openEdit(details)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => setConfirmDelete(details)}
              >
                Delete
              </Button>
            </>
          )
        }
      >
        {details && <TeamDetails team={details} />}
      </DetailsDrawer>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name}?`}
        description="The team and its membership will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
      />
    </div>
  );
}

function TeamForm({
  draft,
  setDraft,
  slugTouched,
  setSlugTouched,
}: {
  draft: TeamInput;
  setDraft: (d: TeamInput) => void;
  slugTouched: boolean;
  setSlugTouched: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Team name">
        <Input
          value={draft.name}
          onChange={(e) => {
            const name = e.target.value;
            setDraft({ ...draft, name, slug: slugTouched ? draft.slug : slugify(name) });
          }}
        />
      </Field>
      <Field label="Slug">
        <Input
          value={draft.slug}
          onChange={(e) => {
            setSlugTouched(true);
            setDraft({ ...draft, slug: e.target.value });
          }}
        />
        <p className="text-xs text-muted-foreground">
          Lowercase letters, numbers and hyphens. Used as the team's unique identifier.
        </p>
      </Field>
      <Field label="Description">
        <Textarea
          rows={2}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </Field>
    </div>
  );
}

function TeamDetails({ team }: { team: TeamSummary }) {
  const qc = useQueryClient();
  const membersQ = useQuery(teamMembersQuery(team.id));
  const rolesQ = useQuery(teamRolesQuery());
  const profilesQ = useQuery(profilesQuery());

  const members = membersQ.data ?? [];
  const roles = rolesQ.data ?? [];
  const allProfiles = profilesQ.data ?? [];

  const [addUserId, setAddUserId] = useState("");
  const [addRoleKey, setAddRoleKey] = useState("team_viewer");

  const invalidateMembers = () => {
    qc.invalidateQueries({ queryKey: teamsKeys.members(team.id) });
    qc.invalidateQueries({ queryKey: teamsKeys.list() });
  };

  const addMutation = useMutation({
    mutationFn: () => addTeamMember(team.id, addUserId, addRoleKey),
    onSuccess: () => {
      invalidateMembers();
      setAddUserId("");
      toast.success("Member added");
    },
    onError: (e) => toast.error(formatTeamsError(e, "Failed to add member")),
  });
  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeTeamMember(team.id, userId),
    onSuccess: () => {
      invalidateMembers();
      toast.success("Member removed");
    },
    onError: (e) => toast.error(formatTeamsError(e, "Failed to remove member")),
  });
  const roleMutation = useMutation({
    mutationFn: ({ userId, roleKey }: { userId: string; roleKey: string }) =>
      setTeamMemberRole(team.id, userId, roleKey),
    onSuccess: () => {
      invalidateMembers();
      toast.success("Role updated");
    },
    onError: (e) => toast.error(formatTeamsError(e, "Failed to update role")),
  });

  const memberIds = new Set(members.map((m) => m.userId));
  const availableProfiles = allProfiles.filter((p) => !memberIds.has(p.id));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Members" value={String(members.length)} />
        <Stat label="Slug" value={team.slug} />
        <Stat label="Created" value={new Date(team.createdAt).toLocaleDateString()} />
      </div>

      <SectionCard title="Members">
        {membersQ.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading members…</p>
        ) : members.length === 0 ? (
          <p className="text-xs text-muted-foreground">No members.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/35 bg-background/25 p-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.displayName}</div>
                  {m.email && (
                    <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Select
                    value={m.roleKey ?? undefined}
                    onValueChange={(v) => roleMutation.mutate({ userId: m.userId, roleKey: v })}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.roleKey} value={r.roleKey}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeMutation.mutate(m.userId)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border/40 bg-background/25 p-3 sm:flex-row sm:items-center">
          <Select value={addUserId || undefined} onValueChange={setAddUserId}>
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder="Add member…" />
            </SelectTrigger>
            <SelectContent>
              {availableProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={addRoleKey} onValueChange={setAddRoleKey}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.roleKey} value={r.roleKey}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!addUserId || addMutation.isPending || rolesQ.isError || profilesQ.isError}
            onClick={() => addMutation.mutate()}
          >
            Add
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

/* ───────────────────────── Shared ───────────────────────── */

function Toolbar({
  search,
  onSearch,
  placeholder,
  chips,
  activeChip,
  onChip,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  chips: { id: string; label: string }[];
  activeChip: string;
  onChip: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/60 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => onChip(c.id)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              activeChip === c.id
                ? "border-primary/50 bg-primary/15 text-foreground"
                : "border-border/40 bg-background/40 text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="relative max-w-sm flex-1 sm:w-80 sm:flex-none">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-border/40 bg-card/30 p-3.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`mt-0.5 truncate ${muted ? "italic text-muted-foreground" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function DisabledMenuItem({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>
          <DropdownMenuItem disabled>{label}</DropdownMenuItem>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left">Not available in this environment</TooltipContent>
    </Tooltip>
  );
}

function BackendPendingBanner() {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
      Configuration required — department mutations are managed by your organization administrator.
    </div>
  );
}

function DisabledFooterNote() {
  return (
    <p className="text-[11px] text-muted-foreground">
      Access controlled by role and scope. Contact your organization administrator to enable department changes.
    </p>
  );
}

/* ───────────────────────── Access Map tab ───────────────────────── */

type AccessLevel = "none" | "read" | "write" | "manage" | "admin";

const ACCESS_LEVEL_STYLES: Record<AccessLevel, { label: string; className: string }> = {
  none: { label: "None", className: "border-border/40 bg-muted/20 text-muted-foreground" },
  read: { label: "Read", className: "border-sky-500/30 bg-sky-500/10 text-sky-200" },
  write: { label: "Write", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" },
  manage: { label: "Manage", className: "border-violet-500/30 bg-violet-500/10 text-violet-200" },
  admin: { label: "Admin", className: "border-rose-500/30 bg-rose-500/10 text-rose-200" },
};

interface ModuleRow {
  module: string;
  scope: string;
  access: Partial<Record<string, AccessLevel>>;
}

const ACCESS_ROLE_COLUMNS: { key: string; label: string }[] = [
  { key: "platform_admin", label: "Platform Admin" },
  { key: "it_admin", label: "IT Admin" },
  { key: "sd_lead", label: "Service Desk Lead" },
  { key: "helpdesk", label: "Helpdesk" },
  { key: "technician", label: "Technician" },
  { key: "network_admin", label: "Network Admin" },
  { key: "doc_editor", label: "Doc Editor" },
  { key: "auditor", label: "Auditor" },
  { key: "employee", label: "Employee" },
];

const ACCESS_MATRIX: ModuleRow[] = [
  { module: "Dashboard", scope: "Organization", access: { platform_admin: "admin", it_admin: "manage", sd_lead: "manage", helpdesk: "read", technician: "read", network_admin: "read", doc_editor: "read", auditor: "read", employee: "read" } },
  { module: "Tickets", scope: "Team / queue", access: { platform_admin: "admin", it_admin: "manage", sd_lead: "manage", helpdesk: "write", technician: "write", network_admin: "read", doc_editor: "none", auditor: "read", employee: "none" } },
  { module: "My Requests", scope: "Own records", access: { platform_admin: "admin", it_admin: "read", sd_lead: "read", helpdesk: "read", technician: "read", network_admin: "read", doc_editor: "read", auditor: "read", employee: "write" } },
  { module: "Service Catalog", scope: "Organization", access: { platform_admin: "admin", it_admin: "manage", sd_lead: "manage", helpdesk: "read", technician: "read", network_admin: "read", doc_editor: "read", auditor: "read", employee: "read" } },
  { module: "Knowledge Base", scope: "Department / visibility", access: { platform_admin: "admin", it_admin: "manage", sd_lead: "write", helpdesk: "write", technician: "read", network_admin: "read", doc_editor: "manage", auditor: "read", employee: "read" } },
  { module: "CMDB", scope: "Asset scope", access: { platform_admin: "admin", it_admin: "manage", sd_lead: "read", helpdesk: "read", technician: "write", network_admin: "manage", doc_editor: "none", auditor: "read", employee: "none" } },
  { module: "IPAM", scope: "Network scope", access: { platform_admin: "admin", it_admin: "manage", sd_lead: "none", helpdesk: "none", technician: "read", network_admin: "manage", doc_editor: "none", auditor: "read", employee: "none" } },
  { module: "Tasks", scope: "Own / team", access: { platform_admin: "admin", it_admin: "manage", sd_lead: "manage", helpdesk: "write", technician: "write", network_admin: "write", doc_editor: "write", auditor: "read", employee: "none" } },
  { module: "Protocols", scope: "Department", access: { platform_admin: "admin", it_admin: "manage", sd_lead: "write", helpdesk: "read", technician: "read", network_admin: "read", doc_editor: "manage", auditor: "read", employee: "none" } },
  { module: "Notes", scope: "Own / shared", access: { platform_admin: "admin", it_admin: "write", sd_lead: "write", helpdesk: "write", technician: "write", network_admin: "write", doc_editor: "write", auditor: "read", employee: "none" } },
  { module: "Audit Log", scope: "Organization", access: { platform_admin: "admin", it_admin: "read", sd_lead: "none", helpdesk: "none", technician: "none", network_admin: "none", doc_editor: "none", auditor: "read", employee: "none" } },
  { module: "Reports", scope: "Organization", access: { platform_admin: "admin", it_admin: "manage", sd_lead: "read", helpdesk: "none", technician: "none", network_admin: "read", doc_editor: "none", auditor: "read", employee: "none" } },
  { module: "Settings", scope: "Own profile", access: { platform_admin: "admin", it_admin: "manage", sd_lead: "write", helpdesk: "write", technician: "write", network_admin: "write", doc_editor: "write", auditor: "read", employee: "read" } },
  { module: "Admin", scope: "Organization", access: { platform_admin: "admin", it_admin: "manage", sd_lead: "none", helpdesk: "none", technician: "none", network_admin: "none", doc_editor: "none", auditor: "none", employee: "none" } },
];

function AccessLevelChip({ level }: { level: AccessLevel }) {
  const style = ACCESS_LEVEL_STYLES[level];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}

function AccessMapTab() {
  const [scope, setScope] = useState<"role" | "department" | "team">("role");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Module access overview</div>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              How each role sees the platform. Page visibility is controlled in{" "}
              <span className="font-medium text-foreground">Roles &amp; Permissions</span>; the
              levels shown here describe the typical operational scope per module.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-background/40 p-1 text-xs">
            {(["role", "department", "team"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`rounded-md px-2.5 py-1 capitalize transition ${
                  scope === s
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                By {s}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(Object.keys(ACCESS_LEVEL_STYLES) as AccessLevel[]).map((lvl) => (
            <AccessLevelChip key={lvl} level={lvl} />
          ))}
        </div>
      </div>

      {scope !== "role" ? (
        <SectionCard className="border-border/50 shadow-sm">
          <EmptyState
            icon={Layers}
            title={`Access by ${scope} — configuration required`}
            description={`The ${scope} access view becomes available once your organization administrator publishes ${scope} scopes. The role view below already reflects the live model.`}
          />
        </SectionCard>
      ) : (
        <SectionCard className="overflow-hidden border-border/50 shadow-sm" contentClassName="p-0">
          <div className="overflow-auto">
            <Table className="min-w-[980px]">
              <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[200px]">Module</TableHead>
                  <TableHead className="w-[160px]">Scope</TableHead>
                  {ACCESS_ROLE_COLUMNS.map((col) => (
                    <TableHead key={col.key} className="text-center text-[11px]">
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ACCESS_MATRIX.map((row) => (
                  <TableRow key={row.module} className="hover:bg-muted/20">
                    <TableCell className="font-medium">{row.module}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.scope}</TableCell>
                    {ACCESS_ROLE_COLUMNS.map((col) => (
                      <TableCell key={col.key} className="text-center">
                        <AccessLevelChip level={row.access[col.key] ?? "none"} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-border/40 bg-card/40 px-3 py-2 text-[11px] text-muted-foreground">
            Access controlled by role and scope. Edit per-route visibility in Roles &amp; Permissions.
          </div>
        </SectionCard>
      )}
    </div>
  );
}
