import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { usePageVisibility } from "@/lib/page-visibility";
import { AppShell } from "./AppShell";
import { useRole } from "@/lib/permissions";

const PUBLIC_PATHS = new Set<string>(["/auth"]);

/**
 * Top-level gate for the authenticated UI.
 *
 * Routing rules (applied after auth resolves on the client):
 *  - unauthenticated user on a protected route → /auth
 *  - authenticated user on /auth → /
 *  - authenticated non-admin on /admin/* → role home
 *  - DB-backed visibility (or static safety fallback) violation → role home
 *      employee → /my-requests, other roles → /
 *
 * Dynamic sub-paths must match an explicit page-visibility pattern before
 * their page-level per-record authorization runs.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, contextLoading, session, isPlatformAdmin, roleKeys } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const role = useRole();
  const pageVisibility = usePageVisibility(roleKeys, Boolean(session) && !contextLoading);
  const isPublic = PUBLIC_PATHS.has(pathname);
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const homeForRole = role === "employee" ? "/my-requests" : "/";
  const isKnownPage = pageVisibility.hasRule(pathname);
  // Unknown non-admin paths fail closed. Unknown admin paths retain the
  // platform-admin-only fallback below.
  const roleForbidden = isKnownPage ? !pageVisibility.canSeePage(pathname) : !isAdminRoute;
  // Known admin pages use the explicit role matrix. Unknown admin paths,
  // including diagnostics, remain restricted to platform administrators.
  const platformAdminRequired = isAdminRoute && !isKnownPage;
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
    } else if (session && platformAdminRequired && !isPlatformAdmin) {
      navigate({ to: homeForRole, replace: true });
    } else if (session && roleForbidden) {
      navigate({ to: homeForRole, replace: true });
    }
  }, [
    mounted,
    loading,
    session,
    isPublic,
    identityContextPending,
    platformAdminRequired,
    isPlatformAdmin,
    roleForbidden,
    homeForRole,
    navigate,
  ]);

  // /auth is always bare — same on SSR and client.
  if (isPublic) return <>{children}</>;

  // Protected route, auth not yet resolved → neutral splash.
  if (!mounted || loading || identityContextPending) {
    return <AuthSplash />;
  }

  // Resolved but not allowed here → render nothing while redirect runs.
  if (!session) return null;
  if (platformAdminRequired && !isPlatformAdmin) return null;
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
