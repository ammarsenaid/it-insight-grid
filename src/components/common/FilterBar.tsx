import { useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Standardized filter bar.
 * Layout (left → right):
 *   [search] [primary filters] [secondary filters (collapsible)] [savedViews] [reset]
 *
 * On narrow screens primary filters wrap and secondary filters collapse behind a "More filters" toggle.
 */
export function FilterBar({
  query,
  onQueryChange,
  placeholder = "Search…",
  children,
  secondaryChildren,
  savedViews,
  onReset,
  className,
}: {
  query?: string;
  onQueryChange?: (v: string) => void;
  placeholder?: string;
  /** Primary filters, always visible. */
  children?: ReactNode;
  /** Secondary filters, collapsed by default behind a "More filters" toggle. */
  secondaryChildren?: ReactNode;
  /** Saved views slot rendered before Reset. */
  savedViews?: ReactNode;
  onReset?: () => void;
  className?: string;
}) {
  const [showMore, setShowMore] = useState(false);
  const hasSecondary = Boolean(secondaryChildren);

  return (
    <div className={cn("glass-card mb-4 rounded-2xl p-3", className)}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        {onQueryChange !== undefined && (
          <div className="relative w-full md:max-w-sm md:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query ?? ""}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={placeholder}
              className="h-9 rounded-lg border-border/60 bg-background/40 pl-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
        {children && (
          <div className="flex flex-wrap items-center gap-2 md:flex-1">
            {children}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasSecondary && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMore((v) => !v)}
              className="h-9 text-xs"
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              {showMore ? "Fewer filters" : "More filters"}
            </Button>
          )}
          {savedViews}
          {onReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-9 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
          )}
        </div>
      </div>
      {hasSecondary && showMore && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
          {secondaryChildren}
        </div>
      )}
    </div>
  );
}
