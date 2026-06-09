import type { LucideIcon } from "lucide-react";
import { Activity } from "lucide-react";
import { timeAgo } from "./format";
import { cn } from "@/lib/utils";

export interface TimelineEntry {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}

const toneColors: Record<NonNullable<TimelineEntry["tone"]>, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-[#52D6A4]/15 text-[#52D6A4]",
  warning: "bg-[#FFC86B]/15 text-[#FFC86B]",
  danger: "bg-[#FF7C91]/15 text-[#FF7C91]",
  info: "bg-[#5B8CFF]/15 text-[#5B8CFF]",
};

export function ActivityTimeline({
  entries,
  className,
  emptyLabel = "No recent activity",
}: {
  entries: TimelineEntry[];
  className?: string;
  emptyLabel?: string;
}) {
  if (entries.length === 0) {
    return (
      <div className={cn("py-8 text-center text-xs text-muted-foreground", className)}>{emptyLabel}</div>
    );
  }
  return (
    <ol className={cn("relative space-y-4 pl-6", className)}>
      <span className="absolute left-[11px] top-1 bottom-1 w-px bg-border/60" aria-hidden />
      {entries.map((e) => {
        const Icon = e.icon ?? Activity;
        return (
          <li key={e.id} className="relative">
            <span
              className={cn(
                "absolute -left-6 grid h-6 w-6 place-items-center rounded-full ring-4 ring-background",
                toneColors[e.tone ?? "default"],
              )}
            >
              <Icon className="h-3 w-3" />
            </span>
            <div className="text-sm font-medium leading-tight">{e.title}</div>
            {e.description && <div className="mt-0.5 text-xs text-muted-foreground">{e.description}</div>}
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              {timeAgo(e.timestamp)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
