import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "danger" | "info" | "muted";

const toneClass: Record<Tone, string> = {
  default: "border-border bg-secondary text-foreground",
  success: "border-[#52D6A4]/30 bg-[#52D6A4]/10 text-[#52D6A4]",
  warning: "border-[#FFC86B]/30 bg-[#FFC86B]/10 text-[#FFC86B]",
  danger: "border-[#FF7C91]/30 bg-[#FF7C91]/10 text-[#FF7C91]",
  info: "border-[#5B8CFF]/30 bg-[#5B8CFF]/10 text-[#5B8CFF]",
  muted: "border-border bg-muted/40 text-muted-foreground",
};

export function StatusBadge({
  label,
  tone = "default",
  className,
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium capitalize", toneClass[tone], className)}
    >
      {label}
    </Badge>
  );
}

export function statusTone(value: string): Tone {
  const v = value.toLowerCase();
  if (["active", "approved", "used", "done", "success", "ok"].includes(v)) return "success";
  if (["maintenance", "warning", "review", "blocked", "in_progress", "reserved", "draft"].includes(v))
    return "warning";
  if (["retired", "danger", "overdue", "archived"].includes(v)) return "muted";
  if (["critical", "error", "failed", "high"].includes(v)) return "danger";
  if (["info", "free", "open", "normal"].includes(v)) return "info";
  return "default";
}
