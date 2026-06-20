import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Eye,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  adminRolePageVisibilityQuery,
  adminRolesKeys,
  adminRolesQuery,
} from "@/lib/admin-roles/queries";
import type {
  AdminPermission,
  AdminRole,
  AdminRolePageVisibility,
  AdminRolesData,
} from "@/lib/admin-roles/types";
import { updateRoleMetadata } from "@/lib/admin-roles/update-role-metadata";
import { updateRolePermission } from "@/lib/admin-roles/update-role-permission";
import { useAuth } from "@/lib/auth/AuthProvider";
import { roleLabel } from "@/lib/data/users";
import {
  CAPABILITY_GROUPS,
  PAGE_VISIBILITY,
  ROLES,
  can,
  setRole,
  useRole,
  type Role,
} from "@/lib/permissions";

export const Route = createFileRoute("/admin/roles")({
  head: () => ({ meta: [{ title: "Roles and Permissions · IT Knowledge Center" }] }),
  component: AdminRolesPage,
});

const PAGES: { path: string; label: string }[] = [
  { path: "/", label: "Dashboard" },
  { path: "/documents", label: "Documents" },
  { path: "/tickets", label: "Tickets" },
  { path: "/my-requests", label: "My Requests" },
  { path: "/service-catalog", label: "Service Catalog" },
  { path: "/cmdb", label: "CMDB" },
  { path: "/ipam", label: "IPAM" },
  { path: "/tasks", label: "Tasks" },
  { path: "/notes", label: "Notes" },
  { path: "/audit", label: "Audit Log" },
  { path: "/reports", label: "Reports" },
  { path: "/admin/users", label: "Users" },
  { path: "/admin/teams", label: "Teams" },
  { path: "/admin/roles", label: "Roles" },
  { path: "/admin/ticket-settings", label: "Ticket Configuration" },
  { path: "/trash", label: "Recycle Bin" },
  { path: "/settings", label: "Settings" },
];

const GROUP_ORDER = [
  "documents",
  "knowledge",
  "tickets",
  "catalog",
  "cmdb",
  "ipam",
  "tasks",
  "notes",
  "protocols",
  "admin",
  "platform",
  "team",
  "audit",
  "reports",
  "recyclebin",
  "system",
  "notifications",
  "other",
];

function permissionGroup(permissionKey: string): string {
  const prefix = permissionKey.split(".", 1)[0]?.toLowerCase();
  return GROUP_ORDER.includes(prefix) ? prefix : "other";
}

function staticRoleFor(roleKey: string): Role | null {
  const mapped =
    roleKey === "platform_admin"
      ? "super_admin"
      : roleKey === "platform_auditor"
        ? "auditor"
        : roleKey;
  return ROLES.some((role) => role.id === mapped) ? (mapped as Role) : null;
}

function formatLoadError(error: unknown): string {
  return error instanceof Error && error.message
    ? "The database role matrix could not be loaded."
    : "The database role matrix could not be loaded.";
}

function AdminRolesPage() {
  const role = useRole();
  const allowed = can("admin.roles", role);
  const { session, isPlatformAdmin } = useAuth();
  const isSignedIn = Boolean(session);
  const enabled = Boolean(session?.user) && allowed;
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<Role>(role);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [metadataName, setMetadataName] = useState("");
  const [metadataDescription, setMetadataDescription] = useState("");
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const rolesQuery = useQuery({ ...adminRolesQuery(), enabled });
  const pageVisibilityQuery = useQuery({ ...adminRolePageVisibilityQuery(), enabled });

  const permissionMutation = useMutation({
    mutationFn: async (input: {
      roleId: string;
      permissionId: string;
      action: "grant" | "revoke";
    }) => {
      if (!session?.access_token) throw new Error("Your session is no longer available.");
      return updateRolePermission({ ...input, accessToken: session.access_token });
    },
    onMutate: () => setMutationError(null),
    onSuccess: async (result) => {
      if (!result.ok) {
        setMutationError(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: adminRolesKeys.all });
    },
    onError: () => setMutationError("The role permission could not be updated."),
  });

  const metadataMutation = useMutation({
    mutationFn: async () => {
      if (!session?.access_token) throw new Error("Your session is no longer available.");
      if (!editingRole) throw new Error("No role is selected for editing.");
      return updateRoleMetadata({
        accessToken: session.access_token,
        roleId: editingRole.id,
        name: metadataName,
        description: metadataDescription.trim() || null,
      });
    },
    onMutate: () => setMetadataError(null),
    onSuccess: async (result) => {
      if (!result.ok) {
        setMetadataError(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: adminRolesKeys.all });
      setEditingRole(null);
    },
    onError: () => setMetadataError("The role metadata could not be updated."),
  });

  function openMetadataEditor(dbRole: AdminRole) {
    setEditingRole(dbRole);
    setMetadataName(dbRole.name);
    setMetadataDescription(dbRole.description ?? "");
    setMetadataError(null);
  }

  function closeMetadataEditor() {
    if (metadataMutation.isPending) return;
    setEditingRole(null);
    setMetadataError(null);
  }

  if (!allowed) {
    return (
      <div>
        <PageHeader
          title="Roles and Permissions"
          description="Control workspace capabilities and access levels."
        />
        <EmptyState
          icon={Lock}
          title="Admin access required"
          description="A platform administrator role is required to view the permission matrix."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Roles and Permissions"
        description="Control workspace capabilities and access levels."
      />

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-border/40 bg-card/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium text-foreground">Database permission management</p>
          <p className="mt-0.5">
            Roles, permissions, and the read-only page matrix are loaded from the database. Route
            enforcement and role preview remain on the current static safety rules.
          </p>
        </div>
      </div>

      <Tabs defaultValue="roles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="roles">
            <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Role list
          </TabsTrigger>
          <TabsTrigger value="capabilities">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Capability matrix
          </TabsTrigger>
          <TabsTrigger value="pages">
            <Eye className="mr-1.5 h-3.5 w-3.5" /> Page visibility
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="mr-1.5 h-3.5 w-3.5" /> Role preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles">
          <DatabaseState query={rolesQuery}>
            {(matrix) => (
              <DatabaseRoleList
                matrix={matrix}
                setPreview={setPreview}
                isPlatformAdmin={isPlatformAdmin}
                onEdit={openMetadataEditor}
              />
            )}
          </DatabaseState>
        </TabsContent>

        <TabsContent value="capabilities">
          <DatabaseState query={rolesQuery}>
            {(matrix) => (
              <PermissionMatrix
                matrix={matrix}
                isPlatformAdmin={isPlatformAdmin}
                mutation={permissionMutation}
                mutationError={mutationError}
              />
            )}
          </DatabaseState>
        </TabsContent>

        <TabsContent value="pages">
          <PageVisibilityTab rolesQuery={rolesQuery} visibilityQuery={pageVisibilityQuery} />
        </TabsContent>

        <TabsContent value="preview">
          <StaticRolePreview
            isSignedIn={isSignedIn}
            preview={preview}
            role={role}
            setPreview={setPreview}
          />
        </TabsContent>
      </Tabs>

      <RoleMetadataDialog
        role={editingRole}
        name={metadataName}
        description={metadataDescription}
        error={metadataError}
        saving={metadataMutation.isPending}
        onNameChange={setMetadataName}
        onDescriptionChange={setMetadataDescription}
        onClose={closeMetadataEditor}
        onSave={() => metadataMutation.mutate()}
      />
    </div>
  );
}

function DatabaseState({
  query,
  children,
}: {
  query: ReturnType<typeof useQuery<AdminRolesData>>;
  children: (matrix: AdminRolesData) => React.ReactNode;
}) {
  if (query.isLoading) {
    return (
      <SectionCard
        title="Database roles"
        description="Loading the current role catalog and grants."
      >
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading roles and permissions…
        </div>
      </SectionCard>
    );
  }

  if (query.isError || !query.data) {
    return (
      <SectionCard title="Database roles unavailable" description={formatLoadError(query.error)}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />{" "}
          Retry
        </Button>
      </SectionCard>
    );
  }

  return <>{children(query.data)}</>;
}

function DatabaseRoleList({
  matrix,
  setPreview,
  isPlatformAdmin,
  onEdit,
}: {
  matrix: AdminRolesData;
  setPreview: (role: Role) => void;
  isPlatformAdmin: boolean;
  onEdit: (role: AdminRole) => void;
}) {
  const grantCounts = new Map<string, number>();
  for (const grant of matrix.grants) {
    grantCounts.set(grant.roleId, (grantCounts.get(grant.roleId) ?? 0) + 1);
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {matrix.roles.map((dbRole) => {
        const previewRole = staticRoleFor(dbRole.roleKey);
        const pageCount = previewRole
          ? Object.values(PAGE_VISIBILITY).filter((roles) => roles.includes(previewRole)).length
          : 0;
        return (
          <SectionCard
            key={dbRole.id}
            title={dbRole.name}
            description={dbRole.description ?? "No description provided."}
            actions={
              <StatusBadge label={dbRole.scope === "platform" ? "Platform" : "Team"} tone="info" />
            }
          >
            <dl className="mb-3 grid gap-1 rounded-lg border border-border/30 bg-background/30 p-2 text-[11px]">
              <ReadOnlyMetadata label="Role key" value={dbRole.roleKey} mono />
              <ReadOnlyMetadata label="Scope" value={dbRole.scope} />
              <ReadOnlyMetadata label="System role" value={dbRole.isSystem ? "Yes" : "No"} />
            </dl>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <Cell label="Pages" value={pageCount} />
              <Cell label="Permissions" value={grantCounts.get(dbRole.id) ?? 0} />
            </dl>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                disabled={!isPlatformAdmin}
                title={
                  isPlatformAdmin
                    ? "Edit display metadata"
                    : "Only a platform administrator can edit role metadata."
                }
                onClick={() => onEdit(dbRole)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
              {previewRole && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setPreview(previewRole)}
                >
                  Preview
                </Button>
              )}
            </div>
            {!previewRole && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                No static page-visibility preview exists for this DB role.
              </p>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

function RoleMetadataDialog({
  role,
  name,
  description,
  error,
  saving,
  onNameChange,
  onDescriptionChange,
  onClose,
  onSave,
}: {
  role: AdminRole | null;
  name: string;
  description: string;
  error: string | null;
  saving: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const validName = name.trim().length > 0 && name.trim().length <= 120;
  const validDescription = description.trim().length <= 1000;

  return (
    <Dialog open={Boolean(role)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit role display metadata</DialogTitle>
          <DialogDescription>
            Authorization identity and scope remain read-only. This changes display text only.
          </DialogDescription>
        </DialogHeader>

        {role && (
          <div className="space-y-4">
            <dl className="grid gap-1 rounded-lg border border-border/40 bg-muted/20 p-3 text-xs">
              <ReadOnlyMetadata label="Role ID" value={role.id} mono />
              <ReadOnlyMetadata label="Role key" value={role.roleKey} mono />
              <ReadOnlyMetadata label="Scope" value={role.scope} />
              <ReadOnlyMetadata label="System role" value={role.isSystem ? "Yes" : "No"} />
            </dl>

            <div className="space-y-2">
              <Label htmlFor="role-metadata-name">Name</Label>
              <Input
                id="role-metadata-name"
                value={name}
                maxLength={120}
                disabled={saving}
                onChange={(event) => onNameChange(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="role-metadata-description">Description</Label>
                <span className="text-[10px] text-muted-foreground">{description.length}/1000</span>
              </div>
              <Textarea
                id="role-metadata-description"
                value={description}
                maxLength={1000}
                rows={4}
                disabled={saving}
                placeholder="Optional role description"
                onChange={(event) => onDescriptionChange(event.target.value)}
              />
            </div>

            {error && (
              <div
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || !validName || !validDescription}
            onClick={onSave}
          >
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReadOnlyMetadata({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`truncate ${mono ? "font-mono text-[10px]" : "font-medium"}`}>{value}</dd>
    </div>
  );
}

function PermissionMatrix({
  matrix,
  isPlatformAdmin,
  mutation,
  mutationError,
}: {
  matrix: AdminRolesData;
  isPlatformAdmin: boolean;
  mutation: ReturnType<
    typeof useMutation<
      { ok: true } | { ok: false; error: string },
      Error,
      { roleId: string; permissionId: string; action: "grant" | "revoke" }
    >
  >;
  mutationError: string | null;
}) {
  const grantKeys = useMemo(
    () => new Set(matrix.grants.map((grant) => `${grant.roleId}:${grant.permissionId}`)),
    [matrix.grants],
  );
  const grouped = useMemo(() => {
    const groups = new Map<string, AdminPermission[]>();
    for (const permission of matrix.permissions) {
      const group = permissionGroup(permission.permissionKey);
      groups.set(group, [...(groups.get(group) ?? []), permission]);
    }
    return GROUP_ORDER.filter((group) => groups.has(group)).map((group) => ({
      label: group,
      permissions: groups.get(group) ?? [],
    }));
  }, [matrix.permissions]);

  return (
    <SectionCard
      title="Database permission matrix"
      description="Changes take effect in database authorization checks after the server confirms the write."
    >
      {mutationError && (
        <div
          className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {mutationError}
        </div>
      )}
      {!isPlatformAdmin && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Only an active platform administrator can change database permissions.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-xs">
          <thead>
            <tr className="border-b border-border/40 text-left text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-64 bg-card px-2 py-2 font-medium">
                Permission
              </th>
              {matrix.roles.map((dbRole) => (
                <th
                  key={dbRole.id}
                  className="min-w-24 px-2 py-2 text-center font-medium"
                  title={dbRole.name}
                >
                  <div>{abbreviation(dbRole.name)}</div>
                  <div className="mt-0.5 text-[9px] font-normal uppercase">{dbRole.scope}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => (
              <PermissionGroupRows
                key={group.label}
                group={group}
                roles={matrix.roles}
                grantKeys={grantKeys}
                isPlatformAdmin={isPlatformAdmin}
                mutation={mutation}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        Platform Administrator cells are read-only to prevent administrative lockout. Page
        visibility is not controlled by this matrix yet.
      </p>
    </SectionCard>
  );
}

function PermissionGroupRows({
  group,
  roles,
  grantKeys,
  isPlatformAdmin,
  mutation,
}: {
  group: { label: string; permissions: AdminPermission[] };
  roles: AdminRole[];
  grantKeys: Set<string>;
  isPlatformAdmin: boolean;
  mutation: ReturnType<
    typeof useMutation<
      { ok: true } | { ok: false; error: string },
      Error,
      { roleId: string; permissionId: string; action: "grant" | "revoke" }
    >
  >;
}) {
  return (
    <>
      <tr className="bg-muted/30">
        <td
          colSpan={1 + roles.length}
          className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {group.label}
        </td>
      </tr>
      {group.permissions.map((permission) => (
        <tr key={permission.id} className="border-b border-border/20">
          <td className="sticky left-0 z-10 bg-card px-2 py-2">
            <div className="font-medium">{permission.name}</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {permission.permissionKey}
            </div>
          </td>
          {roles.map((dbRole) => {
            const key = `${dbRole.id}:${permission.id}`;
            const checked = grantKeys.has(key);
            const saving =
              mutation.isPending &&
              mutation.variables?.roleId === dbRole.id &&
              mutation.variables.permissionId === permission.id;
            const platformAdminProtected = dbRole.roleKey === "platform_admin";
            const disabled = !isPlatformAdmin || platformAdminProtected || mutation.isPending;
            const explanation = platformAdminProtected
              ? "Platform Administrator permissions are read-only to prevent lockout."
              : !isPlatformAdmin
                ? "Only an active platform administrator can change this grant."
                : saving
                  ? "Saving permission change."
                  : checked
                    ? "Revoke permission"
                    : "Grant permission";

            return (
              <td key={dbRole.id} className="px-2 py-2 text-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex h-7 w-7 items-center justify-center">
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Checkbox
                          checked={checked}
                          disabled={disabled}
                          aria-label={`${checked ? "Revoke" : "Grant"} ${permission.name} for ${dbRole.name}`}
                          onCheckedChange={() =>
                            mutation.mutate({
                              roleId: dbRole.id,
                              permissionId: permission.id,
                              action: checked ? "revoke" : "grant",
                            })
                          }
                        />
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{explanation}</TooltipContent>
                </Tooltip>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function PageVisibilityTab({
  rolesQuery,
  visibilityQuery,
}: {
  rolesQuery: ReturnType<typeof useQuery<AdminRolesData>>;
  visibilityQuery: ReturnType<typeof useQuery<AdminRolePageVisibility[]>>;
}) {
  const roleData = rolesQuery.data;
  const visibilityData = visibilityQuery.data;
  const liveDataAvailable = Boolean(
    rolesQuery.isSuccess &&
    visibilityQuery.isSuccess &&
    roleData?.roles.length &&
    visibilityData?.length,
  );

  if (liveDataAvailable && roleData && visibilityData) {
    return <LivePageVisibility roles={roleData.roles} visibility={visibilityData} />;
  }

  const emptyResult =
    (rolesQuery.isSuccess && roleData?.roles.length === 0) ||
    (visibilityQuery.isSuccess && visibilityData?.length === 0);
  const failed = rolesQuery.isError || visibilityQuery.isError || emptyResult;
  return (
    <div className="space-y-4">
      <div
        className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
          failed
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-border/40 bg-card/40 text-muted-foreground"
        }`}
        role={failed ? "alert" : "status"}
      >
        {failed ? (
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
        )}
        <div>
          <p className="font-medium">
            {failed ? "Live DB page visibility unavailable" : "Loading live DB page visibility"}
          </p>
          <p className="mt-0.5">
            {failed
              ? "The database matrix could not be loaded. The static fallback remains visible below."
              : "The static fallback remains visible until the read-only database matrix loads."}
          </p>
          {failed && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              disabled={rolesQuery.isFetching || visibilityQuery.isFetching}
              onClick={() => {
                void rolesQuery.refetch();
                void visibilityQuery.refetch();
              }}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry live matrix
            </Button>
          )}
        </div>
      </div>
      <StaticPageVisibility />
    </div>
  );
}

function LivePageVisibility({
  roles,
  visibility,
}: {
  roles: AdminRole[];
  visibility: AdminRolePageVisibility[];
}) {
  const visibleRoleIds = new Set(visibility.map((row) => row.roleId));
  const platformRoles = roles.filter(
    (dbRole) => dbRole.scope === "platform" && visibleRoleIds.has(dbRole.id),
  );
  const routePaths = Array.from(new Set(visibility.map((row) => row.routePath))).sort((a, b) =>
    a.localeCompare(b),
  );
  const visibilityByCell = new Map(
    visibility.map((row) => [`${row.routePath}:${row.roleId}`, row.canView]),
  );

  return (
    <SectionCard
      title="Live DB page visibility - read only"
      description="Current values from public.role_page_visibility. No edits are available in this milestone."
    >
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Routing still uses static fallback until enforcement milestone.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="border-b border-border/40 text-left text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-64 bg-card px-2 py-2 font-medium">Route</th>
              {platformRoles.map((dbRole) => (
                <th
                  key={dbRole.id}
                  className="min-w-24 px-2 py-2 text-center font-medium"
                  title={`${dbRole.name} (${dbRole.roleKey})`}
                >
                  {abbreviation(dbRole.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {routePaths.map((routePath) => {
              const knownPage = PAGES.find((page) => page.path === routePath);
              return (
                <tr key={routePath} className="border-b border-border/20">
                  <td className="sticky left-0 z-10 bg-card px-2 py-2">
                    {knownPage && <div className="font-medium">{knownPage.label}</div>}
                    <div className="font-mono text-[10px] text-muted-foreground">{routePath}</div>
                  </td>
                  {platformRoles.map((dbRole) => {
                    const cell = visibilityByCell.get(`${routePath}:${dbRole.id}`);
                    return (
                      <td key={dbRole.id} className="px-2 py-2 text-center">
                        {cell === true ? (
                          <Check
                            className="mx-auto h-3.5 w-3.5 text-[#52D6A4]"
                            aria-label={`${dbRole.name} can view ${routePath}`}
                          />
                        ) : cell === false ? (
                          <X
                            className="mx-auto h-3.5 w-3.5 text-muted-foreground/50"
                            aria-label={`${dbRole.name} cannot view ${routePath}`}
                          />
                        ) : (
                          <span className="text-muted-foreground" aria-label="No database row">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function StaticPageVisibility() {
  return (
    <SectionCard
      title="Page visibility"
      description="Read-only static fallback. Live page visibility is deferred to a later milestone."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="border-b border-border/40 text-left text-muted-foreground">
              <th className="px-2 py-2 font-medium">Page</th>
              {ROLES.map((role) => (
                <th key={role.id} className="px-2 py-2 text-center font-medium">
                  {abbreviation(role.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PAGES.map((page) => (
              <tr key={page.path} className="border-b border-border/20">
                <td className="px-2 py-2">
                  <div className="font-medium">{page.label}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{page.path}</div>
                </td>
                {ROLES.map((staticRole) => {
                  const visible = (PAGE_VISIBILITY[page.path] ?? []).includes(staticRole.id);
                  return (
                    <td key={staticRole.id} className="px-2 py-2 text-center">
                      {visible ? (
                        <Check className="mx-auto h-3.5 w-3.5 text-[#52D6A4]" />
                      ) : (
                        <X className="mx-auto h-3.5 w-3.5 text-muted-foreground/50" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function StaticRolePreview({
  isSignedIn,
  preview,
  role,
  setPreview,
}: {
  isSignedIn: boolean;
  preview: Role;
  role: Role;
  setPreview: (role: Role) => void;
}) {
  return (
    <SectionCard
      title="Role preview"
      description={
        isSignedIn
          ? "Inspect the current static fallback. The active role comes from your account."
          : "Inspect the current static fallback, then optionally activate it."
      }
      actions={
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-border/40 bg-background/40 px-2 py-1 text-xs"
            value={preview}
            onChange={(event) => setPreview(event.target.value as Role)}
          >
            {ROLES.map((staticRole) => (
              <option key={staticRole.id} value={staticRole.id}>
                {staticRole.label}
              </option>
            ))}
          </select>
          {!isSignedIn && (
            <Button size="sm" onClick={() => setRole(preview)}>
              Activate role
            </Button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Visible pages
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {PAGES.filter((page) => (PAGE_VISIBILITY[page.path] ?? []).includes(preview)).map(
              (page) => (
                <Badge key={page.path} variant="outline" className="text-[11px]">
                  {page.label}
                </Badge>
              ),
            )}
          </div>
          <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hidden pages
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {PAGES.filter((page) => !(PAGE_VISIBILITY[page.path] ?? []).includes(preview)).map(
              (page) => (
                <Badge
                  key={page.path}
                  variant="outline"
                  className="text-[11px] text-muted-foreground line-through"
                >
                  {page.label}
                </Badge>
              ),
            )}
            {PAGES.every((page) => (PAGE_VISIBILITY[page.path] ?? []).includes(preview)) && (
              <span className="text-xs text-muted-foreground">None — full access.</span>
            )}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Allowed actions
          </h3>
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-2 text-xs">
            {CAPABILITY_GROUPS.flatMap((group) => group.caps).map((capability) => {
              const permitted = can(capability.key, [preview]);
              return (
                <div
                  key={capability.key}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-background/40 px-2 py-1.5"
                >
                  <span>{capability.label}</span>
                  {permitted ? (
                    <Check className="h-3.5 w-3.5 text-[#52D6A4]" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Currently active role: <strong>{roleLabel(role)}</strong>.
      </p>
    </SectionCard>
  );
}

function abbreviation(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function Cell({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold">{value}</div>
    </div>
  );
}
