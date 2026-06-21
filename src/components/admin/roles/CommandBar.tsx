import { useEffect, useState } from "react";
import {
  Activity,
  Database,
  Info,
  Loader2,
  RefreshCw,
  Rows3,
  Rows4,
  ShieldQuestion,
  UserCog,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ROLES, type Role } from "@/lib/permissions";
import { roleLabel } from "@/lib/data/users";

export type Density = "comfortable" | "compact";

export interface CommandBarStatus {
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isSaving: boolean;
  lastUpdated: Date | null;
}

export function CommandBar({
  status,
  previewRole,
  onPreviewRoleChange,
  onRefresh,
  density,
  onDensityChange,
}: {
  status: CommandBarStatus;
  previewRole: Role;
  onPreviewRoleChange: (role: Role) => void;
  onRefresh: () => void;
  density: Density;
  onDensityChange: (density: Density) => void;
}) {
  const stateChip = status.isError
    ? {
        label: "Connection error",
        tone: "border-destructive/40 bg-destructive/15 text-destructive",
        dot: "bg-destructive",
      }
    : status.isLoading
      ? {
          label: "Loading…",
          tone: "border-border/60 bg-muted/30 text-muted-foreground",
          dot: "bg-muted-foreground/60 animate-pulse",
        }
      : {
          label: "DB connected",
          tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
          dot: "bg-emerald-400",
        };

  return (
    <div className="sticky top-0 z-40 -mx-4 mb-4 border-b border-border/50 bg-background/85 px-4 py-3 backdrop-blur-md md:-mx-6 md:px-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20"
          >
            <UserCog className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
                Roles &amp; Permissions
              </h1>
              <Badge
                variant="outline"
                className={`gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${stateChip.tone}`}
                aria-live="polite"
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${stateChip.dot}`}
                />
                {stateChip.label}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              <LiveStatusLine status={status} />
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ViewAsControl value={previewRole} onChange={onPreviewRoleChange} />
          <DensityToggle value={density} onChange={onDensityChange} />
          <ProtectionPopover />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={onRefresh}
                disabled={status.isFetching}
                aria-label="Refresh roles and visibility from the database"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${status.isFetching ? "animate-spin" : ""}`}
                />
                <span className="ml-1.5 hidden sm:inline">Refresh</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refetch roles, grants, and visibility</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ProgressStrip status={status} />
    </div>
  );
}

function LiveStatusLine({ status }: { status: CommandBarStatus }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const updated = status.lastUpdated
    ? formatRelative(status.lastUpdated)
    : "not yet loaded";
  const saving = status.isSaving ? " · saving change…" : "";
  return (
    <>
      <Database className="-mt-0.5 mr-1 inline h-3 w-3" /> Live database matrix · refreshed{" "}
      {updated}
      {saving}
    </>
  );
}

function formatRelative(date: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}

function ViewAsControl({
  value,
  onChange,
}: {
  value: Role;
  onChange: (role: Role) => void;
}) {
  return (
    <label className="group flex h-9 items-center gap-2 rounded-md border border-border/60 bg-card/60 px-2.5 text-xs shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
      <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:inline">
        View as
      </span>
      <select
        aria-label="View the console as this role"
        value={value}
        onChange={(event) => onChange(event.target.value as Role)}
        className="h-7 cursor-pointer bg-transparent pr-1 text-xs font-medium text-foreground outline-none"
      >
        {ROLES.map((role) => (
          <option key={role.id} value={role.id}>
            {roleLabel(role.id)}
          </option>
        ))}
      </select>
    </label>
  );
}

function DensityToggle({
  value,
  onChange,
}: {
  value: Density;
  onChange: (density: Density) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Row density"
      className="flex h-9 items-center rounded-md border border-border/60 bg-card/60 p-0.5 shadow-sm"
    >
      <DensityButton
        active={value === "comfortable"}
        label="Comfortable rows"
        onClick={() => onChange("comfortable")}
        icon={Rows3}
      />
      <DensityButton
        active={value === "compact"}
        label="Compact rows"
        onClick={() => onChange("compact")}
        icon={Rows4}
      />
    </div>
  );
}

function DensityButton({
  active,
  label,
  onClick,
  icon: Icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: typeof Rows3;
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
            active ? "bg-background text-foreground shadow-sm" : ""
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ProtectionPopover() {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              aria-label="What is protected on this page"
            >
              <ShieldQuestion className="h-3.5 w-3.5" />
              <span className="ml-1.5 hidden md:inline">What&apos;s protected?</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Recovery routes &amp; lockout guardrails</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 text-xs">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Info className="h-3.5 w-3.5 text-primary" /> Built-in guardrails
          </div>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>
                The Platform Administrator role keeps every capability and access to{" "}
                <code className="rounded bg-muted/40 px-1 text-[10px]">/admin/roles</code> —
                cells are read-only to prevent lockout.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>
                Employees can never reach <code className="rounded bg-muted/40 px-1 text-[10px]">/admin/*</code>{" "}
                routes regardless of database rows.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>
                Every role must keep a recovery destination — Dashboard for staff, My Requests
                for employees — so signed-in users always have somewhere safe to land.
              </span>
            </li>
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ProgressStrip({ status }: { status: CommandBarStatus }) {
  if (!status.isFetching && !status.isSaving && !status.isError) return null;
  const tone = status.isError
    ? "bg-destructive"
    : status.isSaving
      ? "bg-amber-400"
      : "bg-primary/70";
  return (
    <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-border/50" aria-hidden>
      <div className={`h-full w-1/3 animate-[progress-slide_1.2s_linear_infinite] ${tone}`} />
      <style>{`
        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}

export function HeadlineMetricRow({
  items,
}: {
  items: {
    label: string;
    value: number | null;
    icon: typeof Activity;
    accent: string;
    hint: string;
  }[];
}) {
  return (
    <section
      aria-label="Permissions overview"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {items.map(({ label, value, icon: Icon, accent, hint }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/60 px-3 py-2.5 shadow-sm"
        >
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
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-semibold leading-none tabular-nums text-foreground">
                {value === null ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  value.toLocaleString()
                )}
              </span>
              <span className="truncate text-[10px] text-muted-foreground">{hint}</span>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
