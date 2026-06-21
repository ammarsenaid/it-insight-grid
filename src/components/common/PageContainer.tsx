import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * PageContainer — single source of truth for page-level horizontal
 * constraints, gutters and vertical rhythm. Use at the top of any route to
 * keep layouts consistent across the app.
 *
 *  - max width is capped so 4K screens don't stretch tables across the world
 *  - horizontal padding scales with viewport
 *  - vertical spacing between top-level sections is uniform
 *
 * Variants:
 *  - default: comfortable centered content (most pages)
 *  - wide:    workspace-style layouts (CMDB, IPAM, knowledge)
 *  - flush:   no horizontal padding (pages that own their gutters)
 */
export function PageContainer({
  children,
  className,
  variant = "default",
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "wide" | "flush";
  as?: "div" | "section" | "article";
}) {
  return (
    <As
      className={cn(
        "mx-auto w-full min-w-0",
        variant === "default" && "max-w-[1400px]",
        variant === "wide" && "max-w-[1680px]",
        variant === "flush" && "max-w-none",
        "space-y-6",
        className,
      )}
    >
      {children}
    </As>
  );
}
