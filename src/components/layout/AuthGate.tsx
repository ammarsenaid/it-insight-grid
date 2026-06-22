import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "./AppShell";
import { canAccessRoute } from "@/lib/auth/effective-access";

const PUBLIC_PATHS = new Set<string>(["/auth"]);

/**
 * Top-level gate for the authenticated UI.
 *
 * Routing rules (applied after auth resolves on the client):
 *  - unauthenticated user on a protected route → /auth
 *  - authenticated user on /auth → /
 * Backend visibility and permission requirements must both allow a protected
 * route. Unknown routes and unavailable access context fail closed.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, contextLoading, session, effectiveAccess } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isPublic = PUBLIC_PATHS.has(pathname);
  const homeForRole = effectiveAccess?.safeRecoveryRoute ?? "/auth";
  const routeForbidden = !isPublic && !canAccessRoute(effectiveAccess, pathname);
  const identityContextPending = Boolean(session) && contextLoading;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || loading) return;
    if (!session && !isPublic) {
      navigate({ to: "/auth", replace: true });
    } else if (session && isPublic) {
      if (identityContextPending) return;
      navigate({ to: homeForRole, replace: true });
    } else if (identityContextPending) {
      return;
    } else if (session && routeForbidden) {
      navigate({ to: homeForRole, replace: true });
    }
  }, [mounted, loading, session, isPublic, identityContextPending, routeForbidden, homeForRole, navigate]);

  // /auth is always bare — same on SSR and client.
  if (isPublic) return <>{children}</>;

  // Protected route, auth not yet resolved → neutral splash.
  if (!mounted || loading || identityContextPending) {
    return <AuthSplash />;
  }

  // Resolved but not allowed here → render nothing while redirect runs.
  if (!session) return null;
  if (routeForbidden) return null;

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
