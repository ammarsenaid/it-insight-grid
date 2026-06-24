import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bell,
  Inbox,
  LayoutDashboard,
  Loader2,
  Mail,
  Palette,
  RefreshCw,
  Sparkles,
  Table2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { can, useRole } from "@/lib/permissions";
import { updateSettings, useData } from "@/lib/data/store";
import {
  mailboxConfigsQuery,
  slaPoliciesQuery,
  ticketCategoriesQuery,
  ticketPriorityConfigsQuery,
} from "@/lib/service-desk/queries";
import {
  createMailboxConfig,
  deleteMailboxConfig,
  updateMailboxConfig,
  type TicketMailboxConfigInput,
} from "@/lib/service-desk/settings";
import type {
  TicketCategory,
  TicketMailboxConfig,
  TicketPriorityConfig,
  TicketSlaPolicy,
} from "@/lib/service-desk/types";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · IT Knowledge Center" }] }),
  component: SettingsPage,
});

type Tone = "sky" | "violet" | "amber" | "emerald" | "rose";

type MailboxDraft = TicketMailboxConfigInput;

const EMPTY_MAILBOX_DRAFT: MailboxDraft = {
  name: "",
  inboundAddress: "",
  outboundFrom: "",
  replyTo: "",
  defaultCategory: "",
  defaultPriority: "normal",
  defaultTeam: "",
  isActive: true,
};

function mailboxToDraft(config: TicketMailboxConfig): MailboxDraft {
  return {
    name: config.name,
    inboundAddress: config.inboundAddress,
    outboundFrom: config.outboundFrom ?? "",
    replyTo: config.replyTo ?? "",
    defaultCategory: config.defaultCategory ?? "",
    defaultPriority: config.defaultPriority,
    defaultTeam: config.defaultTeam ?? "",
    isActive: config.isActive,
  };
}

function normalizeMailboxDraft(draft: MailboxDraft): TicketMailboxConfigInput {
  return {
    name: draft.name.trim(),
    inboundAddress: draft.inboundAddress.trim(),
    outboundFrom: draft.outboundFrom?.trim() || null,
    replyTo: draft.replyTo?.trim() || null,
    defaultCategory: draft.defaultCategory?.trim() || null,
    defaultPriority: draft.defaultPriority,
    defaultTeam: draft.defaultTeam?.trim() || null,
    isActive: draft.isActive,
  };
}

function mailboxDraftIsValid(draft: MailboxDraft): boolean {
  return draft.name.trim().length > 0 && draft.inboundAddress.trim().length >= 3;
}


const TONE_CLASSES: Record<Tone, { ring: string; icon: string; halo: string; chip: string }> = {
  sky: {
    ring: "ring-sky-500/15",
    icon: "from-sky-500/25 to-sky-500/5 text-sky-300",
    halo: "from-sky-500/[0.06] via-transparent to-transparent",
    chip: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  },
  violet: {
    ring: "ring-violet-500/15",
    icon: "from-violet-500/25 to-violet-500/5 text-violet-300",
    halo: "from-violet-500/[0.06] via-transparent to-transparent",
    chip: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  },
  amber: {
    ring: "ring-amber-500/15",
    icon: "from-amber-500/25 to-amber-500/5 text-amber-300",
    halo: "from-amber-500/[0.06] via-transparent to-transparent",
    chip: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  },
  emerald: {
    ring: "ring-emerald-500/15",
    icon: "from-emerald-500/25 to-emerald-500/5 text-emerald-300",
    halo: "from-emerald-500/[0.06] via-transparent to-transparent",
    chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  },
  rose: {
    ring: "ring-rose-500/15",
    icon: "from-rose-500/25 to-rose-500/5 text-rose-300",
    halo: "from-rose-500/[0.06] via-transparent to-transparent",
    chip: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  },
};

type SectionDef = {
  id: string;
  label: string;
  description: string;
  icon: typeof Palette;
  tone: Tone;
};

const SECTIONS: SectionDef[] = [
  {
    id: "appearance",
    label: "Appearance",
    description: "Look, density, motion",
    icon: Palette,
    tone: "violet",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "In-app alerts",
    icon: Bell,
    tone: "amber",
  },
  {
    id: "tables",
    label: "Tables & views",
    description: "Defaults across lists",
    icon: Table2,
    tone: "sky",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Home screen modules",
    icon: LayoutDashboard,
    tone: "emerald",
  },
  {
    id: "service-desk",
    label: "Service desk",
    description: "Backend defaults",
    icon: Inbox,
    tone: "sky",
  },
  {
    id: "mailboxes",
    label: "Department mailboxes",
    description: "Backend mailbox metadata",
    icon: Mail,
    tone: "rose",
  },
];

function SettingsPage() {
  const { session, effectiveAccess, isPlatformAdmin, activeOrganization, currentWorkspace } =
    useAuth();
  const role = useRole();
  const queryClient = useQueryClient();
  const data = useData();
  const s = data.settings;
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const permissionKeys = effectiveAccess?.permissionKeys ?? [];
  const canViewServiceDeskSettings =
    Boolean(session?.user?.id) &&
    (isPlatformAdmin ||
      permissionKeys.includes("tickets.view_all") ||
      permissionKeys.includes("tickets.config") ||
      can("tickets.config", role));
  const canManageServiceDeskSettings =
    Boolean(session?.user?.id) &&
    (isPlatformAdmin || permissionKeys.includes("tickets.config") || can("tickets.config", role));

  const mailboxQuery = useQuery({
    ...mailboxConfigsQuery(),
    enabled: canViewServiceDeskSettings,
  });
  const categoryQuery = useQuery({
    ...ticketCategoriesQuery(),
    enabled: canViewServiceDeskSettings,
  });
  const priorityQuery = useQuery({
    ...ticketPriorityConfigsQuery(),
    enabled: canViewServiceDeskSettings,
  });
  const slaQuery = useQuery({
    ...slaPoliciesQuery(),
    enabled: canViewServiceDeskSettings,
  });

  const refreshMailboxConfigs = () =>
    queryClient.invalidateQueries({ queryKey: mailboxConfigsQuery().queryKey });

  const createMailboxMutation = useMutation({
    mutationFn: (input: TicketMailboxConfigInput) => createMailboxConfig(input),
    onSuccess: () => {
      toast.success("Mailbox configuration created");
      void refreshMailboxConfigs();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to create mailbox configuration");
    },
  });

  const updateMailboxMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TicketMailboxConfigInput> }) =>
      updateMailboxConfig(id, patch),
    onSuccess: () => {
      toast.success("Mailbox configuration updated");
      void refreshMailboxConfigs();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update mailbox configuration");
    },
  });

  const deleteMailboxMutation = useMutation({
    mutationFn: (id: string) => deleteMailboxConfig(id),
    onSuccess: () => {
      toast.success("Mailbox configuration deleted");
      void refreshMailboxConfigs();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete mailbox configuration");
    },
  });

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    SECTIONS.forEach((sec) => {
      const el = document.getElementById(sec.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(id);
    }
  };

  const backendMailboxCount = mailboxQuery.data?.filter((m) => m.isActive).length ?? 0;

  return (
    <div className="pb-16">
      <PageHeader
        title="Settings"
        description="Personalize this device and review backend-backed service desk configuration."
        status={
          <Badge
            variant="outline"
            className="gap-1 border-border/60 bg-muted/40 text-[10px] font-medium"
          >
            <Sparkles className="h-3 w-3 text-primary" />
            {activeOrganization?.name ?? "Authenticated settings"}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <nav className="glass-card rounded-2xl p-2">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Settings
            </p>
            <ul className="space-y-0.5">
              {SECTIONS.map((sec) => {
                const Icon = sec.icon;
                const isActive = active === sec.id;
                const tone = TONE_CLASSES[sec.tone];
                return (
                  <li key={sec.id}>
                    <button
                      type="button"
                      onClick={() => jump(sec.id)}
                      className={cn(
                        "group flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-all",
                        isActive
                          ? "bg-white/[0.04] text-foreground ring-1 ring-white/10 shadow-sm"
                          : "text-muted-foreground hover:bg-white/[0.02] hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br transition-colors",
                          isActive ? tone.icon : "from-muted/40 to-muted/10 text-muted-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 pt-0.5">
                        <span className="block text-sm font-medium leading-tight">{sec.label}</span>
                        <span className="block truncate text-[11px] text-muted-foreground/80">
                          {sec.description}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <div className="space-y-6">
          <SettingsSection
            id="appearance"
            icon={Palette}
            tone="violet"
            title="Appearance"
            description="Tune density, motion and the navigation rail."
          >
            <Row label="Compact mode" hint="Tighter spacing across tables, cards and forms.">
              <Switch
                checked={s.compactMode}
                onCheckedChange={(v) => updateSettings({ compactMode: v })}
              />
            </Row>
            <Row label="Reduced motion" hint="Disable non-essential transitions and parallax.">
              <Switch
                checked={s.reducedMotion}
                onCheckedChange={(v) => updateSettings({ reducedMotion: v })}
              />
            </Row>
            <Row
              label="Sidebar collapsed by default"
              hint="Start each session with only icons visible."
            >
              <Switch
                checked={s.sidebarCollapsed}
                onCheckedChange={(v) => updateSettings({ sidebarCollapsed: v })}
              />
            </Row>
          </SettingsSection>

          <SettingsSection
            id="notifications"
            icon={Bell}
            tone="amber"
            title="Notifications"
            description="Control which signals reach you while you work."
            badge={
              <Badge
                variant="outline"
                className="border-border/60 bg-muted/30 text-[10px] text-muted-foreground"
              >
                Local preference
              </Badge>
            }
          >
            <Row label="Show in-app notifications" hint="Toasts, banners and the bell counter.">
              <Switch
                checked={s.showNotifications}
                onCheckedChange={(v) => updateSettings({ showNotifications: v })}
              />
            </Row>
          </SettingsSection>

          <SettingsSection
            id="tables"
            icon={Table2}
            tone="sky"
            title="Tables & views"
            description="Default pagination and the lens used for document lists."
          >
            <Row label="Default page size" hint="Number of rows loaded per page in lists.">
              <Select
                value={String(s.tablePageSize)}
                onValueChange={(v) => updateSettings({ tablePageSize: Number(v) })}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row
              label="Default document view"
              hint="Opening lens used when navigating to Documents."
            >
              <Select
                value={s.defaultDocView}
                onValueChange={(v: "table" | "cards") => updateSettings({ defaultDocView: v })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="table">Table</SelectItem>
                  <SelectItem value="cards">Cards</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </SettingsSection>

          <SettingsSection
            id="dashboard"
            icon={LayoutDashboard}
            tone="emerald"
            title="Dashboard"
            description="Show or hide modules on the home dashboard."
          >
            <Row label="Show dashboard chart" hint="Ticket volume trend on the dashboard.">
              <Switch
                checked={s.showDashboardChart}
                onCheckedChange={(v) => updateSettings({ showDashboardChart: v })}
              />
            </Row>
          </SettingsSection>

          <SettingsSection
            id="service-desk"
            icon={Inbox}
            tone="sky"
            title="Service desk defaults"
            description="Read backend-backed ticket categories, priorities, and SLA policies."
            badge={
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-200"
              >
                Backend-backed
              </Badge>
            }
          >
            <ServiceDeskDefaultsPanel
              canView={canViewServiceDeskSettings}
              currentWorkspaceName={currentWorkspace?.name ?? null}
              categories={categoryQuery.data ?? []}
              priorities={priorityQuery.data ?? []}
              slaPolicies={slaQuery.data ?? []}
              isLoading={categoryQuery.isLoading || priorityQuery.isLoading || slaQuery.isLoading}
              isError={categoryQuery.isError || priorityQuery.isError || slaQuery.isError}
              error={categoryQuery.error ?? priorityQuery.error ?? slaQuery.error}
              onRetry={() => {
                categoryQuery.refetch();
                priorityQuery.refetch();
                slaQuery.refetch();
              }}
            />
          </SettingsSection>

          <SettingsSection
            id="mailboxes"
            icon={Mail}
            tone="rose"
            title="Department mailboxes"
            description="Review real mailbox metadata. Create/update controls are withheld until a workspace-scoped mailbox write contract is available."
            badge={
              <Badge
                variant="outline"
                className="border-border/60 bg-muted/30 text-[10px] text-muted-foreground"
              >
                {backendMailboxCount} backend active
              </Badge>
            }
          >
            <BackendMailboxPanel
              canView={canViewServiceDeskSettings}
              canManage={canManageServiceDeskSettings}
              configs={mailboxQuery.data ?? []}
              categories={categoryQuery.data ?? []}
              priorities={priorityQuery.data ?? []}
              isLoading={mailboxQuery.isLoading}
              isError={mailboxQuery.isError}
              error={mailboxQuery.error}
              isCreating={createMailboxMutation.isPending}
              updatingId={
                updateMailboxMutation.variables?.id && updateMailboxMutation.isPending
                  ? updateMailboxMutation.variables.id
                  : null
              }
              deletingId={
                typeof deleteMailboxMutation.variables === "string" && deleteMailboxMutation.isPending
                  ? deleteMailboxMutation.variables
                  : null
              }
              onCreate={(input) => createMailboxMutation.mutate(normalizeMailboxDraft(input))}
              onUpdate={(id, patch) =>
                updateMailboxMutation.mutate({ id, patch: normalizeMailboxDraft(patch) })
              }
              onDelete={(id) => deleteMailboxMutation.mutate(id)}
              onRetry={() => mailboxQuery.refetch()}
            />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

function ServiceDeskDefaultsPanel({
  canView,
  currentWorkspaceName,
  categories,
  priorities,
  slaPolicies,
  isLoading,
  isError,
  error,
  onRetry,
}: {
  canView: boolean;
  currentWorkspaceName: string | null;
  categories: TicketCategory[];
  priorities: TicketPriorityConfig[];
  slaPolicies: TicketSlaPolicy[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (!canView) {
    return (
      <BackendNotice
        title="Service desk configuration is permission-gated"
        description="Your current role can use personal settings, but backend service desk defaults require tickets.view_all or tickets.config."
      />
    );
  }

  if (isLoading) {
    return <LoadingNotice label="Loading backend service desk defaults…" />;
  }

  if (isError) {
    return (
      <ErrorNotice
        message={
          error instanceof Error ? error.message : "Failed to load backend service desk defaults."
        }
        onRetry={onRetry}
      />
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <BackendMetricCard
        label="Active categories"
        value={String(categories.filter((c) => c.isActive).length)}
        detail={
          currentWorkspaceName
            ? `Context: ${currentWorkspaceName}`
            : "Organization-scoped backend data"
        }
      />
      <BackendMetricCard
        label="Priorities"
        value={String(priorities.filter((p) => p.isActive).length)}
        detail={priorities.map((p) => p.key).join(", ") || "No active priorities"}
      />
      <BackendMetricCard
        label="SLA policies"
        value={String(slaPolicies.filter((p) => p.isActive).length)}
        detail="Read from Supabase ticket_sla_policies"
      />
    </div>
  );
}

function BackendMailboxPanel({
  canView,
  canManage,
  configs,
  categories,
  priorities,
  isLoading,
  isError,
  error,
  isCreating,
  updatingId,
  deletingId,
  onCreate,
  onUpdate,
  onDelete,
  onRetry,
}: {
  canView: boolean;
  canManage: boolean;
  configs: TicketMailboxConfig[];
  categories: TicketCategory[];
  priorities: TicketPriorityConfig[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isCreating: boolean;
  updatingId: string | null;
  deletingId: string | null;
  onCreate: (input: MailboxDraft) => void;
  onUpdate: (id: string, patch: MailboxDraft) => void;
  onDelete: (id: string) => void;
  onRetry: () => void;
}) {
  const [draft, setDraft] = useState<MailboxDraft>(EMPTY_MAILBOX_DRAFT);
  const [editing, setEditing] = useState<Record<string, MailboxDraft>>({});

  const canSubmitCreate = canManage && mailboxDraftIsValid(draft) && !isCreating;

  function updateEditing(id: string, patch: Partial<MailboxDraft>) {
    setEditing((current) => ({
      ...current,
      [id]: { ...(current[id] ?? mailboxToDraft(configs.find((c) => c.id === id)!)), ...patch },
    }));
  }

  function resetEditing(id: string) {
    setEditing((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  if (!canView) {
    return (
      <BackendNotice
        title="Backend mailbox configuration is permission-gated"
        description="Mailbox metadata is loaded from Supabase only for service desk roles with tickets.view_all or tickets.config."
      />
    );
  }

  if (isLoading) {
    return <LoadingNotice label="Loading backend mailbox configuration…" />;
  }

  if (isError) {
    return (
      <ErrorNotice
        message={
          error instanceof Error ? error.message : "Failed to load backend mailbox configuration."
        }
        onRetry={onRetry}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5">
        <div>
          <p className="text-xs font-semibold text-foreground">Backend mailbox metadata</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Stored in Supabase ticket_mailbox_configs. This saves metadata only; provider
            connection tests and secrets are intentionally not implemented here.
          </p>
        </div>
        <Badge
          variant="outline"
          className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-200"
        >
          {canManage ? "Editable with tickets.config" : "Read-only"}
        </Badge>
      </div>

      <div className="rounded-xl border border-border/50 bg-background/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Add department mailbox</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Create safe mailbox metadata for a department or workspace. Real Microsoft 365,
              IMAP, SMTP, OAuth and secret storage will be connected in a later integration phase.
            </p>
          </div>
          <Badge variant="outline" className="border-border/60 bg-muted/30 text-[10px]">
            No secrets stored
          </Badge>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <MailboxInput
            label="Display name"
            value={draft.name}
            disabled={!canManage || isCreating}
            placeholder="IT Support"
            onChange={(value) => setDraft((current) => ({ ...current, name: value }))}
          />
          <MailboxInput
            label="Inbound address"
            value={draft.inboundAddress}
            disabled={!canManage || isCreating}
            placeholder="it-support@example.com"
            mono
            onChange={(value) => setDraft((current) => ({ ...current, inboundAddress: value }))}
          />
          <MailboxInput
            label="Reply-to"
            value={draft.replyTo ?? ""}
            disabled={!canManage || isCreating}
            placeholder="it-support@example.com"
            mono
            onChange={(value) => setDraft((current) => ({ ...current, replyTo: value }))}
          />
          <MailboxInput
            label="Outbound from"
            value={draft.outboundFrom ?? ""}
            disabled={!canManage || isCreating}
            placeholder="support@example.com"
            mono
            onChange={(value) => setDraft((current) => ({ ...current, outboundFrom: value }))}
          />

          <div className="grid gap-1.5">
            <Label className="text-[11px] text-muted-foreground">Default priority</Label>
            <Select
              value={draft.defaultPriority}
              disabled={!canManage || isCreating}
              onValueChange={(value: TicketMailboxConfig["defaultPriority"]) =>
                setDraft((current) => ({ ...current, defaultPriority: value }))
              }
            >
              <SelectTrigger className="h-9 bg-background/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(priorities.length > 0
                  ? priorities.map((p) => p.key)
                  : ["low", "normal", "high", "critical"]
                ).map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <MailboxInput
            label="Default category"
            value={draft.defaultCategory ?? ""}
            disabled={!canManage || isCreating}
            placeholder={categories[0]?.name ?? "Applications"}
            onChange={(value) => setDraft((current) => ({ ...current, defaultCategory: value }))}
          />

          <MailboxInput
            label="Default team"
            value={draft.defaultTeam ?? ""}
            disabled={!canManage || isCreating}
            placeholder="Service Desk"
            onChange={(value) => setDraft((current) => ({ ...current, defaultTeam: value }))}
          />

          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/50 px-3 py-2">
            <div>
              <Label className="text-xs text-foreground">Active</Label>
              <p className="text-[11px] text-muted-foreground">Allow this mailbox metadata to be used.</p>
            </div>
            <Switch
              checked={draft.isActive}
              disabled={!canManage || isCreating}
              onCheckedChange={(value) => setDraft((current) => ({ ...current, isActive: value }))}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!canSubmitCreate}
            onClick={() => {
              onCreate(draft);
              setDraft(EMPTY_MAILBOX_DRAFT);
            }}
          >
            {isCreating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Save mailbox metadata
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled
            title="Provider testing requires the later Microsoft 365 / mail integration phase."
          >
            Test provider connection later
          </Button>
          {!canManage ? (
            <p className="text-xs text-muted-foreground">
              Editing requires tickets.config. Your current role can only review visible metadata.
            </p>
          ) : null}
        </div>
      </div>

      {configs.length === 0 ? (
        <BackendNotice
          title="No backend mailboxes configured"
          description="The service desk mailbox table is reachable. Create the first safe metadata row above."
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {configs.map((config) => {
            const rowDraft = editing[config.id] ?? mailboxToDraft(config);
            const isUpdating = updatingId === config.id;
            const isDeleting = deletingId === config.id;
            const canSaveRow = canManage && mailboxDraftIsValid(rowDraft) && !isUpdating && !isDeleting;

            return (
              <article
                key={config.id}
                className="rounded-xl border border-border/50 bg-background/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {config.name}
                    </h3>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {config.inboundAddress}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      config.isActive
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        : "border-border/60 bg-muted/30 text-muted-foreground",
                    )}
                  >
                    {config.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <MailboxInput
                    label="Display name"
                    value={rowDraft.name}
                    disabled={!canManage || isUpdating || isDeleting}
                    onChange={(value) => updateEditing(config.id, { name: value })}
                  />
                  <MailboxInput
                    label="Inbound address"
                    value={rowDraft.inboundAddress}
                    disabled={!canManage || isUpdating || isDeleting}
                    mono
                    onChange={(value) => updateEditing(config.id, { inboundAddress: value })}
                  />
                  <MailboxInput
                    label="Reply-to"
                    value={rowDraft.replyTo ?? ""}
                    disabled={!canManage || isUpdating || isDeleting}
                    mono
                    onChange={(value) => updateEditing(config.id, { replyTo: value })}
                  />
                  <MailboxInput
                    label="Outbound from"
                    value={rowDraft.outboundFrom ?? ""}
                    disabled={!canManage || isUpdating || isDeleting}
                    mono
                    onChange={(value) => updateEditing(config.id, { outboundFrom: value })}
                  />
                  <MailboxInput
                    label="Default category"
                    value={rowDraft.defaultCategory ?? ""}
                    disabled={!canManage || isUpdating || isDeleting}
                    onChange={(value) => updateEditing(config.id, { defaultCategory: value })}
                  />
                  <MailboxInput
                    label="Default team"
                    value={rowDraft.defaultTeam ?? ""}
                    disabled={!canManage || isUpdating || isDeleting}
                    onChange={(value) => updateEditing(config.id, { defaultTeam: value })}
                  />

                  <div className="grid gap-1.5">
                    <Label className="text-[11px] text-muted-foreground">Default priority</Label>
                    <Select
                      value={rowDraft.defaultPriority}
                      disabled={!canManage || isUpdating || isDeleting}
                      onValueChange={(value: TicketMailboxConfig["defaultPriority"]) =>
                        updateEditing(config.id, { defaultPriority: value })
                      }
                    >
                      <SelectTrigger className="h-9 bg-background/60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(priorities.length > 0
                          ? priorities.map((p) => p.key)
                          : ["low", "normal", "high", "critical"]
                        ).map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {priority}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/50 px-3 py-2">
                    <div>
                      <Label className="text-xs text-foreground">Active</Label>
                      <p className="text-[11px] text-muted-foreground">Stored as is_active.</p>
                    </div>
                    <Switch
                      checked={rowDraft.isActive}
                      disabled={!canManage || isUpdating || isDeleting}
                      onCheckedChange={(value) => updateEditing(config.id, { isActive: value })}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!canSaveRow}
                    onClick={() => onUpdate(config.id, rowDraft)}
                  >
                    {isUpdating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    Save changes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canManage || isUpdating || isDeleting}
                    onClick={() => resetEditing(config.id)}
                  >
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    title="Real connection tests require provider integration."
                  >
                    Test connection later
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!canManage || isUpdating || isDeleting}
                    onClick={() => {
                      if (window.confirm(`Delete mailbox metadata "${config.name}"?`)) {
                        onDelete(config.id);
                      }
                    }}
                    title="Delete is still finally controlled by backend RLS."
                  >
                    {isDeleting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    Delete
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MailboxInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn("h-9 bg-background/60", mono && "font-mono text-xs")}
      />
    </div>
  );
}

function BackendMetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function BackendField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 truncate text-foreground",
          mono ? "font-mono text-[10px]" : "font-medium",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function LoadingNotice({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/40 px-3 py-4 text-sm text-muted-foreground"
      role="status"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p>{message}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    </div>
  );
}

function BackendNotice({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-3">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function SettingsSection({
  id,
  icon: Icon,
  tone,
  title,
  description,
  badge,
  children,
}: {
  id: string;
  icon: typeof Palette;
  tone: Tone;
  title: string;
  description: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-6 relative overflow-hidden rounded-2xl border border-border/50 bg-card/60 shadow-sm ring-1 backdrop-blur-sm",
        t.ring,
      )}
    >
      <div
        className={cn("pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b", t.halo)}
      />
      <header className="relative flex items-start justify-between gap-3 border-b border-border/40 px-5 py-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-white/5",
              t.icon,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {badge}
      </header>
      <div className="relative space-y-4 px-5 py-5">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-transparent px-1 py-1 transition-colors hover:border-border/30 hover:bg-muted/10">
      <div className="min-w-0">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
