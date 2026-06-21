import { useEffect, useState, type ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopHeader } from "./TopHeader";
import { ContextErrorBanner } from "./ContextErrorBanner";
import { useData } from "@/lib/data/store";

export function AppShell({ children }: { children: ReactNode }) {
  const { settings } = useData();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof document === "undefined") return;
    document.body.classList.toggle("compact-mode", settings.compactMode);
    document.body.classList.toggle("reduced-motion", settings.reducedMotion);
  }, [settings.compactMode, settings.reducedMotion]);

  return (
    <SidebarProvider defaultOpen={!settings.sidebarCollapsed}>
      <div className="dark flex min-h-dvh w-full">
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-1 flex-col bg-transparent">
          <TopHeader />
          {/*
            Single, predictable main scroll area.
            - `app-main` exposes scroll-padding-top so in-page anchors clear
              the sticky header.
            - Horizontal padding scales responsively; vertical padding stays
              consistent across every route.
            - PageContainer caps width so content doesn't stretch indefinitely.
          */}
          <main className="app-main flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
            <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-4">
              <ContextErrorBanner />
              {mounted ? (
                children
              ) : (
                <div className="h-[60vh] animate-pulse rounded-2xl bg-card/30" />
              )}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
