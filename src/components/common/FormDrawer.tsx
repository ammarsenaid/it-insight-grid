import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * FormDrawer — standard right-side drawer for create/edit forms.
 *
 * Layout contract matches DetailsDrawer:
 *  - fixed header with title + optional description
 *  - scrollable body wrapped in a <form> so Enter submits
 *  - sticky footer with Cancel + Submit
 *  - wide enough on desktop for two-column FormGrid layouts
 *
 * Field content should be composed with <FormGrid> and <FormField>
 * from `@/components/common/FormGrid` so spacing stays consistent.
 */
export function FormDrawer({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  submitDisabled,
  submitting,
  children,
  size = "md",
  className,
  extraFooter,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  onSubmit: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  submitDisabled?: boolean;
  submitting?: boolean;
  children: ReactNode;
  size?: "md" | "lg" | "xl";
  className?: string;
  extraFooter?: ReactNode;
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
        className={cn(
          "flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:!w-[640px]",
          widthCls,
          className,
        )}
      >
        <SheetHeader className="shrink-0 space-y-0 border-b border-border/40 bg-background/95 px-5 py-4 pr-12 text-left backdrop-blur">
          <SheetTitle className="truncate text-base">{title}</SheetTitle>
          {description && (
            <SheetDescription className="mt-0.5 line-clamp-2 text-xs">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(e) => {
            e.preventDefault();
            if (submitDisabled || submitting) return;
            onSubmit();
          }}
        >
          <div className="kb-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {children}
          </div>

          <div className="shrink-0 border-t border-border/40 bg-background/95 px-5 py-3 backdrop-blur">
            <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-xs text-muted-foreground">
                {extraFooter}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  {cancelLabel}
                </Button>
                <Button type="submit" disabled={submitDisabled || submitting}>
                  {submitting ? "Saving…" : submitLabel}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
