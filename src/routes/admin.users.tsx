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
import { createAdminUser, setAdminUserActive } from "@/lib/admin-users/create-user";
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

const BACKEND_ACTION_PENDING = "Backend action pending";
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
  const { session } = useAuth();
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
  const optionsQuery = useQuery({ ...adminUserFormOptionsQuery(), enabled });

  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [q, setQ] = useState("");
  const [details, setDetails] = useState<AdminUser | null>(null);
  const [statusActionUserId, setStatusActionUserId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<UserDraft>(EMPTY_USER);
  const [createError, setCreateError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
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
    setDraft(EMPTY_USER);
    setCreateError(null);
    createMutation.reset();
    setCreateOpen(true);
  }

  function submitCreate() {
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

  async function handleSetUserActive(user: AdminUser, isActive: boolean) {
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
    <div>
      <PageHeader
        title="Users"
        description="Manage workspace users and access."
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Add user
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <TabsList>
            <TabsTrigger value="active">
              Active ({data.filter((user) => user.isActive).length})
            </TabsTrigger>
            <TabsTrigger value="inactive">
              Inactive ({data.filter((user) => !user.isActive).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative max-w-sm flex-1 sm:w-72 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search name, email, team…"
            className="pl-9"
          />
        </div>
      </div>

      <SectionCard contentClassName="p-0">
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
          <Table>
            <TableHeader>
              <TableRow>
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
                <TableRow key={user.id} className="cursor-pointer" onClick={() => setDetails(user)}>
                  <TableCell>
                    <div className="font-medium">{user.displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      {user.email ?? "Email unavailable"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">Not available</TableCell>
                  <TableCell className="text-sm">{listLabel(user.teamNames)}</TableCell>
                  <TableCell>
                    <StatusBadge label={listLabel(user.roleNames, "No global role")} tone="info" />
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
                        <DropdownMenuItem onClick={() => toast.info(BACKEND_ACTION_PENDING)}>
                          Edit user
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={statusActionUserId === user.id}
                          onClick={() => handleSetUserActive(user, !user.isActive)}
                        >
                          {user.isActive ? "Disable" : "Enable"} user
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <FormDrawer
        open={createOpen}
        onOpenChange={(open) => {
          if (!createMutation.isPending) setCreateOpen(open);
        }}
        title="Add user"
        description="Create a real Supabase account and assign its initial access."
        onSubmit={submitCreate}
        submitLabel={createMutation.isPending ? "Creating…" : "Create user"}
      >
        <div className="space-y-1.5">
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
        <div className="space-y-1.5">
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
        <div className="space-y-1.5">
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
        <div className="space-y-1.5">
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
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/40 p-3">
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
          details && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => toast.info(BACKEND_ACTION_PENDING)}
            >
              Edit (backend pending)
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
