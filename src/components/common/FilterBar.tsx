import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FilterBar({
  query,
  onQueryChange,
  placeholder = "Search…",
  children,
  onReset,
  className,
}: {
  query?: string;
  onQueryChange?: (v: string) => void;
  placeholder?: string;
  children?: ReactNode;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("glass-card mb-4 flex flex-col gap-2 rounded-2xl p-3 md:flex-row md:items-center", className)}>
      {onQueryChange !== undefined && (
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query ?? ""}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            className="h-9 rounded-lg border-border/60 bg-background/40 pl-9"
          />
        </div>
      )}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="h-9 text-xs text-muted-foreground">
          <X className="mr-1 h-3.5 w-3.5" /> Reset
        </Button>
      )}
    </div>
  );
}
