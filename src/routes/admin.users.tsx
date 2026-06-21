import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  Lock,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { DetailsDrawer } from "@/components/common/DetailsDrawer";
import { EmptyState } from "@/components/common/EmptyState";
import { FormDrawer } from "@/components/common/FormDrawer";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useAuth } from "@/lib/auth/AuthProvider";
import { can, useRole } from "@/lib/permissions";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users · IT Knowledge Center" }] }),
  component: AdminUsersPage,
});

const NO_SELECTION = "none";

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

function listLabel(values: string[], fallback = "—"): string {
  return values.length > 0 ? values.join(", ") : fallback;
}

function AdminUsersPage() {
  const { session, isPlatformAdmin } = useAuth();
  const role = useRole();
  const allowed = can("admin.users", role);
  const enabled = Boolean(session?.user) && allowed;
  const queryClient = useQueryClient();
  const {
    data = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    ...adminUsersQuery(),
    enabled,
  });
  const optionsQuery = useQuery({
    ...adminUserFormOptionsQuery(),
    enabled: enabled && isPlatformAdmin,
  });

  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [q, setQ] = useState("");
  const [details, setDetails] = useState<AdminUser | null>(null);
  const [statusActionUserId, setStatusActionUserId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<UserDraft>(EMPTY_USER);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editDraft, setEditDraft] = useState<UserDraft>(EMPTY_USER);
  const [editError, setEditError] = useState<string | null>(null);

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
    onError: (mutationError) => {
      setCreateError(formatAdminUsersError(mutationError, "Failed to create user"));
    },
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
    onError: (mutationError) => {
      setEditError(formatAdminUsersError(mutationError, "Failed to update user"));
    },
  });

  const visible = useMemo(() => {
    const list = data.filter((user) => (tab === "active" ? user.isActive : !user.isActive));
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((user) =>
      [
        user.displayName,
        user.email ?? "",
        ...user.teamNames,
        ...user.roleNames,
        ...user.roleKeys,
      ].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [data, q, tab]);

  function openCreate() {
    if (!isPlatformAdmin) return;
    setDraft(EMPTY_USER);
    setCreateError(null);
    createMutation.reset();
    setCreateOpen(true);
  }

  function submitCreate() {
    if (!isPlatformAdmin) return;
    if (createMutation.isPending) return;
    if (!draft.displayName.trim()) {
      setCreateError("Display name is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
      setCreateError("Enter a valid email address.");
      return;
    }
    setCreateError(null);
    createMutation.mutate();
  }

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
    updateMutation.reset();
  }

  function submitEdit() {
    if (!isPlatformAdmin) return;
    if (updateMutation.isPending) return;
    if (!editUser) {
      setEditError("No user is selected for editing.");
      return;
    }
    if (!editDraft.displayName.trim()) {
      setEditError("Display name is required.");
      return;
    }
    setEditError(null);
    updateMutation.mutate();
  }

  async function handleSetUserActive(user: AdminUser, isActive: boolean) {
    if (!isPlatformAdmin) return;
    if (!session?.access_token) {
      toast.error("User status was not updated", {
        description: "Your session is no longer available.",
      });
      return;
    }

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
    } catch (error) {
      toast.error("User status was not updated", {
        description: error instanceof Error ? error.message : "Unexpected error",
      });
    } finally {
      setStatusActionUserId(null);
    }
  }

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Users" description="Internal user directory." />
        <EmptyState
          icon={Lock}
          title="Admin access required"
          description="Switch to the IT Administrator role via the profile menu to manage users."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Users"
        description="Manage workspace identities, account status, teams, and assigned roles."
        actions={
          isPlatformAdmin ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" /> Add user
            </Button>
          ) : undefined
        }
      />

      {!isPlatformAdmin && (
        <Alert className="border-border/50 bg-muted/30 text-muted-foreground">
          <Lock className="h-4 w-4" />
          <AlertDescription>
            User management changes require Platform Administrator access.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/60 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <TabsList className="h-9 border border-border/40 bg-background/40 p-1">
            <TabsTrigger value="active">
              Active ({data.filter((user) => user.isActive).length})
            </TabsTrigger>
            <TabsTrigger value="inactive">
              Inactive ({data.filter((user) => !user.isActive).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative max-w-sm flex-1 sm:w-80 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search name, email, team…"
            className="pl-9"
          />
        </div>
      </div>

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
            title={q.trim() ? "No users match your filters" : `No ${tab} users`}
            description={
              q.trim()
                ? "Adjust search or change the tab."
                : "No matching profiles were returned by Supabase."
            }
            className="m-4"
          />
        ) : (
          <div className="max-h-[68vh] overflow-auto">
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
                    <TableCell className="text-sm text-muted-foreground">Not available</TableCell>
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
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetails(user)}>
                            View user details
                          </DropdownMenuItem>
                          {isPlatformAdmin && (
                            <>
                              <DropdownMenuItem onClick={() => openEdit(user)}>
                                Edit user
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={statusActionUserId === user.id}
                                onClick={() => handleSetUserActive(user, !user.isActive)}
                              >
                                {user.isActive ? "Disable" : "Enable"} user
                              </DropdownMenuItem>
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
        )}
      </SectionCard>

      <FormDrawer
        open={createOpen && isPlatformAdmin}
        onOpenChange={(open) => {
          if (!createMutation.isPending) setCreateOpen(open);
        }}
        title="Add user"
        description="Create a real Supabase account and assign its initial access."
        onSubmit={submitCreate}
        submitLabel={createMutation.isPending ? "Creating…" : "Create user"}
      >
        <div className="space-y-2 rounded-xl border border-border/40 bg-card/30 p-3.5">
          <Label htmlFor="new-user-display-name" className="text-xs">
            Display name
          </Label>
          <Input
            id="new-user-display-name"
            value={draft.displayName}
            onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
            maxLength={120}
            autoComplete="name"
          />
        </div>
        <div className="space-y-2 rounded-xl border border-border/40 bg-card/30 p-3.5">
          <Label htmlFor="new-user-email" className="text-xs">
            Email
          </Label>
          <Input
            id="new-user-email"
            type="email"
            value={draft.email}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            maxLength={320}
            autoComplete="email"
          />
        </div>
        <div className="space-y-2 rounded-xl border border-border/40 bg-card/30 p-3.5">
          <Label className="text-xs">Initial global role</Label>
          <Select
            value={draft.roleId ?? NO_SELECTION}
            onValueChange={(value) =>
              setDraft({ ...draft, roleId: value === NO_SELECTION ? null : value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="No global role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SELECTION}>No global role</SelectItem>
              {(optionsQuery.data?.roles ?? []).map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 rounded-xl border border-border/40 bg-card/30 p-3.5">
          <Label className="text-xs">Team</Label>
          <Select
            value={draft.teamId ?? NO_SELECTION}
            onValueChange={(value) =>
              setDraft({ ...draft, teamId: value === NO_SELECTION ? null : value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="No team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SELECTION}>No team</SelectItem>
              {(optionsQuery.data?.teams ?? []).map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/30 p-3.5">
          <div>
            <Label htmlFor="new-user-active" className="text-xs">
              Active account
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Active users receive an invite. Inactive users are created disabled without an invite.
            </p>
          </div>
          <Switch
            id="new-user-active"
            checked={draft.isActive}
            onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
          />
        </div>
        {optionsQuery.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Could not load roles or teams</AlertTitle>
            <AlertDescription>
              {formatAdminUsersError(optionsQuery.error, "Unexpected error")}
            </AlertDescription>
          </Alert>
        )}
        {createError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>User was not created</AlertTitle>
            <AlertDescription>{createError}</AlertDescription>
          </Alert>
        )}
      </FormDrawer>

      <FormDrawer
        open={Boolean(editUser) && isPlatformAdmin}
        onOpenChange={(open) => {
          if (!updateMutation.isPending && !open) {
            setEditUser(null);
            setEditDraft(EMPTY_USER);
            setEditError(null);
          }
        }}
        title={editUser ? `Edit ${editUser.displayName}` : "Edit user"}
        description="Update the user's display name and account status."
        onSubmit={submitEdit}
        submitLabel={updateMutation.isPending ? "Saving…" : "Save changes"}
      >
        <div className="space-y-2 rounded-xl border border-border/40 bg-card/30 p-3.5">
          <Label htmlFor="edit-user-display-name" className="text-xs">
            Display name
          </Label>
          <Input
            id="edit-user-display-name"
            value={editDraft.displayName}
            onChange={(event) => setEditDraft({ ...editDraft, displayName: event.target.value })}
            maxLength={120}
            autoComplete="name"
          />
        </div>

        <div className="space-y-2 rounded-xl border border-border/40 bg-card/30 p-3.5">
          <Label htmlFor="edit-user-email" className="text-xs">
            Email
          </Label>
          <Input
            id="edit-user-email"
            type="email"
            value={editDraft.email}
            disabled
            className="opacity-80"
          />
          <p className="text-[11px] text-muted-foreground">
            Email editing is intentionally locked to avoid breaking authentication.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/30 p-3.5">
          <div>
            <Label htmlFor="edit-user-active" className="text-xs">
              Active account
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Disabled users cannot sign in until the account is enabled again.
            </p>
          </div>
          <Switch
            id="edit-user-active"
            checked={editDraft.isActive}
            onCheckedChange={(checked) => setEditDraft({ ...editDraft, isActive: checked })}
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

      <DetailsDrawer
        open={Boolean(details)}
        onOpenChange={(open) => !open && setDetails(null)}
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
        {details && <UserDetails user={details} />}
      </DetailsDrawer>
    </div>
  );
}

function UserDetails({ user }: { user: AdminUser }) {
  return (
    <div className="space-y-5">
      <SectionCard title="Profile">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Info icon={Mail} label="Email" value={user.email ?? "Email unavailable"} />
          <Info icon={Building2} label="Department" value="Not available" />
          <Info icon={Users} label="Team" value={listLabel(user.teamNames, "No team")} />
          <Info
            icon={ShieldCheck}
            label="Role"
            value={listLabel(user.roleNames, "No global role")}
          />
        </dl>
      </SectionCard>

      <SectionCard title="Account data">
        <p className="text-xs text-muted-foreground">
          Ticket, task, document, notes, and activity summaries are not available from the admin
          users backend yet.
        </p>
      </SectionCard>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-0.5 truncate">{value}</div>
    </div>
  );
}
