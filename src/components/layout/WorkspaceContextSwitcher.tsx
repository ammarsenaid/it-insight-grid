import { useCallback } from "react";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/lib/auth/AuthProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function WorkspaceStatusDot({ status }: { status?: string }) {
  const color =
    status === "active"
      ? "bg-emerald-500"
      : status === "pending"
        ? "bg-amber-500"
        : status === "suspended"
          ? "bg-rose-500"
          : "bg-muted-foreground";
  return (
    <span
      className={cn("inline-block h-1.5 w-1.5 rounded-full", color)}
      aria-hidden="true"
    />
  );
}

function WorkspaceTypeBadge({ type }: { type?: string }) {
  if (!type) return null;
  return (
    <span className="rounded px-1 py-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/60">
      {type}
    </span>
  );
}

export function WorkspaceContextSwitcher() {
  const {
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    setCurrentWorkspaceId,
    loading,
    error,
  } = useWorkspaceContext();

  const handleSelect = useCallback(
    (id: string) => {
      setCurrentWorkspaceId(id);
    },
    [setCurrentWorkspaceId],
  );

  // Loading / error / empty state
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/40 px-3 py-1.5 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="hidden text-xs sm:inline">Workspace loading…</span>
      </div>
    );
  }

  if (error || workspaces.length === 0) {
    return (
      <div className="hidden items-center gap-2 rounded-xl border border-border/40 bg-card/40 px-3 py-1.5 text-muted-foreground md:flex">
        <Building2 className="h-3.5 w-3.5" />
        <span className="text-xs">Workspace unavailable</span>
      </div>
    );
  }

  const workspace = currentWorkspace ?? workspaces[0];
  const hasMultiple = workspaces.length > 1;

  // Single workspace — read-only pill
  if (!hasMultiple) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-1.5"
        title={`Workspace: ${workspace?.name ?? "Unknown"}`}
      >
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
          Workspace
        </span>
        <span className="max-w-[140px] truncate text-xs font-medium">
          {workspace?.name ?? "Unknown"}
        </span>
        <WorkspaceStatusDot status={workspace?.status} />
      </div>
    );
  }

  // Multiple workspaces — dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-1.5 transition-colors hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label={`Current workspace: ${workspace?.name ?? "Unknown"}. Click to switch.`}
        >
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
            Workspace
          </span>
          <span className="max-w-[120px] truncate text-xs font-medium">
            {workspace?.name ?? "Unknown"}
          </span>
          <WorkspaceStatusDot status={workspace?.status} />
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Switch workspace
        </div>
        {workspaces.map((ws) => {
          const isActive = ws.id === currentWorkspaceId;
          return (
            <DropdownMenuItem
              key={ws.id}
              onClick={(e) => {
                e.preventDefault();
                handleSelect(ws.id);
              }}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2",
                isActive && "bg-primary/5",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Building2
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <div className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      "truncate text-sm",
                      isActive ? "font-medium text-foreground" : "text-foreground",
                    )}
                  >
                    {ws.name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <WorkspaceTypeBadge type={ws.type} />
                    <WorkspaceStatusDot status={ws.status} />
                    <span className="text-[10px] capitalize text-muted-foreground">
                      {ws.status}
                    </span>
                  </div>
                </div>
              </div>
              {isActive && (
                <Check className="h-4 w-4 shrink-0 text-primary" />
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="px-2 pb-1.5 pt-1 text-[10px] leading-relaxed text-muted-foreground">
          Module filtering will be enabled after workspace migration.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
