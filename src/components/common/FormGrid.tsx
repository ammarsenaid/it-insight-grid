import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Form layout primitives. Use inside drawers and dialogs to keep field
 * spacing, label alignment and responsive collapse identical everywhere.
 *
 *   <FormGrid>
 *     <FormField label="Name"><Input ... /></FormField>
 *     <FormField label="Status"><Select ... /></FormField>
 *     <FormField label="Notes" full><Textarea ... /></FormField>
 *   </FormGrid>
 */
export function FormGrid({
  children,
  className,
  columns = 2,
}: {
  children: ReactNode;
  className?: string;
  columns?: 1 | 2;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-5",
        columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  full,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  full?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5",
        full && "sm:col-span-2",
        className,
      )}
    >
      {label && (
        <Label
          htmlFor={htmlFor}
          className="text-xs font-medium text-muted-foreground"
        >
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      )}
      <div className="min-w-0">{children}</div>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground/80">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || description) && (
        <header className="space-y-0.5">
          {title && (
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          )}
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}
