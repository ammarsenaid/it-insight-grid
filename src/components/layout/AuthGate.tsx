import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "./AppShell";
import { useRole, PAGE_VISIBILITY, canSeePage } from "@/lib/permissions";

const PUBLIC_PATHS = new Set<string>(["/auth"]);

/**
 * Top-level gate for the authenticated UI.
 *
 * Routing rules (applied after auth resolves on the client):
 *  - unauthenticated user on a protected route → /auth
 *  - authenticated user on /auth → /
 *  - authenticated non-admin on /admin/* → role home
 *  - role-based PAGE_VISIBILITY violation → role home
 *      employee → /my-requests, other roles → /
 *
 * Dynamic sub-paths (e.g. /tickets/:id, /service-catalog/:id) are NOT
 * blocked here — those pages handle their own per-record access checks
 * (e.g. requester isolation on /tickets/:id).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, session, isPlatformAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const role = useRole();
  const isPublic = PUBLIC_PATHS.has(pathname);
  const isAdminRoute = pathname.startsWith("/admin");
  const homeForRole = role === "employee" ? "/my-requests" : "/";
  // Only gate routes explicitly listed in PAGE_VISIBILITY (exact match).
  // Detail routes like /tickets/abc fall through to the page's own guard.
  const isKnownPage = pathname in PAGE_VISIBILITY;
  const roleForbidden = isKnownPage && !canSeePage(pathname, role);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || loading) return;
    if (!session && !isPublic) {
      navigate({ to: "/auth", replace: true });
    } else if (session && isPublic) {
      navigate({ to: homeForRole, replace: true });
    } else if (session && isAdminRoute && !isPlatformAdmin) {
      navigate({ to: homeForRole, replace: true });
    } else if (session && roleForbidden) {
      navigate({ to: homeForRole, replace: true });
    }
  }, [mounted, loading, session, isPublic, isAdminRoute, isPlatformAdmin, roleForbidden, homeForRole, navigate]);

  // /auth is always bare — same on SSR and client.
  if (isPublic) return <>{children}</>;

  // Protected route, auth not yet resolved → neutral splash.
  if (!mounted || loading) {
    return <AuthSplash />;
  }

  // Resolved but not allowed here → render nothing while redirect runs.
  if (!session) return null;
  if (isAdminRoute && !isPlatformAdmin) return null;
  if (roleForbidden) return null;

  return <AppShell>{children}</AppShell>;
}

function AuthSplash() {
  return (
    <div className="dark grid min-h-screen place-items-center bg-background">
      <div
        className="flex items-center gap-3 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading…</span>
      </div>
    </div>
  );
}
