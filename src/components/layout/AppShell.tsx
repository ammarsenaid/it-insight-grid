import { useEffect, useState, type ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopHeader } from "./TopHeader";
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
      <div className="dark flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-1 flex-col bg-transparent">
          <TopHeader />
          <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
            {mounted ? children : <div className="h-[60vh] animate-pulse rounded-2xl bg-card/30" />}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
