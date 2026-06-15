import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminUsersQuery } from "@/lib/admin-users/queries";
import { formatAdminUsersError } from "@/lib/admin-users/errors";
import type { AdminUser } from "@/lib/admin-users/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { can, useRole } from "@/lib/permissions";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users · IT Knowledge Center" }] }),
  component: AdminUsersPage,
});

const BACKEND_ACTION_PENDING = "Backend action pending";

function listLabel(values: string[], fallback = "—"): string {
  return values.length > 0 ? values.join(", ") : fallback;
}

function AdminUsersPage() {
  const { session } = useAuth();
  const role = useRole();
  const allowed = can("admin.users", role);
  const enabled = Boolean(session?.user) && allowed;
  const { data = [], isLoading, isError, error, refetch } = useQuery({
    ...adminUsersQuery(),
    enabled,
  });

  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [q, setQ] = useState("");
  const [details, setDetails] = useState<AdminUser | null>(null);

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
          <Button size="sm" onClick={() => toast.info(BACKEND_ACTION_PENDING)}>
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
            description={q.trim() ? "Adjust search or change the tab." : "No matching profiles were returned by Supabase."}
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
                    <div className="text-xs text-muted-foreground">{user.email ?? "Email unavailable"}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">Not available</TableCell>
                  <TableCell className="text-sm">{listLabel(user.teamNames)}</TableCell>
                  <TableCell>
                    <StatusBadge label={listLabel(user.roleNames, "No global role")} tone="info" />
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={user.isActive ? "active" : "inactive"} tone={user.isActive ? "success" : "muted"} />
                  </TableCell>
                  <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetails(user)}>View details</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.info(BACKEND_ACTION_PENDING)}>
                          Edit user (backend pending)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => toast.info(BACKEND_ACTION_PENDING)}>
                          {user.isActive ? "Disable" : "Enable"} user (backend pending)
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

      <DetailsDrawer
        open={Boolean(details)}
        onOpenChange={(open) => !open && setDetails(null)}
        title={details?.displayName ?? ""}
        description={details ? `${listLabel(details.roleNames, "No global role")} · ${listLabel(details.teamNames, "No team")}` : undefined}
        actions={details && (
          <Button size="sm" variant="secondary" onClick={() => toast.info(BACKEND_ACTION_PENDING)}>
            Edit (backend pending)
          </Button>
        )}
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
          <Info icon={ShieldCheck} label="Role" value={listLabel(user.roleNames, "No global role")} />
        </dl>
      </SectionCard>

      <SectionCard title="Account data">
        <p className="text-xs text-muted-foreground">
          Ticket, task, document, notes, and activity summaries are not available from the admin users backend yet.
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
