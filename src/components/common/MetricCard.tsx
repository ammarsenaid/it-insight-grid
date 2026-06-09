import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "primary" | "success" | "warning" | "danger" | "muted";

const accentBg: Record<Accent, string> = {
  primary: "bg-[#5B8CFF]/15 text-[#5B8CFF]",
  success: "bg-[#52D6A4]/15 text-[#52D6A4]",
  warning: "bg-[#FFC86B]/15 text-[#FFC86B]",
  danger: "bg-[#FF7C91]/15 text-[#FF7C91]",
  muted: "bg-white/5 text-muted-foreground",
};

export function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  accent?: Accent;
}) {
  return (
    <div className="glass-card group relative overflow-hidden rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/10 hover:shadow-lg hover:shadow-primary/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", accentBg[accent])}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </div>
  );
}
