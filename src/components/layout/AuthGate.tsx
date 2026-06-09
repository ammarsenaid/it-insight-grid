import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "./AppShell";

const PUBLIC_PATHS = new Set<string>(["/auth"]);

/**
 * Top-level gate for the authenticated UI.
 *
 * - Shows a loading splash while the Supabase session is being restored.
 * - Renders the public route (e.g. /auth) bare when there is no session.
 * - Redirects unauthenticated users that hit a protected URL to /auth.
 * - Wraps authenticated routes in the regular AppShell.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, session, configured, isPlatformAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isPublic = PUBLIC_PATHS.has(pathname);
  const isAdminRoute = pathname.startsWith("/admin");

  useEffect(() => {
    if (loading) return;
    if (!session && !isPublic) {
      navigate({ to: "/auth", replace: true });
    } else if (session && isAdminRoute && !isPlatformAdmin) {
      navigate({ to: "/", replace: true });
    }
  }, [loading, session, isPublic, isAdminRoute, isPlatformAdmin, navigate]);

  if (loading) {
    return (
      <div className="dark grid min-h-screen place-items-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Restoring session…
        </div>
      </div>
    );
  }

  if (!configured && isPublic) {
    return <>{children}</>;
  }

  if (!session) {
    // Either on /auth, or redirecting — render the public surface only.
    return isPublic ? <>{children}</> : null;
  }

  if (isPublic) {
    // Signed in but on /auth — render nothing while the redirect resolves.
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
