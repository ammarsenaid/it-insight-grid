import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * DetailsDrawer — standard right-side drawer used for read-mostly detail
 * panels (CMDB asset, IPAM subnet, Task, Note, Protocol …).
 *
 * Layout contract:
 *  - fixed header (title + actions, never scrolls away)
 *  - single scrollable body in the middle
 *  - sticky footer that always stays visible
 *  - consistent width: full width on mobile, ~640px on >=sm
 *  - close button is provided by the underlying Sheet (top-right)
 */
export function DetailsDrawer({
  open,
  onOpenChange,
  title,
  description,
  actions,
  footer,
  children,
  side = "right",
  className,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  side?: "right" | "left";
  className?: string;
  size?: "md" | "lg" | "xl";
}) {
  const widthCls =
    size === "xl"
      ? "sm:!max-w-3xl"
      : size === "lg"
      ? "sm:!max-w-2xl"
      : "sm:!max-w-xl";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          "flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:!w-[640px]",
          widthCls,
          className,
        )}
      >
        {/* Fixed header */}
        <SheetHeader className="shrink-0 space-y-0 border-b border-border/40 bg-background/95 px-5 py-4 pr-12 text-left backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">{title}</SheetTitle>
              {description && (
                <SheetDescription className="mt-0.5 line-clamp-2 text-xs">
                  {description}
                </SheetDescription>
              )}
            </div>
            {actions && (
              <div className="flex shrink-0 items-center gap-1">{actions}</div>
            )}
          </div>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="kb-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* Sticky footer */}
        {footer && (
          <div className="shrink-0 border-t border-border/40 bg-background/95 px-5 py-3 backdrop-blur">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Alias semantics: CreateEditDrawer = FormDrawer (form-bound)
export { FormDrawer as CreateEditDrawer } from "./FormDrawer";
