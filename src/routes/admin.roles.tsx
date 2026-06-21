import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Database,
  Eye,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
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
  UpdateRolePageVisibilityInput,
} from "@/lib/admin-roles/types";
import { updateRoleMetadata } from "@/lib/admin-roles/update-role-metadata";
import { updateRolePageVisibility } from "@/lib/admin-roles/update-role-page-visibility";
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

const NON_EMPLOYEE_RECOVERY_ROLE_KEYS = new Set([
  "platform_admin",
  "it_admin",
  "sd_lead",
  "helpdesk",
  "technician",
  "network_admin",
  "doc_editor",
  "platform_auditor",
]);

const PAGE_VISIBILITY_ROLE_LABELS: Record<string, string> = {
  doc_editor: "Doc Editor",
  employee: "Employee",
  helpdesk: "Helpdesk",
  it_admin: "IT Admin",
  network_admin: "Network Admin",
  platform_admin: "Platform Admin",
  platform_auditor: "Platform Auditor",
  sd_lead: "SD Lead",
  technician: "Technician",
  super_admin: "Platform Admin",
  auditor: "Platform Auditor",
};

type PageVisibilityChange = Omit<UpdateRolePageVisibilityInput, "accessToken">;

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
  const [pageVisibilityError, setPageVisibilityError] = useState<string | null>(null);
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

  const pageVisibilityMutation = useMutation({
    mutationFn: async (input: PageVisibilityChange) => {
      if (!session?.access_token) throw new Error("Your session is no longer available.");
      return updateRolePageVisibility({ ...input, accessToken: session.access_token });
    },
    onMutate: () => setPageVisibilityError(null),
    onSuccess: async (result) => {
      if (!result.ok) {
        setPageVisibilityError(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: adminRolesKeys.pageVisibility() });
    },
    onError: () => setPageVisibilityError("The page visibility row could not be updated."),
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
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Roles and Permissions"
        description="Manage role definitions, capability grants, and workspace visibility from one administrative view."
      />

      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-xs text-muted-foreground shadow-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
          <Database className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Database-backed role management</p>
          <p className="mt-0.5 leading-relaxed">
            Roles, permissions, and page visibility are loaded from the database. Route enforcement
            and role preview remain on the current static safety rules.
          </p>
        </div>
        <Badge
          variant="outline"
          className="hidden border-emerald-500/30 bg-emerald-500/10 text-[10px] font-semibold uppercase tracking-wider text-emerald-200 sm:inline-flex"
        >
          Live data
        </Badge>
      </div>

      <OverviewStats
        rolesData={rolesQuery.data}
        visibilityData={pageVisibilityQuery.data}
        isLoading={rolesQuery.isLoading || pageVisibilityQuery.isLoading}
      />



      <Tabs defaultValue="roles" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border/50 bg-card/60 p-1.5 shadow-sm lg:grid-cols-4">
          <TabsTrigger
            value="roles"
            className="min-h-10 justify-start gap-2 rounded-lg px-3 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <KeyRound className="h-4 w-4" /> Role list
          </TabsTrigger>
          <TabsTrigger
            value="capabilities"
            className="min-h-10 justify-start gap-2 rounded-lg px-3 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <ShieldCheck className="h-4 w-4" /> Capability matrix
          </TabsTrigger>
          <TabsTrigger
            value="pages"
            className="min-h-10 justify-start gap-2 rounded-lg px-3 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Eye className="h-4 w-4" /> Page visibility
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            className="min-h-10 justify-start gap-2 rounded-lg px-3 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <UsersRound className="h-4 w-4" /> Role preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles">
          <DatabaseState query={rolesQuery}>
            {(matrix) => (
              <div className="space-y-4">
                <SelectedRolePanel preview={preview} matrix={matrix} />
                <DatabaseRoleList
                  matrix={matrix}
                  setPreview={setPreview}
                  selectedPreview={preview}
                  isPlatformAdmin={isPlatformAdmin}
                  onEdit={openMetadataEditor}
                />
              </div>
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

        <TabsContent value="pages" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-200">
                <Eye className="h-3.5 w-3.5" /> Live routes
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Discovered from the current application routes and enforced from the database.
                Toggles here change real authorization.
              </p>
            </div>
            <div className="rounded-xl border border-slate-500/20 bg-slate-500/[0.05] p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-200">
                <ShieldCheck className="h-3.5 w-3.5" /> Static routes
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Configured fallback for known routes. Used for preview and as a safety net when
                live data is unavailable.
              </p>
            </div>
          </div>
          <PageVisibilityTab
            rolesQuery={rolesQuery}
            visibilityQuery={pageVisibilityQuery}
            isPlatformAdmin={isPlatformAdmin}
            mutationError={pageVisibilityError}
            isSaving={pageVisibilityMutation.isPending}
            savingChange={pageVisibilityMutation.variables}
            onToggle={(change) => pageVisibilityMutation.mutate(change)}
          />
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
  selectedPreview,
  isPlatformAdmin,
  onEdit,
}: {
  matrix: AdminRolesData;
  setPreview: (role: Role) => void;
  selectedPreview: Role;
  isPlatformAdmin: boolean;
  onEdit: (role: AdminRole) => void;
}) {
  const grantCounts = new Map<string, number>();
  for (const grant of matrix.grants) {
    grantCounts.set(grant.roleId, (grantCounts.get(grant.roleId) ?? 0) + 1);
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {matrix.roles.map((dbRole) => {
        const previewRole = staticRoleFor(dbRole.roleKey);
        const pageCount = previewRole
          ? Object.values(PAGE_VISIBILITY).filter((roles) => roles.includes(previewRole)).length
          : 0;
        const platformRole = dbRole.scope === "platform";
        const permissionCount = grantCounts.get(dbRole.id) ?? 0;
        const isSelected = previewRole !== null && previewRole === selectedPreview;
        const accessLevel =
          permissionCount >= 30
            ? { label: "High access", className: "border-rose-500/30 bg-rose-500/10 text-rose-200" }
            : permissionCount >= 10
              ? {
                  label: "Standard",
                  className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
                }
              : {
                  label: "Limited",
                  className: "border-slate-500/30 bg-slate-500/10 text-slate-200",
                };
        const accent = platformRole
          ? {
              border: "border-cyan-500/20 hover:border-cyan-500/40",
              ring: "hover:ring-cyan-500/10",
              bar: "bg-gradient-to-r from-cyan-500/80 via-cyan-500/40 to-transparent",
              chip: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
              mono: "bg-cyan-500/10 text-cyan-200 ring-cyan-500/25",
              stat: "text-cyan-200",
              selectedRing: "ring-cyan-400/60",
            }
          : {
              border: "border-violet-500/20 hover:border-violet-500/40",
              ring: "hover:ring-violet-500/10",
              bar: "bg-gradient-to-r from-violet-500/80 via-violet-500/40 to-transparent",
              chip: "border-violet-500/30 bg-violet-500/10 text-violet-200",
              mono: "bg-violet-500/10 text-violet-200 ring-violet-500/25",
              stat: "text-violet-200",
              selectedRing: "ring-violet-400/60",
            };
        return (
          <article
            key={dbRole.id}
            aria-current={isSelected ? "true" : undefined}
            className={`group relative flex min-h-72 flex-col overflow-hidden rounded-xl border bg-card/70 shadow-sm ring-1 transition-all hover:bg-card hover:shadow-lg ${
              isSelected
                ? `ring-2 ${accent.selectedRing} shadow-md`
                : `ring-transparent ${accent.border} ${accent.ring}`
            }`}
          >
            {isSelected && (
              <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-200">
                <Check className="h-2.5 w-2.5" /> Selected
              </span>
            )}
            <div className={`h-1 w-full ${accent.bar}`} />

            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-start gap-3">
                <div
                  aria-hidden
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[11px] font-bold tracking-wider ring-1 ${accent.mono}`}
                >
                  {abbreviation(dbRole.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    className="truncate text-[15px] font-semibold leading-tight text-foreground"
                    title={dbRole.name}
                  >
                    {dbRole.name}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={`shrink-0 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider ${accent.chip}`}
                    >
                      {platformRole ? "Platform" : "Team"}
                    </Badge>
                    {dbRole.isSystem && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="shrink-0 gap-1 border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-amber-200"
                          >
                            <Lock className="h-2.5 w-2.5" /> System
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>System-managed role</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className={`shrink-0 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider ${accessLevel.className}`}
                        >
                          {accessLevel.label}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        Access tier derived from {permissionCount} granted permission
                        {permissionCount === 1 ? "" : "s"}.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              <code
                className="mt-3 block w-fit max-w-full truncate rounded-md border border-border/40 bg-background/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                title={dbRole.roleKey}
              >
                {dbRole.roleKey}
              </code>

              <p className="mt-3 line-clamp-3 min-h-10 text-xs leading-relaxed text-muted-foreground">
                {dbRole.description ?? (
                  <span className="italic text-muted-foreground/70">No description provided.</span>
                )}
              </p>

              <dl className="mt-4 grid grid-cols-2 divide-x divide-border/40 overflow-hidden rounded-lg border border-border/40 bg-background/35">
                <Cell label="Visible pages" value={pageCount} accent={accent.stat} />
                <Cell label="Permissions" value={permissionCount} accent={accent.stat} />
              </dl>

              <div className="mt-auto flex gap-2 pt-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-border/60 bg-background/30"
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
                {previewRole ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1 font-medium"
                    onClick={() => setPreview(previewRole)}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex flex-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1 font-medium"
                          disabled
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5 opacity-60" /> Preview
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      No static page-visibility preview exists for this DB role.
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </article>
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
      <div className="mb-3 flex flex-col gap-3 rounded-lg border border-border/40 bg-muted/15 px-3 py-2.5 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Scan by capability group, then compare grants across role columns.</p>
        <div className="flex flex-wrap items-center gap-3" aria-label="Permission matrix legend">
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded border border-emerald-500/30 bg-emerald-500/10">
              <Check className="h-3 w-3 text-emerald-300" />
            </span>
            Granted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-5 w-5 rounded border border-border/60 bg-background/40" /> Not
            granted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-amber-400" /> Protected
          </span>
        </div>
      </div>
      <div className="max-h-[68vh] overflow-auto rounded-xl border border-border/50 bg-background/20 shadow-inner">
        <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-30 bg-card/95 shadow-[0_1px_0_hsl(var(--border))] backdrop-blur">
            <tr className="text-left text-muted-foreground">
              <th className="sticky left-0 z-40 min-w-72 border-r border-border/50 bg-card px-4 py-3 font-semibold text-foreground">
                <div>Permission</div>
                <div className="mt-0.5 text-[9px] font-normal uppercase tracking-wider text-muted-foreground">
                  Capability and key
                </div>
              </th>
              {matrix.roles.map((dbRole) => (
                <th
                  key={dbRole.id}
                  className="min-w-28 border-l border-border/20 px-2 py-3 text-center font-medium"
                  title={dbRole.name}
                >
                  <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-md border border-border/50 bg-background/60 text-[10px] font-bold text-foreground">
                    {abbreviation(dbRole.name)}
                  </span>
                  <div className="mt-1.5 truncate text-[9px] font-medium text-foreground">
                    {dbRole.name}
                  </div>
                  <div className="mt-0.5 text-[8px] font-normal uppercase tracking-wider">
                    {dbRole.scope}
                  </div>
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
      <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
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
      <tr className="bg-gradient-to-r from-muted/60 via-muted/40 to-transparent">
        <td
          colSpan={1 + roles.length}
          className="sticky left-0 z-10 border-y border-border/40 bg-card/95 px-4 py-2 backdrop-blur"
        >
          <div className="flex items-center gap-2">
            <span className="h-3 w-1 rounded-full bg-foreground/40" aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground">
              {formatGroupLabel(group.label)}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">
              · {group.permissions.length} permission
              {group.permissions.length === 1 ? "" : "s"}
            </span>
          </div>
        </td>
      </tr>
      {group.permissions.map((permission, index) => {
        const zebra = index % 2 === 1;
        const rowBg = zebra ? "bg-muted/[0.04]" : "";
        const stickyBg = zebra ? "bg-[hsl(var(--card))]/95" : "bg-card";
        return (
          <tr
            key={permission.id}
            className={`group/permission transition-colors hover:bg-muted/25 ${rowBg}`}
          >
            <td
              className={`sticky left-0 z-20 border-r border-b border-border/30 px-4 py-2.5 group-hover/permission:bg-muted ${stickyBg}`}
            >
              <div className="font-medium text-foreground">{permission.name}</div>
              <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
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
                <td
                  key={dbRole.id}
                  className={`border-l border-b border-border/20 px-2 py-2 text-center transition-colors ${
                    checked ? "bg-emerald-500/[0.05]" : ""
                  }`}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`relative inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
                          checked
                            ? "border-emerald-500/30 bg-emerald-500/10"
                            : "border-transparent hover:border-border/60 hover:bg-muted/30"
                        } ${platformAdminProtected ? "opacity-90" : ""}`}
                      >
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
                        {platformAdminProtected && !saving && (
                          <Lock className="pointer-events-none absolute -right-1 -bottom-1 h-2.5 w-2.5 text-amber-400" />
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{explanation}</TooltipContent>
                  </Tooltip>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function PageVisibilityTab({
  rolesQuery,
  visibilityQuery,
  isPlatformAdmin,
  mutationError,
  isSaving,
  savingChange,
  onToggle,
}: {
  rolesQuery: ReturnType<typeof useQuery<AdminRolesData>>;
  visibilityQuery: ReturnType<typeof useQuery<AdminRolePageVisibility[]>>;
  isPlatformAdmin: boolean;
  mutationError: string | null;
  isSaving: boolean;
  savingChange: PageVisibilityChange | undefined;
  onToggle: (change: PageVisibilityChange) => void;
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
    return (
      <LivePageVisibility
        roles={roleData.roles}
        visibility={visibilityData}
        isPlatformAdmin={isPlatformAdmin}
        mutationError={mutationError}
        isSaving={isSaving}
        savingChange={savingChange}
        onToggle={onToggle}
      />
    );
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
  isPlatformAdmin,
  mutationError,
  isSaving,
  savingChange,
  onToggle,
}: {
  roles: AdminRole[];
  visibility: AdminRolePageVisibility[];
  isPlatformAdmin: boolean;
  mutationError: string | null;
  isSaving: boolean;
  savingChange: PageVisibilityChange | undefined;
  onToggle: (change: PageVisibilityChange) => void;
}) {
  const [routeFilter, setRouteFilter] = useState("");
  const visibleRoleIds = new Set(visibility.map((row) => row.roleId));
  const platformRoles = roles.filter(
    (dbRole) => dbRole.scope === "platform" && visibleRoleIds.has(dbRole.id),
  );
  const routePaths = Array.from(new Set(visibility.map((row) => row.routePath))).sort((a, b) =>
    a.localeCompare(b),
  );
  const normalizedFilter = routeFilter.trim().toLowerCase();
  const filteredRoutePaths = routePaths.filter((routePath) => {
    const routeLabel = PAGES.find((page) => page.path === routePath)?.label ?? "";
    return (
      normalizedFilter.length === 0 ||
      routePath.toLowerCase().includes(normalizedFilter) ||
      routeLabel.toLowerCase().includes(normalizedFilter)
    );
  });
  const visibilityByCell = new Map(
    visibility.map((row) => [`${row.routePath}:${row.roleId}`, row.canView]),
  );

  return (
    <SectionCard
      title="Live DB page visibility"
      description="Current values from public.role_page_visibility. Changes are server-validated and refetched after saving."
    >
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {
            "This edits the live DB matrix only. Routing still uses static safety rules. DB-backed enforcement is disabled."
          }
        </span>
      </div>
      {mutationError && (
        <div
          className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {mutationError}
        </div>
      )}
      {!isPlatformAdmin && (
        <div className="mb-3 rounded-lg border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
          Only an active platform administrator can edit page visibility. This matrix is read-only
          for your account.
        </div>
      )}
      <PageVisibilityLegend />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full max-w-md space-y-1.5">
          <Label htmlFor="live-page-visibility-route-filter">Filter routes</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="live-page-visibility-route-filter"
              type="search"
              className="pl-9"
              value={routeFilter}
              placeholder="Search route label or path"
              aria-label="Filter live page visibility routes"
              onChange={(event) => setRouteFilter(event.target.value)}
            />
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">
          Showing {filteredRoutePaths.length} of {routePaths.length} routes
        </span>
      </div>
      <div className="max-h-[68vh] overflow-auto rounded-xl border border-border/50 bg-background/20 shadow-inner">
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-30 bg-card/95 shadow-[0_1px_0_hsl(var(--border))] backdrop-blur">
            <tr className="text-left text-foreground">
              <th className="sticky left-0 z-40 min-w-72 border-r border-border/50 bg-card px-4 py-3 font-semibold">
                <div>Route</div>
                <div className="mt-0.5 text-[9px] font-normal uppercase tracking-wider text-muted-foreground">
                  Page and path
                </div>
              </th>
              {platformRoles.map((dbRole) => (
                <th
                  key={dbRole.id}
                  className="min-w-28 border-l border-border/20 px-2 py-3 text-center font-semibold"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex max-w-24 cursor-help flex-col items-center leading-tight">
                        <span className="mb-1 flex h-6 min-w-7 items-center justify-center rounded border border-border/50 bg-background/60 px-1.5 text-[9px] font-bold">
                          {abbreviation(PAGE_VISIBILITY_ROLE_LABELS[dbRole.roleKey] ?? dbRole.name)}
                        </span>
                        {PAGE_VISIBILITY_ROLE_LABELS[dbRole.roleKey] ?? dbRole.name}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{dbRole.name}</TooltipContent>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRoutePaths.map((routePath) => {
              const knownPage = PAGES.find((page) => page.path === routePath);
              return (
                <tr key={routePath} className="group/route transition-colors hover:bg-muted/20">
                  <td className="sticky left-0 z-20 border-r border-b border-border/30 bg-card px-4 py-2.5 group-hover/route:bg-muted">
                    <div className="font-semibold text-foreground">
                      {knownPage?.label ?? "Unlisted route"}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {routePath}
                    </div>
                  </td>
                  {platformRoles.map((dbRole) => {
                    const cell = visibilityByCell.get(`${routePath}:${dbRole.id}`);
                    const recoveryRouteCell =
                      (routePath === "/" && NON_EMPLOYEE_RECOVERY_ROLE_KEYS.has(dbRole.roleKey)) ||
                      (routePath === "/my-requests" && dbRole.roleKey === "employee");
                    const protectedCell =
                      (dbRole.roleKey === "platform_admin" && routePath === "/admin/roles") ||
                      (dbRole.roleKey === "employee" &&
                        (routePath === "/admin" || routePath.startsWith("/admin/"))) ||
                      (recoveryRouteCell && cell === true);
                    const savingCell =
                      isSaving &&
                      savingChange?.roleId === dbRole.id &&
                      savingChange.routePath === routePath;
                    const protectionReason =
                      dbRole.roleKey === "platform_admin" && routePath === "/admin/roles"
                        ? "Platform Admin must always keep access to role management."
                        : dbRole.roleKey === "employee" &&
                            (routePath === "/admin" || routePath.startsWith("/admin/"))
                          ? "Employee access to admin pages is intentionally blocked."
                          : "Required recovery destination. This route cannot be disabled.";
                    return (
                      <td
                        key={dbRole.id}
                        className={`border-l border-b border-border/20 px-3 py-2.5 text-center align-middle ${
                          cell === true ? "bg-emerald-500/[0.025]" : ""
                        }`}
                      >
                        {savingCell ? (
                          <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-md border border-border/40 bg-muted/30">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </span>
                        ) : isPlatformAdmin && cell !== undefined ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={`relative inline-flex h-8 w-8 items-center justify-center rounded-md border ${
                                  cell
                                    ? "border-emerald-500/25 bg-emerald-500/10"
                                    : "border-border/40 bg-background/30"
                                }`}
                              >
                                <Checkbox
                                  checked={cell}
                                  disabled={isSaving || protectedCell}
                                  aria-label={`${cell ? "Disable" : "Enable"} ${dbRole.name} visibility for ${routePath}`}
                                  onCheckedChange={() =>
                                    onToggle({
                                      roleId: dbRole.id,
                                      routePath,
                                      canView: !cell,
                                    })
                                  }
                                />
                                {protectedCell && (
                                  <Lock className="pointer-events-none absolute -right-1 -bottom-1 h-2.5 w-2.5 text-amber-400" />
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {protectedCell
                                ? protectionReason
                                : cell
                                  ? "Disable live DB visibility"
                                  : "Enable live DB visibility"}
                            </TooltipContent>
                          </Tooltip>
                        ) : cell === true ? (
                          <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10">
                            <Check
                              className="h-3.5 w-3.5 text-emerald-300"
                              aria-label={`${dbRole.name} can view ${routePath}`}
                            />
                          </span>
                        ) : cell === false ? (
                          <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-md border border-border/30 bg-background/20">
                            <X
                              className="h-3.5 w-3.5 text-muted-foreground/50"
                              aria-label={`${dbRole.name} cannot view ${routePath}`}
                            />
                          </span>
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
            {filteredRoutePaths.length === 0 && (
              <tr>
                <td
                  colSpan={platformRoles.length + 1}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No routes match “{routeFilter}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function StaticPageVisibility() {
  const [routeFilter, setRouteFilter] = useState("");
  const normalizedFilter = routeFilter.trim().toLowerCase();
  const filteredPages = PAGES.filter(
    (page) =>
      normalizedFilter.length === 0 ||
      page.label.toLowerCase().includes(normalizedFilter) ||
      page.path.toLowerCase().includes(normalizedFilter),
  );

  return (
    <SectionCard
      title="Page visibility"
      description="Read-only static fallback. Live page visibility is deferred to a later milestone."
    >
      <PageVisibilityLegend staticMatrix />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full max-w-md space-y-1.5">
          <Label htmlFor="static-page-visibility-route-filter">Filter routes</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="static-page-visibility-route-filter"
              type="search"
              className="pl-9"
              value={routeFilter}
              placeholder="Search route label or path"
              aria-label="Filter static page visibility routes"
              onChange={(event) => setRouteFilter(event.target.value)}
            />
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">
          Showing {filteredPages.length} of {PAGES.length} routes
        </span>
      </div>
      <div className="max-h-[68vh] overflow-auto rounded-xl border border-border/50 bg-background/20 shadow-inner">
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-30 bg-card/95 shadow-[0_1px_0_hsl(var(--border))] backdrop-blur">
            <tr className="text-left text-foreground">
              <th className="sticky left-0 z-40 min-w-72 border-r border-border/50 bg-card px-4 py-3 font-semibold">
                <div>Route</div>
                <div className="mt-0.5 text-[9px] font-normal uppercase tracking-wider text-muted-foreground">
                  Static page rule
                </div>
              </th>
              {ROLES.map((role) => (
                <th
                  key={role.id}
                  className="min-w-28 border-l border-border/20 px-2 py-3 text-center font-semibold"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex max-w-24 cursor-help flex-col items-center leading-tight">
                        <span className="mb-1 flex h-6 min-w-7 items-center justify-center rounded border border-border/50 bg-background/60 px-1.5 text-[9px] font-bold">
                          {abbreviation(PAGE_VISIBILITY_ROLE_LABELS[role.id] ?? role.label)}
                        </span>
                        {PAGE_VISIBILITY_ROLE_LABELS[role.id] ?? role.label}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {PAGE_VISIBILITY_ROLE_LABELS[role.id] ?? role.label}
                    </TooltipContent>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredPages.map((page) => (
              <tr key={page.path} className="group/route transition-colors hover:bg-muted/20">
                <td className="sticky left-0 z-20 border-r border-b border-border/30 bg-card px-4 py-2.5 group-hover/route:bg-muted">
                  <div className="font-semibold text-foreground">{page.label}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {page.path}
                  </div>
                </td>
                {ROLES.map((staticRole) => {
                  const visible = (PAGE_VISIBILITY[page.path] ?? []).includes(staticRole.id);
                  return (
                    <td
                      key={staticRole.id}
                      className={`border-l border-b border-border/20 px-3 py-2.5 text-center align-middle ${
                        visible ? "bg-emerald-500/[0.025]" : ""
                      }`}
                    >
                      {visible ? (
                        <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10">
                          <Check className="h-3.5 w-3.5 text-emerald-300" />
                        </span>
                      ) : (
                        <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-md border border-border/30 bg-background/20">
                          <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filteredPages.length === 0 && (
              <tr>
                <td
                  colSpan={ROLES.length + 1}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No routes match “{routeFilter}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function PageVisibilityLegend({ staticMatrix = false }: { staticMatrix?: boolean }) {
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/40 bg-muted/15 px-3 py-2.5 text-[11px] text-muted-foreground"
      aria-label="Page visibility legend"
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="flex h-6 w-6 items-center justify-center rounded border border-emerald-500/25 bg-emerald-500/10">
          <Check className="h-3.5 w-3.5 text-emerald-300" />
        </span>
        Checked = visible
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="flex h-6 w-6 items-center justify-center rounded border border-border/40 bg-background/30">
          <X className="h-3.5 w-3.5 text-muted-foreground/50" />
        </span>
        Empty = hidden
      </span>
      {!staticMatrix && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-amber-400" /> Locked = protected safety route
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving = update in progress
          </span>
        </>
      )}
      {staticMatrix && (
        <Badge variant="outline" className="ml-auto text-[9px] uppercase tracking-wider">
          Static fallback
        </Badge>
      )}
    </div>
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
  const [actionFilter, setActionFilter] = useState("");
  const visiblePages = PAGES.filter((page) => (PAGE_VISIBILITY[page.path] ?? []).includes(preview));
  const hiddenPages = PAGES.filter((page) => !(PAGE_VISIBILITY[page.path] ?? []).includes(preview));
  const normalizedActionFilter = actionFilter.trim().toLowerCase();
  const capabilityGroups = CAPABILITY_GROUPS.map((group) => ({
    ...group,
    caps: group.caps.filter(
      (capability) =>
        normalizedActionFilter.length === 0 ||
        capability.label.toLowerCase().includes(normalizedActionFilter) ||
        capability.key.toLowerCase().includes(normalizedActionFilter),
    ),
  })).filter((group) => group.caps.length > 0);
  const allowedActionCount = CAPABILITY_GROUPS.flatMap((group) => group.caps).filter((capability) =>
    can(capability.key, [preview]),
  ).length;

  return (
    <SectionCard
      title="Role preview"
      description={
        isSignedIn
          ? "Inspect the current static fallback. The active role comes from your account."
          : "Inspect the current static fallback, then optionally activate it."
      }
    >
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border/50 bg-background/30 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full max-w-sm space-y-1.5">
          <Label htmlFor="role-preview-selector">Preview role</Label>
          <select
            id="role-preview-selector"
            className="h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm font-medium text-foreground shadow-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            value={preview}
            onChange={(event) => setPreview(event.target.value as Role)}
          >
            {ROLES.map((staticRole) => (
              <option key={staticRole.id} value={staticRole.id}>
                {staticRole.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8 bg-card/60 px-3 text-[10px]">
            Active: {roleLabel(role)}
          </Badge>
          {!isSignedIn && (
            <Button size="sm" className="h-8" onClick={() => setRole(preview)}>
              Activate role
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PreviewMetric label="Visible pages" value={visiblePages.length} icon={Eye} />
        <PreviewMetric label="Hidden pages" value={hiddenPages.length} icon={Lock} />
        <PreviewMetric label="Allowed actions" value={allowedActionCount} icon={ShieldCheck} />
      </div>

      <div className="mt-4 rounded-xl border border-border/50 bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Visible pages</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Destinations included in the current static role preview.
            </p>
          </div>
          <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
            {visiblePages.length} routes
          </Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visiblePages.map((page) => (
            <div
              key={page.path}
              className="flex items-center gap-2.5 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.045] px-3 py-2.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
                <Check className="h-3.5 w-3.5 text-emerald-300" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-foreground">
                  {page.label}
                </span>
                <code className="block truncate text-[9px] text-muted-foreground">{page.path}</code>
              </span>
            </div>
          ))}
        </div>
        {visiblePages.length === 0 && (
          <p className="rounded-lg border border-dashed border-border/50 p-4 text-xs text-muted-foreground">
            This role has no visible pages in the static preview.
          </p>
        )}
        {hiddenPages.length > 0 && (
          <div className="mt-4 border-t border-border/40 pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Hidden pages
            </p>
            <div className="flex flex-wrap gap-1.5">
              {hiddenPages.map((page) => (
                <Badge
                  key={page.path}
                  variant="outline"
                  className="border-border/30 bg-background/20 text-[10px] font-normal text-muted-foreground/70"
                >
                  {page.label}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-border/50 bg-card/40 p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Capability overview</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Allowed and unavailable actions grouped by administrative area.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              className="h-9 pl-9 text-xs"
              value={actionFilter}
              placeholder="Search actions or keys"
              aria-label="Search role preview actions"
              onChange={(event) => setActionFilter(event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {capabilityGroups.map((group) => (
            <div key={group.label} className="overflow-hidden rounded-lg border border-border/40">
              <div className="border-b border-border/40 bg-muted/25 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
              <div className="divide-y divide-border/25">
                {group.caps.map((capability) => {
                  const permitted = can(capability.key, [preview]);
                  return (
                    <div
                      key={capability.key}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs transition-colors hover:bg-muted/15"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-foreground">{capability.label}</span>
                        <code className="block truncate text-[9px] text-muted-foreground">
                          {capability.key}
                        </code>
                      </span>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                          permitted
                            ? "border-emerald-500/25 bg-emerald-500/10"
                            : "border-border/30 bg-background/20"
                        }`}
                      >
                        {permitted ? (
                          <Check className="h-3.5 w-3.5 text-emerald-300" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {capabilityGroups.length === 0 && (
          <p className="rounded-lg border border-dashed border-border/50 px-4 py-8 text-center text-xs text-muted-foreground">
            No actions match “{actionFilter}”.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

function PreviewMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Eye;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-lg font-semibold leading-none text-foreground">{value}</span>
        <span className="mt-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </span>
    </div>
  );
}

function formatGroupLabel(label: string): string {
  return label.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

function Cell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="px-3 py-2.5 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold leading-none ${accent ?? "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function OverviewStats({
  rolesData,
  visibilityData,
  isLoading,
}: {
  rolesData: AdminRolesData | undefined;
  visibilityData: AdminRolePageVisibility[] | undefined;
  isLoading: boolean;
}) {
  const totalRoles = rolesData?.roles.length ?? null;
  const groupCount = rolesData
    ? new Set(rolesData.permissions.map((p) => permissionGroup(p.permissionKey))).size
    : null;
  const visibilityRuleCount = visibilityData?.length ?? null;
  const restrictedRouteCount = visibilityData
    ? new Set(visibilityData.filter((row) => !row.canView).map((row) => row.routePath)).size
    : null;

  const fmt = (value: number | null) =>
    isLoading && value === null ? "—" : value === null ? "—" : value.toLocaleString();

  const items: {
    label: string;
    value: string;
    icon: typeof KeyRound;
    accent: string;
    hint: string;
  }[] = [
    {
      label: "Total roles",
      value: fmt(totalRoles),
      icon: KeyRound,
      accent: "text-cyan-200 ring-cyan-500/25 bg-cyan-500/10",
      hint: "Defined in database",
    },
    {
      label: "Permission groups",
      value: fmt(groupCount),
      icon: ShieldCheck,
      accent: "text-violet-200 ring-violet-500/25 bg-violet-500/10",
      hint: "Capability categories",
    },
    {
      label: "Page visibility rules",
      value: fmt(visibilityRuleCount),
      icon: Eye,
      accent: "text-emerald-200 ring-emerald-500/25 bg-emerald-500/10",
      hint: "Role × route rows",
    },
    {
      label: "Restricted routes",
      value: fmt(restrictedRouteCount),
      icon: Lock,
      accent: "text-amber-200 ring-amber-500/25 bg-amber-500/10",
      hint: "At least one role denied",
    },
  ];

  return (
    <section
      aria-label="Roles and permissions overview"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {items.map(({ label, value, icon: Icon, accent, hint }) => (
        <div
          key={label}
          className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/60 p-3.5 shadow-sm transition-colors hover:border-border"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ${accent}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </div>
              <div
                className="mt-1 text-2xl font-semibold leading-none text-foreground tabular-nums"
                aria-live="polite"
              >
                {value}
              </div>
              <div className="mt-1 truncate text-[10px] text-muted-foreground">{hint}</div>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function SelectedRolePanel({ preview, matrix }: { preview: Role; matrix: AdminRolesData }) {
  const dbRole = matrix.roles.find((r) => r.roleKey === preview) ?? null;
  const platformRole = dbRole?.scope === "platform";
  const visiblePages = Object.entries(PAGE_VISIBILITY).filter(([, roles]) =>
    roles.includes(preview),
  ).length;
  const totalPages = Object.keys(PAGE_VISIBILITY).length;
  const allowedCaps = CAPABILITY_GROUPS.flatMap((group) =>
    group.caps
      .filter((cap) => can(cap.key, preview))
      .map((cap) => ({ groupLabel: group.label, label: cap.label })),
  );
  const grantedGroups = Array.from(new Set(allowedCaps.map((c) => c.groupLabel)));

  const accent = platformRole
    ? "from-cyan-500/15 via-cyan-500/5 border-cyan-500/25"
    : "from-violet-500/15 via-violet-500/5 border-violet-500/25";
  const monoAccent = platformRole
    ? "bg-cyan-500/10 text-cyan-200 ring-cyan-500/25"
    : "bg-violet-500/10 text-violet-200 ring-violet-500/25";

  return (
    <section
      aria-label="Selected role summary"
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br to-transparent p-4 shadow-sm sm:p-5 ${accent}`}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div
          aria-hidden
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[12px] font-bold tracking-wider ring-1 ${monoAccent}`}
        >
          {abbreviation(dbRole?.name ?? roleLabel(preview))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Selected role
            </span>
            <Badge
              variant="outline"
              className={`px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider ${
                platformRole
                  ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                  : "border-violet-500/30 bg-violet-500/10 text-violet-200"
              }`}
            >
              {platformRole ? "Platform" : dbRole?.scope === "team" ? "Team" : "Static"}
            </Badge>
            {dbRole?.isSystem && (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-amber-200"
              >
                <Lock className="h-2.5 w-2.5" /> System
              </Badge>
            )}
          </div>
          <h3 className="mt-1 truncate text-lg font-semibold text-foreground">
            {dbRole?.name ?? roleLabel(preview)}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {dbRole?.description ??
              "Static safety-rule role used for route enforcement and preview only."}
          </p>
        </div>
        <div className="flex shrink-0 gap-4 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Capabilities
            </div>
            <div className="mt-0.5 text-xl font-semibold leading-none tabular-nums text-foreground">
              {allowedCaps.length}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Visible pages
            </div>
            <div className="mt-0.5 text-xl font-semibold leading-none tabular-nums text-foreground">
              {visiblePages}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                / {totalPages}
              </span>
            </div>
          </div>
        </div>
      </div>

      {grantedGroups.length > 0 ? (
        <div className="mt-4 border-t border-border/40 pt-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            What this role can do
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {grantedGroups.map((label) => {
              const count = allowedCaps.filter((c) => c.groupLabel === label).length;
              return (
                <li key={label}>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/40 px-2 py-1 text-[11px] text-foreground">
                    <Check className="h-3 w-3 text-emerald-300" />
                    {label}
                    <span className="text-[10px] text-muted-foreground">({count})</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          This role has no granted capabilities in the static safety rules.
        </div>
      )}
    </section>
  );
}
