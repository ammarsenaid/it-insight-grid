import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Breadcrumb {
  label: string;
  /** Optional href; renders as text-only when omitted (current page). */
  to?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  secondaryActions,
  breadcrumbs,
  status,
  meta,
  className,
}: {
  title: string;
  description?: ReactNode;
  /** Primary actions, always rendered last on the right. */
  actions?: ReactNode;
  /** Secondary actions, rendered before the primary group. */
  secondaryActions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  /** Optional status badge / live-state element rendered next to the title. */
  status?: ReactNode;
  /** Small helper text (e.g. "Updated 2m ago · 142 records") under the description. */
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 space-y-3", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
          {breadcrumbs.map((b, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={`${b.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/60" aria-hidden />}
                {b.to && !isLast ? (
                  <Link to={b.to} className="transition-colors hover:text-foreground">
                    {b.label}
                  </Link>
                ) : (
                  <span className={cn(isLast && "text-foreground/80")}>{b.label}</span>
                )}
              </span>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
              {title}
            </h1>
            {status}
          </div>
          {description && (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
          )}
          {meta && (
            <div className="mt-1.5 text-[11px] text-muted-foreground/80">{meta}</div>
          )}
        </div>

        {(actions || secondaryActions) && (
          <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
            {secondaryActions && (
              <div className="flex flex-wrap items-center gap-2">{secondaryActions}</div>
            )}
            {actions && (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
