import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tone = "default" | "muted" | "danger";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Optional small italic hint shown beneath description (operational guidance). */
  hint?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  /** Optional extra actions rendered after primary/secondary buttons. */
  extraActions?: ReactNode;
  /** Compact paddings for use inside drawers/cards. */
  compact?: boolean;
  tone?: Tone;
  className?: string;
}

const toneStyles: Record<Tone, string> = {
  default: "bg-primary/10 text-primary",
  muted: "bg-muted/40 text-muted-foreground",
  danger: "bg-destructive/10 text-destructive",
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  hint,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  extraActions,
  compact,
  tone = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 text-center",
        compact ? "p-6" : "p-8 sm:p-10",
        className,
      )}
    >
      <div className={cn("grid h-12 w-12 place-items-center rounded-xl", toneStyles[tone])}>
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      {hint && (
        <p className="mt-2 max-w-md text-[11px] italic leading-relaxed text-muted-foreground/80">{hint}</p>
      )}
      {(actionLabel || secondaryActionLabel || extraActions) && (
        <div className="mt-5 flex w-full max-w-sm flex-col-reverse items-stretch justify-center gap-2 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center">
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="outline" size="sm" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
          {actionLabel && onAction && (
            <Button size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {extraActions}
        </div>
      )}
    </div>
  );
}
