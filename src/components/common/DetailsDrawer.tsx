import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={cn("flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl", className)}>
        <SheetHeader className="border-b border-border/40 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="truncate text-base">{title}</SheetTitle>
              {description && (
                <SheetDescription className="mt-0.5 text-xs">{description}</SheetDescription>
              )}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-border/40 px-5 py-3">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}

// Alias semantics: CreateEditDrawer = FormDrawer (form-bound)
export { FormDrawer as CreateEditDrawer } from "./FormDrawer";
