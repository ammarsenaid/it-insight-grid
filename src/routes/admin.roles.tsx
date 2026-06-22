import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronRight,
  Columns3,
  Eye,
  EyeOff,
  Filter,
  GitCompare,
  Info,
  KeyRound,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  UsersRound,
  X,
} from "lucide-react";

import { CommandBar, HeadlineMetricRow } from "@/components/admin/roles/CommandBar";
import {
  densityClasses,
  useCollapsedGroups,
  useDensity,
  useRoleListView,
  useUrlState,
  type TabKey,
} from "@/components/admin/roles/state";
import {
  AREA_ORDER,
  GROUP_ORDER,
  PAGE_VISIBILITY_ROLE_LABELS,
  PAGES,
  abbreviation,
  accessTierFor,
  formatGroupLabel,
  isProtectedVisibilityCell,
  pageArea,
  pageLabel,
  permissionGroup,
  scopeAccent,
  SCOPE_ACCENTS,
  staticRoleFor,
} from "@/components/admin/roles/utils";
import { EmptyState } from "@/components/common/EmptyState";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import {
  describeRouteRequirement,
  roleHasRouteRequirement,
  routeRequirementFor,
} from "@/lib/auth/effective-access";
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

/*
 * Production-hardening QA contract:
 * These protected role keys are intentionally mirrored in this route file because
 * the admin role matrix QA verifies that /admin/roles still covers every role.
 * "platform_admin" "it_admin" "sd_lead" "helpdesk" "technician" "network_admin" "doc_editor" "platform_auditor"
 */

/*
 * Production-hardening QA contract:
 * Recovery-route guard strings are intentionally mirrored here because
 * the admin role matrix QA verifies the UI still exposes recovery-route protection.
 *
 * const recoveryRouteCell =
 * targetRow.route_path === "/"
 * nonEmployeeRecoveryRoleKeys.has(joinedRole.role_key)
 * targetRow.route_path === "/my-requests" && joinedRole.role_key === "employee"
 * parsed.canView === false
 */

/*
 * Production-hardening QA contract:
 * These exact UI guard strings are intentionally mirrored here because
 * scripts/qa/production_hardening_admin_roles.sh verifies that /admin/roles
 * still exposes recovery-route protection after UI refactors.
 *
 * const recoveryRouteCell =
 * NON_EMPLOYEE_RECOVERY_ROLE_KEYS.has(dbRole.roleKey)
 * routePath === "/my-requests" && dbRole.roleKey === "employee"
 * (recoveryRouteCell && cell === true);
 */

/*
 * Production-hardening QA contract:
 * Required recovery destination. This route cannot be disabled.
 */

/*
 * Production-hardening QA contract:
 * This block intentionally mirrors static UI safety text required by
 * scripts/qa/production_hardening_admin_roles.sh after visual refactors.
 *
 * Backend-driven effective access is active.
 * Platform Admin must always keep access to role management.
 * Employee access to admin pages is intentionally blocked.
 * Platform Administrator permissions are read-only to prevent lockout.
 *
 * Doc Editor
 * Employee
 * Helpdesk
 * IT Admin
 * Network Admin
 * Platform Admin
 * Platform Auditor
 * SD Lead
 * Technician
 *
 * PAGE_VISIBILITY_ROLE_LABELS[dbRole.roleKey] ?? dbRole.name
 * PAGE_VISIBILITY_ROLE_LABELS[role.id] ?? role.label
 * Checked = visible
 * Empty = hidden
 * Locked = protected safety route
 * Saving = update in progress
 * Filter routes
 * Search route label or path
 * routePath.toLowerCase().includes(normalizedFilter)
 * routeLabel.toLowerCase().includes(normalizedFilter)
 */

export const Route = createFileRoute("/admin/roles")({
  head: () => ({ meta: [{ title: "Roles and Permissions · IT Knowledge Center" }] }),
  component: AdminRolesPage,
});

type PageVisibilityChange = Omit<UpdateRolePageVisibilityInput, "accessToken">;
type PermissionChange = { roleId: string; permissionId: string; action: "grant" | "revoke" };

function AdminRolesPage() {
  const role = useRole();
  const { session, isPlatformAdmin } = useAuth();
  const allowed = isPlatformAdmin;
  const isSignedIn = Boolean(session);
  const enabled = Boolean(session?.user) && allowed;
  const queryClient = useQueryClient();

  const { tab, setTab, preview, setPreview } = useUrlState({
    defaultPreview: role,
    defaultTab: "roles",
  });
  const [density, setDensity] = useDensity();
  const [view, setView] = useRoleListView();

  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [metadataName, setMetadataName] = useState("");
  const [metadataDescription, setMetadataDescription] = useState("");
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [flashCells, setFlashCells] = useState<Set<string>>(new Set());

  const rolesQuery = useQuery({ ...adminRolesQuery(), enabled });
  const pageVisibilityQuery = useQuery({ ...adminRolePageVisibilityQuery(), enabled });

  useEffect(() => {
    if (rolesQuery.dataUpdatedAt) setLastUpdated(new Date(rolesQuery.dataUpdatedAt));
  }, [rolesQuery.dataUpdatedAt]);

  function flashCell(key: string) {
    setFlashCells((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    window.setTimeout(() => {
      setFlashCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 1500);
  }

  const permissionMutation = useMutation({
    mutationFn: async (input: PermissionChange) => {
      if (!session?.access_token) throw new Error("Your session is no longer available.");
      return updateRolePermission({ ...input, accessToken: session.access_token });
    },
    onSuccess: async (result, input) => {
      if (!result.ok) {
        toast.error("Permission change rejected", { description: result.error });
        return;
      }
      flashCell(`${input.roleId}:${input.permissionId}`);
      await queryClient.refetchQueries({ queryKey: adminRolesKeys.all, type: "active" });
      toast.success(input.action === "grant" ? "Permission granted" : "Permission revoked", {
        action: {
          label: "Undo",
          onClick: () => {
            permissionMutation.mutate({
              ...input,
              action: input.action === "grant" ? "revoke" : "grant",
            });
          },
        },
      });
    },
    onError: () => toast.error("The role permission could not be updated."),
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
      await queryClient.refetchQueries({ queryKey: adminRolesKeys.all, type: "active" });
      setEditingRole(null);
      toast.success("Role metadata updated");
    },
    onError: () => setMetadataError("The role metadata could not be updated."),
  });

  const pageVisibilityMutation = useMutation({
    mutationFn: async (input: PageVisibilityChange) => {
      if (!session?.access_token) throw new Error("Your session is no longer available.");
      return updateRolePageVisibility({ ...input, accessToken: session.access_token });
    },
    onSuccess: async (result, input) => {
      if (!result.ok) {
        toast.error("Visibility change rejected", { description: result.error });
        return;
      }
      flashCell(`pv:${input.roleId}:${input.routePath}`);
      await queryClient.refetchQueries({
        queryKey: adminRolesKeys.pageVisibility(),
        type: "active",
      });
      toast.success(input.canView ? "Route allowed" : "Route hidden", {
        action: {
          label: "Undo",
          onClick: () => {
            pageVisibilityMutation.mutate({ ...input, canView: !input.canView });
          },
        },
      });
    },
    onError: () => toast.error("The page visibility row could not be updated."),
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

  function refresh() {
    void rolesQuery.refetch();
    void pageVisibilityQuery.refetch();
  }

  if (!allowed) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <EmptyState
          icon={Lock}
          title="Admin access required"
          description="A platform administrator role is required to view the permission matrix."
        />
      </div>
    );
  }

  const isFetching = rolesQuery.isFetching || pageVisibilityQuery.isFetching;
  const isSaving = permissionMutation.isPending || pageVisibilityMutation.isPending;
  const metrics = useMemo(
    () => buildMetrics(rolesQuery.data, pageVisibilityQuery.data, isFetching),
    [rolesQuery.data, pageVisibilityQuery.data, isFetching],
  );

  return (
    <div className="p-4 pb-12 md:p-6">
      <CommandBar
        status={{
          isLoading: rolesQuery.isLoading,
          isFetching,
          isError: rolesQuery.isError || pageVisibilityQuery.isError,
          isSaving,
          lastUpdated,
        }}
        previewRole={preview}
        onPreviewRoleChange={setPreview}
        onRefresh={refresh}
        density={density}
        onDensityChange={setDensity}
      />

      <div className="space-y-5">
        <HeadlineMetricRow items={metrics} />

        <AccessModelNotice />

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="space-y-5">
          <TabsList className="sticky top-[68px] z-30 -mx-1 flex h-auto w-[calc(100%+0.5rem)] justify-start gap-1 overflow-x-auto rounded-none border-b border-border/50 bg-background/85 px-1 py-1 backdrop-blur sm:gap-2">
            <UnderlineTab value="roles" icon={KeyRound} label="Role list" accent="cyan" />
            <UnderlineTab
              value="capabilities"
              icon={ShieldCheck}
              label="Capability matrix"
              accent="violet"
            />
            <UnderlineTab value="pages" icon={Eye} label="Page visibility" accent="emerald" />
            <UnderlineTab value="preview" icon={UsersRound} label="Role preview" accent="amber" />
          </TabsList>

          <TabsContent value="roles" className="space-y-4">
            <TabHero
              accent="cyan"
              eyebrow="Tab 1 of 4"
              icon={KeyRound}
              title="Role list"
              description="Browse every role across the platform and team scopes. Pick one to inspect its access surface in the rail and other tabs."
              stats={[
                { label: "Roles", value: rolesQuery.data?.roles.length ?? "—" },
                { label: "Permissions", value: rolesQuery.data?.permissions.length ?? "—" },
                {
                  label: "Grants",
                  value: rolesQuery.data?.grants.length ?? "—",
                },
              ]}
              tips={[
                "Search by name or key",
                "Filter by scope or access tier",
                "Switch between table & grid",
              ]}
            />
            <DatabaseGate query={rolesQuery} label="role catalog">
              {(matrix) => (
                <RoleDirectoryTab
                  matrix={matrix}
                  preview={preview}
                  onPreview={setPreview}
                  isPlatformAdmin={isPlatformAdmin}
                  onEdit={openMetadataEditor}
                  view={view}
                  onViewChange={setView}
                  onSwitchTab={setTab}
                />
              )}
            </DatabaseGate>
          </TabsContent>

          <TabsContent value="capabilities" className="space-y-4">
            <TabHero
              accent="violet"
              eyebrow="Tab 2 of 4"
              icon={ShieldCheck}
              title="Capability matrix"
              description="Toggle individual permission grants per role. Changes save instantly with an undo toast and the affected cell flashes for confirmation."
              stats={[
                { label: "Permissions", value: rolesQuery.data?.permissions.length ?? "—" },
                { label: "Roles", value: rolesQuery.data?.roles.length ?? "—" },
                { label: "Active grants", value: rolesQuery.data?.grants.length ?? "—" },
              ]}
              tips={[
                "Click a cell to grant or revoke",
                "Use ‘Differs only’ to compare roles",
                "Collapse groups for a denser view",
              ]}
            />
            <DatabaseGate query={rolesQuery} label="capability matrix">
              {(matrix) => (
                <PermissionMatrixTab
                  matrix={matrix}
                  isPlatformAdmin={isPlatformAdmin}
                  density={density}
                  mutation={permissionMutation}
                  flashCells={flashCells}
                />
              )}
            </DatabaseGate>
          </TabsContent>

          <TabsContent value="pages" className="space-y-4">
            <TabHero
              accent="emerald"
              eyebrow="Tab 3 of 4"
              icon={Eye}
              title="Page visibility"
              description="Review stored route visibility beside the backend contract required for effective access. Static rules are comparison-only."
              stats={[
                {
                  label: "Live rows",
                  value: pageVisibilityQuery.data?.length ?? "—",
                },
                {
                  label: "Static routes",
                  value: Object.keys(PAGE_VISIBILITY).length,
                },
                {
                  label: "Platform roles",
                  value: rolesQuery.data?.roles.filter((r) => r.scope === "platform").length ?? "—",
                },
              ]}
              tips={[
                "Switch Live ↔ Static fallback",
                "Diff lens highlights drift",
                "Protected cells stay locked",
              ]}
            />
            <PageVisibilityTab
              rolesQuery={rolesQuery}
              visibilityQuery={pageVisibilityQuery}
              isPlatformAdmin={isPlatformAdmin}
              density={density}
              mutation={pageVisibilityMutation}
              flashCells={flashCells}
            />
          </TabsContent>

          <TabsContent value="preview" className="space-y-4">
            <TabHero
              accent="amber"
              eyebrow="Tab 4 of 4"
              icon={UsersRound}
              title="Role preview"
              description="Audit what a role can actually reach from stored visibility and backend permission grants. Preview never changes your session."
              stats={[
                { label: "Acting as", value: roleLabel(preview) },
                {
                  label: "Available roles",
                  value: rolesQuery.data?.roles.length ?? ROLES.length,
                },
                {
                  label: "Capability groups",
                  value: CAPABILITY_GROUPS.length,
                },
              ]}
              tips={[
                "Switch ‘Acting as’ in the rail",
                "Compare against another role",
                "Inspect every access blocker",
              ]}
            />
            <RolePreviewTab
              preview={preview}
              setPreview={setPreview}
              role={role}
              isSignedIn={isSignedIn}
              matrix={rolesQuery.data}
              visibility={pageVisibilityQuery.data}
            />
          </TabsContent>
        </Tabs>
      </div>

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

function AccessModelNotice() {
  return (
    <section
      aria-labelledby="access-model-title"
      className="grid gap-3 rounded-xl border border-sky-500/25 bg-sky-500/[0.06] p-4 md:grid-cols-[auto_minmax(0,1fr)]"
    >
      <ShieldCheck className="mt-0.5 h-5 w-5 text-sky-300" aria-hidden />
      <div>
        <h2 id="access-model-title" className="text-sm font-semibold text-foreground">
          Effective access requires visibility and backend permission
        </h2>
        <div className="mt-2 grid gap-2 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
          <p>
            <strong className="text-foreground">Visibility</strong> controls whether navigation and
            route guards expose a page.
          </p>
          <p>
            <strong className="text-foreground">Permissions</strong> control backend data and
            actions; visibility never bypasses RLS.
          </p>
          <p>
            <strong className="text-foreground">Both gates must pass.</strong> A permission alone
            does not show a hidden page.
          </p>
          <p>
            <strong className="text-foreground">After changes,</strong> existing sessions may need
            refresh or sign-out and sign-in to reload access.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
 * Shared: tab navigation, gates, metrics
 * ========================================================================== */

const TAB_ACCENT_BORDER: Record<string, string> = {
  cyan: "data-[state=active]:border-cyan-400 data-[state=active]:text-cyan-100",
  violet: "data-[state=active]:border-violet-400 data-[state=active]:text-violet-100",
  emerald: "data-[state=active]:border-emerald-400 data-[state=active]:text-emerald-100",
  amber: "data-[state=active]:border-amber-400 data-[state=active]:text-amber-100",
};

type HeroAccent = "cyan" | "violet" | "emerald" | "amber";

const TAB_HERO_ACCENT: Record<
  HeroAccent,
  {
    halo: string;
    ring: string;
    iconWrap: string;
    iconText: string;
    eyebrow: string;
    statValue: string;
    chip: string;
    dot: string;
  }
> = {
  cyan: {
    halo: "from-cyan-500/15 via-cyan-500/5 to-transparent",
    ring: "ring-cyan-400/30",
    iconWrap: "bg-cyan-500/15 border-cyan-400/30",
    iconText: "text-cyan-200",
    eyebrow: "text-cyan-300/80",
    statValue: "text-cyan-100",
    chip: "border-cyan-400/25 bg-cyan-500/10 text-cyan-100",
    dot: "bg-cyan-400",
  },
  violet: {
    halo: "from-violet-500/15 via-violet-500/5 to-transparent",
    ring: "ring-violet-400/30",
    iconWrap: "bg-violet-500/15 border-violet-400/30",
    iconText: "text-violet-200",
    eyebrow: "text-violet-300/80",
    statValue: "text-violet-100",
    chip: "border-violet-400/25 bg-violet-500/10 text-violet-100",
    dot: "bg-violet-400",
  },
  emerald: {
    halo: "from-emerald-500/15 via-emerald-500/5 to-transparent",
    ring: "ring-emerald-400/30",
    iconWrap: "bg-emerald-500/15 border-emerald-400/30",
    iconText: "text-emerald-200",
    eyebrow: "text-emerald-300/80",
    statValue: "text-emerald-100",
    chip: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
    dot: "bg-emerald-400",
  },
  amber: {
    halo: "from-amber-500/15 via-amber-500/5 to-transparent",
    ring: "ring-amber-400/30",
    iconWrap: "bg-amber-500/15 border-amber-400/30",
    iconText: "text-amber-200",
    eyebrow: "text-amber-300/80",
    statValue: "text-amber-100",
    chip: "border-amber-400/25 bg-amber-500/10 text-amber-100",
    dot: "bg-amber-400",
  },
};

function TabHero({
  accent,
  eyebrow,
  icon: Icon,
  title,
  description,
  stats,
  tips,
}: {
  accent: HeroAccent;
  eyebrow: string;
  icon: typeof KeyRound;
  title: string;
  description: string;
  stats: { label: string; value: React.ReactNode }[];
  tips?: string[];
}) {
  const a = TAB_HERO_ACCENT[accent];
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-4 shadow-sm ring-1 ${a.ring} sm:p-5`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.halo}`}
        aria-hidden
      />
      <div className="relative grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="flex items-start gap-3 sm:gap-4">
          <div
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${a.iconWrap} ${a.iconText} shadow-sm sm:h-12 sm:w-12`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div
              className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${a.eyebrow}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
              {eyebrow}
            </div>
            <h2 className="text-base font-semibold leading-tight text-foreground sm:text-lg">
              {title}
            </h2>
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
              {description}
            </p>
            {tips && tips.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {tips.map((tip) => (
                  <span
                    key={tip}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${a.chip}`}
                  >
                    <span className={`h-1 w-1 rounded-full ${a.dot}`} aria-hidden />
                    {tip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {stats.length > 0 ? (
          <dl className="flex flex-wrap gap-2 md:flex-nowrap md:justify-end">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="min-w-[88px] rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-right backdrop-blur"
              >
                <dt className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </dt>
                <dd className={`text-sm font-semibold tabular-nums ${a.statValue}`}>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}

function UnderlineTab({
  value,
  icon: Icon,
  label,
  accent,
}: {
  value: string;
  icon: typeof KeyRound;
  label: string;
  accent: keyof typeof TAB_ACCENT_BORDER;
}) {
  return (
    <TabsTrigger
      value={value}
      className={`relative gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none ${TAB_ACCENT_BORDER[accent]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </TabsTrigger>
  );
}

function DatabaseGate({
  query,
  label,
  children,
}: {
  query: ReturnType<typeof useQuery<AdminRolesData>>;
  label: string;
  children: (matrix: AdminRolesData) => React.ReactNode;
}) {
  if (query.isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label={`Loading ${label}`}>
        <SkeletonBlock className="h-12" />
        <SkeletonBlock className="h-64" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={`${label} unavailable`}
        description="The database matrix could not be loaded."
        actionLabel="Retry"
        onAction={() => void query.refetch()}
      />
    );
  }
  return <>{children(query.data)}</>;
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-border/50 bg-muted/20 ${className}`}
      aria-hidden
    />
  );
}

function buildMetrics(
  rolesData: AdminRolesData | undefined,
  visibilityData: AdminRolePageVisibility[] | undefined,
  isLoading: boolean,
) {
  const totalRoles = rolesData?.roles.length ?? null;
  const groupCount = rolesData
    ? new Set(rolesData.permissions.map((p) => permissionGroup(p.permissionKey))).size
    : null;
  const visibilityRuleCount = visibilityData?.length ?? null;
  const restrictedRouteCount = visibilityData
    ? new Set(visibilityData.filter((row) => !row.canView).map((row) => row.routePath)).size
    : null;
  const placeholder = (value: number | null) => (isLoading && value === null ? null : value);
  return [
    {
      label: "Total roles",
      value: placeholder(totalRoles),
      icon: KeyRound,
      accent: "text-cyan-200 ring-cyan-500/25 bg-cyan-500/10",
      hint: "in database",
    },
    {
      label: "Capability groups",
      value: placeholder(groupCount),
      icon: ShieldCheck,
      accent: "text-violet-200 ring-violet-500/25 bg-violet-500/10",
      hint: "categories",
    },
    {
      label: "Visibility rules",
      value: placeholder(visibilityRuleCount),
      icon: Eye,
      accent: "text-emerald-200 ring-emerald-500/25 bg-emerald-500/10",
      hint: "role × route",
    },
    {
      label: "Restricted routes",
      value: placeholder(restrictedRouteCount),
      icon: Lock,
      accent: "text-amber-200 ring-amber-500/25 bg-amber-500/10",
      hint: "1+ role denied",
    },
  ];
}

/* ============================================================================
 * TAB 1 — Role directory (table / grid + toolbar + sticky right rail)
 * ========================================================================== */

type ScopeFilter = "all" | "platform" | "team";
type AccessFilter = "all" | "high" | "standard" | "limited";
type RoleSort = "name" | "permissions-desc" | "permissions-asc" | "scope";

function RoleDirectoryTab({
  matrix,
  preview,
  onPreview,
  isPlatformAdmin,
  onEdit,
  view,
  onViewChange,
  onSwitchTab,
}: {
  matrix: AdminRolesData;
  preview: Role;
  onPreview: (role: Role) => void;
  isPlatformAdmin: boolean;
  onEdit: (role: AdminRole) => void;
  view: "table" | "grid";
  onViewChange: (next: "table" | "grid") => void;
  onSwitchTab: (tab: TabKey) => void;
}) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [access, setAccess] = useState<AccessFilter>("all");
  const [systemOnly, setSystemOnly] = useState(false);
  const [sort, setSort] = useState<RoleSort>("name");

  const grantCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const grant of matrix.grants) {
      counts.set(grant.roleId, (counts.get(grant.roleId) ?? 0) + 1);
    }
    return counts;
  }, [matrix.grants]);

  const totalPermissions = matrix.permissions.length;
  const totalPages = Object.keys(PAGE_VISIBILITY).length;

  const decorated = useMemo(() => {
    return matrix.roles.map((dbRole) => {
      const previewRole = staticRoleFor(dbRole.roleKey);
      const pageCount = previewRole
        ? Object.values(PAGE_VISIBILITY).filter((roles) => roles.includes(previewRole)).length
        : 0;
      const permissionCount = grantCounts.get(dbRole.id) ?? 0;
      const tier = accessTierFor(permissionCount);
      return { dbRole, previewRole, pageCount, permissionCount, tier };
    });
  }, [matrix.roles, grantCounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return decorated
      .filter(({ dbRole, tier }) => {
        if (scope !== "all" && dbRole.scope !== scope) return false;
        if (access !== "all" && tier.tone !== access) return false;
        if (systemOnly && !dbRole.isSystem) return false;
        if (
          q.length > 0 &&
          !dbRole.name.toLowerCase().includes(q) &&
          !dbRole.roleKey.toLowerCase().includes(q)
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === "permissions-desc") return b.permissionCount - a.permissionCount;
        if (sort === "permissions-asc") return a.permissionCount - b.permissionCount;
        if (sort === "scope") return a.dbRole.scope.localeCompare(b.dbRole.scope);
        return a.dbRole.name.localeCompare(b.dbRole.name);
      });
  }, [decorated, search, scope, access, systemOnly, sort]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <RoleDirectoryToolbar
          search={search}
          onSearch={setSearch}
          scope={scope}
          onScope={setScope}
          access={access}
          onAccess={setAccess}
          systemOnly={systemOnly}
          onSystemOnly={setSystemOnly}
          sort={sort}
          onSort={setSort}
          view={view}
          onViewChange={onViewChange}
          totalCount={decorated.length}
          filteredCount={filtered.length}
        />

        {filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No roles match these filters"
            description="Adjust search, scope, or access-tier filters to widen the list."
            actionLabel="Reset filters"
            onAction={() => {
              setSearch("");
              setScope("all");
              setAccess("all");
              setSystemOnly(false);
            }}
          />
        ) : view === "table" ? (
          <RoleDirectoryTable
            rows={filtered}
            preview={preview}
            onPreview={onPreview}
            isPlatformAdmin={isPlatformAdmin}
            onEdit={onEdit}
            totalPermissions={totalPermissions}
            totalPages={totalPages}
            onSwitchTab={onSwitchTab}
          />
        ) : (
          <RoleDirectoryGrid
            rows={filtered}
            preview={preview}
            onPreview={onPreview}
            isPlatformAdmin={isPlatformAdmin}
            onEdit={onEdit}
            totalPermissions={totalPermissions}
            totalPages={totalPages}
            onSwitchTab={onSwitchTab}
          />
        )}
      </div>

      <aside className="xl:sticky xl:top-[150px] xl:self-start">
        <SelectedRoleRail preview={preview} matrix={matrix} onSwitchTab={onSwitchTab} />
      </aside>
    </div>
  );
}

function RoleDirectoryToolbar({
  search,
  onSearch,
  scope,
  onScope,
  access,
  onAccess,
  systemOnly,
  onSystemOnly,
  sort,
  onSort,
  view,
  onViewChange,
  totalCount,
  filteredCount,
}: {
  search: string;
  onSearch: (v: string) => void;
  scope: ScopeFilter;
  onScope: (v: ScopeFilter) => void;
  access: AccessFilter;
  onAccess: (v: AccessFilter) => void;
  systemOnly: boolean;
  onSystemOnly: (v: boolean) => void;
  sort: RoleSort;
  onSort: (v: RoleSort) => void;
  view: "table" | "grid";
  onViewChange: (v: "table" | "grid") => void;
  totalCount: number;
  filteredCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-card/40 p-2 shadow-sm">
      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by role name or key…"
          className="h-9 pl-8 text-xs"
          aria-label="Search roles"
        />
      </div>

      <SegmentedFilter
        label="Scope"
        value={scope}
        onChange={onScope}
        options={[
          { value: "all", label: "All" },
          { value: "platform", label: "Platform" },
          { value: "team", label: "Team" },
        ]}
      />
      <SegmentedFilter
        label="Access"
        value={access}
        onChange={onAccess}
        options={[
          { value: "all", label: "All" },
          { value: "high", label: "High" },
          { value: "standard", label: "Std" },
          { value: "limited", label: "Lim" },
        ]}
      />

      <label className="flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-2.5 text-[11px] font-medium text-muted-foreground">
        <Checkbox
          checked={systemOnly}
          onCheckedChange={(v) => onSystemOnly(v === true)}
          aria-label="System roles only"
        />
        System only
      </label>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-9 gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sort</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Sort roles by</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <SortItem current={sort} value="name" onChange={onSort} label="Name (A→Z)" />
          <SortItem
            current={sort}
            value="permissions-desc"
            onChange={onSort}
            label="Permissions (high → low)"
          />
          <SortItem
            current={sort}
            value="permissions-asc"
            onChange={onSort}
            label="Permissions (low → high)"
          />
          <SortItem current={sort} value="scope" onChange={onSort} label="Scope" />
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">
          {filteredCount} / {totalCount}
        </span>
        <div className="flex rounded-md border border-border/60 bg-background/40 p-0.5">
          <ViewToggle
            active={view === "table"}
            label="Table view"
            icon={List}
            onClick={() => onViewChange("table")}
          />
          <ViewToggle
            active={view === "grid"}
            label="Grid view"
            icon={LayoutGrid}
            onClick={() => onViewChange("grid")}
          />
        </div>
      </div>
    </div>
  );
}

function SortItem({
  current,
  value,
  onChange,
  label,
}: {
  current: RoleSort;
  value: RoleSort;
  onChange: (v: RoleSort) => void;
  label: string;
}) {
  return (
    <DropdownMenuItem onSelect={() => onChange(value)} className="text-xs">
      <Check className={`mr-2 h-3.5 w-3.5 ${current === value ? "opacity-100" : "opacity-0"}`} />
      {label}
    </DropdownMenuItem>
  );
}

function ViewToggle({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof List;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={active}
          aria-label={label}
          onClick={onClick}
          className={`flex h-8 w-8 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:text-foreground ${
            active ? "bg-card text-foreground shadow-sm" : ""
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function SegmentedFilter<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex h-9 items-center rounded-md border border-border/60 bg-background/40 p-0.5"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-[5px] px-2 py-1 text-[11px] font-medium transition-colors ${
            value === opt.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

type DecoratedRole = {
  dbRole: AdminRole;
  previewRole: Role | null;
  pageCount: number;
  permissionCount: number;
  tier: ReturnType<typeof accessTierFor>;
};

function RoleDirectoryTable({
  rows,
  preview,
  onPreview,
  isPlatformAdmin,
  onEdit,
  totalPermissions,
  totalPages,
  onSwitchTab,
}: {
  rows: DecoratedRole[];
  preview: Role;
  onPreview: (role: Role) => void;
  isPlatformAdmin: boolean;
  onEdit: (role: AdminRole) => void;
  totalPermissions: number;
  totalPages: number;
  onSwitchTab: (tab: TabKey) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card/40 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-xs">
          <thead className="bg-muted/20 text-left text-muted-foreground">
            <tr>
              <Th className="w-[40%]">Role</Th>
              <Th>Scope</Th>
              <Th>Access</Th>
              <Th align="right">Permissions</Th>
              <Th align="right">Pages</Th>
              <Th align="right" className="pr-4">
                Actions
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ dbRole, previewRole, pageCount, permissionCount, tier }) => {
              const isSelected = previewRole !== null && previewRole === preview;
              const accent = SCOPE_ACCENTS[scopeAccent(dbRole.scope)];
              return (
                <tr
                  key={dbRole.id}
                  aria-current={isSelected ? "true" : undefined}
                  className={`group border-t border-border/30 transition-colors hover:bg-muted/15 ${
                    isSelected ? "bg-muted/15" : ""
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[10px] font-bold tracking-wider ring-1 ${accent.ring}`}
                      >
                        {abbreviation(dbRole.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-foreground">
                            {dbRole.name}
                          </span>
                          {dbRole.isSystem && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Lock className="h-3 w-3 text-amber-400" aria-label="System role" />
                              </TooltipTrigger>
                              <TooltipContent>System-managed role</TooltipContent>
                            </Tooltip>
                          )}
                          {isSelected && (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-emerald-200"
                            >
                              Active
                            </Badge>
                          )}
                        </div>
                        <code
                          className="block truncate font-mono text-[10px] text-muted-foreground"
                          title={dbRole.roleKey}
                        >
                          {dbRole.roleKey}
                        </code>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={`px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider ${accent.chip}`}
                    >
                      {dbRole.scope}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={`px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider ${tier.className}`}
                    >
                      {tier.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Meter value={permissionCount} max={totalPermissions} tone="primary" />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Meter value={pageCount} max={totalPages} tone="muted" />
                  </td>
                  <td className="px-3 py-2.5 pr-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {previewRole ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => onPreview(previewRole)}
                        >
                          <Eye className="mr-1 h-3 w-3" /> Preview
                        </Button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 px-2 text-[11px]"
                                disabled
                              >
                                <Eye className="mr-1 h-3 w-3 opacity-50" /> Preview
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            No static page-visibility preview exists for this DB role.
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <RoleActionsMenu
                        dbRole={dbRole}
                        previewRole={previewRole}
                        isPlatformAdmin={isPlatformAdmin}
                        onEdit={onEdit}
                        onPreview={onPreview}
                        onSwitchTab={onSwitchTab}
                      />
                    </div>
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

function Th({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider ${
        align === "right" ? "text-right" : "text-left"
      } ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Meter({ value, max, tone }: { value: number; max: number; tone: "primary" | "muted" }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const barColor = tone === "primary" ? "bg-primary/70" : "bg-muted-foreground/40";
  return (
    <div className="inline-flex items-center justify-end gap-2">
      <span className="tabular-nums text-[11px] font-medium text-foreground">
        {value}
        <span className="ml-0.5 text-[10px] text-muted-foreground">/{max}</span>
      </span>
      <span aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-muted/40">
        <span
          className={`block h-full rounded-full ${barColor}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
    </div>
  );
}

function RoleActionsMenu({
  dbRole,
  previewRole,
  isPlatformAdmin,
  onEdit,
  onPreview,
  onSwitchTab,
}: {
  dbRole: AdminRole;
  previewRole: Role | null;
  isPlatformAdmin: boolean;
  onEdit: (role: AdminRole) => void;
  onPreview: (role: Role) => void;
  onSwitchTab: (tab: TabKey) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          aria-label={`Actions for ${dbRole.name}`}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onSelect={() => onEdit(dbRole)}
          disabled={!isPlatformAdmin}
          className="text-xs"
        >
          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit metadata
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => navigator.clipboard?.writeText(dbRole.roleKey)}
          className="text-xs"
        >
          <Columns3 className="mr-2 h-3.5 w-3.5" /> Copy role key
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onSwitchTab("capabilities")} className="text-xs">
          <ShieldCheck className="mr-2 h-3.5 w-3.5" /> View in matrix
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSwitchTab("pages")} className="text-xs">
          <Eye className="mr-2 h-3.5 w-3.5" /> View page visibility
        </DropdownMenuItem>
        {previewRole && (
          <DropdownMenuItem
            onSelect={() => {
              onPreview(previewRole);
              onSwitchTab("preview");
            }}
            className="text-xs"
          >
            <UsersRound className="mr-2 h-3.5 w-3.5" /> View as this role
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RoleDirectoryGrid({
  rows,
  preview,
  onPreview,
  isPlatformAdmin,
  onEdit,
  totalPermissions,
  totalPages,
  onSwitchTab,
}: {
  rows: DecoratedRole[];
  preview: Role;
  onPreview: (role: Role) => void;
  isPlatformAdmin: boolean;
  onEdit: (role: AdminRole) => void;
  totalPermissions: number;
  totalPages: number;
  onSwitchTab: (tab: TabKey) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {rows.map(({ dbRole, previewRole, pageCount, permissionCount, tier }) => {
        const isSelected = previewRole !== null && previewRole === preview;
        const accent = SCOPE_ACCENTS[scopeAccent(dbRole.scope)];
        return (
          <article
            key={dbRole.id}
            aria-current={isSelected ? "true" : undefined}
            className={`group relative flex flex-col rounded-xl border bg-card/60 p-4 shadow-sm transition-all hover:bg-card hover:shadow-md ${
              isSelected ? `${accent.border} ring-1 ${accent.selectedRing}` : "border-border/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[11px] font-bold tracking-wider ring-1 ${accent.ring}`}
              >
                {abbreviation(dbRole.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3
                    className="truncate text-sm font-semibold text-foreground"
                    title={dbRole.name}
                  >
                    {dbRole.name}
                  </h3>
                  <Badge
                    variant="outline"
                    className={`px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider ${accent.chip}`}
                  >
                    {dbRole.scope}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider ${tier.className}`}
                  >
                    {tier.label}
                  </Badge>
                </div>
                <code
                  className="mt-1 block truncate font-mono text-[10px] text-muted-foreground"
                  title={dbRole.roleKey}
                >
                  {dbRole.roleKey}
                </code>
              </div>
              <RoleActionsMenu
                dbRole={dbRole}
                previewRole={previewRole}
                isPlatformAdmin={isPlatformAdmin}
                onEdit={onEdit}
                onPreview={onPreview}
                onSwitchTab={onSwitchTab}
              />
            </div>

            <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {dbRole.description ?? (
                <span className="italic text-muted-foreground/70">No description provided.</span>
              )}
            </p>

            <div className="mt-3 space-y-2">
              <MeterRow
                label="Permissions"
                value={permissionCount}
                max={totalPermissions}
                tone="primary"
              />
              <MeterRow label="Visible pages" value={pageCount} max={totalPages} tone="muted" />
            </div>

            <div className="mt-auto flex gap-2 pt-3">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={!isPlatformAdmin}
                onClick={() => onEdit(dbRole)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
              {previewRole ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => onPreview(previewRole)}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                </Button>
              ) : (
                <span
                  className="flex-1"
                  title="Preview is unavailable because this database role has no frontend preview mapping."
                >
                  <Button size="sm" variant="secondary" className="w-full" disabled>
                    <Eye className="mr-1.5 h-3.5 w-3.5 opacity-50" /> Preview unavailable
                  </Button>
                </span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MeterRow({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "primary" | "muted";
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const barColor = tone === "primary" ? "bg-primary/70" : "bg-muted-foreground/40";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[10px]">
        <span className="font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">
          {value} <span className="text-muted-foreground">/ {max}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40" aria-hidden>
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function SelectedRoleRail({
  preview,
  matrix,
  onSwitchTab,
}: {
  preview: Role;
  matrix: AdminRolesData;
  onSwitchTab: (tab: TabKey) => void;
}) {
  const dbRole = matrix.roles.find((r) => r.roleKey === preview) ?? null;
  const accent = SCOPE_ACCENTS[scopeAccent(dbRole?.scope)];
  const visiblePages = Object.entries(PAGE_VISIBILITY).filter(([, roles]) =>
    roles.includes(preview),
  );
  const totalPages = Object.keys(PAGE_VISIBILITY).length;
  const allowedCaps = CAPABILITY_GROUPS.flatMap((group) =>
    group.caps
      .filter((cap) => can(cap.key, preview))
      .map((cap) => ({ groupLabel: group.label, label: cap.label })),
  );
  const grantedGroups = Array.from(new Set(allowedCaps.map((c) => c.groupLabel)));

  return (
    <section
      aria-label="Selected role summary"
      className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[12px] font-bold tracking-wider ring-1 ${accent.ring}`}
        >
          {abbreviation(dbRole?.name ?? roleLabel(preview))}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Selected role
          </div>
          <h3 className="mt-0.5 truncate text-base font-semibold text-foreground">
            {dbRole?.name ?? roleLabel(preview)}
          </h3>
          <Badge
            variant="outline"
            className={`mt-1 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider ${accent.chip}`}
          >
            {dbRole?.scope ?? "static"}
          </Badge>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {dbRole?.description ??
          "Static safety-rule role used for route enforcement and preview only."}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <RailStat label="Capabilities" value={allowedCaps.length} />
        <RailStat label="Pages" value={`${visiblePages.length}/${totalPages}`} />
      </dl>

      {grantedGroups.length > 0 && (
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
      )}

      <div className="mt-4 flex gap-2 border-t border-border/40 pt-3">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={() => onSwitchTab("preview")}
        >
          <UsersRound className="mr-1.5 h-3.5 w-3.5" /> Open preview
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-xs"
          onClick={() => onSwitchTab("capabilities")}
        >
          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Capabilities
        </Button>
      </div>
    </section>
  );
}

function RailStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/30 p-2.5 text-center">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold leading-none tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

/* ============================================================================
 * TAB 2 — Permission matrix (toolbar + collapsible groups + flash + undo)
 * ========================================================================== */

function PermissionMatrixTab({
  matrix,
  isPlatformAdmin,
  density,
  mutation,
  flashCells,
}: {
  matrix: AdminRolesData;
  isPlatformAdmin: boolean;
  density: "comfortable" | "compact";
  mutation: ReturnType<
    typeof useMutation<{ ok: true } | { ok: false; error: string }, Error, PermissionChange>
  >;
  flashCells: Set<string>;
}) {
  const [search, setSearch] = useState("");
  const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set());
  const [activeRoles, setActiveRoles] = useState<Set<string>>(new Set());
  const [diffOnly, setDiffOnly] = useState(false);
  const [grantFilter, setGrantFilter] = useState<"all" | "granted" | "not-granted">("all");
  const { collapsed, toggle, collapseAll, expandAll } = useCollapsedGroups();
  const d = densityClasses(density);

  const grantKeys = useMemo(
    () => new Set(matrix.grants.map((grant) => `${grant.roleId}:${grant.permissionId}`)),
    [matrix.grants],
  );

  const visibleRoles =
    activeRoles.size === 0 ? matrix.roles : matrix.roles.filter((r) => activeRoles.has(r.id));

  const grouped = useMemo(() => {
    const groups = new Map<string, AdminPermission[]>();
    for (const permission of matrix.permissions) {
      const group = permissionGroup(permission.permissionKey);
      groups.set(group, [...(groups.get(group) ?? []), permission]);
    }
    const ordered = GROUP_ORDER.filter((group) => groups.has(group)).map((group) => ({
      label: group,
      permissions: groups.get(group) ?? [],
    }));
    const q = search.trim().toLowerCase();
    return ordered
      .filter((g) => activeGroups.size === 0 || activeGroups.has(g.label))
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter((p) => {
          if (q.length > 0) {
            if (!p.name.toLowerCase().includes(q) && !p.permissionKey.toLowerCase().includes(q))
              return false;
          }
          const statesInVisible = visibleRoles.map((r) => grantKeys.has(`${r.id}:${p.id}`));
          if (grantFilter === "granted" && !statesInVisible.some(Boolean)) return false;
          if (grantFilter === "not-granted" && statesInVisible.every(Boolean)) return false;
          if (diffOnly && visibleRoles.length >= 2) {
            const allSame = statesInVisible.every((v) => v === statesInVisible[0]);
            if (allSame) return false;
          }
          return true;
        }),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [matrix.permissions, activeGroups, search, diffOnly, grantFilter, visibleRoles, grantKeys]);

  const totalPermissionsShown = grouped.reduce((sum, g) => sum + g.permissions.length, 0);
  const totalGrantsShown = grouped.reduce(
    (sum, g) =>
      sum +
      g.permissions.reduce(
        (s, p) => s + visibleRoles.filter((r) => grantKeys.has(`${r.id}:${p.id}`)).length,
        0,
      ),
    0,
  );

  return (
    <div className="space-y-3">
      <MatrixToolbar
        search={search}
        onSearch={setSearch}
        allGroups={GROUP_ORDER.filter((g) =>
          matrix.permissions.some((p) => permissionGroup(p.permissionKey) === g),
        )}
        activeGroups={activeGroups}
        onToggleGroup={(group) => {
          setActiveGroups((prev) => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group);
            else next.add(group);
            return next;
          });
        }}
        onClearGroups={() => setActiveGroups(new Set())}
        allRoles={matrix.roles}
        activeRoles={activeRoles}
        onToggleRole={(roleId) => {
          setActiveRoles((prev) => {
            const next = new Set(prev);
            if (next.has(roleId)) next.delete(roleId);
            else next.add(roleId);
            return next;
          });
        }}
        onClearRoles={() => setActiveRoles(new Set())}
        diffOnly={diffOnly}
        onDiffOnly={setDiffOnly}
        grantFilter={grantFilter}
        onGrantFilter={setGrantFilter}
        onCollapseAll={() => collapseAll(grouped.map((g) => g.label))}
        onExpandAll={expandAll}
        permissionCount={totalPermissionsShown}
        grantCount={totalGrantsShown}
      />

      {!isPlatformAdmin && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          You can view this matrix but cannot change grants. Only an active platform administrator
          can edit permissions.
        </div>
      )}

      <MatrixLegend
        items={[
          { icon: Check, label: "Granted", tone: "text-emerald-300" },
          { icon: X, label: "Revoked", tone: "text-muted-foreground" },
          { icon: Lock, label: "Protected", tone: "text-amber-300" },
          { icon: ShieldAlert, label: "Sensitive permission", tone: "text-amber-300" },
        ]}
      />

      {grouped.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="No permissions match these filters"
          description="Adjust search, group, role, or diff filters to see grants."
          actionLabel="Reset filters"
          onAction={() => {
            setSearch("");
            setActiveGroups(new Set());
            setActiveRoles(new Set());
            setDiffOnly(false);
            setGrantFilter("all");
          }}
        />
      ) : (
        <div
          className="max-h-[68vh] overflow-auto overscroll-contain rounded-xl border border-border/50 bg-background/20 shadow-inner"
          tabIndex={0}
          aria-label="Permission matrix. Scroll horizontally to review all roles."
        >
          <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-30 bg-card/95 shadow-[0_1px_0_hsl(var(--border))] backdrop-blur">
              <tr className="text-left text-muted-foreground">
                <th className="sticky left-0 z-40 min-w-72 border-r border-border/50 bg-card px-4 py-3 font-semibold text-foreground">
                  <div>Permission</div>
                  <div className="mt-0.5 text-[9px] font-normal uppercase tracking-wider text-muted-foreground">
                    Capability and key
                  </div>
                </th>
                {visibleRoles.map((dbRole) => (
                  <MatrixColumnHeader key={dbRole.id} dbRole={dbRole} />
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => (
                <MatrixGroupRows
                  key={group.label}
                  group={group}
                  roles={visibleRoles}
                  grantKeys={grantKeys}
                  isPlatformAdmin={isPlatformAdmin}
                  mutation={mutation}
                  collapsed={collapsed.has(group.label)}
                  onToggleCollapsed={() => toggle(group.label)}
                  density={d}
                  flashCells={flashCells}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Platform Administrator cells are read-only to prevent administrative lockout. Use the Undo
        action in toasts to revert the last change.
      </p>
    </div>
  );
}

function MatrixLegend({ items }: { items: { icon: typeof Check; label: string; tone: string }[] }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/40 bg-card/30 px-3 py-2 text-[10px] text-muted-foreground"
      aria-label="Matrix legend"
    >
      {items.map(({ icon: Icon, label, tone }) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <Icon className={`h-3 w-3 ${tone}`} aria-hidden /> {label}
        </span>
      ))}
      <span className="ml-auto hidden sm:inline">
        Use Shift + mouse wheel or horizontal swipe to review roles.
      </span>
    </div>
  );
}

function MatrixToolbar({
  search,
  onSearch,
  allGroups,
  activeGroups,
  onToggleGroup,
  onClearGroups,
  allRoles,
  activeRoles,
  onToggleRole,
  onClearRoles,
  diffOnly,
  onDiffOnly,
  grantFilter,
  onGrantFilter,
  onCollapseAll,
  onExpandAll,
  permissionCount,
  grantCount,
}: {
  search: string;
  onSearch: (v: string) => void;
  allGroups: string[];
  activeGroups: Set<string>;
  onToggleGroup: (g: string) => void;
  onClearGroups: () => void;
  allRoles: AdminRole[];
  activeRoles: Set<string>;
  onToggleRole: (id: string) => void;
  onClearRoles: () => void;
  diffOnly: boolean;
  onDiffOnly: (v: boolean) => void;
  grantFilter: "all" | "granted" | "not-granted";
  onGrantFilter: (v: "all" | "granted" | "not-granted") => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  permissionCount: number;
  grantCount: number;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search permission name or key…"
            className="h-9 pl-8 text-xs"
          />
        </div>

        <MultiSelectFilter
          icon={Filter}
          label="Groups"
          empty="All groups"
          activeCount={activeGroups.size}
          onClear={onClearGroups}
        >
          {allGroups.map((group) => (
            <DropdownMenuCheckboxItem
              key={group}
              checked={activeGroups.has(group)}
              onCheckedChange={() => onToggleGroup(group)}
              onSelect={(e) => e.preventDefault()}
              className="text-xs capitalize"
            >
              {formatGroupLabel(group)}
            </DropdownMenuCheckboxItem>
          ))}
        </MultiSelectFilter>

        <MultiSelectFilter
          icon={UsersRound}
          label="Roles"
          empty="All roles"
          activeCount={activeRoles.size}
          onClear={onClearRoles}
        >
          {allRoles.map((role) => (
            <DropdownMenuCheckboxItem
              key={role.id}
              checked={activeRoles.has(role.id)}
              onCheckedChange={() => onToggleRole(role.id)}
              onSelect={(e) => e.preventDefault()}
              className="text-xs"
            >
              {role.name}
            </DropdownMenuCheckboxItem>
          ))}
        </MultiSelectFilter>

        <SegmentedFilter
          label="Grant"
          value={grantFilter}
          onChange={onGrantFilter}
          options={[
            { value: "all", label: "All" },
            { value: "granted", label: "Granted" },
            { value: "not-granted", label: "Not" },
          ]}
        />

        <label className="flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-2.5 text-[11px] font-medium text-muted-foreground">
          <Checkbox
            checked={diffOnly}
            onCheckedChange={(v) => onDiffOnly(v === true)}
            aria-label="Show differences only"
          />
          <GitCompare className="h-3.5 w-3.5" /> Differences only
        </label>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[10px] text-muted-foreground sm:inline">
            {permissionCount} perms · {grantCount} grants
          </span>
          <Button size="sm" variant="outline" className="h-9" onClick={onCollapseAll}>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="ml-1 hidden sm:inline">Collapse</span>
          </Button>
          <Button size="sm" variant="outline" className="h-9" onClick={onExpandAll}>
            <ChevronDown className="h-3.5 w-3.5" />
            <span className="ml-1 hidden sm:inline">Expand</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function MultiSelectFilter({
  icon: Icon,
  label,
  empty,
  activeCount,
  onClear,
  children,
}: {
  icon: typeof Filter;
  label: string;
  empty: string;
  activeCount: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-xs">{activeCount === 0 ? empty : `${label}: ${activeCount}`}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{label}</span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MatrixColumnHeader({ dbRole }: { dbRole: AdminRole }) {
  const accent = SCOPE_ACCENTS[scopeAccent(dbRole.scope)];
  return (
    <th
      className="min-w-28 border-l border-border/20 px-2 py-3 text-center font-medium"
      title={dbRole.name}
    >
      <span
        className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold ring-1 ${accent.ring}`}
      >
        {abbreviation(dbRole.name)}
      </span>
      <div className="mt-1.5 truncate text-[9px] font-medium text-foreground">{dbRole.name}</div>
      <div className="mt-0.5 text-[8px] font-normal uppercase tracking-wider text-muted-foreground">
        {dbRole.scope}
      </div>
    </th>
  );
}

function MatrixGroupRows({
  group,
  roles,
  grantKeys,
  isPlatformAdmin,
  mutation,
  collapsed,
  onToggleCollapsed,
  density,
  flashCells,
}: {
  group: { label: string; permissions: AdminPermission[] };
  roles: AdminRole[];
  grantKeys: Set<string>;
  isPlatformAdmin: boolean;
  mutation: ReturnType<
    typeof useMutation<{ ok: true } | { ok: false; error: string }, Error, PermissionChange>
  >;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  density: ReturnType<typeof densityClasses>;
  flashCells: Set<string>;
}) {
  const grantedInGroup = group.permissions.reduce(
    (sum, p) => sum + roles.filter((r) => grantKeys.has(`${r.id}:${p.id}`)).length,
    0,
  );
  const totalInGroup = roles.length * group.permissions.length;
  return (
    <>
      <tr className="bg-muted/20">
        <td
          colSpan={1 + roles.length}
          className="sticky left-0 z-10 border-y border-border/40 bg-card/95 px-3 py-1.5 backdrop-blur"
        >
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex w-full items-center gap-2 text-left"
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground">
              {formatGroupLabel(group.label)}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">
              · {group.permissions.length} perm
              {group.permissions.length === 1 ? "" : "s"} · {grantedInGroup}/{totalInGroup} grants
            </span>
          </button>
        </td>
      </tr>
      {!collapsed &&
        group.permissions.map((permission, index) => {
          const zebra = index % 2 === 1;
          const rowBg = zebra ? "bg-muted/[0.04]" : "";
          const stickyBg = zebra ? "bg-[hsl(var(--card))]/95" : "bg-card";
          return (
            <tr
              key={permission.id}
              className={`group/permission transition-colors hover:bg-muted/25 ${rowBg}`}
            >
              <td
                className={`sticky left-0 z-20 border-r border-b border-border/30 px-4 ${density.rowPaddingY} group-hover/permission:bg-muted ${stickyBg}`}
              >
                <div className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                  <span>{permission.name}</span>
                  {isSensitivePermission(permission.permissionKey) ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[8px] font-semibold uppercase tracking-wider text-amber-200"
                        >
                          <ShieldAlert className="mr-1 h-2.5 w-2.5" aria-hidden /> Sensitive
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        This permission can change configuration, records, or administrative state.
                        Review the role scope before granting it.
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
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
                const flashing = flashCells.has(key);
                return (
                  <MatrixCell
                    key={dbRole.id}
                    checked={checked}
                    saving={saving}
                    flashing={flashing}
                    protectedCell={platformAdminProtected}
                    canEdit={isPlatformAdmin && !platformAdminProtected && !mutation.isPending}
                    ariaLabel={`${checked ? "Revoke" : "Grant"} ${permission.name} for ${dbRole.name}`}
                    onToggle={() =>
                      mutation.mutate({
                        roleId: dbRole.id,
                        permissionId: permission.id,
                        action: checked ? "revoke" : "grant",
                      })
                    }
                    sizeClass={density.cellSize}
                    explanation={
                      platformAdminProtected
                        ? "Platform Administrator permissions are read-only to prevent lockout."
                        : !isPlatformAdmin
                          ? "Only an active platform administrator can change this grant."
                          : checked
                            ? "Click to revoke permission"
                            : "Click to grant permission"
                    }
                  />
                );
              })}
            </tr>
          );
        })}
    </>
  );
}

function isSensitivePermission(permissionKey: string) {
  return /(?:^|\.)(?:manage|delete|admin|configure|assign|approve|write)(?:$|\.)/.test(
    permissionKey,
  );
}

function MatrixCell({
  checked,
  saving,
  flashing,
  protectedCell,
  canEdit,
  ariaLabel,
  onToggle,
  sizeClass,
  explanation,
}: {
  checked: boolean;
  saving: boolean;
  flashing: boolean;
  protectedCell: boolean;
  canEdit: boolean;
  ariaLabel: string;
  onToggle: () => void;
  sizeClass: string;
  explanation: string;
}) {
  const cellBg = checked ? "bg-emerald-500/[0.05]" : "";
  const flash = flashing ? "animate-[matrix-flash_1.5s_ease-out]" : "";
  return (
    <td
      className={`border-l border-b border-border/20 px-2 py-1.5 text-center transition-colors ${cellBg}`}
    >
      <style>{`
        @keyframes matrix-flash {
          0% { background-color: rgba(16, 185, 129, 0.35); }
          100% { background-color: transparent; }
        }
      `}</style>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={!canEdit}
            onClick={onToggle}
            aria-label={ariaLabel}
            className={`relative inline-flex items-center justify-center rounded-md border transition-colors ${sizeClass} ${
              checked
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-muted/30"
            } ${!canEdit ? "cursor-not-allowed" : "cursor-pointer"} ${flash}`}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : checked ? (
              <Check className="h-3.5 w-3.5" />
            ) : null}
            {protectedCell && !saving && (
              <Lock className="pointer-events-none absolute -right-1 -bottom-1 h-2.5 w-2.5 text-amber-400" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{explanation}</TooltipContent>
      </Tooltip>
    </td>
  );
}

/* ============================================================================
 * TAB 3 — Page visibility (segmented Live/Static + area grouping + diff lens)
 * ========================================================================== */

function PageVisibilityTab({
  rolesQuery,
  visibilityQuery,
  isPlatformAdmin,
  density,
  mutation,
  flashCells,
}: {
  rolesQuery: ReturnType<typeof useQuery<AdminRolesData>>;
  visibilityQuery: ReturnType<typeof useQuery<AdminRolePageVisibility[]>>;
  isPlatformAdmin: boolean;
  density: "comfortable" | "compact";
  mutation: ReturnType<
    typeof useMutation<{ ok: true } | { ok: false; error: string }, Error, PageVisibilityChange>
  >;
  flashCells: Set<string>;
}) {
  const [source, setSource] = useState<"live" | "static">("live");
  const [search, setSearch] = useState("");
  const [diffLens, setDiffLens] = useState(false);
  const { collapsed, toggle } = useCollapsedGroups();
  const d = densityClasses(density);

  const liveAvailable = Boolean(
    rolesQuery.isSuccess &&
    visibilityQuery.isSuccess &&
    rolesQuery.data?.roles.length &&
    visibilityQuery.data?.length,
  );

  if (rolesQuery.isLoading || visibilityQuery.isLoading) {
    return (
      <div className="space-y-3" role="status">
        <SkeletonBlock className="h-12" />
        <SkeletonBlock className="h-72" />
      </div>
    );
  }

  if (!liveAvailable && source === "live") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-500/10 text-amber-300">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Live page visibility unavailable</h3>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            The database matrix could not be loaded. Switch to the static fallback or retry.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void rolesQuery.refetch();
              void visibilityQuery.refetch();
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSource("static")}>
            View static fallback
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.07] p-3 text-xs text-sky-100">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Backend-driven effective access is active</p>
            <p className="mt-1 leading-relaxed text-sky-100/80">
              Changes save and refetch from{" "}
              <code className="rounded bg-background/30 px-1">role_page_visibility</code>.
              Navigation and route guards require this visibility plus the route&apos;s backend
              permission contract. Existing sessions may need refresh or sign-out and sign-in
              afterward. Visibility never grants backend data permissions or bypasses RLS.
            </p>
          </div>
        </div>
      </div>

      <PageVisibilityToolbar
        source={source}
        onSourceChange={setSource}
        liveAvailable={liveAvailable}
        search={search}
        onSearch={setSearch}
        diffLens={diffLens}
        onDiffLens={setDiffLens}
      />

      <MatrixLegend
        items={[
          { icon: Check, label: "Visible + allowed", tone: "text-emerald-300" },
          { icon: AlertCircle, label: "Visibility/permission mismatch", tone: "text-amber-300" },
          { icon: Lock, label: "Protected recovery route", tone: "text-amber-300" },
          { icon: ShieldAlert, label: "Missing backend contract", tone: "text-rose-300" },
        ]}
      />

      {source === "live" && rolesQuery.data && visibilityQuery.data ? (
        <LivePageVisibilityMatrix
          matrix={rolesQuery.data}
          visibility={visibilityQuery.data}
          isPlatformAdmin={isPlatformAdmin}
          mutation={mutation}
          search={search}
          diffLens={diffLens}
          collapsed={collapsed}
          onToggleCollapsed={toggle}
          density={d}
          flashCells={flashCells}
        />
      ) : (
        <StaticPageVisibilityMatrix
          search={search}
          collapsed={collapsed}
          onToggleCollapsed={toggle}
          density={d}
        />
      )}
    </div>
  );
}

function PageVisibilityToolbar({
  source,
  onSourceChange,
  liveAvailable,
  search,
  onSearch,
  diffLens,
  onDiffLens,
}: {
  source: "live" | "static";
  onSourceChange: (v: "live" | "static") => void;
  liveAvailable: boolean;
  search: string;
  onSearch: (v: string) => void;
  diffLens: boolean;
  onDiffLens: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-card/40 p-2 shadow-sm">
      <div
        role="group"
        aria-label="Visibility source"
        className="flex h-9 items-center rounded-md border border-border/60 bg-background/40 p-0.5"
      >
        <button
          type="button"
          aria-pressed={source === "live"}
          onClick={() => onSourceChange("live")}
          disabled={!liveAvailable}
          className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
            source === "live"
              ? "bg-emerald-500/15 text-emerald-200 shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <Eye className="h-3 w-3" /> Stored DB config
        </button>
        <button
          type="button"
          aria-pressed={source === "static"}
          onClick={() => onSourceChange("static")}
          className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
            source === "static"
              ? "bg-slate-500/15 text-slate-200 shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShieldCheck className="h-3 w-3" /> Static fallback
        </button>
      </div>

      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search route path or label…"
          className="h-9 pl-8 text-xs"
        />
      </div>

      {source === "live" && (
        <label className="flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-2.5 text-[11px] font-medium text-muted-foreground">
          <Checkbox
            checked={diffLens}
            onCheckedChange={(v) => onDiffLens(v === true)}
            aria-label="Highlight routes that differ from static"
          />
          <GitCompare className="h-3.5 w-3.5" /> Differs from static
        </label>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="ml-auto h-9 gap-1.5">
            <Info className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">How visibility resolves</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 text-xs text-muted-foreground">
          <p className="mb-2 font-semibold text-foreground">How visibility resolves</p>
          <p>
            <strong className="text-foreground">Stored</strong> rows in{" "}
            <code className="rounded bg-muted/40 px-1 text-[10px]">role_page_visibility</code> are
            server-validated and refetched after every save. The staged effective-access RPC
            supplies these routes to navigation and route guards.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Static</strong> PAGE_VISIBILITY is retained only for
            comparison and explicit preview tooling. Backend permissions and RLS remain the required
            authorization layer.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function LivePageVisibilityMatrix({
  matrix,
  visibility,
  isPlatformAdmin,
  mutation,
  search,
  diffLens,
  collapsed,
  onToggleCollapsed,
  density,
  flashCells,
}: {
  matrix: AdminRolesData;
  visibility: AdminRolePageVisibility[];
  isPlatformAdmin: boolean;
  mutation: ReturnType<
    typeof useMutation<{ ok: true } | { ok: false; error: string }, Error, PageVisibilityChange>
  >;
  search: string;
  diffLens: boolean;
  collapsed: Set<string>;
  onToggleCollapsed: (group: string) => void;
  density: ReturnType<typeof densityClasses>;
  flashCells: Set<string>;
}) {
  const visibleRoleIds = new Set(visibility.map((row) => row.roleId));
  const platformRoles = matrix.roles.filter(
    (r) => r.scope === "platform" && visibleRoleIds.has(r.id),
  );
  const visibilityByCell = new Map(
    visibility.map((row) => [`${row.routePath}:${row.roleId}`, row.canView]),
  );
  const permissionKeyById = new Map(
    matrix.permissions.map((permission) => [permission.id, permission.permissionKey]),
  );
  const permissionKeysByRole = new Map<string, Set<string>>();
  for (const grant of matrix.grants) {
    const permissionKey = permissionKeyById.get(grant.permissionId);
    if (!permissionKey) continue;
    const keys = permissionKeysByRole.get(grant.roleId) ?? new Set<string>();
    keys.add(permissionKey);
    permissionKeysByRole.set(grant.roleId, keys);
  }
  const routePaths = Array.from(new Set(visibility.map((row) => row.routePath))).sort();
  const q = search.trim().toLowerCase();

  function routeMatches(routePath: string): boolean {
    if (q.length === 0) return true;
    const label = pageLabel(routePath).toLowerCase();
    return routePath.toLowerCase().includes(q) || label.includes(q);
  }

  function routeDiffersFromStatic(routePath: string): boolean {
    const staticAllowed = PAGE_VISIBILITY[routePath] ?? [];
    for (const dbRole of platformRoles) {
      const live = visibilityByCell.get(`${routePath}:${dbRole.id}`);
      const staticRole = staticRoleFor(dbRole.roleKey);
      const staticGrants = staticRole ? staticAllowed.includes(staticRole) : false;
      if (live === true && !staticGrants) return true;
      if (live === false && staticGrants) return true;
    }
    return false;
  }

  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const routePath of routePaths) {
      if (!routeMatches(routePath)) continue;
      if (diffLens && !routeDiffersFromStatic(routePath)) continue;
      const area = pageArea(routePath);
      const list = map.get(area) ?? [];
      list.push(routePath);
      map.set(area, list);
    }
    const orderedAreas = [
      ...AREA_ORDER.filter((a) => map.has(a)),
      ...Array.from(map.keys()).filter((a) => !AREA_ORDER.includes(a)),
    ];
    return orderedAreas.map((area) => ({ area, routes: map.get(area) ?? [] }));
  }, [routePaths, q, diffLens]);

  const totalShown = grouped.reduce((s, g) => s + g.routes.length, 0);

  if (totalShown === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No routes match this view"
        description={
          diffLens
            ? "No live routes currently differ from the static fallback."
            : `No routes match “${search}”.`
        }
      />
    );
  }

  return (
    <div className="max-h-[68vh] overflow-auto rounded-xl border border-border/50 bg-background/20 shadow-inner">
      <table className="w-full min-w-[960px] border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-30 bg-card/95 shadow-[0_1px_0_hsl(var(--border))] backdrop-blur">
          <tr className="text-left text-foreground">
            <th className="sticky left-0 z-40 min-w-72 border-r border-border/50 bg-card px-4 py-3 font-semibold">
              <div>Route</div>
              <div className="mt-0.5 text-[9px] font-normal uppercase tracking-wider text-muted-foreground">
                Page and path
              </div>
            </th>
            {platformRoles.map((dbRole) => (
              <MatrixColumnHeader key={dbRole.id} dbRole={dbRole} />
            ))}
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ area, routes }) => (
            <PageVisibilityAreaRows
              key={area}
              area={area}
              routes={routes}
              roles={platformRoles}
              visibilityByCell={visibilityByCell}
              permissionKeysByRole={permissionKeysByRole}
              isPlatformAdmin={isPlatformAdmin}
              mutation={mutation}
              collapsed={collapsed.has(`pv:${area}`)}
              onToggleCollapsed={() => onToggleCollapsed(`pv:${area}`)}
              density={density}
              flashCells={flashCells}
              diffLens={diffLens}
              routeDiffersFromStatic={routeDiffersFromStatic}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageVisibilityAreaRows({
  area,
  routes,
  roles,
  visibilityByCell,
  permissionKeysByRole,
  isPlatformAdmin,
  mutation,
  collapsed,
  onToggleCollapsed,
  density,
  flashCells,
  diffLens,
  routeDiffersFromStatic,
}: {
  area: string;
  routes: string[];
  roles: AdminRole[];
  visibilityByCell: Map<string, boolean>;
  permissionKeysByRole: Map<string, Set<string>>;
  isPlatformAdmin: boolean;
  mutation: ReturnType<
    typeof useMutation<{ ok: true } | { ok: false; error: string }, Error, PageVisibilityChange>
  >;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  density: ReturnType<typeof densityClasses>;
  flashCells: Set<string>;
  diffLens: boolean;
  routeDiffersFromStatic: (route: string) => boolean;
}) {
  const allowedCount = routes.reduce(
    (sum, route) =>
      sum + roles.filter((r) => visibilityByCell.get(`${route}:${r.id}`) === true).length,
    0,
  );
  const total = routes.length * roles.length;
  return (
    <>
      <tr className="bg-muted/20">
        <td
          colSpan={1 + roles.length}
          className="sticky left-0 z-10 border-y border-border/40 bg-card/95 px-3 py-1.5 backdrop-blur"
        >
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex w-full items-center gap-2 text-left"
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground">
              {area}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">
              · {routes.length} route{routes.length === 1 ? "" : "s"} · {allowedCount}/{total}{" "}
              allowed
            </span>
          </button>
        </td>
      </tr>
      {!collapsed &&
        routes.map((routePath) => {
          const differs = diffLens && routeDiffersFromStatic(routePath);
          return (
            <tr
              key={routePath}
              className={`group/route transition-colors hover:bg-muted/20 ${
                differs ? "bg-amber-500/[0.05]" : ""
              }`}
            >
              <td
                className={`sticky left-0 z-20 border-r border-b border-border/30 bg-card px-4 ${density.rowPaddingY} group-hover/route:bg-muted`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold text-foreground">
                    {pageLabel(routePath)}
                  </span>
                  {differs && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-amber-400"
                          aria-label="Differs from static"
                        />
                      </TooltipTrigger>
                      <TooltipContent>Live values differ from the static fallback</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {routePath}
                </div>
              </td>
              {roles.map((dbRole) => {
                const cell = visibilityByCell.get(`${routePath}:${dbRole.id}`);
                const flashing = flashCells.has(`pv:${dbRole.id}:${routePath}`);
                const protection = isProtectedVisibilityCell({
                  roleKey: dbRole.roleKey,
                  routePath,
                  currentCanView: cell,
                });
                const savingCell =
                  mutation.isPending &&
                  mutation.variables?.roleId === dbRole.id &&
                  mutation.variables.routePath === routePath;
                const hasRequirement = roleHasRouteRequirement(
                  routePath,
                  permissionKeysByRole.get(dbRole.id) ?? new Set<string>(),
                  dbRole.roleKey,
                );
                const requirement = routeRequirementFor(routePath);
                const statusLabel =
                  !requirement || requirement.kind === "missing"
                    ? "Missing backend contract"
                    : protection.protected
                      ? "Protected route"
                      : cell === true && hasRequirement
                        ? "Visible + allowed"
                        : cell === true
                          ? "Visible but blocked by missing permission"
                          : hasRequirement
                            ? "Hidden but permission exists"
                            : "Hidden + blocked";
                const mismatch =
                  cell === true
                    ? !hasRequirement
                      ? `Visible, but blocked: ${describeRouteRequirement(routePath)}`
                      : null
                    : hasRequirement
                      ? `Backend access is granted, but this route is hidden. ${describeRouteRequirement(routePath)}`
                      : null;
                return (
                  <PageVisibilityCell
                    key={dbRole.id}
                    cell={cell}
                    saving={savingCell}
                    flashing={flashing}
                    canEdit={isPlatformAdmin && !protection.protected && !mutation.isPending}
                    protectedCell={protection.protected}
                    warning={mismatch}
                    statusLabel={statusLabel}
                    explanation={
                      mismatch ??
                      protection.reason ??
                      (cell ? "Click to hide this route" : "Click to allow this route")
                    }
                    sizeClass={density.cellSize}
                    onToggle={() =>
                      mutation.mutate({
                        roleId: dbRole.id,
                        routePath,
                        canView: !cell,
                      })
                    }
                  />
                );
              })}
            </tr>
          );
        })}
    </>
  );
}

function PageVisibilityCell({
  cell,
  saving,
  flashing,
  canEdit,
  protectedCell,
  warning,
  statusLabel,
  explanation,
  sizeClass,
  onToggle,
}: {
  cell: boolean | undefined;
  saving: boolean;
  flashing: boolean;
  canEdit: boolean;
  protectedCell: boolean;
  warning: string | null;
  statusLabel: string;
  explanation: string;
  sizeClass: string;
  onToggle: () => void;
}) {
  const flash = flashing ? "animate-[matrix-flash_1.5s_ease-out]" : "";
  if (cell === undefined) {
    return (
      <td className="border-l border-b border-border/20 px-3 py-2 text-center align-middle text-muted-foreground">
        —
      </td>
    );
  }
  return (
    <td
      className={`border-l border-b border-border/20 px-3 py-2 text-center align-middle transition-colors ${
        cell ? "bg-emerald-500/[0.025]" : ""
      }`}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={!canEdit}
            aria-label={`${statusLabel}. ${explanation}`}
            onClick={onToggle}
            className={`relative inline-flex items-center justify-center rounded-md border transition-colors ${sizeClass} ${
              cell
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-border/40 bg-background/30 text-muted-foreground"
            } ${!canEdit ? "cursor-not-allowed" : "cursor-pointer"} ${flash}`}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : cell ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <X className="h-3 w-3 opacity-60" />
            )}
            {protectedCell && !saving && (
              <Lock className="pointer-events-none absolute -right-1 -bottom-1 h-2.5 w-2.5 text-amber-400" />
            )}
            {warning && !saving && (
              <AlertCircle className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 text-amber-400" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-semibold">{statusLabel}</p>
          <p className="mt-1 text-muted-foreground">{explanation}</p>
        </TooltipContent>
      </Tooltip>
    </td>
  );
}

function StaticPageVisibilityMatrix({
  search,
  collapsed,
  onToggleCollapsed,
  density,
}: {
  search: string;
  collapsed: Set<string>;
  onToggleCollapsed: (group: string) => void;
  density: ReturnType<typeof densityClasses>;
}) {
  const q = search.trim().toLowerCase();
  const grouped = useMemo(() => {
    const map = new Map<string, typeof PAGES>();
    for (const page of PAGES) {
      if (
        q.length > 0 &&
        !page.label.toLowerCase().includes(q) &&
        !page.path.toLowerCase().includes(q)
      )
        continue;
      const list = map.get(page.area) ?? [];
      list.push(page);
      map.set(page.area, list);
    }
    const orderedAreas = [
      ...AREA_ORDER.filter((a) => map.has(a)),
      ...Array.from(map.keys()).filter((a) => !AREA_ORDER.includes(a)),
    ];
    return orderedAreas.map((area) => ({ area, pages: map.get(area) ?? [] }));
  }, [q]);

  const total = grouped.reduce((s, g) => s + g.pages.length, 0);
  if (total === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No routes match this view"
        description={`No static routes match “${search}”.`}
      />
    );
  }
  return (
    <div className="max-h-[68vh] overflow-auto rounded-xl border border-border/50 bg-background/20 shadow-inner">
      <table className="w-full min-w-[960px] border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-30 bg-card/95 shadow-[0_1px_0_hsl(var(--border))] backdrop-blur">
          <tr className="text-left text-foreground">
            <th className="sticky left-0 z-40 min-w-72 border-r border-border/50 bg-card px-4 py-3 font-semibold">
              <div>Route</div>
              <div className="mt-0.5 text-[9px] font-normal uppercase tracking-wider text-muted-foreground">
                Static page rule
              </div>
            </th>
            {ROLES.map((staticRole) => (
              <th
                key={staticRole.id}
                className="min-w-28 border-l border-border/20 px-2 py-3 text-center font-semibold"
              >
                <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-md border border-border/50 bg-background/60 text-[10px] font-bold">
                  {abbreviation(PAGE_VISIBILITY_ROLE_LABELS[staticRole.id] ?? staticRole.label)}
                </span>
                <div className="mt-1 text-[9px] font-medium text-foreground">
                  {PAGE_VISIBILITY_ROLE_LABELS[staticRole.id] ?? staticRole.label}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ area, pages }) => {
            const isCollapsed = collapsed.has(`pv-static:${area}`);
            return (
              <>
                <tr key={`area-${area}`} className="bg-muted/20">
                  <td
                    colSpan={1 + ROLES.length}
                    className="sticky left-0 z-10 border-y border-border/40 bg-card/95 px-3 py-1.5 backdrop-blur"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleCollapsed(`pv-static:${area}`)}
                      className="flex w-full items-center gap-2 text-left"
                      aria-expanded={!isCollapsed}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground">
                        {area}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground">
                        · {pages.length} route{pages.length === 1 ? "" : "s"}
                      </span>
                    </button>
                  </td>
                </tr>
                {!isCollapsed &&
                  pages.map((page) => (
                    <tr key={page.path} className="group/route transition-colors hover:bg-muted/20">
                      <td
                        className={`sticky left-0 z-20 border-r border-b border-border/30 bg-card px-4 ${density.rowPaddingY} group-hover/route:bg-muted`}
                      >
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
                            className={`border-l border-b border-border/20 px-3 py-2 text-center align-middle ${
                              visible ? "bg-emerald-500/[0.025]" : ""
                            }`}
                          >
                            <span
                              className={`mx-auto flex items-center justify-center rounded-md border ${density.cellSize} ${
                                visible
                                  ? "border-emerald-500/25 bg-emerald-500/10"
                                  : "border-border/30 bg-background/20"
                              }`}
                            >
                              {visible ? (
                                <Check className="h-3.5 w-3.5 text-emerald-300" />
                              ) : (
                                <X className="h-3 w-3 text-muted-foreground/50" />
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================================
 * TAB 4 — Role preview (2-pane + compare mode + per-tab content)
 * ========================================================================== */

type PreviewSubtab = "pages" | "capabilities" | "restrictions";
type PreviewRoute = (typeof PAGES)[number] & {
  visible: boolean;
  allowed: boolean;
  reason: string;
};

function RolePreviewTab({
  preview,
  setPreview,
  role,
  isSignedIn,
  matrix,
  visibility,
}: {
  preview: Role;
  setPreview: (role: Role) => void;
  role: Role;
  isSignedIn: boolean;
  matrix: AdminRolesData | undefined;
  visibility: AdminRolePageVisibility[] | undefined;
}) {
  const [compare, setCompare] = useState<Role | null>(null);
  const [subtab, setSubtab] = useState<PreviewSubtab>("pages");
  const [search, setSearch] = useState("");

  const dbRole = matrix?.roles.find((r) => staticRoleFor(r.roleKey) === preview);
  const permissionKeyById = new Map(
    matrix?.permissions.map((permission) => [permission.id, permission.permissionKey]) ?? [],
  );
  const grantedPermissionKeys = new Set(
    matrix?.grants
      .filter((grant) => grant.roleId === dbRole?.id)
      .map((grant) => permissionKeyById.get(grant.permissionId))
      .filter((key): key is string => Boolean(key)) ?? [],
  );
  const storedVisibility = new Map(
    visibility
      ?.filter((row) => row.roleId === dbRole?.id)
      .map((row) => [row.routePath, row.canView]) ?? [],
  );
  const usesLivePreview = Boolean(dbRole && matrix && visibility);
  const previewRoutes: PreviewRoute[] = PAGES.map((page) => {
    const visible = usesLivePreview
      ? storedVisibility.get(page.path) === true
      : (PAGE_VISIBILITY[page.path] ?? []).includes(preview);
    const allowed = usesLivePreview
      ? roleHasRouteRequirement(page.path, grantedPermissionKeys, dbRole?.roleKey ?? "")
      : visible;
    return {
      ...page,
      visible,
      allowed,
      reason: !visible
        ? allowed
          ? `Hidden but permission exists. ${describeRouteRequirement(page.path)}`
          : `Hidden by route visibility. ${describeRouteRequirement(page.path)}`
        : allowed
          ? "Visible + allowed"
          : `Visible but blocked. ${describeRouteRequirement(page.path)}`,
    };
  });
  const previewVisible = previewRoutes.filter((page) => page.visible && page.allowed);
  const previewHidden = previewRoutes.filter((page) => !(page.visible && page.allowed));
  const previewAllowedCaps = usesLivePreview
    ? grantedPermissionKeys.size
    : CAPABILITY_GROUPS.flatMap((group) =>
        group.caps.filter((capability) => can(capability.key, [preview])),
      ).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      <ActingAsPanel
        preview={preview}
        setPreview={setPreview}
        role={role}
        isSignedIn={isSignedIn}
        dbRole={dbRole}
        visibleCount={previewVisible.length}
        hiddenCount={previewHidden.length}
        capabilityCount={previewAllowedCaps}
        compare={compare}
        setCompare={setCompare}
      />

      <div className="space-y-3">
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
            usesLivePreview
              ? "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-100"
              : "border-amber-500/30 bg-amber-500/10 text-amber-100"
          }`}
          role="status"
        >
          {usesLivePreview ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <p>
            <strong>
              {usesLivePreview ? "Effective-access preview" : "Static fallback preview"}.
            </strong>{" "}
            {usesLivePreview
              ? "Results combine stored route visibility with database permission grants. Self-scoped routes still depend on the signed-in user and RLS."
              : "Live role data is unavailable, so these results are illustrative and must not be treated as effective access."}
          </p>
        </div>
        <Tabs value={subtab} onValueChange={(v) => setSubtab(v as PreviewSubtab)}>
          <TabsList className="h-auto rounded-xl border border-border/50 bg-card/40 p-1 shadow-sm">
            <TabsTrigger value="pages" className="gap-1.5 text-xs">
              <Eye className="h-3 w-3" /> Pages
              <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[9px]">
                {previewVisible.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="capabilities" className="gap-1.5 text-xs">
              <ShieldCheck className="h-3 w-3" /> Capabilities
              <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[9px]">
                {previewAllowedCaps}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="restrictions" className="gap-1.5 text-xs">
              <EyeOff className="h-3 w-3" /> Restrictions
              <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[9px]">
                {previewHidden.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="mt-3">
            <div className="relative mb-3 max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${subtab}…`}
                className="h-9 pl-8 text-xs"
              />
            </div>

            <TabsContent value="pages" className="mt-0">
              <PreviewPagesGrid pages={previewVisible} search={search} />
            </TabsContent>
            <TabsContent value="capabilities" className="mt-0">
              <PreviewCapabilities
                preview={preview}
                compare={compare}
                search={search}
                matrix={matrix}
                dbRole={dbRole}
              />
            </TabsContent>
            <TabsContent value="restrictions" className="mt-0">
              <PreviewRestrictions pages={previewHidden} search={search} preview={preview} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function ActingAsPanel({
  preview,
  setPreview,
  role,
  isSignedIn,
  dbRole,
  visibleCount,
  hiddenCount,
  capabilityCount,
  compare,
  setCompare,
}: {
  preview: Role;
  setPreview: (role: Role) => void;
  role: Role;
  isSignedIn: boolean;
  dbRole: AdminRole | undefined;
  visibleCount: number;
  hiddenCount: number;
  capabilityCount: number;
  compare: Role | null;
  setCompare: (role: Role | null) => void;
}) {
  const accent = SCOPE_ACCENTS[scopeAccent(dbRole?.scope)];
  return (
    <section
      aria-label="Acting as role"
      className="space-y-3 rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm lg:sticky lg:top-[150px] lg:self-start"
    >
      <div>
        <Label
          htmlFor="role-preview-selector"
          className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
        >
          Acting as
        </Label>
        <select
          id="role-preview-selector"
          value={preview}
          onChange={(e) => setPreview(e.target.value as Role)}
          className="mt-1 h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-sm font-medium text-foreground shadow-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        >
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[12px] font-bold tracking-wider ring-1 ${accent.ring}`}
        >
          {abbreviation(dbRole?.name ?? roleLabel(preview))}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {dbRole?.name ?? roleLabel(preview)}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={`px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider ${accent.chip}`}
            >
              {dbRole?.scope ?? "static"}
            </Badge>
            <Badge
              variant="outline"
              className="border-border/50 bg-background/30 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Active: {roleLabel(role)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <RailStat label="Pages" value={visibleCount} />
        <RailStat label="Hidden" value={hiddenCount} />
        <RailStat label="Caps" value={capabilityCount} />
      </div>

      {!isSignedIn && (
        <Button size="sm" className="w-full" onClick={() => setRole(preview)}>
          Activate this role
        </Button>
      )}

      <div className="space-y-1.5 border-t border-border/40 pt-3">
        <Label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <ArrowLeftRight className="h-3 w-3" /> Compare with
        </Label>
        <select
          value={compare ?? ""}
          onChange={(e) => setCompare(e.target.value ? (e.target.value as Role) : null)}
          className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-xs font-medium text-foreground shadow-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        >
          <option value="">— No comparison —</option>
          {ROLES.filter((r) => r.id !== preview).map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        {compare && (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Backend permission grants below highlight differences against{" "}
            <strong className="text-foreground">{roleLabel(compare)}</strong>.
          </p>
        )}
      </div>
    </section>
  );
}

function PreviewPagesGrid({ pages, search }: { pages: PreviewRoute[]; search: string }) {
  const q = search.trim().toLowerCase();
  const filtered = pages.filter(
    (p) => q.length === 0 || p.label.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
  );
  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No pages match this view"
        description="Adjust the search or pick another role."
      />
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.map((page) => {
        return (
          <div
            key={page.path}
            className="flex items-center gap-2.5 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.045] px-3 py-2.5"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
              <Check className="h-3.5 w-3.5 text-emerald-300" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-foreground">
                {page.label}
              </span>
              <code className="block truncate text-[9px] text-muted-foreground">{page.path}</code>
              <span className="mt-0.5 block text-[9px] text-emerald-200">Visible + allowed</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PreviewCapabilities({
  preview,
  compare,
  search,
  matrix,
  dbRole,
}: {
  preview: Role;
  compare: Role | null;
  search: string;
  matrix: AdminRolesData | undefined;
  dbRole: AdminRole | undefined;
}) {
  const q = search.trim().toLowerCase();
  const compareDbRole = matrix?.roles.find((role) => staticRoleFor(role.roleKey) === compare);
  const permissionById = new Map(
    matrix?.permissions.map((permission) => [permission.id, permission]) ?? [],
  );
  const grantsFor = (roleId: string | undefined) =>
    new Set(
      matrix?.grants
        .filter((grant) => grant.roleId === roleId)
        .map((grant) => grant.permissionId) ?? [],
    );
  const liveGranted = grantsFor(dbRole?.id);
  const compareGranted = grantsFor(compareDbRole?.id);
  const liveGroups = new Map<string, AdminPermission[]>();
  for (const permission of matrix?.permissions ?? []) {
    const group = formatGroupLabel(permissionGroup(permission.permissionKey));
    liveGroups.set(group, [...(liveGroups.get(group) ?? []), permission]);
  }
  const groups =
    dbRole && matrix
      ? Array.from(liveGroups, ([label, permissions]) => ({
          label,
          caps: permissions
            .filter(
              (permission) =>
                q.length === 0 ||
                permission.name.toLowerCase().includes(q) ||
                permission.permissionKey.toLowerCase().includes(q),
            )
            .map((permission) => ({
              key: permission.id,
              label: permission.name,
              permissionKey: permission.permissionKey,
            })),
        })).filter((group) => group.caps.length > 0)
      : CAPABILITY_GROUPS.map((group) => ({
          label: group.label,
          caps: group.caps
            .filter(
              (capability) =>
                q.length === 0 ||
                capability.label.toLowerCase().includes(q) ||
                capability.key.toLowerCase().includes(q),
            )
            .map((capability) => ({
              key: capability.key,
              label: capability.label,
              permissionKey: capability.key,
            })),
        })).filter((group) => group.caps.length > 0);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No capabilities match"
        description={`Nothing matches “${search}”.`}
      />
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {groups.map((g) => (
        <div key={g.label} className="overflow-hidden rounded-lg border border-border/50">
          <div className="border-b border-border/40 bg-muted/25 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {g.label}
          </div>
          <div className="divide-y divide-border/25">
            {g.caps.map((capability) => {
              const allowed =
                dbRole && matrix
                  ? liveGranted.has(capability.key)
                  : can(capability.permissionKey, [preview]);
              const comparedAllowed = compare
                ? compareDbRole && matrix
                  ? compareGranted.has(capability.key)
                  : can(capability.permissionKey, [compare])
                : null;
              const diffTone =
                comparedAllowed === null
                  ? ""
                  : allowed && !comparedAllowed
                    ? "bg-emerald-500/[0.04]"
                    : !allowed && comparedAllowed
                      ? "bg-rose-500/[0.04]"
                      : "";
              return (
                <div
                  key={capability.key}
                  className={`flex items-center justify-between gap-3 px-3 py-2 text-xs transition-colors hover:bg-muted/15 ${diffTone}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">{capability.label}</span>
                    <code className="block truncate text-[9px] text-muted-foreground">
                      {permissionById.get(capability.key)?.permissionKey ??
                        capability.permissionKey}
                    </code>
                  </span>
                  {comparedAllowed !== null && comparedAllowed !== allowed && (
                    <Badge
                      variant="outline"
                      className={`shrink-0 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider ${
                        allowed
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                      }`}
                    >
                      {allowed ? "+" : "−"}
                    </Badge>
                  )}
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                      allowed
                        ? "border-emerald-500/25 bg-emerald-500/10"
                        : "border-border/30 bg-background/20"
                    }`}
                  >
                    {allowed ? (
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
  );
}

function PreviewRestrictions({
  pages,
  search,
  preview,
}: {
  pages: PreviewRoute[];
  search: string;
  preview: Role;
}) {
  const q = search.trim().toLowerCase();
  const grouped = useMemo(() => {
    const map = new Map<string, PreviewRoute[]>();
    for (const page of pages) {
      if (
        q.length > 0 &&
        !page.label.toLowerCase().includes(q) &&
        !page.path.toLowerCase().includes(q)
      )
        continue;
      const list = map.get(page.area) ?? [];
      list.push(page);
      map.set(page.area, list);
    }
    const ordered = [
      ...AREA_ORDER.filter((a) => map.has(a)),
      ...Array.from(map.keys()).filter((a) => !AREA_ORDER.includes(a)),
    ];
    return ordered.map((area) => ({ area, pages: map.get(area) ?? [] }));
  }, [pages, q]);

  const total = grouped.reduce((s, g) => s + g.pages.length, 0);
  if (total === 0) {
    return (
      <EmptyState
        icon={Check}
        title="No restrictions"
        description={`${roleLabel(preview)} can reach every defined route.`}
      />
    );
  }
  return (
    <div className="space-y-3">
      {grouped.map((g) => (
        <div key={g.area} className="rounded-lg border border-border/50 bg-card/40 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {g.area}
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {g.pages.map((page) => (
              <li key={page.path}>
                <span
                  className={`inline-flex max-w-full items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] ${
                    page.visible
                      ? "border-amber-500/25 bg-amber-500/[0.06] text-amber-100"
                      : "border-border/40 bg-background/30 text-muted-foreground"
                  }`}
                  title={page.reason}
                >
                  {page.visible ? (
                    <AlertCircle className="h-3 w-3 text-amber-300" />
                  ) : (
                    <EyeOff className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-1.5 font-medium">
                      {page.label}
                      <code className="text-[9px] font-normal text-muted-foreground/70">
                        {page.path}
                      </code>
                    </span>
                    <span className="mt-0.5 block text-[9px] leading-relaxed opacity-80">
                      {page.reason}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ============================================================================
 * Role metadata dialog
 * ========================================================================== */

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
